/**
 * 构建网页预览版
 * 把 miniprogram/utils 下的四个模块原样内联进一个单文件 HTML，
 * 这样预览版与小程序用的是**同一份玩法代码**，不会出现两边行为不一致。
 *
 *   node tools/build-preview.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const UTILS = path.join(ROOT, 'miniprogram', 'utils');
const FILES = ['game.js', 'geo.js', 'solver.js', 'draw.js', 'core.js'];

// 极简 CommonJS 运行时：按 basename 解析 require
const runtime = `
(function () {
  var __mods = {};
  function __norm(p) { return String(p).replace(/^.*[\\\\/]/, ''); }
  window.__mods = __mods;
  window.require = function (p) {
    var k = __norm(p);
    if (!(k in __mods)) throw new Error('模块未找到: ' + p);
    return __mods[k];
  };
  window.__define = function (name, fn) {
    var mod = { exports: {} };
    fn(mod, mod.exports, window.require);
    __mods[name] = mod.exports;
  };
})();
`;

function wrap(file) {
  const src = fs.readFileSync(path.join(UTILS, file), 'utf8');
  return `window.__define(${JSON.stringify(file)}, function (module, exports, require) {\n${src}\n});\n`;
}

const bundle = runtime + FILES.map(wrap).join('\n');

const CSS = `
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
html, body { margin: 0; padding: 0; }
body {
  min-height: 100vh;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(180deg, #FCFAF5 0%, #EFE9DD 100%);
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
  color: #3D3A34;
  overflow: hidden;
}
.app {
  width: 100%; max-width: 420px; height: 100vh;
  max-height: 900px;
  padding: 14px 16px 16px;
  display: flex; flex-direction: column; align-items: center;
}
.hud {
  width: 100%; display: flex; background: #fff; border-radius: 14px;
  padding: 10px 0; box-shadow: 0 2px 10px rgba(120,110,90,.08);
  position: relative;
}
.hud-item { flex: 1; display: flex; flex-direction: column; align-items: center; position: relative; }
.hud-item + .hud-item::before {
  content: ''; position: absolute; left: 0; top: 6px; bottom: 6px; width: 1px; background: #EFEBE2;
}
.hud-num { font-size: 21px; font-weight: 600; color: #2F2C27; font-variant-numeric: tabular-nums; }
.hud-num small { font-size: 12px; color: #A9A294; font-weight: 500; }
.hud-label { margin-top: 1px; font-size: 11px; color: #A9A294; }
.bar { width: 100%; height: 4px; margin: 10px 0 4px; border-radius: 4px; background: #E9E3D8; overflow: hidden; }
.bar-fill { height: 100%; width: 100%; border-radius: 4px; background: linear-gradient(90deg,#F0B429,#34A06A); transition: width .22s ease-out; }
.board-wrap { width: 100%; flex: 1; display: flex; align-items: center; justify-content: center; min-height: 0; padding: 4px 0; position: relative; }
canvas { display: block; touch-action: none; cursor: grab; }
canvas.dragging { cursor: grabbing; }
.tip { font-size: 12px; line-height: 17px; color: #A29B8D; text-align: center; padding: 0 10px; }
.levels { display: flex; gap: 8px; margin-top: 10px; }
.chip {
  padding: 5px 17px; border-radius: 999px; font-size: 13px; color: #8C8578;
  background: #fff; border: 1px solid #E7E1D6; cursor: pointer; user-select: none;
}
.chip.on { color: #fff; background: #3D6FD6; border-color: #3D6FD6; font-weight: 500; }
.actions { width: 100%; display: flex; gap: 10px; margin-top: 11px; }
.learn-row { margin-top: 8px; }
.learn-btn.on {
  color: #fff; font-weight: 500;
  background: linear-gradient(135deg,#3FB98A,#2E9B69);
  box-shadow: 0 4px 12px rgba(46,155,105,.26);
}
.btn.next {
  flex: 1.5; color: #fff; font-weight: 500;
  background: linear-gradient(135deg,#4A82E8,#3563C8);
  box-shadow: 0 4px 12px rgba(60,105,200,.3);
}
.btn.next.done {
  background: linear-gradient(135deg,#8FB8EF,#6C9BE0); box-shadow: none;
}
.btn {
  flex: 1; height: 46px; line-height: 46px; text-align: center; border-radius: 10px;
  font-size: 15px; color: #4A4640; background: #fff; cursor: pointer; user-select: none;
  box-shadow: 0 2px 8px rgba(120,110,90,.09);
}
.btn:active { opacity: .72; }
.btn.primary {
  flex: 1.5; color: #fff; font-weight: 500;
  background: linear-gradient(135deg,#4A82E8,#3563C8);
  box-shadow: 0 4px 12px rgba(60,105,200,.3);
}
.foot { margin-top: 12px; font-size: 11px; color: #B6AFA1; letter-spacing: .5px; }
/* 胜利提示：直接覆盖在计分块（步数/用时）上，高度与之一致 */
.win-pop {
  position: absolute; inset: 0; border-radius: 14px; background: #fff;
  display: none; align-items: center; padding: 0 14px; gap: 9px;
  box-shadow: 0 2px 10px rgba(120,110,90,.08); z-index: 20;
  opacity: 0; transition: opacity .22s ease-out;
}
.win-pop.show { display: flex; opacity: 1; }
.win-badge {
  flex: none; width: 30px; height: 30px; line-height: 30px; text-align: center; border-radius: 50%;
  font-size: 15px; color: #fff; background: linear-gradient(135deg,#4CC48A,#2E9B69);
}
.win-title { flex: none; font-size: 16px; font-weight: 600; color: #2F2C27; }
.win-sub { flex: none; font-size: 11px; color: #9C9587; white-space: nowrap; }
.win-btn {
  flex: none; margin-left: auto; width: 82px; height: 32px; line-height: 32px; text-align: center;
  border-radius: 8px; font-size: 12px; color: #fff; cursor: pointer;
  background: linear-gradient(135deg,#4A82E8,#3563C8);
}
.win-link { flex: none; font-size: 11px; color: #A9A294; cursor: pointer; padding: 4px 2px; }
`;

const APP = `
var core = require('core.js'), GEO = require('geo.js'), DRAW = require('draw.js');

var els = {
  canvas: document.getElementById('board'),
  steps: document.getElementById('steps'),
  time: document.getElementById('time'),
  done: document.getElementById('done'),
  bar: document.getElementById('bar'),
  tip: document.getElementById('tip'),
  levels: document.getElementById('levels'),
  mask: document.getElementById('mask'),
  winSub: document.getElementById('winSub'),
  shuffle: document.getElementById('shuffle'),
  undo: document.getElementById('undo'),
  reset: document.getElementById('reset'),
  learn: document.getElementById('learn'),
  next: document.getElementById('next'),
  winBtn: document.getElementById('winBtn'),
  winLink: document.getElementById('winLink')
};

var W = 0, H = 0;
var engine = core.createEngine({
  onHud: function (h) {
    els.steps.textContent = h.steps;
    els.time.textContent = h.timeText;
    els.done.innerHTML = h.doneCount + '<small>/36</small>';
    els.bar.style.width = h.donePct + '%';
  },
  onWin: function (h) {
    els.winSub.textContent = '用时 ' + h.timeText + '　·　' + h.steps + ' 步';
    els.mask.classList.add('show');
    if (navigator.vibrate) navigator.vibrate(40);
  }
});
window.__engine = engine;   // 供自动化测试/调试

// 难度
core.LEVELS.forEach(function (lv) {
  var b = document.createElement('div');
  b.className = 'chip' + (lv.key === 'normal' ? ' on' : '');
  b.textContent = lv.label;
  b.dataset.key = lv.key;
  b.onclick = function () {
    if (lv.key === engine.level) return;
    engine.setLevel(lv.key);
    [].forEach.call(els.levels.children, function (n) { n.classList.toggle('on', n.dataset.key === lv.key); });
  };
  els.levels.appendChild(b);
});

function resize() {
  var wrap = els.canvas.parentNode;
  var size = Math.floor(Math.min(wrap.clientWidth, wrap.clientHeight));
  if (size < 120) size = 120;
  if (size === W) return;
  W = H = size;
  var dpr = window.devicePixelRatio || 1;
  els.canvas.width = Math.round(size * dpr);
  els.canvas.height = Math.round(size * dpr);
  els.canvas.style.width = size + 'px';
  els.canvas.style.height = size + 'px';
  var ctx = els.canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  window.__ctx = ctx;
  var pad = size * 0.035;
  engine.setViewport((size / 2 - pad) / GEO.DISC_R, size / 2, size / 2);
}

function frame() {
  engine.tick();
  DRAW.drawBoard(window.__ctx, W, H, engine.view());
  requestAnimationFrame(frame);
}
resize();
window.addEventListener('resize', resize);
requestAnimationFrame(frame);

// ── 指针事件（鼠标 / 触屏通用）──
function local(e) {
  var r = els.canvas.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}
var active = false;

els.canvas.addEventListener('pointerdown', function (e) {
  var p = local(e);
  active = engine.down(p[0], p[1]);
  if (active) {
    try { els.canvas.setPointerCapture(e.pointerId); } catch (err) {}
    els.canvas.classList.add('dragging');
  }
  e.preventDefault();
});
els.canvas.addEventListener('pointermove', function (e) {
  if (!active) return;
  var p = local(e);
  engine.move(p[0], p[1]);
  e.preventDefault();
});
function end(e) {
  if (!active) return;
  active = false;
  engine.up();
  els.canvas.classList.remove('dragging');
}
els.canvas.addEventListener('pointerup', end);
els.canvas.addEventListener('pointercancel', end);
els.canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

// ── 按钮 ──
function doShuffle() { els.mask.classList.remove('show'); engine.shuffle(); syncLearn(); }
els.shuffle.onclick = doShuffle;
els.winBtn.onclick = doShuffle;
els.undo.onclick = function () { engine.undo(); setTimeout(syncLearn, 240); };
els.reset.onclick = function () { els.mask.classList.remove('show'); engine.reset(); syncLearn(); };
els.winLink.onclick = function () { els.mask.classList.remove('show'); engine.reset(); syncLearn(); };

// ── 学习模式 ──
function syncLearn() {
  var ls = engine.learnState();
  els.learn.classList.toggle('on', ls.on);
  els.learn.textContent = ls.on ? '学习模式 · 已开启' : '学习模式';
  els.tip.textContent = ls.on
    ? '盘面已锁定，点击「下一步」逐步演示；关闭学习模式后恢复手动拨动'
    : '按住任意外圈，沿圆周方向拨动；捏住中心转子左右拨动换珠';
  var done = ls.on && ls.left === 0;
  els.next.style.display = ls.on ? '' : 'none';
  els.next.classList.toggle('done', done);
  els.next.textContent = done ? '已完成 ✓'
    : (ls.left === null || ls.left === undefined ? '下一步' : '下一步（剩 ' + ls.left + ' 步）');
}
els.learn.onclick = function () { engine.setLearn(!engine.learnState().on); syncLearn(); };
els.next.onclick = function () {
  if (!engine.learnNext()) { syncLearn(); return; }
  syncLearn();
  var wait = setInterval(function () {
    if (!engine.busy) { clearInterval(wait); syncLearn(); }
  }, 60);
};
document.addEventListener('visibilitychange', function () {
  if (document.hidden) engine.pause(); else engine.resume();
});
syncLearn();
`;

const HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>滚珠魔方豆 · 网页预览</title>
<style>${CSS}</style>
</head>
<body>
<div class="app">
  <div class="hud">
    <div class="hud-item"><div class="hud-num" id="steps">0</div><div class="hud-label">步数</div></div>
    <div class="hud-item"><div class="hud-num" id="time">00:00</div><div class="hud-label">用时</div></div>
    <div class="hud-item"><div class="hud-num" id="done">36<small>/36</small></div><div class="hud-label">已归位</div></div>
    <div class="win-pop" id="mask">
      <div class="win-badge">✓</div>
      <div class="win-title">复原成功</div>
      <div class="win-sub" id="winSub"></div>
      <div class="win-btn" id="winBtn">再来一局</div>
      <div class="win-link" id="winLink">看看原始排列</div>
    </div>
  </div>
  <div class="bar"><div class="bar-fill" id="bar"></div></div>
  <div class="board-wrap"><canvas id="board"></canvas></div>
  <div class="tip" id="tip">按住任意外圈，沿圆周方向拨动；捏住中心转子左右拨动换珠</div>
  <div class="levels" id="levels"></div>
  <div class="actions">
    <div class="btn primary" id="shuffle">一键打乱</div>
    <div class="btn" id="undo">撤销</div>
    <div class="btn" id="reset">重来</div>
  </div>
  <div class="actions learn-row">
    <div class="btn learn-btn" id="learn">学习模式</div>
    <div class="btn next" id="next" style="display:none">下一步</div>
  </div>
  <div class="foot">3 圈 × 12 颗 = 36 颗珠 · 每次换圈只动 6 颗</div>
</div>
<script>${bundle}</script>
<script>${APP}</script>
</body>
</html>
`;

const OUT_DIR = path.join(ROOT, '预览');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
const out = path.join(OUT_DIR, '滚珠魔方豆-网页预览.html');
fs.writeFileSync(out, HTML, 'utf8');
console.log('已生成：' + out);
console.log('大小：' + (Buffer.byteLength(HTML) / 1024).toFixed(1) + ' KB');
