#!/usr/bin/env python3
"""生成语音包：把播放器要念的全部句子，用开源神经语音 Kokoro v1.1-zh（Apache-2.0）合成成 mp3。

只在 Kevin 这边运行一次（改了动作文字后再运行），Grace 的手机只是播放现成的 mp3，不耗任何 token。

准备（一次）：
  pip install sherpa-onnx soundfile
  下载模型并解压：https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-multi-lang-v1_1.tar.bz2
  需要 ffmpeg。
用法：
  python3 stretch/tools/make_voice.py --model /path/to/kokoro-multi-lang-v1_1
  已生成的句子会跳过；--force 全部重做。换声音：改下面 VOICES 里的 sid（3–57 是中文女声）。

克隆声音（engine = zipvoice）：零样本声音克隆 ZipVoice（k2-fsa，Apache-2.0）。
  另需下载 sherpa-onnx-zipvoice-distill-int8-zh-en-emilia.tar.bz2（tts-models）和 vocos_24khz.onnx（vocoder-models），
  以及一段 10–15 秒的本人录音 prompt.wav + 对应文字 prompt.txt，放在 --clone-dir 指定的目录（不要放进仓库）。
  加 --asr <paraformer 目录> 时，每句合成后用语音识别核对，读错的自动重试。
"""
import argparse, hashlib, json, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "voice")

# id、Kokoro 说话人编号、显示名、说明（基频为实测中位数）
VOICES = [
    ("kevin", "clone", "Kevin", "Kevin 本人的声音"),
    ("anran", 8, "安然", "温暖偏低（约 206 Hz）"),
    ("jingyu", 30, "静语", "柔和适中（约 219 Hz）"),
    ("ruoxi", 28, "若溪", "平稳清亮（约 233 Hz）"),
]
SPEED = 0.86
CLONE_SPEED = 0.85  # 克隆声音的语速（1.0 = 录音原速）；Kevin 2026-10-13 要求再慢一点
# 后期：去掉首尾静音、轻微暖声、很小的房间混响、统一响度
FILTER = ("silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse,"
          "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08,areverse,"
          "highpass=f=70,lowpass=f=9500,equalizer=f=220:t=q:w=1.2:g=2,equalizer=f=3200:t=q:w=1.5:g=-2,"
          "aecho=0.85:0.6:35|60:0.10|0.06,loudnorm=I=-17:TP=-2:LRA=7,afade=t=in:d=0.02")

FILTER_CLONE = ("silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse,"
                "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08,areverse,"
                "highpass=f=60,lowpass=f=10000,aecho=0.85:0.6:35|60:0.08|0.05,loudnorm=I=-17:TP=-2:LRA=7,afade=t=in:d=0.02")


CN_DIGIT = "零一二三四五六七八九"
MEASURE = "秒次个组度圈分天周轮步下拳根厘米倍"


def cn_int(n, before=""):
    """阿拉伯数字 → 普通话读法；量词前的 2 读「两」。"""
    if n == 2 and before[:1] in MEASURE:
        return "两"
    if n < 10:
        return CN_DIGIT[n]
    if n < 20:
        return "十" + (CN_DIGIT[n % 10] if n % 10 else "")
    if n < 100:
        return CN_DIGIT[n // 10] + "十" + (CN_DIGIT[n % 10] if n % 10 else "")
    return str(n)


def normalize(t):
    """按普通话说话习惯整理文字：数字读法、去掉中英文之间的空格、统一停顿标点。"""
    rep = [("膝-髋-肩", "膝、髋、肩"), ("4-7-8", "四七八"), ("4-6", "四六"), ("90/90", "九十九十"), (" × ", "，做"),
           ("—", "、"), (" / ", "，或"), (" + ", "，加"), ("50%", "百分之五十"), ("80%", "百分之八十"), ("「", ""), ("」", "")]
    for a, b in rep:
        t = t.replace(a, b)
    t = re.sub(r"\s*(\d+)\s*(\S?)", lambda m: cn_int(int(m.group(1)), m.group(2)) + m.group(2), t)
    t = re.sub(r"(?<=[一-鿿，。、；：])\s+|\s+(?=[一-鿿，。、；：])", "", t)
    return t


# 两个模型字典里都会读错的词（用语音识别和字典逐字核对得出），换成同音字让它读对
POLYPHONES = [("着地", "卓地"), ("变长", "变常"), ("往后倒", "往后岛"), ("倒向", "岛向"), ("两只手", "两支手"), ("这只手", "这支手"),
              ("距离差", "距离叉"), ("数三秒", "属三秒")]


def fix_common(t):
    for a, b in POLYPHONES:
        t = t.replace(a, b)
    return re.sub(r"肋(?!骨)", "泪", t)  # 单独的「肋」被读成 lē


def for_speech(t):
    """只改念法，不改句子本身（句子是查找录音的键）。Kokoro 用这个版本。"""
    t = fix_common(normalize(t))
    # Kokoro 的字典把单独的「地」读成 de：表示地面时换成同音的「第」
    t = t.replace("卓地", "卓第")
    t = re.sub(r"(?<=[离贴踩跪蹬推点])地", "第", t)
    return t + "。"


def clone_text(t):
    """克隆声音（ZipVoice）用：它的字典把「地」一律读 dì，所以副词「慢慢地」改成「的」。"""
    t = fix_common(normalize(t))
    for a, b in [("慢慢地", "慢慢的"), ("轻轻地", "轻轻的")]:
        t = t.replace(a, b)
    return t


def sentences(t):
    """按句号、分号等切成短句分别合成，句间留自然停顿，准确率也更高。"""
    parts = [p for p in re.split(r"(?<=[。；！？])", t) if p.strip("。；！？ ")]
    return parts or [t]


def pinyin_err(ref, hyp):
    """拼音层面的差异比例（同音字不算错），用来判断合成有没有读错。"""
    import difflib
    from pypinyin import lazy_pinyin
    keep = lambda t: re.sub(r"[^\u4e00-\u9fffA-Za-z0-9]", "", t)
    a, b = lazy_pinyin(keep(ref)), lazy_pinyin(keep(hyp))
    return 1 - difflib.SequenceMatcher(None, a, b).ratio()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=os.environ.get("KOKORO_DIR", "/tmp/claude-0/kokoro-multi-lang-v1_1"))
    ap.add_argument("--clone-dir", default=os.environ.get("CLONE_DIR", "/tmp/claude-0/clone"), help="prompt.wav + prompt.txt")
    ap.add_argument("--zipvoice", default="/tmp/claude-0/sherpa-onnx-zipvoice-distill-int8-zh-en-emilia")
    ap.add_argument("--vocoder", default="/tmp/claude-0/vocos_24khz.onnx")
    ap.add_argument("--asr", default=None, help="paraformer 中文识别模型目录，用于核对")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--only", help="只生成某个声音 id")
    ap.add_argument("--redo", help="强制重做的句子，用 | 分隔")
    a = ap.parse_args()
    import sherpa_onnx, soundfile as sf, numpy as np
    engines = {}

    def kokoro():
        if "kokoro" not in engines:
            M = a.model.rstrip("/") + "/"
            cfg = sherpa_onnx.OfflineTtsConfig(
                model=sherpa_onnx.OfflineTtsModelConfig(kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
                    model=M + "model.onnx", voices=M + "voices.bin", tokens=M + "tokens.txt", data_dir=M + "espeak-ng-data",
                    dict_dir=M + "dict", lexicon=M + "lexicon-us-en.txt," + M + "lexicon-zh.txt"), num_threads=os.cpu_count() or 4),
                rule_fsts=M + "date-zh.fst," + M + "phone-zh.fst," + M + "number-zh.fst", max_num_sentences=1)
            engines["kokoro"] = sherpa_onnx.OfflineTts(cfg)
        return engines["kokoro"]

    def clone():
        if "clone" not in engines:
            Z = a.zipvoice.rstrip("/") + "/"
            cfg = sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(zipvoice=sherpa_onnx.OfflineTtsZipvoiceModelConfig(
                tokens=Z + "tokens.txt", encoder=Z + "encoder.int8.onnx", decoder=Z + "decoder.int8.onnx", vocoder=a.vocoder,
                data_dir=Z + "espeak-ng-data", lexicon=Z + "lexicon.txt"), num_threads=os.cpu_count() or 4))
            x, sr = sf.read(os.path.join(a.clone_dir, "prompt.wav"), dtype="float32")
            engines["clone"] = (sherpa_onnx.OfflineTts(cfg), x, sr, open(os.path.join(a.clone_dir, "prompt.txt"), encoding="utf-8").read().strip())
        return engines["clone"]

    rec = None
    if a.asr:
        R = a.asr.rstrip("/") + "/"
        rec = sherpa_onnx.OfflineRecognizer.from_paraformer(paraformer=R + "model.int8.onnx", tokens=R + "tokens.txt", num_threads=4)

    def recognize(samples, sr):
        import librosa
        y = librosa.resample(np.asarray(samples, dtype=np.float32), orig_sr=sr, target_sr=16000)
        pad = np.zeros(8000, np.float32)
        st = rec.create_stream(); st.accept_waveform(16000, np.concatenate([pad, y, pad])); rec.decode_stream(st)
        return st.result.text

    def synth(voice, text):
        vid, sid = voice[0], voice[1]
        if sid != "clone":
            g = kokoro().generate(for_speech(text), sid=sid, speed=SPEED)
            return g.samples, g.sample_rate, FILTER
        tts, x, sr, pt = clone()
        pieces, rate = [], None
        for sent in sentences(clone_text(text)):
            best = None
            for steps in (8, 12, 16):
                g = tts.generate(sent if sent[-1] in "。；！？" else sent + "。", pt, x, sr, speed=CLONE_SPEED, num_steps=steps)
                if not rec:
                    best = (0, g.samples, g.sample_rate); break
                err = pinyin_err(sent, recognize(g.samples, g.sample_rate))
                if best is None or err < best[0]:
                    best = (err, g.samples, g.sample_rate)
                if err <= .15:
                    break
            if best[0] > .15:
                print("核对未通过（保留最好的一次）:", round(best[0], 2), sent, file=sys.stderr)
            rate = best[2]
            pieces.append(np.asarray(best[1], dtype=np.float32))
            pieces.append(np.zeros(int(rate * (.32 if sent.endswith("；") else .45)), np.float32))
        return np.concatenate(pieces[:-1]), rate, FILTER_CLONE

    lines = json.loads(subprocess.check_output(["node", os.path.join(HERE, "voice_lines.js")]))
    mf = os.path.join(OUT, "manifest.json")
    redo = set(a.redo.split("|")) if a.redo else set()
    entries = {}
    for text in lines:
        entries[text] = [hashlib.sha1(text.encode("utf-8")).hexdigest()[:12] + ".mp3", 0.0]
    shipped = []
    for voice in VOICES:
        vid = voice[0]
        d = os.path.join(OUT, vid)
        if voice[1] == "clone" and not os.path.exists(os.path.join(a.clone_dir, "prompt.wav")) and not os.path.isdir(d):
            continue  # 没有录音、也没有已生成的文件：跳过这个声音
        shipped.append(voice)
        os.makedirs(d, exist_ok=True)
        keep = set()
        for n, text in enumerate(lines):
            fn = entries[text][0]
            keep.add(fn)
            dst = os.path.join(d, fn)
            todo = (a.only in (None, vid)) and (not os.path.exists(dst) or a.force or text in redo)
            if todo:
                samples, rate, filt = synth(voice, text)
                with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
                    sf.write(tmp.name, samples, rate)
                    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", tmp.name, "-af", filt, "-ar", "24000", "-ac", "1",
                                    "-c:a", "libmp3lame", "-b:a", "40k", dst], check=True)
            if os.path.exists(dst):
                dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", dst]))
                entries[text][1] = round(max(entries[text][1], dur), 2)
            if n % 50 == 0 and todo:
                print(vid, n, "/", len(lines), file=sys.stderr)
        for f in os.listdir(d):
            if f.endswith(".mp3") and f not in keep:
                os.remove(os.path.join(d, f))  # 句子已不再使用的旧录音
    manifest = {"engine": "Kokoro-82M v1.1-zh 与 ZipVoice（均为 Apache-2.0），经 sherpa-onnx 合成", "speed": SPEED,
                "voices": [{"id": v[0], "name": v[2], "desc": v[3]} for v in shipped],
                "lines": entries}
    json.dump(manifest, open(mf, "w"), ensure_ascii=False, separators=(",", ":"))
    print("OK", len(lines), "句 ×", len(shipped), "个声音", file=sys.stderr)


if __name__ == "__main__":
    main()
