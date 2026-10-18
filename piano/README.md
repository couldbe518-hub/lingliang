# Grace 练琴

网址：https://couldbe518-hub.github.io/lingliang/piano/

纯静态网页，所有功能在浏览器本地运行（Web Audio 发声、麦克风音高识别、MediaRecorder 录音），日常使用不调用任何 AI，不耗 token。练习记录和录音只存在 Grace 自己的设备上。

## 文件
- `data.js` —— 曲库与识谱课（改曲目只改这里，写法见文件开头注释）
- `version.json` —— 每次改动后把 `v` 改成新值，Grace 的设备会在 5 分钟内或下次打开时自动刷新
- `app.js` / `music.js` / `index.html` —— 程序
- `vendor/abcjs-basic-min.js` —— 五线谱渲染库 abcjs 6.4.4（MIT），本地托管
- `tools/validate.js` —— `node piano/tools/validate.js` 检查每小节拍数、两手对齐

## 修改流程（Kevin 侧）
1. 在 Claude 会话里说要改什么（加曲子、改难度、改说明）。
2. Claude 修改 `data.js`，运行校验脚本，更新 `version.json`，推送到 `main`。
3. GitHub Pages 约 1 分钟后发布；Grace 那边自动刷新。

曲目均为公有领域旋律的简易改编。

## 进阶曲目的来源（2026-10-12 加入）
进阶级（level 4）的 10 首不是凭记忆写的，而是用 `tools/import_score.py` 从权威数字乐谱转换：
- 赞美诗 5 首（耶稣恩友、有福的确据、听啊天使高声唱、求主同住、芬兰颂）：Echoes of Grace 诗本四部和声，
  LilyPond 源码 github.com/kulp/eog（维护者声明放弃版权）。编译时需给 `inc/common/*.ily`、`override/*.ily` 放空文件，
  并定义 `mon`、`moff`、`eogbreak` 为空。
- 名曲 5 首：月光奏鸣曲、K.545、肖邦前奏曲 No.4 / No.7 来自 KernScores（Craig Stuart Sapp 编码，CC BY-NC-SA 4.0，仅非商业使用）；
  巴赫 BWV 846 来自 music21 语料库。
- 同一来源也核对了已有的三一颂、普世欢腾、平安夜、耶稣爱我的旋律，音高一致；耶稣爱我据此补上了副歌。

记谱扩展：`rh2` / `lh2` = 同一只手的第二声部；`x` = 不显示的休止；最短时值 0.125 拍（三十二分音符）。

## 歌词（2026-10-18 加入）
11 首赞美诗都在右手旋律下配了第一段英文原文歌词（均为英文原作或通行的公有领域英译：
Silent Night 为 Young 1859 年英译，Be Still My Soul 为 Borthwick 1855 年英译），曲子页可用「显示歌词」开关。
对齐方式：`tools/lyrics_eog.py` 把歌词放进 Echoes of Grace 源码，由 LilyPond 算出每个音节对应的音；
三一颂、平安夜、奇异恩典、欢欣歌颂为逐音手工对齐。
更正：原「齐来崇拜」取自诗本中标为 Adeste Fideles 的曲子，核对后发现旋律并非 O Come All Ye Faithful，已换成「听啊，天使高声唱」。
