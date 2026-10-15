/**
 * 滚珠魔方豆 · 交互控制器（与平台无关）
 * 小程序页面与网页预览都只是给它接一个画布 + 一个逐帧循环，
 * 所有"拨动 → 进档 → 落账 → 判定"的逻辑都在这里，两边行为完全一致。
 *
 * 依赖注入：{ now, onHud, onWin }
 */

var G = require('./game.js');
var GEO = require('./geo.js');
var SOLVER = require('./solver.js');

var DEG = GEO.DEG;

var LEVELS = [
  { key: 'easy', label: '简单', steps: 14 },
  { key: 'normal', label: '普通', steps: 30 },
  { key: 'hard', label: '困难', steps: 52 }
];

var CFG = {
  scrambleMs: 56,       // 打乱时每一步的动画时长（毫秒）
  ringStepDeg: 30,      // 外圈一格
  rotorStepDeg: 120,    // 转子一档
  rotorMinDeg: 44,      // 转子拨够这个角度才算进一档
  rotorLimitDeg: 130,   // 单次拖动最多拨到的角度
  ringSnapMs: 140,      // 松手回位动画
  rotorSnapMs: 190,
  grabBeadFactor: 1.75, // 手指离珠子多近算"抓住这颗珠"
  maxHistory: 600
};

function createEngine(opts) {
  opts = opts || {};
  var now = opts.now || function () { return Date.now(); };
  var onHud = opts.onHud || function () {};
  var onWin = opts.onWin || function () {};

  var E = {};

  // ────────────── 状态 ──────────────
  E.LEVELS = LEVELS;
  E.level = 'normal';
  E.game = { state: G.createState(), phase: G.createPhase() };
  E.vis = { ringExtra: [0, 0, 0], rho: 0, grab: null };

  E.anim = null;
  E.queue = [];
  E.queueSilent = true;
  E.queueEnd = null;
  E.queueDur = CFG.scrambleMs;

  E.history = [];
  E.moves = 0;
  E.busy = false;
  E.playing = false;
  E.won = false;
  E.drag = null;

  // 学习模式：开启后由求解器逐步带打
  E.learn = false;
  E.plan = null;

  E.elapsed = 0;
  E.running = false;
  E._t0 = 0;
  E._hudKey = '';

  // 视口（由宿主页面注入）
  E.scale = 1; E.cx = 0; E.cy = 0;

  // ────────────── 内部工具 ──────────────
  function timeText() {
    var s = Math.floor(E.elapsed / 1000);
    return ('0' + Math.floor(s / 60)).slice(-2) + ':' + ('0' + (s % 60)).slice(-2);
  }

  function pushHud(force) {
    var done = G.progress(E.game.state);
    var key = E.moves + '|' + done + '|' + timeText() + '|' + (E.running ? 1 : 0);
    if (!force && key === E._hudKey) return;
    E._hudKey = key;
    onHud({
      steps: E.moves,
      done: done,
      doneCount: done,
      donePct: Math.round(done / 36 * 100),
      timeText: timeText(),
      running: E.running
    });
  }
  E.pushHud = pushHud;

  function makeAnim(dur, apply, done) {
    return { t0: now(), dur: dur, apply: apply, done: done };
  }

  function startAnim(move, dur, silent) {
    if (move.t === 'r') {
      var r = move.r, d = move.d;
      var from = E.vis.ringExtra[r];
      var to = CFG.ringStepDeg * d;
      E.anim = makeAnim(dur, function (k) {
        E.vis.ringExtra[r] = from + (to - from) * k;
      }, function () {
        E.vis.ringExtra[r] = 0;
        E.game.phase[r] = G.mod(E.game.phase[r] + d, G.N);
        commit(move, silent);
      });
    } else {
      var f0 = E.vis.rho;
      var t0 = CFG.rotorStepDeg * move.d;
      E.anim = makeAnim(dur, function (k) {
        E.vis.rho = f0 + (t0 - f0) * k;
      }, function () {
        E.vis.rho = 0;
        G.turnCenter(E.game.state, E.game.phase, move.d);
        commit(move, silent);
      });
    }
  }

  function commit(move, silent) {
    if (silent) return;
    E.history.push(move);
    if (E.history.length > CFG.maxHistory) E.history.shift();
    E.moves += 1;
    pushHud();
    checkWin();
  }

  function checkWin() {
    if (E.won || !E.playing) return;
    if (!G.isSolved(E.game.state)) return;
    E.won = true;
    E.playing = false;
    E.running = false;
    pushHud(true);
    onWin({ steps: E.moves, timeText: timeText() });
  }

  function pick(x, y) {
    var vx = (x - E.cx) / E.scale;
    var vy = (E.cy - y) / E.scale;
    var d0 = Math.sqrt(vx * vx + vy * vy);

    // ① 落在中心转子毂范围内 → 转子（热区已随轴毂放大，见 geo.CENTER_TOUCH）
    if (d0 < GEO.CENTER_TOUCH) return { mode: 'center' };

    // ② 手指压在某颗珠上 → 归那颗珠所在的外圈
    var lim = GEO.BEAD_R * CFG.grabBeadFactor;
    var bestR = -1, bestD = 1e9;
    for (var r = 0; r < 3; r++) {
      var rot = CFG.ringStepDeg * (E.game.phase[r] % G.N) + E.vis.ringExtra[r];
      for (var i = 0; i < G.N; i++) {
        var p = GEO.slotPoint(r, i, rot);
        var dx = vx - p[0], dy = vy - p[1];
        var dd = Math.sqrt(dx * dx + dy * dy);
        if (dd < bestD) { bestD = dd; bestR = r; }
      }
    }
    if (bestR >= 0 && bestD < lim) return { mode: 'ring', ring: bestR };

    // ③ 盘心附近（爪指上、珠道内侧的空区）→ 转子
    if (d0 < GEO.RC * 0.82) return { mode: 'center' };

    // ④ 就近取外圈
    var bR = 0, bD = 1e9;
    for (var r2 = 0; r2 < 3; r2++) {
      var c = GEO.ringCenter(r2);
      var ex = vx - c[0], ey = vy - c[1];
      var diff = Math.abs(Math.sqrt(ex * ex + ey * ey) - GEO.RO);
      if (diff < bD) { bD = diff; bR = r2; }
    }
    return { mode: 'ring', ring: bR };
  }

  // ────────────── 生命周期 / 逐帧 ──────────────
  E.setViewport = function (scale, cx, cy) {
    E.scale = scale; E.cx = cx; E.cy = cy;
  };

  E.view = function () {
    return {
      scale: E.scale, cx: E.cx, cy: E.cy,
      state: E.game.state, phase: E.game.phase,
      ringExtra: E.vis.ringExtra, rho: E.vis.rho, grab: E.vis.grab
    };
  };

  E.tick = function () {
    var t = now();

    // 队列推进
    if (!E.anim) {
      if (E.queue.length) {
        startAnim(E.queue.shift(), E.queueDur, E.queueSilent);
      } else if (E.busy) {
        E.busy = false;
        var cb = E.queueEnd;
        E.queueEnd = null;
        if (cb) cb();
      }
    }

    // 当前动画
    if (E.anim) {
      var a = E.anim;
      var e = (t - a.t0) / a.dur;
      if (e > 1) e = 1;
      if (e < 0) e = 0;
      var k = e < 0.5 ? 4 * e * e * e : 1 - Math.pow(-2 * e + 2, 3) / 2;
      a.apply(k);
      if (e >= 1) { E.anim = null; a.done(); }
    }

    // 计时
    if (E.running) {
      E.elapsed = t - E._t0;
      pushHud();
    }
  };

  E.pause = function () {
    if (E.running) { E.elapsed = now() - E._t0; E.running = false; }
  };
  E.resume = function () {
    if (E.playing && !E.won) { E._t0 = now() - E.elapsed; E.running = true; }
  };

  // ────────────── 触摸 ──────────────
  E.down = function (x, y) {
    if (E.busy || E.won || !E.scale) return false;
    if (E.learn) return false;          // 学习模式锁定盘面，只能点「下一步」
    var p = pick(x, y);
    if (!p) return false;

    if (p.mode === 'ring') {
      var c = GEO.ringCenter(p.ring);
      var vx = (x - E.cx) / E.scale - c[0];
      var vy = (E.cy - y) / E.scale - c[1];
      if (Math.sqrt(vx * vx + vy * vy) < GEO.RO * 0.28) {
        E.drag = null; E.vis.grab = null; return false;   // 抓在圈心附近，角度太抖，忽略
      }
      E.drag = { mode: 'ring', ring: p.ring, last: Math.atan2(vy, vx) };
    } else {
      var w = E.rotorLocal(x, y);
      E.drag = { mode: 'center', last: Math.atan2(w[1], w[0]) };
    }
    E.vis.grab = p;
    return true;
  };

  E.rotorLocal = function (x, y) {
    return [(x - E.cx) / E.scale, (E.cy - y) / E.scale];
  };

  function norm(a) {
    while (a > 180) a -= 360;
    while (a < -180) a += 360;
    return a;
  }

  E.move = function (x, y) {
    var d = E.drag;
    if (!d) return;

    if (d.mode === 'ring') {
      var c = GEO.ringCenter(d.ring);
      var vx = (x - E.cx) / E.scale - c[0];
      var vy = (E.cy - y) / E.scale - c[1];
      var rad = Math.sqrt(vx * vx + vy * vy);
      var ang = Math.atan2(vy, vx);
      if (rad < GEO.RO * 0.34) { d.last = ang; return; }
      var delta = norm((ang - d.last) / DEG);
      d.last = ang;
      if (delta > 36) delta = 36;
      if (delta < -36) delta = -36;

      var r = d.ring;
      E.vis.ringExtra[r] += delta;

      // 每满 30° 立刻进一档（跟手，不等松手）
      var guard = 0;
      while (Math.abs(E.vis.ringExtra[r]) >= CFG.ringStepDeg && guard++ < 12) {
        var sgn = E.vis.ringExtra[r] > 0 ? 1 : -1;
        E.game.phase[r] = G.mod(E.game.phase[r] + sgn, G.N);
        E.vis.ringExtra[r] -= CFG.ringStepDeg * sgn;
        E.history.push({ t: 'r', r: r, d: sgn });
        E.moves += 1;
        pushHud();
        checkWin();
      }
    } else {
      var w = E.rotorLocal(x, y);
      var a2 = Math.atan2(w[1], w[0]);
      var dl = norm((a2 - d.last) / DEG);
      d.last = a2;
      if (dl > 40) dl = 40;
      if (dl < -40) dl = -40;
      var nv = E.vis.rho + dl;
      if (nv > CFG.rotorLimitDeg) nv = CFG.rotorLimitDeg;
      if (nv < -CFG.rotorLimitDeg) nv = -CFG.rotorLimitDeg;
      E.vis.rho = nv;
    }
  };

  E.up = function () {
    var d = E.drag;
    E.drag = null;
    E.vis.grab = null;
    if (!d) return;

    if (d.mode === 'ring') {
      var r = d.ring;
      var ex = E.vis.ringExtra[r];
      var kk = Math.round(ex / CFG.ringStepDeg);
      if (kk !== 0) {
        E.game.phase[r] = G.mod(E.game.phase[r] + kk, G.N);
        E.vis.ringExtra[r] = ex - CFG.ringStepDeg * kk;
        E.history.push({ t: 'r', r: r, d: kk });
        E.moves += 1;
        pushHud();
        checkWin();
      }
      var from = E.vis.ringExtra[r];
      if (Math.abs(from) > 0.3) {
        E.anim = makeAnim(CFG.ringSnapMs, function (k) {
          E.vis.ringExtra[r] = from * (1 - k);
        }, function () { E.vis.ringExtra[r] = 0; });
      } else {
        E.vis.ringExtra[r] = 0;
      }
    } else {
      var rho = E.vis.rho;
      if (Math.abs(rho) < CFG.rotorMinDeg) {
        E.anim = makeAnim(CFG.rotorSnapMs, function (k) {
          E.vis.rho = rho * (1 - k);
        }, function () { E.vis.rho = 0; });
      } else {
        E.busy = true;
        startAnim({ t: 'c', d: rho > 0 ? 1 : -1 }, CFG.rotorSnapMs, false);
      }
    }
  };

  // ────────────── 操作 ──────────────
  E.setLevel = function (key) {
    for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].key === key) E.level = key;
  };

  E.shuffle = function () {
    if (E.busy) return;
    var lv = LEVELS[1];
    for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].key === E.level) lv = LEVELS[i];

    E.anim = null;
    E.game = { state: G.createState(), phase: G.createPhase() };
    E.vis.ringExtra = [0, 0, 0];
    E.vis.rho = 0;
    E.vis.grab = null;
    E.drag = null;
    E.history = [];
    E.moves = 0;
    E.won = false;
    E.playing = false;
    E.running = false;
    E.elapsed = 0;
    E.plan = null;

    var mv = G.makeScramble(lv.steps);
    E.lastScramble = mv.slice();       // 留档：便于调试 / 日后做"提示"与自动复原
    E.queue = mv.slice();
    E.queueSilent = true;
    E.queueDur = CFG.scrambleMs;
    E.busy = true;
    E.queueEnd = function () {
      E.playing = true;
      E.moves = 0;
      E.history = [];
      E.elapsed = 0;
      E._t0 = now();
      E.running = true;
      pushHud(true);
    };
    pushHud(true);
  };

  E.undo = function () {
    if (E.busy || E.won || !E.history.length) return;
    var mv = E.history.pop();
    E.queue = [G.invert(mv)];
    E.queueSilent = true;
    E.queueDur = 170;
    E.busy = true;
    E.queueEnd = function () {
      E.moves = Math.max(0, E.moves - 1);
      pushHud(true);
    };
  };

  // ────────────── 学习模式 ──────────────
  E.setLearn = function (on) {
    E.learn = !!on;
    E.plan = null;
    // 进入学习模式时预热求解器（JIT），避免第一次点击卡顿
    if (E.learn && !E._warmed) {
      E._warmed = true;
      setTimeout(function () { try { SOLVER.warmup(); } catch (e) {} }, 30);
    }
  };

  E.learnState = function () {
    var left = null;
    if (E.plan) {
      left = 0;
      for (var b = 0; b < E.plan.length; b++) left += E.plan[b].length;
    }
    return { on: E.learn, left: left };
  };

  /**
   * 走一步：执行求解计划的一个"块"（拨好三个圈 + 中心换珠 = 一次完整动作）。
   * 若期间玩家手动动过导致剩余计划失效，会自动重新求解。
   * @returns {boolean} 是否真的走了一步
   */
  E.learnNext = function () {
    if (!E.learn || E.busy || E.won) return false;
    if (G.isSolved(E.game.state)) { E.plan = []; return false; }

    // 剩余计划还有效吗？（在副本上重放校验，代价极小）
    if (E.plan && E.plan.length) {
      var flat = [];
      for (var b = 0; b < E.plan.length; b++) flat = flat.concat(E.plan[b]);
      var st = E.game.state.map(function (row) { return row.slice(); });
      var ph = E.game.phase.slice();
      G.applyMoves(st, ph, flat);
      if (!G.isSolved(st)) E.plan = null;
    }

    if (!E.plan || !E.plan.length) {
      var blocks = SOLVER.solveBlocks(E.game.state, E.game.phase, { history: E.history });
      if (!blocks || !blocks.length) return false;
      E.plan = blocks;
    }

    var blk = E.plan.shift();
    var dur = 240;
    for (var i = 0; i < blk.length; i++) if (blk[i].t === 'c') dur = 420;
    E.queue = blk.slice();
    E.queueSilent = false;              // 计步、进历史（撤销可回退演示步）
    E.queueDur = dur;
    E.busy = true;
    E.queueEnd = function () { pushHud(true); };
    return true;
  };

  E.reset = function () {
    if (E.busy) return;
    E.anim = null;
    E.queue = [];
    E.queueEnd = null;
    E.busy = false;
    E.drag = null;
    E.vis.grab = null;
    E.game = { state: G.createState(), phase: G.createPhase() };
    E.vis.ringExtra = [0, 0, 0];
    E.vis.rho = 0;
    E.history = [];
    E.moves = 0;
    E.won = false;
    E.playing = false;
    E.running = false;
    E.elapsed = 0;
    E.plan = null;
    pushHud(true);
  };

  pushHud(true);
  return E;
}

module.exports = { createEngine: createEngine, LEVELS: LEVELS, CFG: CFG };
