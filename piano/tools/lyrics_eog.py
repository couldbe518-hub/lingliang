"""把标准英文歌词放进 Echoes of Grace 诗本的 LilyPond 源码，让 LilyPond 计算音节落在哪个音上。

输出：每个音节的起始时间（以四分音符为单位）和文字，以及女高音每个音的起始时间与音高。
用法：python lyrics_eog.py <eog仓库> <stub目录> <编号> "<LilyPond 歌词，音节间用 -- >"
"""
import json, os, re, subprocess, sys, tempfile
import lilypond, mido

def run(eog, stub, num, text):
    src = open(os.path.join(eog, "src", "EOG%s.ly" % num), encoding="utf-8").read()
    i = src.index("wordsA = \\lyricmode {")
    j = src.index("\n}", i)
    src = src[:i] + "wordsA = \\lyricmode {\n" + text + "\n" + src[j:]
    src += "\n\\score { \\new Staff { \\notesSoprano } \\midi { } }\n"
    d = tempfile.mkdtemp()
    f = os.path.join(d, "x.ly"); open(f, "w", encoding="utf-8").write(src)
    subprocess.run([lilypond.executable(), "-s", "-deog-midi-permitted", "-dno-print-pages",
                    "-I", stub, "-I", os.path.join(eog, "inc"), "-I", os.path.join(eog, "src"), "-o", os.path.join(d, "x"), f],
                   check=False, capture_output=True)
    def events(path, want):
        m = mido.MidiFile(path); tpq = m.ticks_per_beat; out = []
        for tr in m.tracks:
            t = 0
            for msg in tr:
                t += msg.time
                if want == "lyr" and msg.type == "lyrics" and tr.name.strip().startswith("one"):
                    out.append((t / tpq, msg.text.encode("latin-1", "ignore").decode("utf-8", "ignore")))
                if want == "note" and msg.type == "note_on" and msg.velocity > 0:
                    out.append((t / tpq, msg.note))
        return sorted(out)
    lyr = events(os.path.join(d, "x.midi"), "lyr")
    sop = events(os.path.join(d, "x-1.midi"), "note")
    return {"lyrics": lyr, "soprano": sop}

if __name__ == "__main__":
    eog, stub, num, text = sys.argv[1:5]
    print(json.dumps(run(eog, stub, num, text), ensure_ascii=False))
