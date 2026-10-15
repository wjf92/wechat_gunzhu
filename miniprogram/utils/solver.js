/**
 * 滚珠魔方豆 · 自动求解器 v4
 * ---------------------------------------------------------------
 * 四层结构：
 *
 * ① 构成层（反向闭包）：只看"每圈每种颜色几颗"（3×3 表，行和 = 列和 = 12）。
 *    从 6 个目标构成反向 BFS 一次建缓存（4186 个构成、深度 ≤5），
 *    任何局面的"构成距离"O(深度) 查表。用于引导搜索方向。
 *    （为什么不能拿错位珠数做贪心：存在"两圈互持对方错珠"的结构，
 *      必须先变差才能变好，只有搜索能穿过去。）
 *
 * ② 宏观步枚举：一个"宏观步" = 三圈各转到选定相位 + 中心转 1 档。
 *    关键约束：两颗珠必须恰好隔 2 个珠位（同奇偶）才能同时压上闸口，
 *    所以只有**实际可呈现**的给出对才可行——构成模型里"给得起"
 *    ≠"摆得上闸口"，这是构成计划经常物理不可实现的根因。
 *
 * ③ 求解流水线（solveBlocks，分块 = 学习模式一次点击的动作）：
 *      a. 贪心下降块：只走闭包距离严格递减的宏观步（≤5 块，天然终止）；
 *      b. 相位归零块；
 *      c. 交换子收尾：C(k,δ,dir) = Rk(δ)X(dir)Rk(-δ)X(-dir) 是 5-循环，
 *         共轭后可把珠在任意两环间搬运。选交换子不看代数——直接按
 *         O(1) 收益公式挑"目标圈正确珠数 +1"的块，逐块消错，保证终止。
 *      （可选 a0. 布局感知 DFS 短解，默认停用——收益微小且耗时。）
 *      最终在干净副本上完整重放并校验 isSolved，失败转历史兜底。
 *
 * ④ 兜底：历史逆序回做（必定可行）。
 */

var G = require('./game.js');

var N = G.N;
var R3 = G.RINGS;

// ────────────── 构成层 ──────────────
function cloneState(s) {
  var out = [];
  for (var r = 0; r < R3; r++) out.push(s[r].slice());
  return out;
}

function countsOf(state) {
  var c = [];
  for (var r = 0; r < R3; r++) {
    var row = [0, 0, 0];
    for (var i = 0; i < N; i++) row[state[r][i]]++;
    c.push(row);
  }
  return c;
}

/** 9 个计数（各 0..12，4bit）打包成一个数字键 */
function countsKey(c) {
  var k = 0;
  for (var r = R3 - 1; r >= 0; r--) {
    for (var i = 2; i >= 0; i--) k = k * 16 + c[r][i];
  }
  return k;
}

function isGoalCounts(c) {
  var P = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  for (var p = 0; p < P.length; p++) {
    var ok = true;
    for (var r = 0; r < R3; r++) if (c[r][P[p][r]] !== N) { ok = false; break; }
    if (ok) return true;
  }
  return false;
}

/** 圈 r 能给出的 2 颗颜色组合（多重集，a≤b） */
function givePairs(row) {
  var out = [];
  for (var a = 0; a < 3; a++) {
    for (var b = a; b < 3; b++) {
      if (a === b) { if (row[a] >= 2) out.push([a, b]); }
      else if (row[a] >= 1 && row[b] >= 1) out.push([a, b]);
    }
  }
  return out;
}

/** 与 game.turnCenter 一致：dir=+1 时圈 r 收下圈 (r-dir+3)%3 的给出 */
function applyTurnCounts(c, dir, Gv) {
  var out = [];
  for (var r = 0; r < R3; r++) {
    var src = ((r - dir) % R3 + R3) % R3;
    var row = c[r].slice();
    row[Gv[r][0]]--; row[Gv[r][1]]--;
    row[Gv[src][0]]++; row[Gv[src][1]]++;
    out.push(row);
  }
  return out;
}

/**
 * 反向闭包缓存（模块级，只建一次）：
 * 目标区域固定（6 个对角构成），从目标反向 BFS 一次，得到
 *   cache[key] = { dist, dir, G }
 * 其中 (dir, G) 是"从该构成朝目标走一步"的边。
 * 之后任何求解都是沿缓存边下行，O(构成深度) 查表，零搜索。
 */
var _cache = null;

function backwardClosure() {
  if (_cache) return _cache;

  var cache = {};
  var queue = [];
  var head = 0, tail = 0;

  function push(c, dist, dir, Gv) {
    var k = countsKey(c);
    if (cache[k]) return;
    cache[k] = { dist: dist, dir: dir === undefined ? 0 : dir, G: Gv || null };
    queue[tail++] = c;
  }

  // 6 个目标构成入队
  var P = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  for (var p = 0; p < P.length; p++) {
    var g = [];
    for (var r = 0; r < R3; r++) {
      var row = [0, 0, 0];
      row[P[p][r]] = N;
      g.push(row);
    }
    push(g, 0);
  }

  // 反向扩展：对每个已点 x，枚举所有前驱 y（apply(y,dir,G)=x），y 的下行边即 (dir,G)
  var allPairs = [[0, 0], [0, 1], [0, 2], [1, 1], [1, 2], [2, 2]];
  while (head < tail) {
    var x = queue[head++];
    var xd = cache[countsKey(x)].dist;
    for (var dir = -1; dir <= 1; dir += 2) {
      for (var a = 0; a < 6; a++) {
        for (var b = 0; b < 6; b++) {
          for (var d = 0; d < 6; d++) {
            var Gv = [allPairs[a], allPairs[b], allPairs[d]];
            // 前向：x_r = y_r - count(G[r]) + count(G[src_r])，src_r = (r-dir+3)%3
            // 反解：y_r = x_r - count(G[src_r]) + count(G[r])
            // 校验：x 给得出 G[src_r]（⇔ y 给得出 G[r]），且 y 各计数 ≥ 0
            var y = [], ok = true;
            for (var r2 = 0; r2 < R3 && ok; r2++) {
              var src = ((r2 - dir) % R3 + R3) % R3;
              var gp = Gv[src], gr = Gv[r2];
              if (x[r2][gp[0]] < 1 || x[r2][gp[1]] < 1 ||
                  (gp[0] === gp[1] && x[r2][gp[0]] < 2)) { ok = false; break; }
              var row = x[r2].slice();
              row[gp[0]]--; row[gp[1]]--;
              row[gr[0]]++; row[gr[1]]++;
              for (var c2 = 0; c2 < 3; c2++) if (row[c2] < 0) { ok = false; break; }
              y.push(row);
            }
            if (!ok) continue;
            var k2 = countsKey(y);
            if (cache[k2]) continue;
            cache[k2] = { dist: xd + 1, dir: dir, G: Gv };
            queue[tail++] = y;
          }
        }
      }
    }
  }
  _cache = cache;
  return cache;
}

/**
 * 构成计划：沿缓存边从当前构成下行到目标。
 * @returns [{dir, G}] 或 null（构成不在闭包内——合法对局不会发生）
 */
function bfsPlan(counts0) {
  if (isGoalCounts(counts0)) return [];
  var cache = backwardClosure();
  var k = countsKey(counts0);
  if (!cache[k]) return null;
  var out = [];
  var c = counts0;
  while (!isGoalCounts(c)) {
    var e = cache[countsKey(c)];
    if (!e || !e.G) return null;
    out.push({ dir: e.dir, G: e.G });
    c = applyTurnCounts(c, e.dir, e.G);
  }
  return out;
}

// ────────────── 实现层 ──────────────
/** 会话：携带工作副本 + 输出序列，所有操作经它落账 */
function session(state, phase) {
  return {
    state: cloneState(state),
    phase: phase.slice(),
    moves: [],
    ring: function (r, toPhase) {
      var d = ((toPhase - this.phase[r]) % N + N) % N;
      if (d > N / 2) d -= N;
      if (d === 0) return;
      this.moves.push({ t: 'r', r: r, d: d });
      G.turnRing(this.phase, r, d);
    },
    center: function (dir) {
      this.moves.push({ t: 'c', d: dir });
      G.turnCenter(this.state, this.phase, dir);
    }
  };
}

/** 圈 r 相位 p 时闸口两珠颜色（升序二字符，如 "02"） */
function gateColors(state, r, p) {
  var a = state[r][p], b = state[r][(p + 2) % N];
  return a < b ? ('' + a + b) : ('' + b + a);
}

/** 圈 r 有哪些相位，闸口颜色等于 want（二字符） */
function phasesFor(state, r, want) {
  var out = [];
  for (var p = 0; p < N; p++) if (gateColors(state, r, p) === want) out.push(p);
  return out;
}

function pairKey(G) { return '' + G[0] + G[1]; }

/** 圈 r 当前 12 个闸口对位置上实际呈现的颜色对（多重集键 "ab"，去重） */
function presentablePairs(state, r) {
  var seen = {};
  var out = [];
  for (var m = 0; m < N; m++) {
    var k = gateColors(state, r, m);
    if (!seen[k]) { seen[k] = true; out.push(k); }
  }
  return out;
}

/** 局面哈希（圈体本地序列 + 相位，规范化圈体旋转自由度） */
function layoutKey(state, phase) {
  var parts = [];
  for (var r = 0; r < R3; r++) {
    var p = phase[r] % N;
    var seq = [];
    for (var i = 0; i < N; i++) seq.push(state[r][(p + i) % N]);
    // 取字典序最小的旋转作规范形
    var best = 0;
    for (var s = 1; s < N; s++) {
      for (var j = 0; j < N; j++) {
        var a = seq[(s + j) % N], b = seq[(best + j) % N];
        if (a !== b) { if (a < b) best = s; break; }
      }
    }
    var rot = [];
    for (var i2 = 0; i2 < N; i2++) rot.push(seq[(best + i2) % N]);
    parts.push(rot.join(''));
  }
  return parts.join('|');
}

/**
 * 枚举当前所有"宏观步"（各圈转到选定相位 + 中心转 1 档）。
 * 每个宏观步 = { dir, G(各圈给出对), ps(各圈目标相位), dist(落点闭包距离),
 *               wrong(落点错位珠数，full 时才算), cost(圈转档数) }，按优劣排序。
 * @param {boolean} full true 时额外计算错位珠数（较贵，仅单步选择用）
 */
function enumerateMacros(S, cache, full) {
  var c = countsOf(S.state);
  var e = cache[countsKey(c)];
  var curDist = e ? e.dist : 99;
  var pres = [presentablePairs(S.state, 0), presentablePairs(S.state, 1), presentablePairs(S.state, 2)];
  var out = [];

  for (var dir = -1; dir <= 1; dir += 2) {
    for (var a = 0; a < pres[0].length; a++) {
      for (var b = 0; b < pres[1].length; b++) {
        for (var d = 0; d < pres[2].length; d++) {
          var Gv = [
            [+pres[0][a][0], +pres[0][a][1]],
            [+pres[1][b][0], +pres[1][b][1]],
            [+pres[2][d][0], +pres[2][d][1]]
          ];
          var nc = applyTurnCounts(c, dir, Gv);
          var ne = cache[countsKey(nc)];
          if (!ne) continue;                     // 落点脱离闭包（不应发生）

          // 落成真实转动：每圈选转动代价最小的呈现相位
          var ps = [], cost = 0, ok = true;
          for (var r = 0; r < R3; r++) {
            var cand = phasesFor(S.state, r, pairKey(Gv[r]));
            if (!cand.length) { ok = false; break; }
            var bp = cand[0], bc = 1e9;
            for (var q = 0; q < cand.length; q++) {
              var dd = ((cand[q] - S.phase[r]) % N + N) % N;
              var cc = dd <= N / 2 ? dd : N - dd;
              if (cc < bc) { bc = cc; bp = cand[q]; }
            }
            ps.push(bp); cost += bc;
          }
          if (!ok) continue;

          var m = { dir: dir, G: Gv, ps: ps, cost: cost, dist: ne.dist, distDelta: ne.dist - curDist, wrong: 0 };
          if (full) {
            var st = cloneState(S.state), ph = S.phase.slice();
            for (var r2 = 0; r2 < R3; r2++) if (ps[r2] !== S.phase[r2]) G.turnRing(ph, r2, ((ps[r2] - S.phase[r2]) % N + N) % N);
            G.turnCenter(st, ph, dir);
            m.wrong = 36 - G.progress(st);
          }
          out.push(m);
        }
      }
    }
  }
  if (full) {
    out.sort(function (x, y) {
      return x.distDelta - y.distDelta || x.wrong - y.wrong || x.cost - y.cost;
    });
  } else {
    out.sort(function (x, y) {
      return x.distDelta - y.distDelta || x.cost - y.cost;
    });
  }
  return out;
}

/** 对宏观步落成真实移动序列（3 圈转 + 1 中心转），推入 S */
function applyMacro(S, macro) {
  for (var r = 0; r < R3; r++) S.ring(r, macro.ps[r]);
  S.center(macro.dir);
}

/**
 * 布局感知 DFS：只走"可呈现"的宏观步，优先闭包距离递减。
 * 带全局失败记忆（同布局不再重试），节点预算兜底。
 * @returns 完整移动序列 或 null
 */
function realizeFull(state0, phase0, rnd, nodeBudget) {
  var cache = backwardClosure();
  var S = session(state0, phase0);
  var nodes = 0;
  var MAX_NODES = nodeBudget || 0;       // 默认停用（交换子层已保证 100% 可解）
  var failed = {};                       // 布局哈希 → 已证死路

  function dfs(depth) {
    var c = countsOf(S.state);
    if (isGoalCounts(c)) return true;
    if (depth > 9 || ++nodes > MAX_NODES) return false;

    var hk = layoutKey(S.state, S.phase);
    if (failed[hk]) return false;

    var macros = enumerateMacros(S, cache, false);
    for (var i = 0; i < macros.length; i++) {
      var m = macros[i];
      if (m.distDelta > 0 && depth > 5) continue;    // 深层不再升距
      var snap = { st: cloneState(S.state), ph: S.phase.slice(), len: S.moves.length };
      applyMacro(S, m);
      if (dfs(depth + 1)) return true;
      S.state = snap.st; S.phase = snap.ph; S.moves.length = snap.len;
    }
    failed[hk] = true;
    return false;
  }

  if (dfs(0)) return S.moves;
  return null;
}

// ────────────── 对外 API ──────────────
/** 保底：历史逆序回做 */
function solveByHistory(history) {
  var out = [];
  for (var i = history.length - 1; i >= 0; i--) out.push(G.invert(history[i]));
  return out;
}

// ────────────── 交换子层（保证收尾） ──────────────
// C(k,δ,dir) = Rk(δ)·X(dir)·Rk(-δ)·X(-dir) 是一个 5-循环/4-循环置换，
// 配合共轭（先转别的圈）可把珠在任意两环间搬运。库在"相位 0"基准下
// 预计算全部变体的珠置换；使用前先把相位归零，效果即与库完全一致。
// 选交换子不看代数——直接在当前局面上模拟收益（目标圈正确珠数 +1），
// 从机制上排除推导错误。

/** 带标签珠置换：返回 id → [圈, 槽] */
function beadPermOf(moves) {
  var st = [], r, i;
  for (r = 0; r < R3; r++) {
    var row = [];
    for (i = 0; i < N; i++) row.push(r * N + i);
    st.push(row);
  }
  var ph = [0, 0, 0];
  G.applyMoves(st, ph, moves);
  var perm = [];
  for (r = 0; r < R3; r++) for (i = 0; i < N; i++) perm[st[r][i]] = [r, i];
  return perm;
}

/** 连续同圈旋转合并（工程优化，减步数） */
function mergeMoves(seq) {
  var out = [];
  for (var i = 0; i < seq.length; i++) {
    var m = seq[i];
    var last = out.length ? out[out.length - 1] : null;
    if (m.t === 'r' && last && last.t === 'r' && last.r === m.r) {
      last.d = G.mod(last.d + m.d, N);
      if (last.d === 0) out.pop();
    } else {
      out.push({ t: m.t, r: m.r, d: m.d });
    }
  }
  return out;
}

/** 数某圈某种颜色珠数 */
function countColor(state, r, c) {
  var n = 0;
  for (var i = 0; i < N; i++) if (state[r][i] === c) n++;
  return n;
}

var _commTypes = null;
/**
 * 交换子类型库（12 个描述符，一次构建，毫秒级）：
 * C(k,δ,dir) 共轭后是单条 5-循环，跨环转移恰好两条：
 *   T1: 圈k 槽(a+o1)   → 圈j 槽(b+q1)
 *   T2: 圈j 槽(b+q2)   → 圈k 槽(a+o2)
 * 偏移 (o1,q1,q2,o2) 只取决于 (k,dir,δ)，(a,b) 只是平移参与槽位。
 * 因此收益可 O(1) 计算：gain(圈k 得色 c) = [圈j(b+q2) 有 c] - [圈k(a+o1) 有 c]。
 */
function commTypes() {
  if (_commTypes) return _commTypes;
  var types = [];
  for (var k = 0; k < R3; k++) {
    for (var di = 0; di < 2; di++) {
      var dir = di === 0 ? 1 : -1;
      var j = ((k - dir) % R3 + R3) % R3;
      for (var dsi = 0; dsi < 2; dsi++) {
        var delta = dsi === 0 ? 2 : -2;
        var base = [{ t: 'r', r: k, d: delta }, { t: 'c', d: dir }, { t: 'r', r: k, d: -delta }, { t: 'c', d: -dir }];
        var perm = beadPermOf(base);
        // 提取跨环转移
        var t1 = null, t2 = null;
        for (var id = 0; id < 36; id++) {
          var from = [((id / N) | 0), id % N];
          var to = perm[id];
          if (to[0] === from[0]) continue;
          if (to[0] === j) t1 = { o1: from[1], q1: to[1] };
          else if (to[0] === k) t2 = { q2: from[1], o2: to[1] };
        }
        if (!t1 || !t2) continue;               // 结构异常，跳过该类型
        types.push({ k: k, j: j, dir: dir, delta: delta, o1: t1.o1, q1: t1.q1, o2: t2.o2, q2: t2.q2, base: base });
      }
    }
  }
  _commTypes = types;
  return types;
}

/**
 * 在类型库里挑一个"让圈 rk 的颜色 c 净增 ≥1"的交换子，落成移动块。
 * forbid: 不许触碰的圈（已封盘的圈）。
 * @returns 移动数组 或 null
 */
function pickSwap(state, phase, rk, c, forbid) {
  var types = commTypes();
  var best = null, bestKey = 1e9;
  for (var t = 0; t < types.length; t++) {
    var tp = types[t];
    if (tp.k !== rk && tp.j !== rk) continue;   // 必须触及目标圈
    if (tp.k !== rk) continue;                  // 收益按"接收端 = 目标圈"计
    if (forbid.indexOf(tp.k) >= 0 || forbid.indexOf(tp.j) >= 0) continue;

    var hasInJ = false;
    for (var w = 0; w < N; w++) if (state[tp.j][(w + tp.q2) % N] === c) { hasInJ = true; break; }
    if (!hasInJ) continue;                      // 圈 j 里没有可搬来的 c

    // 枚举 (a,b)：a 决定给出槽（必须非 c），b 决定来源槽（必须 c）
    for (var b2 = 0; b2 < N; b2++) {
      if (state[tp.j][(b2 + tp.q2) % N] !== c) continue;
      for (var a2 = 0; a2 < N; a2++) {
        if (state[tp.k][(a2 + tp.o1) % N] === c) continue;   // 给出的不能是 c
        var key = a2 * 16 + b2;
        if (key < bestKey) {
          bestKey = key;
          var seq = [{ t: 'r', r: tp.k, d: a2 }, { t: 'r', r: tp.j, d: b2 }]
            .concat(tp.base)
            .concat([{ t: 'r', r: tp.k, d: (N - a2) % N }, { t: 'r', r: tp.j, d: (N - b2) % N }]);
          var nz = [];
          for (var z = 0; z < seq.length; z++) if (seq[z].d % N !== 0) nz.push(seq[z]);
          best = mergeMoves(nz);
        }
      }
    }
    if (best) break;                            // 第一个可行类型即可（收益恒 +1）
  }
  return best;
}

/**
 * 分块求解（供学习模式：一个块 = 一次点击的完整动作）。
 * ① 有界布局感知 DFS（块 = [拨圈×3, 中心转] 宏观步）
 * ② 贪心下降块（闭包距离严格递减，不会绕圈）
 * ③ 相位归零 + 交换子收尾（模拟收益选块，保证终止）
 * 任一环节产物都整体重放校验；失败转历史兜底。
 * @returns {Array<Array>} 块数组；每块是若干移动
 */
function solveBlocks(state0, phase0, opts) {
  opts = opts || {};
  var rnd = opts.rnd || Math.random;
  if (G.isSolved(state0)) return [];

  // a0. 布局感知 DFS 完整短解（默认停用，opts.budget > 0 启用）
  var flat = null;
  if (opts.budget > 0) {
    try { flat = realizeFull(state0, phase0, rnd, opts.budget); } catch (e) { flat = null; }
    if (flat && flat.length) {
      var stv = cloneState(state0), phv = phase0.slice();
      G.applyMoves(stv, phv, flat);
      if (G.isSolved(stv)) {
        var blocks = [], cur = [];
        for (var i = 0; i < flat.length; i++) {
          cur.push(flat[i]);
          if (flat[i].t === 'c') { blocks.push(cur); cur = []; }
        }
        if (cur.length) blocks.push(cur);
        return blocks;
      }
    }
  }

  var blocks = [];
  var st = cloneState(state0), ph = phase0.slice();

  // ② 贪心下降（只走闭包距离递减的宏观步，天然终止）
  try {
    var cache = backwardClosure();
    for (var step = 0; step < 6; step++) {
      if (G.isSolved(st)) break;
      var S = session(st, ph);
      var macros = enumerateMacros(S, cache, true);
      var pickM = null;
      for (var m = 0; m < macros.length; m++) {
        if (macros[m].distDelta < 0) { pickM = macros[m]; break; }
      }
      if (!pickM) break;
      var mv = [];
      for (var r = 0; r < R3; r++) {
        var dd = ((pickM.ps[r] - ph[r]) % N + N) % N;
        if (dd > N / 2) dd -= N;
        if (dd !== 0) mv.push({ t: 'r', r: r, d: dd });
      }
      mv.push({ t: 'c', d: pickM.dir });
      G.applyMoves(st, ph, mv);
      blocks.push(mv);
    }
  } catch (e2) {}

  if (G.isSolved(st)) return blocks;

  // ③ 相位归零（交换子库在相位 0 基准下预计算）
  var norm = [];
  for (var r3 = 0; r3 < R3; r3++) {
    if (ph[r3] !== 0) { norm.push({ t: 'r', r: r3, d: G.mod(-ph[r3], N) }); ph[r3] = 0; }
  }
  if (norm.length) blocks.push(mergeMoves(norm));

  // 目标配色：6 种排列里挑当前正确珠数最多者
  var perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  var target = perms[0], bestP = -1;
  for (var p = 0; p < perms.length; p++) {
    var cnt = 0;
    for (var rr = 0; rr < R3; rr++) cnt += countColor(st, rr, perms[p][rr]);
    if (cnt > bestP) { bestP = cnt; target = perms[p]; }
  }

  // 阶段 A：把圈 0 填满 target[0]（可用圈 1、2 做缓冲）
  // 阶段 B：圈 1 ← 圈 2 换到各自目标色（圈 0 封盘不动）
  var stages = [
    { ring: 0, color: target[0], forbid: [] },
    { ring: 1, color: target[1], forbid: [0] }
  ];
  for (var s = 0; s < stages.length; s++) {
    var sg = stages[s];
    var guard = 0;
    while (countColor(st, sg.ring, sg.color) < N && guard++ < 14) {
      var swap = pickSwap(st, ph, sg.ring, sg.color, sg.forbid);
      if (!swap) break;                       // 理论不会发生；兜底在外层
      G.applyMoves(st, ph, swap);
      blocks.push(swap);
    }
  }

  // 整体校验
  var fin = cloneState(state0), fph = phase0.slice();
  for (var b = 0; b < blocks.length; b++) G.applyMoves(fin, fph, blocks[b]);
  if (G.isSolved(fin)) return blocks;

  // ④ 历史兜底（必定可行）
  if (opts.history && opts.history.length) {
    var hist = solveByHistory(opts.history);
    var hb = [], cc = [];
    for (var h = 0; h < hist.length; h++) {
      cc.push(hist[h]);
      if (hist[h].t === 'c') { hb.push(cc); cc = []; }
    }
    if (cc.length) hb.push(cc);
    return hb;
  }
  return null;
}

/**
 * 求解（拍平的分块序列，兼容旧接口/测试）。
 * @returns {Array|null} 操作序列（保证可复原）
 */
function solve(state0, phase0, opts) {
  var blocks = solveBlocks(state0, phase0, opts);
  if (!blocks) return null;
  var out = [];
  for (var b = 0; b < blocks.length; b++) out = out.concat(blocks[b]);
  return out;
}

/** 预热：跑一遍小规模完整流水线，触发 JIT，避免首次点击卡顿 */
function warmup() {
  try {
    var st = G.createState(), ph = G.createPhase();
    G.applyMoves(st, ph, G.makeScramble(14));
    solveBlocks(st, ph, {});
  } catch (e) {}
}

module.exports = {
  solve: solve,
  solveBlocks: solveBlocks,
  solveByHistory: solveByHistory,
  bfsPlan: bfsPlan,
  countsOf: countsOf,
  warmup: warmup
};
