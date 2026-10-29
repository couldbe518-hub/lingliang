// 列出灵粮读经语音包要覆盖的全部中文句子（早晚祷引导语、主祷文、经典经文、情境经文与祷告文），输出 JSON 数组。
// 用法：先在仓库根目录起一个静态服务（python3 -m http.server 8765），再 node tools/voice_lines.js > lines.json
const {chromium}=require(process.env.PW||'playwright');
(async()=>{const br=await chromium.launch();const pg=await br.newPage();await pg.goto(process.env.URL||'http://127.0.0.1:8765/');await pg.waitForFunction(()=>window.__voiceLines&&typeof C!=="undefined"&&C,null,{timeout:60000});const lines=await pg.evaluate(()=>window.__voiceLines());console.log(JSON.stringify(lines));await br.close()})().catch(e=>{console.error(e);process.exit(1)});
