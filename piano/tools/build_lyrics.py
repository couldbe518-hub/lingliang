import json, subprocess, sys, re
SP=sys.argv[1]; EOG=SP+'/eog'; STUB=SP+'/stub'
ev=json.load(open(SP+'/hymn_events.json'))
T={
 'jesus-loves-me':(312,'seq',-3,"Je -- sus loves me! this I know, For the Bi -- ble tells me so; Lit -- tle ones to Him be -- long; They are weak, but He is strong. Yes, Je -- sus loves me! Yes, Je -- sus loves me! Yes, Je -- sus loves me! The Bi -- ble tells me so."),
 'doxology':(135,'seq',-2,"Praise God, from whom all bless -- ings flow; Praise Him, all crea -- tures here be -- low; Praise Him a -- bove, ye heav'n -- ly host; Praise Fa -- ther, Son, and Ho -- ly Ghost."),
 'silent-night':(45,'seq',None,"Si -- lent night, ho -- ly night, All is calm, all is bright Round yon vir -- gin moth -- er and child. Ho -- ly in -- fant so ten -- der and mild, Sleep in heav -- en -- ly peace, Sleep in heav -- en -- ly peace."),
 'joy-to-the-world':(285,'seq',-2,"Joy to the world! the Lord is come; Let earth re -- ceive her King; Let ev -- 'ry heart pre -- pare Him room, And heav'n and na -- ture sing, And heav'n and na -- ture sing, And heav'n, and heav'n, and na -- ture sing."),
 'what-a-friend':(282,'time',0,"What a friend we have in Je -- sus, All our sins and griefs to bear! What a priv -- i -- lege to car -- ry Ev -- 'ry -- thing to God in prayer! O what peace we of -- ten for -- feit, O what need -- less pain we bear, All be -- cause we do not car -- ry Ev -- 'ry -- thing to God in prayer!"),
 'blessed-assurance':(149,'time',0,"Bless -- ed as -- sur -- ance, Je -- sus is mine! O what a fore -- taste of glo -- ry di -- vine! Heir of sal -- va -- tion, pur -- chase of God, Born of His Spir -- it, washed in His blood. This is my sto -- ry, this is my song, Prais -- ing my Sav -- ior all the day long; This is my sto -- ry, this is my song, Prais -- ing my Sav -- ior all the day long."),
 'hark-herald':(16,'time',0,"Hark! the her -- ald an -- gels sing, \"Glo -- ry to the new -- born King; Peace on earth, and mer -- cy mild, God and sin -- ners re -- con -- ciled!\" Joy -- ful, all ye na -- tions, rise, Join the tri -- umph of the skies; With th'an -- gel -- ic host pro -- claim, \"Christ is born in Beth -- le -- hem!\" Hark! the her -- ald an -- gels sing, \"Glo -- ry to the new -- born King!\""),
 'abide':(76,'time',-2,"A -- bide with me; fast falls the e -- ven -- tide; The dark -- ness deep -- ens; Lord, with me a -- bide; When oth -- er help -- ers fail and com -- forts flee, Help of the help -- less, O a -- bide with me."),
 'finlandia':(173,'time',0,"Be still, my soul: the Lord is on thy side; Bear pa -- tient -- ly the cross of grief or pain; Leave to thy God to or -- der and pro -- vide; In ev -- 'ry change He faith -- ful will re -- main. Be still, my soul: thy best, thy heav'n -- ly Friend Through thorn -- y ways leads to a joy -- ful end."),
}
def syls(text):
    toks=text.split(); out=[]
    for i,t in enumerate(toks):
        if t=='--': out[-1][1]=True; continue
        out.append([t,False])
    return out
res={}
for sid,(num,mode,tr,text) in T.items():
    d=json.loads(subprocess.run([SP+'/venv/bin/python','/home/user/lingliang/piano/tools/lyrics_eog.py',EOG,STUB,'%03d'%num,text],capture_output=True,text=True).stdout)
    S=syls(text); L=d['lyrics']; sop=d['soprano']
    if len(S)!=len(L): print('!!',sid,'音节数',len(S),'LilyPond 对齐',len(L)); continue
    mel=[e for e in ev[sid] if not e['rest'] and not e['tf']]
    on=[round(x[0],3) for x in sop]; ltimes=[]; last=-1
    for t,_ in L:
        c=[o for o in on if o>=round(t,3)-1e-6 and o>last]
        if not c: break
        last=c[0]; ltimes.append(c[0])
    if mode=='seq':
        if len(mel)!=len(sop): print('!!',sid,'音数不同',len(mel),len(sop)); continue
        bad=[i for i,(m,s) in enumerate(zip(mel,sop)) if tr is not None and (s[1]+tr-m['top'])%12]
        if bad: print('!!',sid,'音高不符 at',bad[:5]); continue
        flags=[round(x[0],3) in ltimes for x in sop]
    else:
        flags=[round(e['t'],3) in ltimes for e in mel]
    if sum(flags)!=len(S): print('!!',sid,'对上音节',sum(flags),'/',len(S)); continue
    toks=[]; k=0
    for f in flags:
        if f: s,h=S[k]; toks.append(s.replace('-','\\-')+('-' if h else '')); k+=1
        else: toks.append('_')
    res[sid]=' '.join(toks); print('OK',sid,len(S),'音节',len(mel),'音')
json.dump(res,open(SP+'/lyrics_out.json','w'),ensure_ascii=False,indent=1)
