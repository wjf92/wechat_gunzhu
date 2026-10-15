/**
 * 滚珠魔方豆 · 盘面绘制（Canvas 2D）
 * 传进来的是"毫米坐标 + 缩放"，所有尺寸都从 geo.js 的规格换算，改规格只需改 geo.js。
 */

var G = require('./game.js');
var GEO = require('./geo.js');

// 三种珠子颜色（红 / 蓝 / 黄），配深色描边 + 高光
var BEAD = [
  { f: '#E4573D', d: '#A63A22', h: '#F6A28E' },
  { f: '#2E7BE6', d: '#1B539E', h: '#93C0F8' },
  { f: '#F0B429', d: '#B07C0C', h: '#FBDE92' }
];

var C = {
  board: '#FFFFFF',
  boardEdge: '#DED7C8',
  rim: '#E7E1D2',
  trackOut: '#E7E1D3',
  trackIn: '#F8F6F0',
  trackHot: '#BBD6F7',
  arm: '#A8C8F2',
  hub: '#DCEAFC',
  hubEdge: '#96BFF0',
  pin: '#7FA9DE',
  gate: '#DFA33D',
  gateSoft: 'rgba(223,163,61,0.55)',
  mid: '#2E7BE6',
  label: '#9A958A',
  labelSoft: '#BDB7AA'
};

var LABEL = ['上圈 O', '左下 G', '右下 R'];

function drawBoard(ctx, W, H, V) {
  var s = V.scale, cx = V.cx, cy = V.cy;
  var state = V.state, phase = V.phase;
  var extra = V.ringExtra || [0, 0, 0];
  var rho = V.rho || 0;
  var grab = V.grab;

  function X(p) { return cx + p[0] * s; }
  function Y(p) { return cy - p[1] * s; }
  function mm(v) { return v * s; }

  ctx.clearRect(0, 0, W, H);

  // ── 盘体 ─────────────────────────────────────────────
  var bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#FCFAF6');
  bg.addColorStop(1, '#F3EFE6');
  ctx.beginPath(); ctx.arc(cx, cy, mm(GEO.DISC_R), 0, Math.PI * 2);
  ctx.fillStyle = bg; ctx.fill();
  ctx.lineWidth = mm(0.5); ctx.strokeStyle = C.boardEdge; ctx.stroke();

  ctx.beginPath(); ctx.arc(cx, cy, mm(GEO.DISC_R - 1.3), 0, Math.PI * 2);
  ctx.lineWidth = mm(2.4); ctx.strokeStyle = C.rim; ctx.stroke();

  ctx.beginPath(); ctx.arc(cx, cy, mm(14.6), 0, Math.PI * 2);
  ctx.lineWidth = mm(0.4); ctx.strokeStyle = 'rgba(200,194,180,0.55)';
  ctx.setLineDash([mm(1.6), mm(1.6)]); ctx.stroke(); ctx.setLineDash([]);

  // ── 三条外圈珠道 ──────────────────────────────────────
  for (var k = 0; k < 3; k++) {
    var c = GEO.ringCenter(k);
    var cc = { x: X(c), y: Y(c) };
    var hot = grab && grab.mode === 'ring' && grab.ring === k;

    if (hot) {
      ctx.beginPath(); ctx.arc(cc.x, cc.y, mm(GEO.RO), 0, Math.PI * 2);
      ctx.lineWidth = mm(12.4); ctx.strokeStyle = C.trackHot; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(cc.x, cc.y, mm(GEO.RO), 0, Math.PI * 2);
    ctx.lineWidth = mm(11.4); ctx.strokeStyle = C.trackOut; ctx.stroke();

    ctx.beginPath(); ctx.arc(cc.x, cc.y, mm(GEO.RO), 0, Math.PI * 2);
    ctx.lineWidth = mm(9.0); ctx.strokeStyle = C.trackIn; ctx.stroke();
  }

  // ── 转子轨道圆周线（6 个交点珠都落在以盘心为圆、半径 RC 的这条圆上）──
  var rotorHot = grab && grab.mode === 'center';
  ctx.beginPath(); ctx.arc(cx, cy, mm(GEO.RC), 0, Math.PI * 2);
  ctx.lineWidth = mm(rho !== 0 || rotorHot ? 1.0 : 0.6);
  ctx.strokeStyle = (rho !== 0 || rotorHot) ? 'rgba(90,150,230,0.85)' : 'rgba(120,160,220,0.55)';
  ctx.stroke();
  // 轨道线在两交点之间的弧段加亮，突出"6 颗交点珠同圆"的关系
  ctx.beginPath(); ctx.arc(cx, cy, mm(GEO.RC), 0, Math.PI * 2);
  ctx.lineWidth = mm(2.2);
  ctx.strokeStyle = 'rgba(150,190,240,0.18)';
  ctx.stroke();

  // ── 中心三爪转子 ──────────────────────────────────────
  for (var k2 = 0; k2 < 3; k2++) {
    for (var sg = -1; sg <= 1; sg += 2) {
      var tip = GEO.clawTip(k2, sg, rho);
      var hubR = 10.6;                      // 爪指从轴心外缘长出（随轴毂放大）
      var a0 = Math.atan2(tip[1], tip[0]);
      var from = [Math.cos(a0) * hubR, Math.sin(a0) * hubR];
      ctx.beginPath();
      ctx.moveTo(X(from), Y(from));
      ctx.lineTo(X(tip), Y(tip));
      ctx.lineWidth = mm(2.5);
      ctx.lineCap = 'round';
      ctx.strokeStyle = C.arm;
      ctx.stroke();
    }
  }
  // 爪尖珠窝
  for (var k3 = 0; k3 < 3; k3++) {
    for (var sg3 = -1; sg3 <= 1; sg3 += 2) {
      var tp = GEO.clawTip(k3, sg3, rho);
      ctx.beginPath(); ctx.arc(X(tp), Y(tp), mm(GEO.BEAD_R + 0.9), 0, Math.PI * 2);
      ctx.fillStyle = '#EAF2FD'; ctx.fill();
      ctx.lineWidth = mm(0.4); ctx.strokeStyle = C.arm; ctx.stroke();
    }
  }
  // 轴心（放大后的中心转子毂，半径见 geo.HUB_R）
  ctx.beginPath(); ctx.arc(cx, cy, mm(GEO.HUB_R), 0, Math.PI * 2);
  ctx.fillStyle = C.hub; ctx.fill();
  ctx.lineWidth = mm(0.6); ctx.strokeStyle = C.hubEdge; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, mm(2.7), 0, Math.PI * 2);
  ctx.fillStyle = C.pin; ctx.fill();
  // 毂面旋转指示线（让"这是个可转的转子"一眼可读）
  for (var k5 = 0; k5 < 3; k5++) {
    var ga = (GEO.RING_ANGLE[k5] + rho) * GEO.DEG;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ga) * mm(4.2), cy - Math.sin(ga) * mm(4.2));
    ctx.lineTo(cx + Math.cos(ga) * mm(GEO.HUB_R - 2.0), cy - Math.sin(ga) * mm(GEO.HUB_R - 2.0));
    ctx.lineWidth = mm(1.1); ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(120,165,225,0.7)';
    ctx.stroke();
  }

  // ── 闸口标记（固定点，不随转子动） ──────────────────────
  for (var k4 = 0; k4 < 3; k4++) {
    for (var sg4 = -1; sg4 <= 1; sg4 += 2) {
      var gp = GEO.gatePoint(k4, sg4, 0);
      ctx.beginPath(); ctx.arc(X(gp), Y(gp), mm(GEO.BEAD_R + 1.9), 0, Math.PI * 2);
      ctx.lineWidth = mm(0.5);
      ctx.strokeStyle = C.gateSoft;
      ctx.setLineDash([mm(1.3), mm(1.3)]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // ── 珠子 ─────────────────────────────────────────────
  var inRotor = [];   // 转子转动中，被"端着走"的闸口珠
  for (var r = 0; r < 3; r++) {
    var ph = phase[r] % G.N;
    var gates = G.gateSlots(ph);
    var moving = Math.abs(rho) > 0.01;
    for (var i = 0; i < G.N; i++) {
      var isGate = (i === gates[0] || i === gates[1]);
      var rot = 30 * ph + extra[r];
      var p = GEO.slotPoint(r, i, rot);
      if (isGate && moving) {
        var sSign = (i === gates[0]) ? -1 : 1;
        inRotor.push([GEO.gatePoint(r, sSign, rho), state[r][i], true]);
      } else {
        bead(ctx, X(p), Y(p), mm(GEO.BEAD_R), state[r][i], isGate, mm);
      }
    }
    // 圈名（放在圈内空白处，不会被盘缘裁掉）
    var lc = GEO.ringCenter(r);
    ctx.font = '600 ' + mm(4.0) + 'px -apple-system, "PingFang SC", sans-serif';
    ctx.fillStyle = C.label;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(LABEL[r], X(lc), Y(lc));
  }

  for (var q = 0; q < inRotor.length; q++) {
    var ip = inRotor[q][0];
    bead(ctx, X(ip), Y(ip), mm(GEO.BEAD_R), inRotor[q][1], true, mm);
  }
}

function bead(ctx, x, y, br, color, isGate, mm) {
  var c = BEAD[color] || BEAD[0];
  ctx.beginPath(); ctx.arc(x, y, br, 0, Math.PI * 2);
  ctx.fillStyle = c.f; ctx.fill();
  ctx.lineWidth = mm(0.35); ctx.strokeStyle = c.d; ctx.stroke();

  ctx.beginPath();
  ctx.arc(x - br * 0.30, y - br * 0.33, br * 0.32, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.62)';
  ctx.fill();

  if (isGate) {
    ctx.beginPath(); ctx.arc(x, y, br + mm(1.15), 0, Math.PI * 2);
    ctx.lineWidth = mm(0.45); ctx.strokeStyle = 'rgba(200,130,20,0.55)';
    ctx.stroke();
  }
}

module.exports = { drawBoard: drawBoard, BEAD: BEAD };
