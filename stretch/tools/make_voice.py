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
"""
import argparse, hashlib, json, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "voice")

# id、Kokoro 说话人编号、显示名、说明（基频为实测中位数）
VOICES = [
    ("anran", 8, "安然", "温暖偏低（约 206 Hz）"),
    ("jingyu", 30, "静语", "柔和适中（约 219 Hz）"),
    ("ruoxi", 28, "若溪", "平稳清亮（约 233 Hz）"),
]
SPEED = 0.86
# 后期：去掉首尾静音、轻微暖声、很小的房间混响、统一响度
FILTER = ("silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse,"
          "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08,areverse,"
          "highpass=f=70,lowpass=f=9500,equalizer=f=220:t=q:w=1.2:g=2,equalizer=f=3200:t=q:w=1.5:g=-2,"
          "aecho=0.85:0.6:35|60:0.10|0.06,loudnorm=I=-17:TP=-2:LRA=7,afade=t=in:d=0.02")


def for_speech(t):
    """只改念法，不改句子本身（句子是查找录音的键）。"""
    rep = [("膝-髋-肩", "膝、髋、肩"), ("4-7-8", "四七八"), ("4-6", "四六"), ("90/90", "九十九十"), (" × ", "，做 "),
           ("—", "、"), (" / ", "，或"), (" + ", "，加"), ("50%", "百分之五十"), ("80%", "百分之八十")]
    for a, b in rep:
        t = t.replace(a, b)
    # 多音字：Kokoro 的字典把单独的"地"读 de、"肋"读 lē 等，换成同音字让它读对
    t = t.replace("着地", "卓第")
    t = re.sub(r"(?<=[离贴踩跪蹬推点])地", "第", t)
    t = re.sub(r"肋(?!骨)", "泪", t)
    for a, b in [("变长", "变常"), ("往后倒", "往后岛"), ("两只手", "两支手"), ("这只手", "这支手"), ("距离差", "距离叉"), ("数三秒", "属三秒")]:
        t = t.replace(a, b)
    return t + "。"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=os.environ.get("KOKORO_DIR", "/tmp/claude-0/kokoro-multi-lang-v1_1"))
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--only", help="只生成某个声音 id")
    ap.add_argument("--redo", help="强制重做的句子，用 | 分隔")
    a = ap.parse_args()
    import sherpa_onnx, soundfile as sf
    M = a.model.rstrip("/") + "/"
    cfg = sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
            model=M + "model.onnx", voices=M + "voices.bin", tokens=M + "tokens.txt", data_dir=M + "espeak-ng-data",
            dict_dir=M + "dict", lexicon=M + "lexicon-us-en.txt," + M + "lexicon-zh.txt"), num_threads=os.cpu_count() or 4),
        rule_fsts=M + "date-zh.fst," + M + "phone-zh.fst," + M + "number-zh.fst", max_num_sentences=1)
    tts = sherpa_onnx.OfflineTts(cfg)

    lines = json.loads(subprocess.check_output(["node", os.path.join(HERE, "voice_lines.js")]))
    mf = os.path.join(OUT, "manifest.json")
    redo = set(a.redo.split("|")) if a.redo else set()
    entries = {}
    for text in lines:
        entries[text] = [hashlib.sha1(text.encode("utf-8")).hexdigest()[:12] + ".mp3", 0.0]
    for vid, sid, name, desc in VOICES:
        if a.only and vid != a.only:
            continue
        d = os.path.join(OUT, vid)
        os.makedirs(d, exist_ok=True)
        keep = set()
        for n, text in enumerate(lines):
            fn = entries[text][0]
            keep.add(fn)
            dst = os.path.join(d, fn)
            if os.path.exists(dst) and not a.force and text not in redo:
                dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", dst]))
            else:
                g = tts.generate(for_speech(text), sid=sid, speed=SPEED)
                with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
                    sf.write(tmp.name, g.samples, g.sample_rate)
                    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", tmp.name, "-af", FILTER, "-ar", "24000", "-ac", "1",
                                    "-c:a", "libmp3lame", "-b:a", "40k", dst], check=True)
                dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", dst]))
            entries[text][1] = round(max(entries[text][1], dur), 2)
            if n % 50 == 0:
                print(vid, n, "/", len(lines), file=sys.stderr)
        for f in os.listdir(d):
            if f.endswith(".mp3") and f not in keep:
                os.remove(os.path.join(d, f))  # 句子已不再使用的旧录音
    manifest = {"engine": "Kokoro-82M v1.1-zh (Apache-2.0) via sherpa-onnx", "speed": SPEED,
                "voices": [{"id": v[0], "name": v[2], "desc": v[3], "sid": v[1]} for v in VOICES],
                "lines": entries}
    json.dump(manifest, open(mf, "w"), ensure_ascii=False, separators=(",", ":"))
    print("OK", len(lines), "句 ×", len(VOICES), "个声音", file=sys.stderr)


if __name__ == "__main__":
    main()
