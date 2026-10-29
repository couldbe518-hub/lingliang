#!/usr/bin/env python3
"""灵粮读经语音包：用 Kevin 本人的一段录音，经开源零样本声音克隆 ZipVoice（k2-fsa，Apache-2.0，sherpa-onnx 运行）
把早晚祷引导语、主祷文、经典经文、情境经文与祷告文合成为 mp3。Grace 的手机只播放现成的 mp3，整章朗读仍用系统声音。

准备（一次）：
  pip install sherpa-onnx soundfile numpy
  下载并解压（均来自 github.com/k2-fsa/sherpa-onnx/releases）：
    tts-models/sherpa-onnx-zipvoice-distill-int8-zh-en-emilia.tar.bz2
    vocoder-models/vocos_24khz.onnx
  可选核对：asr-models 里的 paraformer 中文模型目录（--asr），再 pip install librosa pypinyin
  录音：10–15 秒本人清晰朗读 prompt.wav（任意采样率，单声道最好）+ 对应文字 prompt.txt，放在 --clone-dir（不要进仓库）
  需要 ffmpeg、node 与 playwright（列句子时用无头浏览器跑一遍应用，保证和播放器要念的字一模一样）
用法：
  在仓库根目录： python3 -m http.server 8765 &
  python3 tools/make_voice.py --clone-dir /path/to/clone --zipvoice /path/to/zipvoice --vocoder /path/to/vocos_24khz.onnx
  已生成的句子会跳过；--force 全部重做；--limit N 只做前 N 句（试听用）；--prune 清理清单外的旧 mp3。
  句子清单可分批（--lines 指定不同文件），清单文件会合并、每 20 句写一次。
"""
import argparse, hashlib, json, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "voice")
VOICE = ("kevin", "Kevin", "Kevin 本人的声音")
CLONE_SPEED = 0.85   # 与拉伸操相同：比录音原速略慢
FILTER = ("silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse,"
          "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08,areverse,"
          "highpass=f=60,lowpass=f=10000,aecho=0.85:0.6:35|60:0.08|0.05,loudnorm=I=-17:TP=-2:LRA=7,afade=t=in:d=0.02")

def clone_text(t):
    """只改念法，不改句子本身（句子原文是播放器查找录音的键）。"""
    t = t.replace("『", "").replace("』", "").replace("「", "").replace("」", "")
    t = re.sub(r"〔[^〕]*〕", "", t)
    for a, b in [("慢慢地", "慢慢的"), ("轻轻地", "轻轻的"), ("……", "，")]:
        t = t.replace(a, b)
    return t

def sentences(t):
    parts = [p for p in re.split(r"(?<=[。；！？])", t) if p.strip("。；！？ ")]
    return parts or [t]

def pinyin_err(ref, hyp):
    import difflib
    from pypinyin import lazy_pinyin
    keep = lambda x: re.sub(r"[^一-鿿A-Za-z0-9]", "", x)
    a, b = lazy_pinyin(keep(ref)), lazy_pinyin(keep(hyp))
    return 1 - difflib.SequenceMatcher(None, a, b).ratio()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--clone-dir", default=os.environ.get("CLONE_DIR", "/tmp/claude-0/clone"))
    ap.add_argument("--zipvoice", default="/tmp/claude-0/sherpa-onnx-zipvoice-distill-int8-zh-en-emilia")
    ap.add_argument("--vocoder", default="/tmp/claude-0/vocos_24khz.onnx")
    ap.add_argument("--asr", default=None, help="paraformer 中文识别模型目录，用于核对")
    ap.add_argument("--lines", default=None, help="已有的句子清单 JSON（省略则用 playwright 现场列出）")
    ap.add_argument("--url", default="http://127.0.0.1:8765/")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--prune", action="store_true", help="删除清单里不再引用的 mp3")
    a = ap.parse_args()
    import sherpa_onnx, soundfile as sf, numpy as np
    Z = a.zipvoice.rstrip("/") + "/"
    cfg = sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(zipvoice=sherpa_onnx.OfflineTtsZipvoiceModelConfig(
        tokens=Z + "tokens.txt", encoder=Z + "encoder.int8.onnx", decoder=Z + "decoder.int8.onnx", vocoder=a.vocoder,
        data_dir=Z + "espeak-ng-data", lexicon=Z + "lexicon.txt"), num_threads=os.cpu_count() or 4))
    tts = sherpa_onnx.OfflineTts(cfg)
    px, psr = sf.read(os.path.join(a.clone_dir, "prompt.wav"), dtype="float32")
    if px.ndim > 1: px = px.mean(axis=1)
    ptxt = open(os.path.join(a.clone_dir, "prompt.txt"), encoding="utf-8").read().strip()
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
    def synth(text):
        pieces, rate = [], None
        for sent in sentences(clone_text(text)):
            best = None
            for steps in (8, 12, 16):
                g = tts.generate(sent if sent[-1] in "。；！？" else sent + "。", ptxt, px, psr, speed=CLONE_SPEED, num_steps=steps)
                if not rec:
                    best = (0, g.samples, g.sample_rate); break
                err = pinyin_err(sent, recognize(g.samples, g.sample_rate))
                if best is None or err < best[0]: best = (err, g.samples, g.sample_rate)
                if err <= .15: break
            if best[0] > .15: print("核对未通过（保留最好的一次）:", round(best[0], 2), sent, file=sys.stderr)
            rate = best[2]
            pieces.append(np.asarray(best[1], dtype=np.float32))
            pieces.append(np.zeros(int(rate * (.32 if sent.endswith("；") else .45)), np.float32))
        return np.concatenate(pieces[:-1]), rate
    if a.lines:
        lines = json.load(open(a.lines, encoding="utf-8"))
    else:
        env = dict(os.environ, URL=a.url)
        lines = json.loads(subprocess.check_output(["node", os.path.join(HERE, "voice_lines.js")], env=env))
    if a.limit: lines = lines[:a.limit]
    mf = os.path.join(OUT, "manifest.json")
    old = json.load(open(mf, encoding="utf-8")) if os.path.exists(mf) else {"lines": {}}
    d = os.path.join(OUT, VOICE[0]); os.makedirs(d, exist_ok=True)
    entries, keep = dict(old.get("lines", {})), set()   # 保留清单里已有的句子（分批生成时不丢）
    def write_manifest():
        json.dump({"engine": "ZipVoice（k2-fsa，Apache-2.0），经 sherpa-onnx 零样本声音克隆合成", "speed": CLONE_SPEED,
                   "voices": [{"id": VOICE[0], "name": VOICE[1], "desc": VOICE[2]}], "lines": entries},
                  open(mf, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    for n, text in enumerate(lines):
        fn = hashlib.sha1(text.encode("utf-8")).hexdigest()[:12] + ".mp3"
        dst = os.path.join(d, fn); keep.add(fn)
        if a.force or not os.path.exists(dst):
            samples, rate = synth(text)
            with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
                sf.write(tmp.name, samples, rate)
                subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", tmp.name, "-af", FILTER, "-ar", "24000", "-ac", "1",
                                "-c:a", "libmp3lame", "-b:a", "40k", dst], check=True)
            print(n + 1, "/", len(lines), text[:24], file=sys.stderr)
        dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", dst]))
        entries[text] = [fn, round(dur, 2)]
        if n % 20 == 19: write_manifest()   # 分批写清单，中途提交也能用
    write_manifest()
    if a.prune:
        used = {v[0] for v in entries.values()}
        for f in os.listdir(d):
            if f.endswith(".mp3") and f not in used: os.remove(os.path.join(d, f))
    print("OK", len(entries), "句", file=sys.stderr)

if __name__ == "__main__":
    main()
