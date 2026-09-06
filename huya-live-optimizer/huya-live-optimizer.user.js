// ==UserScript==
// @name         HuyaLiveOptimizer | 虎牙直播优化器
// @namespace    https://github.com/guodonglu/tampermonkey-scripts
// @homepageURL  https://github.com/guodonglu/tampermonkey-scripts/tree/main/huya-live-optimizer
// @icon         https://www.huya.com/favicon.ico
// @version      2.0.4
// @description  自动免扫码解锁原画/蓝光等画质限制、智能切换最高/指定画质、自动进入观影模式(网页全屏)、毫秒级跳过片头广告、切台监听与毛玻璃设置面板
// @author       guodonglu, mks155
// @match        *://*.huya.com/*
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @run-at       document-start
// @license      MIT
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  // ================= 1. 存储与配置管理 =================
  const STORAGE_KEY_CONFIG = 'hy_live_optimizer_config_v2';

  const DEFAULT_CONFIG = {
    unlockQuality: true,         // 自动解除画质扫码限制
    preferredQuality: 'highest', // 偏好画质: 'highest'(最高) | '原画' | '蓝光' | '超清' | '高清'
    autoTheater: true,           // 自动进入观影模式（网页全屏）
    skipAds: true,               // 自动跳过片头广告
    watchNavigation: true,       // 监听切台/路由变动并自动重新优化
    showFloatBadge: true,        // 在页面右下角显示快捷悬浮徽标
    timeout: 15000               // 等待播放器加载超时(ms)
  };

  function getStorage(key, defaultVal) {
    try {
      if (typeof GM_getValue === 'function') {
        return GM_getValue(key, defaultVal);
      }
    } catch (e) {}
    try {
      const v = localStorage.getItem(key);
      return v !== null ? JSON.parse(v) : defaultVal;
    } catch (e) {
      return defaultVal;
    }
  }

  function setStorage(key, val) {
    try {
      if (typeof GM_setValue === 'function') {
        GM_setValue(key, val);
        return;
      }
    } catch (e) {}
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {}
  }

  let config = Object.assign({}, DEFAULT_CONFIG, getStorage(STORAGE_KEY_CONFIG, {}));

  function saveConfig() {
    setStorage(STORAGE_KEY_CONFIG, config);
    updateBadgeVisibility();
  }

  // ================= 2. 常用工具函数 =================
  const log = (msg, ...details) => {
    console.info('%c[虎牙直播优化器]%c ' + msg, 'color: #7c5cff; font-weight: bold;', 'color: inherit;', ...details);
  };

  const abortError = () => new DOMException('任务已取消', 'AbortError');

  function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(abortError());
      const onAbort = () => {
        clearTimeout(timer);
        reject(abortError());
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  async function waitFor(checkFn, timeout, description, signal) {
    const deadline = Date.now() + timeout;
    while (!signal?.aborted) {
      try {
        const result = checkFn();
        if (result) return result;
      } catch (e) {}
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error(`${description}超时 (${timeout}ms)`);
      await sleep(Math.min(200, remaining), signal);
    }
    throw abortError();
  }

  function isLiveRoom() {
    const pathname = window.location.pathname.replace(/^\/+|\/+$/g, '');
    if (!pathname) return false;
    const reserved = new Set(['all', 'g', 'l', 'video', 'search', 'huya', 'm']);
    if (reserved.has(pathname.toLowerCase())) return false;
    return Boolean(document.querySelector('#player-wrap, #hy-player, .room-player-wrap, #player-video') || /^[a-zA-Z0-9_-]+$/.test(pathname));
  }

  // ================= 3. 核心功能实现 =================
  const SELECTORS = {
    qualityItems: '.player-videotype-list li',
    currentQuality: '.player-videotype-cur',
    qualityBox: '.player-videotype, .player-videotype-box',
    theaterBtn: '#player-fullpage-btn, .player-fullpage-btn',
    theaterBtns: [
      '#player-fullpage-btn',
      '.player-fullpage-btn',
      '#player-ctrl-wrap .player-fullpage-btn',
      '#player-ctrl-wrap [title*="网页全屏"]',
      '#player-ctrl-wrap [data-player-tip*="网页全屏"]',
      '[data-player-tip="网页全屏"]',
      '[title="网页全屏"]'
    ].join(', '),
    theaterActiveMarks: [
      '.player-narrowpage',
      '#player-ctrl-wrap .player-narrowpage',
      '[title*="退出网页全屏"]',
      '[data-player-tip*="退出网页全屏"]'
    ].join(', '),
    adButtons: [
      '.ab-skip',
      '.ad-tip .skip',
      '.ad-skip',
      '.skip-ad',
      '.video-ad-skip',
      '.player-ad-tip .skip',
      '.ad-countdown .skip',
      '.player-ad-close',
      '[class*="skip--"]',
      '[class*="adSkip--"]'
    ].join(', ')
  };

  function getPageJQuery() {
    try {
      const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
      const candidate = win.jQuery || win.$;
      if (typeof candidate === 'function' && typeof candidate.fn?.data === 'function') {
        return candidate;
      }
    } catch (e) {}
    return null;
  }

  /**
   * 解除扫码限制
   * 虎牙播放器画质 li 元素通过 jQuery.data('data') 记录画质状态（status 非 0 会触发扫码登录）
   */
  function unlockQualityRestrictions() {
    if (!config.unlockQuality) return 0;
    const items = document.querySelectorAll(SELECTORS.qualityItems);
    if (!items || items.length === 0) return 0;

    const $ = getPageJQuery();
    let unlocked = 0;

    items.forEach(li => {
      // 1. 修改 jQuery 缓存中绑定的数据状态
      if ($) {
        try {
          const dataObj = $(li).data('data');
          if (dataObj && typeof dataObj === 'object' && dataObj.status !== 0) {
            dataObj.status = 0;
            unlocked++;
          }
        } catch (e) {}
      }

      // 2. 清理 DOM 锁定类名与角标
      if (li.getAttribute('data-status') && li.getAttribute('data-status') !== '0') {
        li.setAttribute('data-status', '0');
      }
      if (li.classList.contains('player-videotype-lock')) {
        li.classList.remove('player-videotype-lock');
      }
      const lockIcon = li.querySelector('.player-videotype-lock-icon, [class*="lock"]');
      if (lockIcon) {
        lockIcon.style.display = 'none';
      }
    });

    return unlocked;
  }

  /**
   * 监听画质下拉列表事件，确保用户手动 hover 或点击时同样解除限制
   */
  function bindDynamicUnlock() {
    const box = document.querySelector(SELECTORS.qualityBox);
    if (box && !box.__hy_opt_bound) {
      box.__hy_opt_bound = true;
      ['mouseenter', 'mouseover', 'click'].forEach(evtName => {
        box.addEventListener(evtName, () => {
          unlockQualityRestrictions();
        }, { passive: true });
      });
    }
  }

  /**
   * 自动切换画质
   */
  async function applyQuality(signal) {
    // 控件出现不代表播放器事件和 jQuery 画质数据已经初始化完成。
    // 在有限时间内重新读取控件、解锁并重试，兼容加载过程中替换列表。
    const deadline = Date.now() + config.timeout;
    let lastClick = -Infinity;
    let confirmedAt = null;
    let previousTarget = null;
    let targetQuality = '';
    const label = el => (el?.textContent || '').replace(/\s+/g, '').replace(/扫码|解锁|限免|登录/g, '');

    while (Date.now() < deadline) {
      if (signal?.aborted) throw abortError();
      bindDynamicUnlock();
      unlockQualityRestrictions();
      const items = Array.from(document.querySelectorAll(SELECTORS.qualityItems));
      const current = document.querySelector(SELECTORS.currentQuality);
      const pref = String(config.preferredQuality || 'highest').trim();
      const target = pref === 'highest' ? items[0]
        : items.find(el => label(el) === pref) || items.find(el => label(el).includes(pref)) || items[0];

      if (target && current && label(target)) {
        if (target !== previousTarget) {
          previousTarget = target;
          confirmedAt = null;
          lastClick = -Infinity;
        }
        targetQuality = label(target);
        if (label(current) === targetQuality) {
          if (confirmedAt === null) confirmedAt = Date.now();
          // 避免加载过程短暂显示目标画质，随后又被播放器默认值覆盖。
          if (Date.now() - confirmedAt >= 1200) {
            updateBadgeQuality(current.textContent.trim());
            return '已确认目标画质: ' + targetQuality;
          }
        } else {
          confirmedAt = null;
          if (Date.now() - lastClick >= 1500) {
            lastClick = Date.now();
            try { target.click(); } catch (e) {}
          }
        }
      } else {
        confirmedAt = null;
      }
      await sleep(Math.min(200, Math.max(0, deadline - Date.now())), signal);
    }
    if (signal?.aborted) throw abortError();
    const current = document.querySelector(SELECTORS.currentQuality)?.textContent.trim();
    updateBadgeQuality(current || '未知画质');
    throw new Error('未确认切换至 ' + (targetQuality || '目标画质') + '，当前画质：' + (current || '未知'));
  }

  /**
   * 检查当前是否已处于观影模式（网页全屏）
   * 结合页面 body 样式标记与播放器控制按钮类名进行双重可靠判定
   */
  function isTheaterModeActive() {
    if (document.body?.classList.contains('mode-page-full') || document.body?.classList.contains('mode-page-theater')) {
      return true;
    }
    const narrowBtn = document.querySelector(SELECTORS.theaterActiveMarks);
    if (narrowBtn) {
      return true;
    }
    const btn = document.querySelector(SELECTORS.theaterBtns);
    if (btn && (btn.classList.contains('player-narrowpage') || btn.getAttribute('title')?.includes('退出'))) {
      return true;
    }
    return false;
  }

  /**
   * 进入观影模式（网页全屏 / 展开半屏）
   * 按照用户建议：进入页面后持续轮询 10 秒，每秒检测并尝试点击 1 次
   */
  async function applyTheaterMode(signal) {
    if (!config.autoTheater) return '未开启自动观影模式';

    const totalSeconds = 10; // 轮询10秒，每秒1次
    let clickCount = 0;

    for (let sec = 1; sec <= totalSeconds; sec++) {
      if (signal?.aborted) throw abortError();

      // 1. 如果检测到已成功处于网页全屏，停止轮询避免反向触发退出
      if (isTheaterModeActive()) {
        log(`观影模式：第 ${sec} 秒检测已处于网页全屏状态，无需重复点击`);
        return clickCount > 0 ? `成功进入观影模式 (第${sec}秒确认)` : '已处于观影模式';
      }

      // 2. 查找网页全屏按钮
      const theaterBtn = document.querySelector(SELECTORS.theaterBtns);
      if (theaterBtn) {
        // 若按钮自身已变成退出全屏标记，则确认已在全屏
        if (theaterBtn.classList.contains('player-narrowpage') || theaterBtn.getAttribute('title')?.includes('退出')) {
          log(`观影模式：第 ${sec} 秒检测到退出全屏按钮，停止点击`);
          return '已处于观影模式';
        }

        try {
          // 切换按钮每轮只能点击一次，重复派发会立即退出全屏。
          theaterBtn.click();
          clickCount++;
          log(`观影模式：第 ${sec}/10 秒检测到按钮并执行点击 (累计点击 ${clickCount} 次)`);
        } catch (err) {
          console.warn(`[虎牙直播优化器] 第 ${sec} 秒点击异常:`, err);
        }

        // 点击后等待 300ms 快速校验是否生效
        await sleep(300, signal);
        if (isTheaterModeActive()) {
          log(`观影模式：第 ${sec} 秒成功进入网页全屏！`);
          return `成功进入观影模式 (第${sec}秒)`;
        }
        // 补齐至 1 秒
        await sleep(700, signal);
      } else {
        log(`观影模式：第 ${sec}/10 秒未找到全屏按钮，等待下一秒继续重试...`);
        await sleep(1000, signal);
      }
    }

    if (isTheaterModeActive()) {
      return '已进入观影模式';
    }

    return `轮询 10 秒完成 (共尝试点击 ${clickCount} 次)`;
  }

  /**
   * 手动切换观影模式
   */
  function toggleTheaterMode() {
    // 手动全屏只取消自动全屏，画质优化仍继续。
    runner.theaterController?.abort();
    const btn = document.querySelector(SELECTORS.theaterBtns) || document.querySelector(SELECTORS.theaterActiveMarks);
    if (btn) {
      btn.click();
      log('已切换观影模式');
    }
  }

  /**
   * 自动跳过片头广告
   */
  async function applyAdSkipper(signal) {
    if (!config.skipAds) return '未开启广告跳过';

    const deadline = Date.now() + 15000;
    const attempts = new WeakMap();
    const adContainers = '.hy-video-ad, .player-ad-tip, .player-videotype-ad, .ad-tip, .ad-countdown';
    const visible = el => Boolean(el?.isConnected && el.getClientRects().length > 0
      && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none');
    let attempted = false;
    let pending = null;

    while (Date.now() < deadline) {
      if (signal?.aborted) throw abortError();
      const containers = Array.from(document.querySelectorAll(adContainers)).filter(visible);
      // 只在已观察到的广告容器消失，且没有新广告容器时确认结束。
      if (pending?.length && pending.every(el => !visible(el)) && containers.length === 0) {
        return '广告已结束（点击/快进后确认广告区域消失）';
      }
      const skipButtons = document.querySelectorAll(SELECTORS.adButtons);
      for (const btn of skipButtons) {
        if (!visible(btn) || btn.disabled || btn.getAttribute('aria-disabled') === 'true') continue;
        if (Date.now() - (attempts.get(btn) ?? -Infinity) < 1500) continue;
        if (signal?.aborted) throw abortError();
        attempts.set(btn, Date.now());
        try {
          btn.click();
          attempted = true;
          pending = containers;
          // 点击后继续检测结果，不把派发点击当成跳过成功。
          break;
        } catch (e) {}
      }

      const adVideo = document.querySelector('.hy-video-ad video, .player-ad-tip video, .player-videotype-ad video');
      if (visible(adVideo) && !adVideo.paused && Number.isFinite(adVideo.duration) && adVideo.duration > 0
          && Date.now() - (attempts.get(adVideo) ?? -Infinity) >= 1500) {
        attempts.set(adVideo, Date.now());
        try {
          adVideo.currentTime = adVideo.duration;
          attempted = true;
          pending = containers;
        } catch (e) {}
      }
      await sleep(500, signal);
    }
    if (signal?.aborted) throw abortError();
    return attempted ? '广告检测结束：已尝试跳过，但未确认广告结束' : '广告检测结束：未发现可操作的跳过按钮';
  }

  // ================= 4. 任务调度与 SPA 切台监听 =================
  class OptimizerRunner {
    constructor() {
      this.controller = null;
      this.isProcessing = false;
    }

    abort() {
      this.theaterController?.abort();
      this.controller?.abort();
      this.controller = null;
      this.isProcessing = false;
    }

    async execute() {
      clearTimeout(navigationTimer);
      this.abort();
      if (!isLiveRoom()) {
        updateBadgeStatus('非直播页面');
        return;
      }
      const controller = new AbortController();
      this.controller = controller;
      const theaterController = new AbortController();
      this.theaterController = theaterController;
      this.isProcessing = true;
      const signal = controller.signal;

      try {
        log('开始执行优化流程...');
        updateBadgeStatus('优化中...');
        await sleep(200, signal);
        if (signal.aborted) throw abortError();

        const jobs = [
          ['观影模式', applyTheaterMode(theaterController.signal).catch(err => {
            if (theaterController.signal.aborted) return '自动观影已取消';
            throw err;
          })],
          ['画质优化', applyQuality(signal)],
          ['广告跳过', applyAdSkipper(signal)]
        ];
        const results = await Promise.allSettled(jobs.map(([, promise]) => promise));
        if (signal.aborted) return;
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') log(jobs[index][0] + '：' + result.value);
          else console.warn('[虎牙直播优化器] ' + jobs[index][0] + '异常:', result.reason);
        });
        if (results.some(result => result.status === 'rejected')) {
          updateBadgeStatus('部分优化失败');
        } else {
          updateBadgeQuality(document.querySelector(SELECTORS.currentQuality)?.textContent.trim() || '已就绪');
        }
      } catch (err) {
        if (!signal.aborted) {
          console.warn('[虎牙直播优化器] 优化任务执行中断:', err);
          updateBadgeStatus('优化失败');
        }
      } finally {
        // 旧任务只能清理自己的状态，不能影响已启动的新任务。
        if (this.controller === controller) {
          this.controller = null;
          this.isProcessing = false;
        }
      }
    }
  }

  const runner = new OptimizerRunner();

  // 房间身份按域名和路径判断，查询参数或锚点变化不应打断画质初始化。
  const roomUrl = () => {
    const url = new URL(window.location.href);
    return url.origin + url.pathname.replace(/\/+$/, '');
  };
  let lastUrl = roomUrl();
  let navigationTimer = null;
  function handleUrlChange() {
    const currentUrl = roomUrl();
    if (currentUrl === lastUrl) return;
    lastUrl = currentUrl;
    clearTimeout(navigationTimer);
    // 即使关闭自动切台，也要停止旧页面任务。
    runner.abort();
    if (!config.watchNavigation) return;
    navigationTimer = setTimeout(() => {
      navigationTimer = null;
      if (config.watchNavigation) runner.execute();
    }, 800);
  }

  function hookHistory() {
    const origPush = history.pushState;
    const origReplace = history.replaceState;

    history.pushState = function (...args) {
      origPush.apply(this, args);
      handleUrlChange();
    };
    history.replaceState = function (...args) {
      origReplace.apply(this, args);
      handleUrlChange();
    };

    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('hashchange', handleUrlChange);
  }

  // ================= 5. UI 界面：悬浮徽标与暗色毛玻璃控制面板 =================
  let badgeEl = null;
  let modalOverlay = null;

  function injectStyles() {
    const styleId = 'hy-optimizer-styles';
    if (document.getElementById(styleId)) return;

    const css = `
      /* 悬浮徽标 */
      #hy-opt-badge {
        position: fixed;
        right: 18px;
        bottom: 118px;
        z-index: 99998;
        display: flex;
        align-items: center;
        gap: 6px;
        background: rgba(28, 28, 30, 0.88);
        color: #fff;
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 20px;
        padding: 6px 13px;
        font-size: 13px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
        cursor: pointer;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
        transition: all 0.25s ease;
        user-select: none;
      }
      #hy-opt-badge:hover {
        background: rgba(124, 92, 255, 0.95);
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(124, 92, 255, 0.45);
      }
      #hy-opt-badge .hy-opt-icon {
        font-size: 14px;
        display: flex;
        align-items: center;
      }
      #hy-opt-badge .hy-opt-quality-tag {
        background: rgba(255, 255, 255, 0.2);
        padding: 1px 7px;
        border-radius: 10px;
        font-size: 11px;
        font-weight: 600;
        color: #ffd166;
        letter-spacing: 0.3px;
      }

      /* 模态弹窗遮罩 */
      #hy-opt-modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.65);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        z-index: 100000;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        visibility: hidden;
        transition: all 0.22s ease;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
      }
      #hy-opt-modal-overlay.open {
        opacity: 1;
        visibility: visible;
      }

      /* 模态卡片 */
      .hy-opt-card {
        background: #18181f;
        color: #f1f2f6;
        width: 500px;
        max-width: 92vw;
        max-height: 88vh;
        border-radius: 16px;
        box-shadow: 0 24px 48px rgba(0, 0, 0, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.12);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transform: scale(0.95);
        transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
      }
      #hy-opt-modal-overlay.open .hy-opt-card {
        transform: scale(1);
      }

      /* 头部 */
      .hy-opt-header {
        padding: 16px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: rgba(255, 255, 255, 0.03);
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }
      .hy-opt-header-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 16px;
        font-weight: 700;
        color: #fff;
      }
      .hy-opt-header-title .hy-opt-badge-tag {
        font-size: 11px;
        background: rgba(124, 92, 255, 0.25);
        color: #c4b5fd;
        border: 1px solid rgba(124, 92, 255, 0.4);
        padding: 1px 6px;
        border-radius: 6px;
      }
      .hy-opt-close-btn {
        background: transparent;
        border: none;
        color: #a4b0be;
        font-size: 20px;
        cursor: pointer;
        line-height: 1;
        padding: 4px;
        border-radius: 6px;
        transition: all 0.2s;
      }
      .hy-opt-close-btn:hover {
        color: #fff;
        background: rgba(255, 255, 255, 0.1);
      }

      /* 内容体 */
      .hy-opt-body {
        padding: 20px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .hy-opt-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: rgba(255, 255, 255, 0.035);
        padding: 12px 16px;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.05);
        transition: background 0.2s;
      }
      .hy-opt-item:hover {
        background: rgba(255, 255, 255, 0.06);
      }
      .hy-opt-item-info {
        display: flex;
        flex-direction: column;
        gap: 3px;
        padding-right: 12px;
      }
      .hy-opt-item-title {
        font-size: 14px;
        font-weight: 600;
        color: #e4e7eb;
      }
      .hy-opt-item-desc {
        font-size: 12px;
        color: #8a8f9d;
        line-height: 1.4;
      }

      /* 开关组件 */
      .hy-opt-switch {
        position: relative;
        display: inline-block;
        width: 44px;
        height: 24px;
        flex-shrink: 0;
      }
      .hy-opt-switch input {
        opacity: 0;
        width: 0;
        height: 0;
      }
      .hy-opt-slider {
        position: absolute;
        cursor: pointer;
        inset: 0;
        background-color: rgba(255, 255, 255, 0.2);
        transition: 0.25s;
        border-radius: 24px;
      }
      .hy-opt-slider:before {
        position: absolute;
        content: "";
        height: 18px;
        width: 18px;
        left: 3px;
        bottom: 3px;
        background-color: white;
        transition: 0.25s;
        border-radius: 50%;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
      }
      .hy-opt-switch input:checked + .hy-opt-slider {
        background-color: #7c5cff;
      }
      .hy-opt-switch input:checked + .hy-opt-slider:before {
        transform: translateX(20px);
      }

      /* 下拉选择框 */
      .hy-opt-select {
        background: #252530;
        color: #f1f2f6;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 8px;
        padding: 6px 12px;
        font-size: 13px;
        outline: none;
        cursor: pointer;
        transition: border 0.2s;
      }
      .hy-opt-select:focus {
        border-color: #7c5cff;
      }

      /* 底部操作区 */
      .hy-opt-footer {
        padding: 14px 20px;
        background: rgba(255, 255, 255, 0.02);
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .hy-opt-btn-group {
        display: flex;
        gap: 10px;
      }
      .hy-opt-btn {
        padding: 7px 16px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        border: none;
        transition: all 0.2s;
      }
      .hy-opt-btn-secondary {
        background: rgba(255, 255, 255, 0.08);
        color: #c8d6e5;
      }
      .hy-opt-btn-secondary:hover {
        background: rgba(255, 255, 255, 0.14);
        color: #fff;
      }
      .hy-opt-btn-primary {
        background: #7c5cff;
        color: #fff;
      }
      .hy-opt-btn-primary:hover {
        background: #6a48f3;
        box-shadow: 0 2px 10px rgba(124, 92, 255, 0.4);
      }
      .hy-opt-btn-run {
        background: rgba(0, 184, 148, 0.2);
        color: #55efc4;
        border: 1px solid rgba(0, 184, 148, 0.4);
      }
      .hy-opt-btn-run:hover {
        background: rgba(0, 184, 148, 0.35);
      }
    `;

    if (typeof GM_addStyle === 'function') {
      GM_addStyle(css);
    } else {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = css;
      (document.head || document.documentElement).appendChild(style);
    }
  }

  function updateBadgeQuality(text) {
    if (!badgeEl) return;
    const tag = badgeEl.querySelector('.hy-opt-quality-tag');
    if (tag && text) {
      tag.textContent = text;
    }
  }

  function updateBadgeStatus(status) {
    if (!badgeEl) return;
    const tag = badgeEl.querySelector('.hy-opt-quality-tag');
    if (tag) {
      tag.textContent = status;
    }
  }

  function updateBadgeVisibility() {
    if (!badgeEl) return;
    badgeEl.style.display = config.showFloatBadge ? 'flex' : 'none';
  }

  function createBadge() {
    if (document.getElementById('hy-opt-badge')) return;

    badgeEl = document.createElement('div');
    badgeEl.id = 'hy-opt-badge';
    badgeEl.title = '点击打开虎牙直播优化设置';
    badgeEl.innerHTML = `
      <span class="hy-opt-icon">⚡</span>
      <span>虎牙优化</span>
      <span class="hy-opt-quality-tag">加载中</span>
    `;

    badgeEl.addEventListener('click', () => openModal());
    document.body.appendChild(badgeEl);
    updateBadgeVisibility();
  }

  function createModal() {
    if (document.getElementById('hy-opt-modal-overlay')) return;

    modalOverlay = document.createElement('div');
    modalOverlay.id = 'hy-opt-modal-overlay';
    modalOverlay.innerHTML = `
      <div class="hy-opt-card" role="dialog" aria-modal="true">
        <div class="hy-opt-header">
          <div class="hy-opt-header-title">
            <span>⚡ 虎牙直播优化器</span>
            <span class="hy-opt-badge-tag">v2.0.4</span>
          </div>
          <button class="hy-opt-close-btn" id="hy-opt-close-btn" title="关闭 (Esc)">✕</button>
        </div>

        <div class="hy-opt-body">
          <!-- 1. 解锁画质扫码限制 -->
          <div class="hy-opt-item">
            <div class="hy-opt-item-info">
              <div class="hy-opt-item-title">🔓 解锁扫码画质限制</div>
              <div class="hy-opt-item-desc">免客户端/手机APP扫码，自由无限制切换原画、蓝光等高规格清晰度</div>
            </div>
            <label class="hy-opt-switch">
              <input type="checkbox" id="hy-opt-chk-unlock" ${config.unlockQuality ? 'checked' : ''}>
              <span class="hy-opt-slider"></span>
            </label>
          </div>

          <!-- 2. 偏好目标画质 -->
          <div class="hy-opt-item">
            <div class="hy-opt-item-info">
              <div class="hy-opt-item-title">🎯 偏好目标画质</div>
              <div class="hy-opt-item-desc">进入直播间自动选择的清晰度；若目标画质不存在则回退至最高可用画质</div>
            </div>
            <select class="hy-opt-select" id="hy-opt-sel-quality">
              <option value="highest" ${config.preferredQuality === 'highest' ? 'selected' : ''}>最高画质 (第一项)</option>
              <option value="原画" ${config.preferredQuality === '原画' ? 'selected' : ''}>原画 优先</option>
              <option value="蓝光" ${config.preferredQuality === '蓝光' ? 'selected' : ''}>蓝光 优先</option>
              <option value="超清" ${config.preferredQuality === '超清' ? 'selected' : ''}>超清 优先</option>
              <option value="高清" ${config.preferredQuality === '高清' ? 'selected' : ''}>高清 优先</option>
            </select>
          </div>

          <!-- 3. 自动进入观影模式 -->
          <div class="hy-opt-item">
            <div class="hy-opt-item-info">
              <div class="hy-opt-item-title">🎬 自动进入观影模式</div>
              <div class="hy-opt-item-desc">进入直播间后自动切换为网页全屏(观影模式)，视野宽阔免干扰</div>
            </div>
            <label class="hy-opt-switch">
              <input type="checkbox" id="hy-opt-chk-theater" ${config.autoTheater ? 'checked' : ''}>
              <span class="hy-opt-slider"></span>
            </label>
          </div>

          <!-- 4. 自动跳过片头广告 -->
          <div class="hy-opt-item">
            <div class="hy-opt-item-info">
              <div class="hy-opt-item-title">⏭️ 自动跳过片头广告</div>
              <div class="hy-opt-item-desc">毫秒级监测并自动点击播放器片头广告跳过按钮</div>
            </div>
            <label class="hy-opt-switch">
              <input type="checkbox" id="hy-opt-chk-skip-ad" ${config.skipAds ? 'checked' : ''}>
              <span class="hy-opt-slider"></span>
            </label>
          </div>

          <!-- 5. 智能切台监听 -->
          <div class="hy-opt-item">
            <div class="hy-opt-item-info">
              <div class="hy-opt-item-title">🧭 路由与切台监听</div>
              <div class="hy-opt-item-desc">单页应用切台或地址改变时，自动重新触发画质解锁与优化流程</div>
            </div>
            <label class="hy-opt-switch">
              <input type="checkbox" id="hy-opt-chk-nav" ${config.watchNavigation ? 'checked' : ''}>
              <span class="hy-opt-slider"></span>
            </label>
          </div>

          <!-- 6. 显示悬浮徽标 -->
          <div class="hy-opt-item">
            <div class="hy-opt-item-info">
              <div class="hy-opt-item-title">📌 显示右下角悬浮徽标</div>
              <div class="hy-opt-item-desc">在页面右下角显示快捷状态球；关闭后仍可通过油猴扩展菜单呼出设置</div>
            </div>
            <label class="hy-opt-switch">
              <input type="checkbox" id="hy-opt-chk-badge" ${config.showFloatBadge ? 'checked' : ''}>
              <span class="hy-opt-slider"></span>
            </label>
          </div>
        </div>

        <div class="hy-opt-footer">
          <button class="hy-opt-btn hy-opt-btn-run" id="hy-opt-btn-run" title="对当前播放器立刻重新运行优化">🚀 立即运行优化</button>
          <div class="hy-opt-btn-group">
            <button class="hy-opt-btn hy-opt-btn-secondary" id="hy-opt-btn-reset">恢复默认</button>
            <button class="hy-opt-btn hy-opt-btn-primary" id="hy-opt-btn-save">保存并应用</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modalOverlay);

    // 事件绑定
    const closeBtn = document.getElementById('hy-opt-close-btn');
    closeBtn.addEventListener('click', closeModal);

    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalOverlay.classList.contains('open')) {
        closeModal();
      }
    });

    document.getElementById('hy-opt-btn-run').addEventListener('click', () => {
      readModalInputs();
      saveConfig();
      closeModal();
      runner.execute();
    });

    document.getElementById('hy-opt-btn-reset').addEventListener('click', () => {
      config = Object.assign({}, DEFAULT_CONFIG);
      saveConfig();
      syncModalInputs();
      runner.execute();
    });

    document.getElementById('hy-opt-btn-save').addEventListener('click', () => {
      readModalInputs();
      saveConfig();
      closeModal();
      runner.execute();
    });
  }

  function readModalInputs() {
    config.unlockQuality = document.getElementById('hy-opt-chk-unlock').checked;
    config.preferredQuality = document.getElementById('hy-opt-sel-quality').value;
    config.autoTheater = document.getElementById('hy-opt-chk-theater').checked;
    config.skipAds = document.getElementById('hy-opt-chk-skip-ad').checked;
    config.watchNavigation = document.getElementById('hy-opt-chk-nav').checked;
    config.showFloatBadge = document.getElementById('hy-opt-chk-badge').checked;
  }

  function syncModalInputs() {
    if (!modalOverlay) return;
    document.getElementById('hy-opt-chk-unlock').checked = config.unlockQuality;
    document.getElementById('hy-opt-sel-quality').value = config.preferredQuality;
    document.getElementById('hy-opt-chk-theater').checked = config.autoTheater;
    document.getElementById('hy-opt-chk-skip-ad').checked = config.skipAds;
    document.getElementById('hy-opt-chk-nav').checked = config.watchNavigation;
    document.getElementById('hy-opt-chk-badge').checked = config.showFloatBadge;
  }

  function openModal() {
    if (!modalOverlay) createModal();
    syncModalInputs();
    modalOverlay.classList.add('open');
  }

  function closeModal() {
    if (modalOverlay) {
      modalOverlay.classList.remove('open');
    }
  }

  // ================= 6. 油猴菜单命令注册 =================
  function registerMenuCommands() {
    if (typeof GM_registerMenuCommand !== 'function') return;

    GM_registerMenuCommand('⚙️ 虎牙直播优化设置', () => {
      openModal();
    });

    GM_registerMenuCommand('🎬 切换网页全屏 / 观影模式', () => {
      toggleTheaterMode();
    });

    GM_registerMenuCommand('🔄 重新解锁并切换画质', () => {
      runner.execute();
    });
  }

  // ================= 7. 脚本初始化入口 =================
  function init() {
    injectStyles();
    hookHistory();
    registerMenuCommands();

    const onDomReady = () => {
      createBadge();
      createModal();
      runner.execute();
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onDomReady, { once: true });
    } else {
      onDomReady();
    }

    // 浏览器前进/后退缓存唤醒处理
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) runner.execute();
    });
    window.addEventListener('pagehide', () => {
      clearTimeout(navigationTimer);
      runner.abort();
    });
  }

  init();
})();
