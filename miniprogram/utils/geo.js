/**
 * 滚珠魔方豆 · 几何常量与坐标换算
 * 完全按《玩法与设计说明》v3 §8.2 的规格（单位 mm）：
 *   外圈半径 r₀ = 18、圈心距 R = 30、转子轨迹 r_c = 17、珠径 7.5、每圈 12 位
 *   两圆交点解出：闸口在圈体上相隔 60°（2 个珠距），在盘心上相隔 2A ≈ 64°
 */

var DEG = Math.PI / 180;

var R = 30.0;        // 外圈圆心距盘心
var RO = 18.0;       // 外圈半径
var RC = 17.0;       // 中心转子轨迹半径
var BEAD_R = 3.75;   // 珠半径（直径 7.5）
var DISC_R = 52.6;   // 盘面可视半径（51.75 + 轮缘）

var SLOTS = 12;                       // 每圈珠位数
var STEP = 360 / SLOTS;               // 30° / 档
var RING_ANGLE = [90, 210, 330];      // 三圈圈心的盘心极角（上、左下、右下）

// 中心转子（可放大视觉而不影响珠道：轴毂必须让开闸口珠内缘 13.25mm）
var HUB_R = 12.2;        // 轴毂可视半径（原 9.4，放大后手感更好）
var CENTER_TOUCH = 13.2; // 转子触摸判定半径（贴住闸口珠内缘 13.25，捏珠不打架）

// 闸口（两圆交点）
var GATE_DISC_HALF = Math.acos((R * R + RC * RC - RO * RO) / (2 * R * RC)) / DEG;   // ≈ 32.0°
var GATE_LOCAL = Math.acos((RC * RC - R * R - RO * RO) / (2 * R * RO)) / DEG;        // ≈ 150.0°

/** 返回圈心坐标 [x, y]（mm，数学系 y 向上） */
function ringCenter(k) {
  var a = RING_ANGLE[k] * DEG;
  return [R * Math.cos(a), R * Math.sin(a)];
}

/** 第 k 圈第 i 个珠位的基础局部角（未叠加圈体旋转） */
function slotBaseAngle(k, i) {
  return RING_ANGLE[k] - GATE_LOCAL - i * STEP;
}

/**
 * 第 k 圈第 i 个珠位在"圈体旋转了 rot 度"时的实际坐标
 * @param {number} k 圈号
 * @param {number} i 珠位号
 * @param {number} rot 圈体累计旋转角（度），= 30*phase + 拖动余量
 */
function slotPoint(k, i, rot) {
  var c = ringCenter(k);
  var a = (slotBaseAngle(k, i) + rot) * DEG;
  return [c[0] + RO * Math.cos(a), c[1] + RO * Math.sin(a)];
}

/**
 * 闸口坐标。【重要】闸口是两条圆的交点，在盘面上是**固定点**，不随转子转动而移动。
 * @param {number} k 圈号
 * @param {number} s -1 或 +1，对应闸口 A / 闸口 B
 * @param {number} [rho] 转子瞬时偏转角（仅动画中非 0）
 */
function gatePoint(k, s, rho) {
  var a = (RING_ANGLE[k] + s * GATE_DISC_HALF + (rho || 0)) * DEG;
  return [RC * Math.cos(a), RC * Math.sin(a)];
}

/** 转子某条爪指的爪尖坐标（三条爪各自对准一个外圈） */
function clawTip(k, s, rho) {
  return gatePoint(k, s, rho);
}

module.exports = {
  DEG: DEG,
  R: R, RO: RO, RC: RC, BEAD_R: BEAD_R, DISC_R: DISC_R,
  HUB_R: HUB_R, CENTER_TOUCH: CENTER_TOUCH,
  SLOTS: SLOTS, STEP: STEP, RING_ANGLE: RING_ANGLE,
  GATE_DISC_HALF: GATE_DISC_HALF, GATE_LOCAL: GATE_LOCAL,
  ringCenter: ringCenter,
  slotBaseAngle: slotBaseAngle,
  slotPoint: slotPoint,
  gatePoint: gatePoint,
  clawTip: clawTip
};
