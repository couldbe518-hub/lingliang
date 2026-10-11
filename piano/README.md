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
- 赞美诗 5 首（耶稣恩友、有福的确据、齐来崇拜、求主同住、芬兰颂）：Echoes of Grace 诗本四部和声，
  LilyPond 源码 github.com/kulp/eog（维护者声明放弃版权）。编译时需给 `inc/common/*.ily`、`override/*.ily` 放空文件，
  并定义 `mon`、`moff`、`eogbreak` 为空。
- 名曲 5 首：月光奏鸣曲、K.545、肖邦前奏曲 No.4 / No.7 来自 KernScores（Craig Stuart Sapp 编码，CC BY-NC-SA 4.0，仅非商业使用）；
  巴赫 BWV 846 来自 music21 语料库。
- 同一来源也核对了已有的三一颂、普世欢腾、平安夜、耶稣爱我的旋律，音高一致；耶稣爱我据此补上了副歌。

记谱扩展：`rh2` / `lh2` = 同一只手的第二声部；`x` = 不显示的休止；最短时值 0.125 拍（三十二分音符）。
