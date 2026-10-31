#!/usr/bin/env python3
"""核对语音包：用中文语音识别（paraformer）把每段 mp3 听一遍，按拼音比对原句，列出偏差大的句子。
用法：python3 tools/verify_voice.py --asr <paraformer 目录> [--threshold 0.3] [--out bad.json]
输出的 bad.json 可直接交给 make_voice.py --lines bad.json --force --asr ... 重做。"""
import argparse, json, os, re, subprocess, sys, tempfile, difflib
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--asr", required=True); ap.add_argument("--threshold", type=float, default=0.3)
    ap.add_argument("--out", default=os.path.join(ROOT, "voice", "verify.json")); a = ap.parse_args()
    import sherpa_onnx, soundfile as sf, numpy as np
    from pypinyin import lazy_pinyin
    R = a.asr.rstrip("/") + "/"
    rec = sherpa_onnx.OfflineRecognizer.from_paraformer(paraformer=R + "model.int8.onnx", tokens=R + "tokens.txt", num_threads=os.cpu_count() or 4)
    keep = lambda t: re.sub(r"[^一-鿿A-Za-z0-9]", "", t)
    def err(ref, hyp): return 1 - difflib.SequenceMatcher(None, lazy_pinyin(keep(ref)), lazy_pinyin(keep(hyp))).ratio()
    m = json.load(open(os.path.join(ROOT, "voice", "manifest.json"), encoding="utf-8"))
    res = {}; bad = []
    with tempfile.TemporaryDirectory() as td:
        for n, (text, (fn, dur)) in enumerate(m["lines"].items()):
            p = os.path.join(ROOT, "voice", m["voices"][0]["id"], fn)
            if not os.path.exists(p): bad.append(text); res[text] = [1.0, "缺文件"]; continue
            w = os.path.join(td, "x.wav")
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", p, "-ar", "16000", "-ac", "1", w], check=True)
            x, sr = sf.read(w, dtype="float32")
            st = rec.create_stream(); st.accept_waveform(16000, np.concatenate([np.zeros(8000, np.float32), x, np.zeros(8000, np.float32)])); rec.decode_stream(st)
            e = round(err(text, st.result.text), 2); res[text] = [e, st.result.text]
            if e > a.threshold: bad.append(text)
            if n % 100 == 99: print(n + 1, "/", len(m["lines"]), "超阈值", len(bad), file=sys.stderr)
    json.dump({"threshold": a.threshold, "results": res}, open(a.out + ".full.json", "w", encoding="utf-8"), ensure_ascii=False)
    json.dump(bad, open(a.out, "w", encoding="utf-8"), ensure_ascii=False)
    es = sorted(v[0] for v in res.values()); print("共", len(res), "句，中位", es[len(es)//2], "超阈值", len(bad), "→", a.out, file=sys.stderr)
if __name__ == "__main__": main()
