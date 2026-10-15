/**
 * 滚珠魔方豆 · 小程序主页面
 * 页面只做三件事：拿画布、跑逐帧循环、把手指坐标喂给控制器。
 * 所有玩法逻辑在 utils/core.js（与网页预览共用同一份代码）。
 */

var core = require('../../utils/core.js');
var DRAW = require('../../utils/draw.js');
var GEO = require('../../utils/geo.js');

Page({
  data: {
    steps: 0,
    timeText: '00:00',
    doneCount: 36,
    donePct: 100,
    level: 'normal',
    levels: core.LEVELS,
    won: false,
    learn: false,
    learnLeft: null,
    learnDone: false,
    tip: '按住任意外圈，沿圆周方向拨动；捏住中心转子左右拨动换珠'
  },

  onLoad: function () {
    var self = this;
    this.engine = core.createEngine({
      onHud: function (h) {
        self.setData({
          steps: h.steps,
          timeText: h.timeText,
          doneCount: h.doneCount,
          donePct: h.donePct
        });
      },
      onWin: function (h) {
        self.setData({ won: true, timeText: h.timeText, steps: h.steps });
        try { wx.vibrateShort({ type: 'medium' }); } catch (e) {}
      }
    });
    this.initCanvas();
  },

  onUnload: function () { this.dead = true; },
  onHide: function () { if (this.engine) this.engine.pause(); },
  onShow: function () { if (this.engine) this.engine.resume(); },

  initCanvas: function () {
    var self = this;
    wx.createSelectorQuery().in(this).select('#board')
      .fields({ node: true, size: true })
      .exec(function (res) {
        if (!res || !res[0] || !res[0].node) return;
        var info = res[0];
        var canvas = info.node;

        var dpr = 2;
        try {
          dpr = wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : wx.getSystemInfoSync().pixelRatio;
        } catch (e) { dpr = 2; }
        if (!dpr || dpr <= 0) dpr = 2;

        canvas.width = Math.round(info.width * dpr);
        canvas.height = Math.round(info.height * dpr);
        var ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        self.canvas = canvas;
        self.ctx = ctx;
        self.W = info.width;
        self.H = info.height;

        var size = Math.min(info.width, info.height);
        var pad = size * 0.035;
        self.engine.setViewport((size / 2 - pad) / GEO.DISC_R, info.width / 2, info.height / 2);

        self.frame = self.frame.bind(self);
        canvas.requestAnimationFrame(self.frame);
      });
  },

  frame: function () {
    if (this.dead) return;
    this.engine.tick();
    DRAW.drawBoard(this.ctx, this.W, this.H, this.engine.view());
    this.canvas.requestAnimationFrame(this.frame);
  },

  onTouchStart: function (e) {
    var t = e.touches && e.touches[0];
    if (t) this.engine.down(t.x, t.y);
  },

  onTouchMove: function (e) {
    var t = e.touches && e.touches[0];
    if (t) this.engine.move(t.x, t.y);
  },

  onTouchEnd: function () {
    this.engine.up();
  },

  onLevel: function (e) {
    var key = e.currentTarget.dataset.key;
    if (key === this.data.level) return;
    this.setData({ level: key });
    this.engine.setLevel(key);
  },

  syncLearn: function () {
    var ls = this.engine.learnState();
    var left = ls.left;
    this.setData({
      learn: ls.on,
      learnLeft: (left === null || left === undefined) ? null : left,
      learnDone: ls.on && left === 0
    });
  },

  onLearn: function () {
    var on = !this.data.learn;
    this.engine.setLearn(on);
    this.syncLearn();
    this.setData({
      tip: on ? '盘面已锁定，点击「下一步」逐步演示；关闭学习模式后恢复手动拨动'
              : '按住任意外圈，沿圆周方向拨动；捏住中心转子左右拨动换珠'
    });
  },

  onLearnNext: function () {
    var self = this;
    if (this.engine.learnNext()) {
      // 动画结束后刷新剩余步数
      var wait = setInterval(function () {
        if (!self.engine.busy) { clearInterval(wait); self.syncLearn(); }
      }, 60);
      this.syncLearn();
    } else {
      this.syncLearn();
    }
  },

  onShuffle: function () {
    this.setData({ won: false });
    this.engine.shuffle();
  },

  onUndo: function () { this.engine.undo(); },

  onReset: function () {
    this.setData({ won: false });
    this.engine.reset();
  }
});
