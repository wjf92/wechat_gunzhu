/**
 * 滚珠魔方豆 · 核心逻辑（纯数据，不依赖渲染 / 小程序 API）
 * ---------------------------------------------------------------
 * 依据《滚珠魔方豆-玩法与设计说明》v3：
 *   3 个外圈 × 12 个珠位 = 36 颗珠；3 种颜色各 12 颗。
 *   每圈 12 位 = 闸口 A + 中间珠 + 闸口 B + 9 颗私有珠。
 *
 * 状态表示（关键设计）：
 *   state[r][i]  = 珠位 i 里那颗珠的颜色号（珠位固定在圈体上，不随转动改变）
 *   phase[r]     = 圈体的档位（0..11），转 1 档 = 30°
 *   —— 转外圈只改 phase，珠子没换位置，只是"哪两个珠位正好压在闸口上"变了。
 *      这等价于"圈内整体平移"，但写起来最不容易错。
 *
 * 闸口：圈体档位为 m 时，压在两交点上的珠位是 slot m 与 slot m+2。
 * 中心转子转 1 档（120°）时：每圈闸口上的 2 颗珠整组送给下一个外圈。
 */

var N = 12;          // 每圈珠位数
var RINGS = 3;       // 外圈数
var COLORS = 3;      // 颜色数
var GATE_SPAN = 2;   // 两闸口在圈体上相隔 2 个珠距（60°），中间夹 1 颗

function mod(a, n) { return ((a % n) + n) % n; }

/** 每圈一个颜色（上圈 0、左下 1、右下 2）——初始态即已复原 */
function createState() {
  var s = [];
  for (var r = 0; r < RINGS; r++) {
    var row = [];
    for (var i = 0; i < N; i++) row.push(r);
    s.push(row);
  }
  return s;
}

function createPhase() { return [0, 0, 0]; }

function cloneState(s) {
  var out = [];
  for (var r = 0; r < s.length; r++) out.push(s[r].slice());
  return out;
}

/** 圈体档位 m 时，两个闸口所在的珠位下标 */
function gateSlots(m) {
  var a = mod(m, N);
  return [a, mod(a + GATE_SPAN, N)];
}

/**
 * 转外圈：只改相位。
 * @param {number[]} phase
 * @param {number} ring  0..2
 * @param {number} d     档数，正负皆可（+1 = 圈体逆时针走 1 档）
 */
function turnRing(phase, ring, d) {
  phase[ring] = mod(phase[ring] + d, N);
}

/**
 * 转中心转子：闸口上的 6 颗珠（每圈 2 颗）整组换圈。
 * @param {number[][]} state
 * @param {number[]} phase
 * @param {number} dir  +1 或 -1（+1 表示 r → r+1，即逆时针 120°）
 */
function turnCenter(state, phase, dir) {
  var g = [gateSlots(phase[0]), gateSlots(phase[1]), gateSlots(phase[2])];
  var take = [];
  for (var r = 0; r < RINGS; r++) {
    take.push([state[r][g[r][0]], state[r][g[r][1]]]);
  }
  for (var r2 = 0; r2 < RINGS; r2++) {
    var dst = mod(r2 + dir, RINGS);
    state[dst][g[dst][0]] = take[r2][0];
    state[dst][g[dst][1]] = take[r2][1];
  }
}

/** 每个外圈 12 颗同色即胜（三圈颜色必然互不相同） */
function isSolved(state) {
  for (var r = 0; r < RINGS; r++) {
    var c = state[r][0];
    for (var i = 1; i < N; i++) if (state[r][i] !== c) return false;
  }
  return true;
}

/** 统计进度：处于"最终所属圈"的珠子数 0..36（取 6 种配色方案中的最优者） */
function progress(state) {
  var perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  var best = 0;
  for (var p = 0; p < perms.length; p++) {
    var cnt = 0;
    for (var r = 0; r < RINGS; r++) {
      for (var i = 0; i < N; i++) if (state[r][i] === perms[p][r]) cnt++;
    }
    if (cnt > best) best = cnt;
  }
  return best;
}

/** 随机数：可注入，便于测试复现 */
function randInt(n, rnd) { return Math.floor((rnd || Math.random)() * n); }

/**
 * 生成一串"打乱"操作。全部由合法转动组成 → 打乱局面**必定可解**。
 * @param {number} steps 步数（难度）
 * @param {function} [rnd]
 * @return {Array<{t:string,r?:number,d:number}>}
 */
function makeScramble(steps, rnd) {
  var moves = [];
  var last = null;
  for (var k = 0; k < steps; k++) {
    var m;
    var guard = 0;
    do {
      if ((rnd || Math.random)() < 0.34) {
        m = { t: 'c', d: (rnd || Math.random)() < 0.5 ? 1 : -1 };
      } else {
        var r = randInt(RINGS, rnd);
        var d = randInt(N - 1, rnd) + 1;              // 1..11
        if ((rnd || Math.random)() < 0.5) d = -d;
        m = { t: 'r', r: r, d: d };
      }
      guard++;
    } while (last && guard < 24 && (
      (m.t === 'c' && last.t === 'c') ||
      (m.t === 'r' && last.t === 'r' && last.r === m.r && mod(m.d, N) === mod(-last.d, N))
    ));
    moves.push(m);
    last = m;
  }
  return moves;
}

function invert(move) {
  if (move.t === 'c') return { t: 'c', d: -move.d };
  return { t: 'r', r: move.r, d: mod(-move.d, N) };
}

/** 应用一步操作 */
function applyMove(state, phase, move) {
  if (move.t === 'c') turnCenter(state, phase, move.d);
  else turnRing(phase, move.r, move.d);
}

/** 连续应用一串操作 */
function applyMoves(state, phase, moves) {
  for (var i = 0; i < moves.length; i++) applyMove(state, phase, moves[i]);
}

module.exports = {
  N: N,
  RINGS: RINGS,
  COLORS: COLORS,
  GATE_SPAN: GATE_SPAN,
  mod: mod,
  createState: createState,
  createPhase: createPhase,
  cloneState: cloneState,
  gateSlots: gateSlots,
  turnRing: turnRing,
  turnCenter: turnCenter,
  isSolved: isSolved,
  progress: progress,
  makeScramble: makeScramble,
  invert: invert,
  applyMove: applyMove,
  applyMoves: applyMoves
};
