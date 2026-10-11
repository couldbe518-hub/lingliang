"""从权威数字乐谱（Humdrum kern / MusicXML / MIDI）导入曲目，转换成 data.js 的记谱格式。

依赖：pip install music21（MIDI 由 LilyPond 源码生成时另需 pip install lilypond）。
用法见文件末尾的 PIECES：每首曲子写明来源文件、小节范围、手的分配、移调等，运行后输出 JSON。
  python piano/tools/import_score.py <乐谱根目录> > out.json
"""
import json
import sys
from fractions import Fraction

from music21 import converter, corpus

LETTER_PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
KEY_ACC = {
    "C": {}, "Am": {}, "G": {"F": "#"}, "Em": {"F": "#"}, "D": {"F": "#", "C": "#"}, "Bm": {"F": "#", "C": "#"},
    "A": {"F": "#", "C": "#", "G": "#"}, "F#m": {"F": "#", "C": "#", "G": "#"},
    "E": {"F": "#", "C": "#", "G": "#", "D": "#"}, "C#m": {"F": "#", "C": "#", "G": "#", "D": "#"},
    "F": {"B": "b"}, "Dm": {"B": "b"}, "Bb": {"B": "b", "E": "b"}, "Gm": {"B": "b", "E": "b"},
    "Eb": {"B": "b", "E": "b", "A": "b"}, "Cm": {"B": "b", "E": "b", "A": "b"},
}
FLAT_KEYS = {"F", "Dm", "Bb", "Gm", "Eb", "Cm"}
VALID = [4, 3, 2, 1.5, 1, 0.75, 0.5, 0.375, 0.25, 0.125]  # 能用一个音符（可带附点）表示的拍数


def spell(midi, key):
    """按调号给 MIDI 音高取音名（用于没有原始拼写的 MIDI 来源）。"""
    pc = midi % 12
    acc = KEY_ACC[key]
    cands = []
    for L, base in LETTER_PC.items():
        for a, v in (("", 0), ("#", 1), ("b", -1)):
            if (base + v) % 12 == pc:
                cands.append((L, a))
    for L, a in cands:  # 调内音
        if acc.get(L, "") == a:
            return name(L, a, midi)
    pref = "b" if key in FLAT_KEYS else "#"
    for L, a in cands:
        if a == "" and L not in acc:
            return name(L, a, midi)
    for L, a in cands:
        if a == pref:
            return name(L, a, midi)
    L, a = cands[0]
    return name(L, a, midi)


def name(L, a, midi):
    v = {"": 0, "#": 1, "b": -1}[a]
    octv = (midi - LETTER_PC[L] - v) // 12 - 1
    return f"{L}{a}{octv}"


def m21name(p):
    a = {"": "", "#": "#", "-": "b"}.get(p.accidental.modifier if p.accidental else "", "")
    if p.accidental and p.accidental.modifier not in ("", "#", "-"):
        return None
    return f"{p.step}{a}{p.octave if p.octave is not None else 4}"


def q(x, grid):
    return round(float(x) / grid) * grid


def slice_notes(notes, grid):
    """notes: [(on, end, [names], [midis])] → 同一只手的切片 [(start, dur, names)]，names 为空即休止。"""
    notes = [(q(a, grid), q(b, grid), n, m) for a, b, n, m in notes]
    notes = [x for x in notes if x[1] > x[0]]
    if not notes:
        return []
    bounds = sorted({x[0] for x in notes} | {x[1] for x in notes} | {0.0})
    out = []
    for a, b in zip(bounds, bounds[1:]):
        sounding = [x for x in notes if x[0] <= a < x[1]]
        attacked = [x for x in sounding if x[0] == a]
        if not sounding:
            if out and not out[-1][2]:
                out[-1][1] += b - a
            else:
                out.append([a, b - a, []])
        elif not attacked and out and out[-1][2]:
            out[-1][1] += b - a
        else:
            pairs = {}
            for x in sounding:
                for nm, md in zip(x[2], x[3]):
                    pairs[md] = nm
            out.append([a, b - a, [pairs[m] for m in sorted(pairs)]])
    return out


def decompose(d):
    parts = []
    while d > 1e-9:
        for v in VALID:
            if v <= d + 1e-9:
                parts.append(v)
                d -= v
                break
        else:
            raise ValueError("无法分解时值")
    return parts


def fmtdur(d):
    s = ("%g" % d)
    return "" if s == "1" else ":" + s


def to_string(slices, total, meter, pickup, invisible_rests=False):
    """按小节线切开并分解时值，生成 'C4+E4:2~ | ...' 形式的字符串。"""
    edges = [0.0, pickup if pickup else meter]
    while edges[-1] < total + meter:
        edges.append(edges[-1] + meter)
    bars = [[] for _ in edges]
    for s, d, names in slices:
        e = min(s + d, total)
        t = s
        while t < e - 1e-9:
            bi = max(i for i, x in enumerate(edges) if x <= t + 1e-9)
            seg_end = min(e, edges[bi + 1])
            chunks = decompose(seg_end - t)
            for i, c in enumerate(chunks):
                last = (seg_end >= e - 1e-9) and i == len(chunks) - 1
                if names:
                    tok = "+".join(names) + fmtdur(c) + ("" if last else "~")
                else:
                    tok = ("x" if invisible_rests else "r") + fmtdur(c)
                bars[bi].append(tok)
            t = seg_end
    return " | ".join(" ".join(b) for b in bars if b)


def collect(part, mfrom, mto, voice_map, transpose, key, spell_midi, scale):
    """把一个声部（钢琴的一行谱）里的音按 voice_map 分到不同的手：返回 {目标: [(on, end, names, midis)]} 和起点偏移。"""
    out = {}
    start = None
    for m in part.getElementsByClass("Measure"):
        if m.number is None or m.number < mfrom or m.number > mto:
            continue
        if start is None:
            start = m.offset
        vs = list(m.voices)
        streams = []
        if vs:
            means = []
            for v in vs:
                ps = [p.midi for n in v.notes for p in n.pitches]
                means.append(sum(ps) / len(ps) if ps else -1)
            order = sorted(range(len(vs)), key=lambda i: -means[i])
            for rank, i in enumerate(order):
                streams.append((voice_map.get("v%d" % rank, voice_map.get("v0")), vs[i]))
        direct = [n for n in m.notesAndRests if not n.isRest]
        if direct:
            streams.append((voice_map["direct"], m))
        for target, st in streams:
            if target is None:
                continue
            for n in st.notes:
                if n.duration.isGrace or n.quarterLength == 0:
                    continue
                on = (m.offset - start + n.offset) * scale
                end = on + n.quarterLength * scale
                names, midis = [], []
                for p in n.pitches:
                    md = p.midi + transpose
                    nm = spell(md, key) if (spell_midi or transpose) else m21name(p)
                    if nm is None:
                        nm = spell(md, key)
                    names.append(nm)
                    midis.append(md)
                out.setdefault(target, []).append((on, end, names, midis))
    return out


def from_midi(path, transpose, key):
    """LilyPond 生成的 MIDI：第 1 轨 = 女声（右手），第 2 轨 = 男声（左手）。"""
    s = converter.parse(path)
    hands = {}
    for target, p in zip(["rh", "lh"], s.parts):
        lst = []
        for n in p.flatten().notes:
            on = float(n.offset)
            end = on + float(n.quarterLength)
            midis = [x.midi + transpose for x in n.pitches]
            lst.append((on, end, [spell(md, key) for md in midis], midis))
        hands[target] = lst
    return hands


def load(src, root):
    if src.startswith("corpus:"):
        s = corpus.parse(src[7:])
    else:
        s = converter.parse(root + "/" + src)
    return s.stripTies()


def build(piece, root):
    meter, pickup = piece["meterBeats"], piece.get("pickup", 0)
    if piece["src"].endswith(".midi"):
        hands = from_midi(root + "/" + piece["src"], piece.get("transpose", 0), piece["key"])
        hands = {k: v for k, v in hands.items()}
        total = max(e for lst in hands.values() for _, e, _, _ in lst)
    else:
        s = load(piece["src"], root)
        hands = {}
        for pi, vmap in enumerate(piece["parts"]):
            got = collect(s.parts[pi], piece["from"], piece["to"], vmap, piece.get("transpose", 0), piece["key"], False, piece.get("scale", 1))
            for k, v in got.items():
                hands.setdefault(k, []).extend(v)
        total = piece["total"]
    out = {}
    for k, lst in hands.items():
        sl = slice_notes(lst, piece.get("grid", 0.125))
        if sl and sl[-1][0] + sl[-1][1] < total:
            sl.append([sl[-1][0] + sl[-1][1], total - sl[-1][0] - sl[-1][1], []])
        out[k] = to_string(sl, total, meter, pickup, invisible_rests=k.endswith("2") or piece.get("invisible", {}).get(k, False))
    return out


PIECES = {
    # 赞美诗：Echoes of Grace 诗本 LilyPond 源码（github.com/kulp/eog）生成的 MIDI，四部和声
    "what-a-friend": {"src": "ly/EOG282.midi", "key": "F", "meterBeats": 4},
    "blessed-assurance": {"src": "ly/EOG149.midi", "key": "D", "meterBeats": 4.5, "pickup": 1.5},
    "adeste": {"src": "ly/EOG226.midi", "key": "G", "transpose": -2, "meterBeats": 4, "pickup": 1},
    "abide": {"src": "ly/EOG076.midi", "key": "D", "transpose": -2, "meterBeats": 4},
    "finlandia": {"src": "ly/EOG173.midi", "key": "F", "meterBeats": 4, "pickup": 3},
    # 名曲：KernScores（github.com/craigsapp）与 music21 语料库
    "moonlight": {"src": "beethoven-piano-sonatas/kern/sonata14-1.krn", "key": "C#m", "from": 1, "to": 9, "scale": 1.5, "grid": 0.5,
                  "meterBeats": 6, "total": 54, "invisible": {"rh": True},
                  "parts": [{"direct": "rh2", "v0": "rh", "v1": "rh2"}, {"direct": "lh", "v0": "lh", "v1": "lh"}]},
    "k545": {"src": "mozart-piano-sonatas/kern/sonata15-1.krn", "key": "C", "from": 1, "to": 12, "meterBeats": 4, "total": 48,
             "parts": [{"direct": "rh", "v0": "rh", "v1": "rh"}, {"direct": "lh", "v0": "lh", "v1": "lh"}]},
    "chopin-4": {"src": "chopin-preludes/kern/prelude28-04.krn", "key": "Em", "from": 0, "to": 25, "meterBeats": 4, "pickup": 1, "total": 97,
                 "grid": 0.25, "parts": [{"direct": "rh", "v0": "rh", "v1": "rh"}, {"direct": "lh", "v0": "lh", "v1": "lh"}]},
    "chopin-7": {"src": "chopin-preludes/kern/prelude28-07.krn", "key": "A", "from": 0, "to": 16, "meterBeats": 3, "pickup": 1, "total": 49,
                 "grid": 0.25, "parts": [{"direct": "rh", "v0": "rh", "v1": "rh"}, {"direct": "lh", "v0": "lh", "v1": "lh"}]},
    "bach-846": {"src": "corpus:bach/bwv846", "key": "C", "from": 1, "to": 19, "meterBeats": 4, "total": 76, "grid": 0.25,
                 "parts": [{"direct": "rh", "v0": "rh", "v1": "rh"}, {"direct": "lh", "v0": "lh2", "v1": "lh"}]},
}

if __name__ == "__main__":
    root = sys.argv[1]
    only = sys.argv[2:] or list(PIECES)
    print(json.dumps({k: build(PIECES[k], root) for k in only}, ensure_ascii=False, indent=1))
