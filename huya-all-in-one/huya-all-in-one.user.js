// ==UserScript==
// @name         虎牙全能助手 (画质解锁+全方位去广告+主播过滤)
// @name:en      Huya All-in-One Toolkit
// @namespace    https://github.com/guodonglu/tampermonkey-scripts
// @homepageURL  https://github.com/guodonglu/tampermonkey-scripts/tree/main/huya-all-in-one
// @icon         https://www.huya.com/favicon.ico
// @version      3.0.0
// @description  虎牙直播全功能一体化助手：免扫码解锁原画/蓝光画质、自动最高画质、网页全屏(观影模式)、毫秒级跳片头广告；全方位屏蔽商业横幅/挂件小黄车/二维码/水印；按房间号/主播名彻底屏蔽与卡片隐藏过滤。现代化多标签暗色毛玻璃控制中心与快捷悬浮徽标。
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

  // =========================================================================
  // 1. 存储与多模块配置管理 (Storage & Unified Configuration)
  // =========================================================================
  const STORAGE_KEY_AIO = 'hy_aio_config_v1';
  const STORAGE_KEY_LIVE = 'hy_live_optimizer_config_v2';
  const STORAGE_KEY_ADBLOCK = 'hy_adblock_config_v1';
  const STORAGE_KEY_STREAMER_CONFIG = 'hy_blocker_config_v1';
  const STORAGE_KEY_STREAMER_LIST = 'hy_blocked_streamers_v1';

  const DEFAULT_CONFIG = {
    // 1. 画质与观影增强
    unlockQuality: true,         // 自动解除画质扫码限制
    preferredQuality: 'highest', // 偏好画质: 'highest'(最高) | '原画' | '蓝光' | '超清' | '高清'
    autoTheater: true,           // 自动进入观影模式（网页全屏）
    skipAds: true,               // 自动跳过片头广告
    watchNavigation: true,       // 监听切台/路由变动并自动重新优化
    timeout: 15000,              // 等待播放器加载超时(ms)

    // 2. 广告与干扰屏蔽
    blockSidebarAd: true,           // 聊天栏上方商业横幅广告（隐藏后聊天栏自动顶格伸展）
    blockPlayerWidgets: true,       // 播放器悬浮营销挂件（小黄车、更多活动、互动插件等）
    blockPlayerQrcode: true,        // 播放器左下角APP下载二维码与吉祥物
    blockTreasureAndPresents: true, // 浮动宝箱、周星榜、首充礼包、百宝箱
    blockWatermark: true,           // 播放器画面水印（虎牙Logo）
    blockTopBanners: true,          // 顶部背景头图广告与活动横幅
    blockBusinessGame: true,        // 游戏推广、分类页商业横幅与页尾推荐
    blockChatRichAds: true,         // 聊天区系统宣传长文与富文本推广卡片
    blockChatNobleEnter: false,     // 聊天区贵族进场座驾播报（默认关闭）
    blockChatGifts: false,          // 聊天区小额送礼滚屏（默认关闭）
    autoCloseLoginPopup: false,     // 自动关闭未登录强制弹出的登录窗口（默认关闭）

    // 3. 主播屏蔽与过滤
    showQuickBtn: true,             // 是否在列表卡片右上角显示快捷屏蔽图标
    autoRedirect: false,            // 进入被屏蔽直播间时是否直接返回首页 (默认弹出拦截遮罩)

    // 4. 全局偏好与 UI
    showFloatBadge: true,           // 是否显示右侧/右下角快捷悬浮徽标
    activeTab: 0                    // 控制面板默认选中的标签页索引
  };

  function getStorage(key, defaultVal) {
    try {
      if (typeof GM_getValue === 'function') {
        const val = GM_getValue(key, undefined);
        if (val !== undefined) return val;
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

  // 深度合并多脚本配置（优先继承旧版已保存的设置，无缝过渡）
  let config = Object.assign(
    {},
    DEFAULT_CONFIG,
    getStorage(STORAGE_KEY_LIVE, {}),
    getStorage(STORAGE_KEY_ADBLOCK, {}),
    getStorage(STORAGE_KEY_STREAMER_CONFIG, {}),
    getStorage(STORAGE_KEY_AIO, {})
  );

  // 主播黑名单列表
  const rawList = getStorage(STORAGE_KEY_STREAMER_LIST, []);
  let blockedList = (Array.isArray(rawList) ? rawList : []).filter(item => {
    return item && typeof item.id === 'string' && item.id.trim().length > 0;
  });

  function saveConfig() {
    setStorage(STORAGE_KEY_AIO, config);
    // 逆向同步至旧版 key，确保多脚本并存时数据完全一致
    setStorage(STORAGE_KEY_LIVE, {
      unlockQuality: config.unlockQuality,
      preferredQuality: config.preferredQuality,
      autoTheater: config.autoTheater,
      skipAds: config.skipAds,
      watchNavigation: config.watchNavigation,
      showFloatBadge: config.showFloatBadge,
      timeout: config.timeout
    });
    setStorage(STORAGE_KEY_ADBLOCK, {
      blockSidebarAd: config.blockSidebarAd,
      blockPlayerWidgets: config.blockPlayerWidgets,
      blockPlayerQrcode: config.blockPlayerQrcode,
      blockTreasureAndPresents: config.blockTreasureAndPresents,
      blockWatermark: config.blockWatermark,
      blockTopBanners: config.blockTopBanners,
      blockBusinessGame: config.blockBusinessGame,
      blockChatRichAds: config.blockChatRichAds,
      blockChatNobleEnter: config.blockChatNobleEnter,
      blockChatGifts: config.blockChatGifts,
      autoCloseLoginPopup: config.autoCloseLoginPopup,
      showFloatBadge: config.showFloatBadge
    });
    setStorage(STORAGE_KEY_STREAMER_CONFIG, {
      showFloatBtn: config.showFloatBadge,
      showQuickBtn: config.showQuickBtn,
      autoRedirect: config.autoRedirect
    });

    applyAdblockStyles();
    updateBadgeVisibility();
    updateBadge();
  }

  function saveList() {
    blockedList = (blockedList || []).filter(item => item && typeof item.id === 'string' && item.id.trim().length > 0);
    setStorage(STORAGE_KEY_STREAMER_LIST, blockedList);
    applyStreamerFilter();
    updateStreamerUIList();
    updateBadge();
  }

  // =========================================================================
  // 2. 常用工具函数与页面判定 (Utilities & Page Detection)
  // =========================================================================
  const log = (msg, ...details) => {
    console.info('%c[虎牙全能助手]%c ' + msg, 'color: #ff7200; font-weight: bold;', 'color: inherit;', ...details);
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

  function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  const RESERVED_PATHS = new Set([
    'all', 'g', 'l', 'm', 'video', 'search', 'myfollow', 'udb', 'pay', 'hd', 
    'news', 'download', 'help', 'act', 'show', 'game', 'app', 'e', 'special', 'huya'
  ]);

  /**
   * 判断当前是否为直播间详情页 (例如 huya.com/102411 或 huya.com/kpl)
   */
  function isLiveRoom() {
    const pathname = window.location.pathname.replace(/^\/+|\/+$/g, '');
    if (!pathname) return false;
    const firstSeg = pathname.split('/')[0].toLowerCase();
    if (RESERVED_PATHS.has(firstSeg)) return false;
    return Boolean(document.querySelector('#player-wrap, #hy-player, .room-player-wrap, #player-video') || /^[a-zA-Z0-9_-]+$/.test(pathname));
  }

  function getCurrentRoomSlug() {
    const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
    if (!path) return null;
    const slug = path.split('/')[0].toLowerCase();
    if (RESERVED_PATHS.has(slug)) return null;
    return slug;
  }

  function showToast(msg, type = 'info') {
    let container = document.getElementById('hy-aio-toast-box');
    if (!container) {
      container = document.createElement('div');
      container.id = 'hy-aio-toast-box';
      (document.body || document.documentElement).appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `hy-aio-toast hy-aio-toast-${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('hide');
      setTimeout(() => toast.remove(), 250);
    }, 2200);
  }

  // =========================================================================
  // 3. 广告与干扰屏蔽引擎 (Pure CSS AdBlocker Engine - 0 CPU)
  // =========================================================================
  const ADBLOCK_STYLE_ID = 'hy-aio-adblock-style';
  let blockedAdCounter = 0;

  function buildCSS() {
    const rules = [];

    // 1. 聊天栏上方商业广告横幅与顶格自适应
    if (config.blockSidebarAd) {
      rules.push(`
        #J_roomSideTop,
        #ab-banner,
        .room-sidebar-top,
        .room-sidebar-business,
        .match-room-ad,
        #huya-ab,
        #huya-ab-fixed {
          display: none !important;
          height: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
          visibility: hidden !important;
        }
      `);
    }

    // 2. 播放器悬浮营销挂件 & 互动插件
    if (config.blockPlayerWidgets) {
      rules.push(`
        .diy-comps-wrap,
        .diy-comp,
        .diy-activity-icon,
        .more-activity-icon,
        .more-activity-icon-box,
        #diy-pet-icon,
        .ext-sub-frame-wrap,
        iframe[src*="ext.huya.com"],
        .player-corner-ad,
        .player-pause-ad,
        .hy-video-ad,
        .hy-video-ad-box,
        #player-download-guide-tip,
        #player-subscribe-pop {
          display: none !important;
          visibility: hidden !important;
          pointer-events: none !important;
          width: 0 !important;
          height: 0 !important;
          opacity: 0 !important;
        }
      `);
    }

    // 3. 播放器二维码与APP下载
    if (config.blockPlayerQrcode) {
      rules.push(`
        .player-app-qrcode,
        .player-download-guide {
          display: none !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }
      `);
    }

    // 4. 宝箱与营销礼包入口
    if (config.blockTreasureAndPresents) {
      rules.push(`
        #J_treasureChestContainer,
        #week-star-btn,
        #player-punch-btn,
        .player-box-icon,
        .player-chest-btn,
        .tv-icon,
        .room-gift-banner,
        .gift-marquee {
          display: none !important;
          visibility: hidden !important;
        }
      `);
    }

    // 5. 播放器水印
    if (config.blockWatermark) {
      rules.push(`
        #hy-watermark,
        #player-watermark {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
        }
      `);
    }

    // 6. 顶部头图广告与活动横幅
    if (config.blockTopBanners) {
      rules.push(`
        .diy-toutu,
        #diy-toutu,
        .J_ttVideo,
        .special-bg,
        #room-hd-banner,
        [class*="bannerList--"],
        [class*="bannerItem--"] {
          display: none !important;
          height: 0 !important;
          visibility: hidden !important;
        }
      `);
    }

    // 7. 游戏推广与页尾推荐
    if (config.blockBusinessGame) {
      rules.push(`
        .room-business-game,
        .business-game,
        .sidebar-banner,
        #sidebarBanner,
        .j_bannerItem,
        .room-footer,
        .game-footer {
          display: none !important;
          visibility: hidden !important;
        }
      `);
    }

    // 8. 聊天室系统宣传长文与推广卡片
    if (config.blockChatRichAds) {
      rules.push(`
        .RoomMessageRichText--THUe1rNMNoESF9P60czw,
        #chat-room__list > div[data-cmid="1"] {
          display: none !important;
        }
      `);
    }

    // 9. 进场座驾广播
    if (config.blockChatNobleEnter) {
      rules.push(`
        #chat-room__list [class*="box-noble-level"],
        #chat-room__list [class*="msg--Zvl2tK76R5QFGf7YrGSb"] {
          display: none !important;
        }
      `);
    }

    // 10. 小额送礼滚屏
    if (config.blockChatGifts) {
      rules.push(`
        #chat-room__list .tit-h-send,
        #chat-room__list [class*="msg-gift"] {
          display: none !important;
        }
      `);
    }

    return rules.join('\n');
  }

  function applyAdblockStyles() {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;
    let style = document.getElementById ? document.getElementById(ADBLOCK_STYLE_ID) : null;
    if (!style) {
      style = document.createElement('style');
      style.id = ADBLOCK_STYLE_ID;
      const target = document.head || document.documentElement;
      if (target && typeof target.appendChild === 'function') {
        target.appendChild(style);
      } else if (typeof document.addEventListener === 'function') {
        document.addEventListener('DOMContentLoaded', () => {
          (document.head || document.documentElement)?.appendChild(style);
        }, { once: true });
      }
    }
    style.textContent = buildCSS();
  }

  // document-start 极速注入纯 CSS 过滤规则
  applyAdblockStyles();

  function countBlockedElements() {
    try {
      const selectors = [
        '#J_roomSideTop', '#ab-banner', '.diy-comps-wrap', '.diy-activity-icon',
        '#diy-pet-icon', '.ext-sub-frame-wrap', '#J_treasureChestContainer',
        '#week-star-btn', '.player-app-qrcode', '#player-punch-btn',
        '#hy-watermark', '#room-hd-banner', '.room-business-game',
        '.RoomMessageRichText--THUe1rNMNoESF9P60czw'
      ];
      let count = 0;
      selectors.forEach(sel => {
        count += document.querySelectorAll(sel).length;
      });
      blockedAdCounter = count;
      return count;
    } catch (e) {
      return 0;
    }
  }

  function checkLoginPopup() {
    if (!config.autoCloseLoginPopup) return;
    const closeBtn = document.querySelector('.udb-popup-close, .login-close, #UDBSdkLgn-close');
    if (closeBtn && closeBtn.offsetParent !== null) {
      closeBtn.click();
    }
  }

  // =========================================================================
  // 4. 主播屏蔽与过滤引擎 (Streamer Blocker Engine)
  // =========================================================================
  let filteredStreamerCount = 0;

  function parseInput(input) {
    if (!input) return null;
    let s = input.trim();
    if (s.includes('huya.com')) {
      const urlMatch = s.match(/huya\.com\/([a-zA-Z0-9_\u4e00-\u9fa5-]+)(?:\?|#|$|\/)/i);
      if (urlMatch && urlMatch[1]) {
        const slug = urlMatch[1].toLowerCase();
        return !RESERVED_PATHS.has(slug) ? slug : null;
      }
      return null;
    }
    s = s.replace(/^[^\w\u4e00-\u9fa5]+|[^\w\u4e00-\u9fa5]+$/gu, '').toLowerCase();
    return s && !RESERVED_PATHS.has(s) ? s : null;
  }

  function addBlockedItem(rawInput, remark = '') {
    const id = parseInput(rawInput);
    if (!id) return { success: false, msg: '输入内容格式不正确' };

    const exists = blockedList.some(item => (item.id || '').toLowerCase() === id);
    if (exists) return { success: false, msg: `[${id}] 已在屏蔽列表中` };

    const dateStr = new Date().toLocaleDateString();
    blockedList.unshift({
      id: id,
      remark: (remark || '').trim(),
      date: dateStr
    });
    saveList();
    return { success: true, id };
  }

  function removeBlockedItem(id) {
    id = (id || '').toLowerCase();
    blockedList = blockedList.filter(item => (item.id || '').toLowerCase() !== id);
    saveList();
  }

  function getCardInfo(card) {
    let roomId = null;
    let uid = null;
    let nick = null;

    if (card.dataset) {
      if (card.dataset.rid) roomId = card.dataset.rid.toLowerCase();
      if (card.dataset.lp) uid = card.dataset.lp.toLowerCase();
      if (card.dataset.uid) uid = card.dataset.uid.toLowerCase();
    }
    if (!uid && card.getAttribute('data-lp')) {
      uid = card.getAttribute('data-lp').toLowerCase();
    }

    const elements = card.querySelectorAll('a, [data-url], [data-href], [data-uid]');
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (!uid && el.getAttribute('data-uid')) uid = el.getAttribute('data-uid').toLowerCase();
      const rawDataUrl = el.getAttribute('data-url') || el.getAttribute('data-href');
      if (rawDataUrl && !roomId) {
        try {
          const decoded = decodeURIComponent(rawDataUrl);
          const m = decoded.match(/(?:huya\.com\/|^|\/)([a-zA-Z0-9_-]+)(?:\?|#|$)/i);
          if (m && m[1]) {
            const slug = m[1].toLowerCase();
            if (!RESERVED_PATHS.has(slug)) roomId = slug;
          }
        } catch (e) {}
      }
      const href = el.getAttribute('href');
      if (href && !roomId) {
        const m = href.match(/(?:huya\.com\/|^|\/)([a-zA-Z0-9_-]+)(?:\?|#|$)/i);
        if (m && m[1]) {
          const slug = m[1].toLowerCase();
          if (!RESERVED_PATHS.has(slug)) roomId = slug;
        }
      }
    }

    const nickEl = card.querySelector('.nick, i.nick, .avatar-name, .txt .nick');
    if (nickEl) {
      nick = (nickEl.innerText || nickEl.getAttribute('title') || '').trim();
    }

    return { roomId, uid, nick };
  }

  function isCardBlocked(info) {
    if (!info || blockedList.length === 0) return false;
    const cardRoomId = (info.roomId || '').toLowerCase();
    const cardUid = (info.uid || '').toLowerCase();
    const cardNick = (info.nick || '').toLowerCase();

    for (const item of blockedList) {
      const target = (item.id || '').toLowerCase().trim();
      if (!target) continue;

      if (cardRoomId && cardRoomId === target) return true;
      if (cardUid && cardUid === target) return true;
      if (cardNick && cardNick === target) return true;

      const isPureDigits = /^\d+$/.test(target);
      if (!isPureDigits && target.length >= 2 && cardNick.includes(target)) {
        return true;
      }
    }
    return false;
  }

  function applyStreamerFilter() {
    if (blockedList.length === 0) {
      document.querySelectorAll('[data-hy-blocked="true"]').forEach(el => {
        el.removeAttribute('data-hy-blocked');
        el.style.display = '';
      });
      filteredStreamerCount = 0;
      updateBadge();
      return;
    }

    const cardSelectors = [
      '.game-live-item', '.live-card', '.video-info-wrap', '.recommend-item',
      '.mod-index-rec li', '.match-item', '.search-result li', '#js-live-list > li',
      '.live-list > li', '.index-list-item', 'li[data-lp]'
    ].join(',');

    const cards = document.querySelectorAll(cardSelectors);
    let count = 0;

    cards.forEach(card => {
      const info = getCardInfo(card);
      const shouldBlock = isCardBlocked(info);

      if (shouldBlock) {
        card.setAttribute('data-hy-blocked', 'true');
        card.style.setProperty('display', 'none', 'important');
        count++;
      } else if (card.getAttribute('data-hy-blocked') === 'true') {
        card.removeAttribute('data-hy-blocked');
        card.style.display = '';
      }

      if (config.showQuickBtn && !shouldBlock && !card.querySelector('.hy-quick-block-btn')) {
        injectQuickBlockBtn(card, info);
      }
    });

    // 兜底补漏：检索带有匹配 data-url / href 的未隐藏元素
    const links = document.querySelectorAll('[data-url], a[href*="huya.com/"], a[href^="/"]');
    links.forEach(el => {
      const raw = el.getAttribute('data-url') || el.getAttribute('href') || '';
      try {
        const decoded = decodeURIComponent(raw);
        for (const item of blockedList) {
          const target = (item.id || '').toLowerCase();
          if (target && decoded.toLowerCase().includes(target)) {
            const parentCard = el.closest('li, .game-live-item, .live-card, [class*="item"]');
            if (parentCard && parentCard.getAttribute('data-hy-blocked') !== 'true') {
              parentCard.setAttribute('data-hy-blocked', 'true');
              parentCard.style.setProperty('display', 'none', 'important');
              count++;
            }
          }
        }
      } catch (e) {}
    });

    filteredStreamerCount = count;
    updateBadge();
  }

  function injectQuickBlockBtn(card, info) {
    if (card.querySelector('.hy-quick-block-btn')) return;

    const btn = document.createElement('button');
    btn.className = 'hy-quick-block-btn';
    btn.title = `一键屏蔽此主播 (${info.nick || info.roomId || ''})`;
    btn.innerHTML = '🚫 屏蔽';

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const blockTarget = info.roomId || info.nick;
      if (!blockTarget) return;

      const res = addBlockedItem(blockTarget, info.nick || '');
      if (res.success) {
        showToast(`已屏蔽：${info.nick || blockTarget}`, 'success');
        card.setAttribute('data-hy-blocked', 'true');
        card.style.setProperty('display', 'none', 'important');
      } else {
        showToast(res.msg, 'info');
      }
    });

    const pos = window.getComputedStyle(card).position;
    if (pos === 'static') {
      card.style.position = 'relative';
    }
    card.appendChild(btn);
  }

  let streamerFilterTimer = null;
  function debounceStreamerFilter() {
    if (streamerFilterTimer) clearTimeout(streamerFilterTimer);
    streamerFilterTimer = setTimeout(() => {
      applyStreamerFilter();
    }, 80);
  }

  const streamerObserver = new MutationObserver(() => {
    debounceStreamerFilter();
  });

  function checkAndInterceptRoom() {
    if (window.self !== window.top) return;
    const currentSlug = getCurrentRoomSlug();
    if (!currentSlug) return;

    const isCurrentBlocked = isCardBlocked({ roomId: currentSlug });
    if (isCurrentBlocked) {
      muteAndPauseMedia();
      if (config.autoRedirect) {
        window.location.replace('https://www.huya.com/');
        return;
      }
      showInterceptOverlay(currentSlug);
    }
  }

  function muteAndPauseMedia() {
    const stopFn = () => {
      document.querySelectorAll('video, audio').forEach(media => {
        try {
          media.pause();
          media.muted = true;
          media.volume = 0;
        } catch (e) {}
      });
    };
    stopFn();
    setInterval(stopFn, 400);
  }

  function showInterceptOverlay(roomId) {
    if (document.getElementById('hy-intercept-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'hy-intercept-overlay';
    overlay.innerHTML = `
      <div class="hy-intercept-box">
        <div class="hy-intercept-icon">🚫</div>
        <h2>该直播间已被您屏蔽</h2>
        <p>房间标识：<strong>${escapeHtml(roomId)}</strong></p>
        <div class="hy-intercept-desc">已自动停止视频画面和声音播放</div>
        <div class="hy-intercept-actions">
          <button id="hy-btn-back-home" class="hy-aio-btn hy-aio-btn-primary">返回虎牙首页</button>
          <button id="hy-btn-unblock" class="hy-aio-btn hy-aio-btn-secondary">取消屏蔽并刷新</button>
          <button id="hy-btn-temporary" class="hy-aio-btn hy-aio-btn-text">临时进入观看</button>
        </div>
      </div>
    `;

    (document.body || document.documentElement).appendChild(overlay);

    document.getElementById('hy-btn-back-home').addEventListener('click', () => {
      window.location.href = 'https://www.huya.com/';
    });

    document.getElementById('hy-btn-unblock').addEventListener('click', () => {
      removeBlockedItem(roomId);
      showToast('已解除屏蔽，正在刷新...', 'success');
      setTimeout(() => {
        window.location.reload();
      }, 500);
    });

    document.getElementById('hy-btn-temporary').addEventListener('click', () => {
      overlay.remove();
      showToast('已临时放行本页面', 'info');
    });
  }

  // =========================================================================
  // 5. 画质优化与观影增强引擎 (Huya Live Optimizer Engine)
  // =========================================================================
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

  function unlockQualityRestrictions() {
    if (!config.unlockQuality) return 0;
    const items = document.querySelectorAll(SELECTORS.qualityItems);
    if (!items || items.length === 0) return 0;

    const $ = getPageJQuery();
    let unlocked = 0;

    items.forEach(li => {
      if ($) {
        try {
          const dataObj = $(li).data('data');
          if (dataObj && typeof dataObj === 'object' && dataObj.status !== 0) {
            dataObj.status = 0;
            unlocked++;
          }
        } catch (e) {}
      }

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

  function bindDynamicUnlock() {
    const box = document.querySelector(SELECTORS.qualityBox);
    if (box && !box.__hy_aio_bound) {
      box.__hy_aio_bound = true;
      ['mouseenter', 'mouseover', 'click'].forEach(evtName => {
        box.addEventListener(evtName, () => {
          unlockQualityRestrictions();
        }, { passive: true });
      });
    }
  }

  async function applyQuality(signal) {
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

  function isTheaterModeActive() {
    if (document.body?.classList.contains('mode-page-full') || document.body?.classList.contains('mode-page-theater')) {
      return true;
    }
    const narrowBtn = document.querySelector(SELECTORS.theaterActiveMarks);
    if (narrowBtn) return true;
    const btn = document.querySelector(SELECTORS.theaterBtns);
    if (btn && (btn.classList.contains('player-narrowpage') || btn.getAttribute('title')?.includes('退出'))) {
      return true;
    }
    return false;
  }

  async function applyTheaterMode(signal) {
    if (!config.autoTheater) return '未开启自动观影模式';

    const totalSeconds = 10;
    let clickCount = 0;

    for (let sec = 1; sec <= totalSeconds; sec++) {
      if (signal?.aborted) throw abortError();

      if (isTheaterModeActive()) {
        log(`观影模式：第 ${sec} 秒检测已处于网页全屏状态，无需重复点击`);
        return clickCount > 0 ? `成功进入观影模式 (第${sec}秒确认)` : '已处于观影模式';
      }

      const theaterBtn = document.querySelector(SELECTORS.theaterBtns);
      if (theaterBtn) {
        if (theaterBtn.classList.contains('player-narrowpage') || theaterBtn.getAttribute('title')?.includes('退出')) {
          log(`观影模式：第 ${sec} 秒检测到退出全屏按钮，停止点击`);
          return '已处于观影模式';
        }

        try {
          theaterBtn.click();
          clickCount++;
          log(`观影模式：第 ${sec}/10 秒检测到按钮并执行点击 (累计点击 ${clickCount} 次)`);
        } catch (err) {
          console.warn(`[虎牙全能助手] 第 ${sec} 秒点击全屏异常:`, err);
        }

        await sleep(300, signal);
        if (isTheaterModeActive()) {
          log(`观影模式：第 ${sec} 秒成功进入网页全屏！`);
          return `成功进入观影模式 (第${sec}秒)`;
        }
        await sleep(700, signal);
      } else {
        log(`观影模式：第 ${sec}/10 秒未找到全屏按钮，等待下一秒继续重试...`);
        await sleep(1000, signal);
      }
    }

    return isTheaterModeActive() ? '已进入观影模式' : `轮询 10 秒完成 (共尝试点击 ${clickCount} 次)`;
  }

  function toggleTheaterMode() {
    runner.theaterController?.abort();
    const btn = document.querySelector(SELECTORS.theaterBtns) || document.querySelector(SELECTORS.theaterActiveMarks);
    if (btn) {
      btn.click();
      log('已切换观影模式');
    }
  }

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

  class OptimizerRunner {
    constructor() {
      this.controller = null;
      this.theaterController = null;
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
          else console.warn('[虎牙全能助手] ' + jobs[index][0] + '异常:', result.reason);
        });
        if (results.some(result => result.status === 'rejected')) {
          updateBadgeStatus('部分优化失败');
        } else {
          updateBadgeQuality(document.querySelector(SELECTORS.currentQuality)?.textContent.trim() || '已就绪');
        }
      } catch (err) {
        if (!signal.aborted) {
          console.warn('[虎牙全能助手] 优化任务执行中断:', err);
          updateBadgeStatus('优化失败');
        }
      } finally {
        if (this.controller === controller) {
          this.controller = null;
          this.isProcessing = false;
        }
      }
    }
  }

  const runner = new OptimizerRunner();

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
    runner.abort();

    checkAndInterceptRoom();
    debounceStreamerFilter();
    updateBadge();

    if (!config.watchNavigation) return;
    navigationTimer = setTimeout(() => {
      navigationTimer = null;
      if (config.watchNavigation && isLiveRoom()) {
        runner.execute();
      }
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

  // =========================================================================
  // 6. UI 系统：统一悬浮徽标与多标签毛玻璃控制面板 (Unified Modern UI)
  // =========================================================================
  let badgeEl = null;
  let modalOverlay = null;

  function injectStyles() {
    const styleId = 'hy-aio-ui-styles';
    if (document.getElementById(styleId)) return;

    const css = `
      /* 全局统一右侧/右下角胶囊徽标 */
      #hy-aio-badge {
        position: fixed;
        right: 18px;
        bottom: 82px;
        z-index: 99998;
        display: flex;
        align-items: center;
        gap: 6px;
        background: rgba(24, 24, 30, 0.88);
        color: #fff;
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 20px;
        padding: 6px 14px;
        font-size: 13px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
        cursor: pointer;
        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.38);
        transition: all 0.25s ease;
        user-select: none;
      }
      #hy-aio-badge:hover {
        background: linear-gradient(135deg, rgba(124, 92, 255, 0.95), rgba(255, 114, 0, 0.95));
        transform: translateY(-2px);
        box-shadow: 0 6px 22px rgba(255, 114, 0, 0.4);
      }
      #hy-aio-badge .hy-aio-icon {
        font-size: 14px;
        display: flex;
        align-items: center;
      }
      .hy-aio-tag {
        padding: 1px 7px;
        border-radius: 10px;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.3px;
      }
      .hy-aio-tag-quality {
        background: rgba(255, 255, 255, 0.2);
        color: #ffd166;
      }
      .hy-aio-tag-ad {
        background: rgba(46, 213, 115, 0.25);
        color: #2ed573;
      }
      .hy-aio-tag-streamer {
        background: rgba(255, 71, 87, 0.25);
        color: #ff6b81;
      }

      /* 快捷屏蔽卡片悬浮按钮 */
      .hy-quick-block-btn {
        display: none !important;
        position: absolute;
        top: 6px;
        right: 6px;
        z-index: 99999 !important;
        background: rgba(235, 59, 90, 0.95);
        color: #fff;
        border: 1px solid rgba(255, 255, 255, 0.3);
        padding: 3px 8px;
        font-size: 11px;
        font-weight: bold;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.15s ease;
        box-shadow: 0 2px 6px rgba(0,0,0,0.35);
      }
      .game-live-item:hover .hy-quick-block-btn,
      .live-card:hover .hy-quick-block-btn,
      li:hover .hy-quick-block-btn,
      [data-lp]:hover .hy-quick-block-btn,
      .video-info-wrap:hover .hy-quick-block-btn,
      .recommend-item:hover .hy-quick-block-btn {
        display: inline-block !important;
      }
      .hy-quick-block-btn:hover {
        background: #ff3838;
        transform: scale(1.08);
      }

      /* 模态弹窗遮罩 */
      #hy-aio-modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.68);
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
      #hy-aio-modal-overlay.open {
        opacity: 1;
        visibility: visible;
      }

      /* 模态卡片 */
      .hy-aio-card {
        background: #181820;
        color: #f1f2f6;
        width: 580px;
        max-width: 94vw;
        max-height: 88vh;
        border-radius: 16px;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.65);
        border: 1px solid rgba(255, 255, 255, 0.12);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transform: scale(0.96);
        transition: transform 0.22s ease;
      }
      #hy-aio-modal-overlay.open .hy-aio-card {
        transform: scale(1);
      }

      /* 头部 */
      .hy-aio-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 22px 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.02);
      }
      .hy-aio-header-title {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 17px;
        font-weight: 700;
        letter-spacing: 0.5px;
      }
      .hy-aio-badge-tag {
        background: linear-gradient(135deg, #7c5cff, #ff7200);
        color: #fff;
        font-size: 11px;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: 10px;
      }
      .hy-aio-close-btn {
        background: transparent;
        border: none;
        color: rgba(255, 255, 255, 0.55);
        font-size: 20px;
        cursor: pointer;
        line-height: 1;
        padding: 4px;
        border-radius: 6px;
        transition: all 0.15s ease;
      }
      .hy-aio-close-btn:hover {
        color: #fff;
        background: rgba(255, 255, 255, 0.1);
      }

      /* 多标签切换栏 */
      .hy-aio-tabs {
        display: flex;
        background: rgba(0, 0, 0, 0.25);
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        padding: 0 16px;
        gap: 4px;
      }
      .hy-aio-tab-btn {
        background: transparent;
        border: none;
        color: rgba(255, 255, 255, 0.65);
        font-size: 13px;
        font-weight: 600;
        padding: 11px 15px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        border-bottom: 2px solid transparent;
        transition: all 0.2s ease;
      }
      .hy-aio-tab-btn:hover {
        color: #fff;
      }
      .hy-aio-tab-btn.active {
        color: #ff9f43;
        border-bottom-color: #ff9f43;
      }

      /* 内容面板容器 */
      .hy-aio-body {
        padding: 16px 22px;
        overflow-y: auto;
        flex: 1;
      }
      .hy-aio-tab-pane {
        display: none;
        flex-direction: column;
        gap: 12px;
      }
      .hy-aio-tab-pane.active {
        display: flex;
      }

      /* 选项条目 */
      .hy-aio-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 11px 14px;
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.035);
        border: 1px solid rgba(255, 255, 255, 0.05);
        transition: background 0.15s ease;
      }
      .hy-aio-item:hover {
        background: rgba(255, 255, 255, 0.06);
      }
      .hy-aio-item-info {
        display: flex;
        flex-direction: column;
        gap: 3px;
        padding-right: 14px;
      }
      .hy-aio-item-title {
        font-size: 14px;
        font-weight: 600;
        color: #f1f2f6;
      }
      .hy-aio-item-desc {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.45);
        line-height: 1.4;
      }

      /* 开关 Switch */
      .hy-aio-switch {
        position: relative;
        display: inline-block;
        width: 44px;
        height: 24px;
        flex-shrink: 0;
      }
      .hy-aio-switch input {
        opacity: 0;
        width: 0;
        height: 0;
      }
      .hy-aio-slider {
        position: absolute;
        cursor: pointer;
        inset: 0;
        background-color: rgba(255, 255, 255, 0.18);
        border-radius: 24px;
        transition: 0.25s ease;
      }
      .hy-aio-slider:before {
        position: absolute;
        content: "";
        height: 18px;
        width: 18px;
        left: 3px;
        bottom: 3px;
        background-color: #fff;
        border-radius: 50%;
        transition: 0.25s ease;
      }
      .hy-aio-switch input:checked + .hy-aio-slider {
        background: linear-gradient(135deg, #7c5cff, #ff7200);
      }
      .hy-aio-switch input:checked + .hy-aio-slider:before {
        transform: translateX(20px);
      }

      /* 下拉选择框 */
      .hy-aio-select {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: #ffd166;
        border-radius: 8px;
        padding: 5px 10px;
        font-size: 13px;
        font-weight: 500;
        outline: none;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .hy-aio-select:focus {
        border-color: #ff9f43;
      }
      .hy-aio-select option {
        background: #1e1e24;
        color: #fff;
      }

      /* 主播过滤专用组件 */
      .hy-aio-form-row {
        display: flex;
        gap: 8px;
      }
      .hy-aio-input {
        flex: 1;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.12);
        color: #fff;
        padding: 8px 12px;
        border-radius: 8px;
        font-size: 13px;
        outline: none;
        transition: border 0.2s;
      }
      .hy-aio-input:focus {
        border-color: #ff9f43;
      }
      .hy-aio-input-remark {
        max-width: 110px;
      }
      .hy-aio-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 4px;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.55);
      }
      .hy-aio-search {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #fff;
        padding: 4px 8px;
        border-radius: 6px;
        font-size: 12px;
        width: 130px;
        outline: none;
      }
      .hy-aio-list-box {
        max-height: 190px;
        overflow-y: auto;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.2);
        margin-top: 4px;
      }
      .hy-aio-list-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 7px 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        font-size: 13px;
      }
      .hy-aio-list-item:last-child {
        border-bottom: none;
      }
      .hy-aio-item-id {
        color: #ff9f43;
        text-decoration: none;
        font-weight: bold;
      }
      .hy-aio-item-id:hover {
        text-decoration: underline;
      }
      .hy-aio-item-remark {
        color: rgba(255, 255, 255, 0.5);
        font-size: 11px;
        margin-left: 6px;
      }
      .hy-aio-item-date {
        color: rgba(255, 255, 255, 0.3);
        font-size: 11px;
        margin-left: 6px;
      }
      .hy-aio-btn-del {
        background: transparent;
        border: 1px solid rgba(255, 71, 87, 0.4);
        color: #ff4757;
        border-radius: 4px;
        padding: 2px 7px;
        font-size: 11px;
        cursor: pointer;
        transition: all 0.15s;
      }
      .hy-aio-btn-del:hover {
        background: #ff4757;
        color: #fff;
      }
      .hy-aio-list-empty {
        text-align: center;
        padding: 24px;
        color: rgba(255, 255, 255, 0.4);
        font-size: 12px;
      }

      /* 底部操作栏 */
      .hy-aio-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 22px;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.02);
      }
      .hy-aio-btn {
        border: none;
        border-radius: 8px;
        padding: 7px 15px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.18s ease;
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }
      .hy-aio-btn-primary {
        background: linear-gradient(135deg, #7c5cff, #ff7200);
        color: #fff;
        box-shadow: 0 2px 8px rgba(255, 114, 0, 0.3);
      }
      .hy-aio-btn-primary:hover {
        opacity: 0.92;
        transform: translateY(-1px);
      }
      .hy-aio-btn-secondary {
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.85);
      }
      .hy-aio-btn-secondary:hover {
        background: rgba(255, 255, 255, 0.14);
        color: #fff;
      }
      .hy-aio-btn-run {
        background: rgba(124, 92, 255, 0.2);
        color: #a29bfe;
        border: 1px solid rgba(124, 92, 255, 0.4);
      }
      .hy-aio-btn-run:hover {
        background: rgba(124, 92, 255, 0.35);
        color: #fff;
      }
      .hy-aio-btn-sm {
        padding: 4px 10px;
        font-size: 12px;
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.85);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        cursor: pointer;
      }
      .hy-aio-btn-sm:hover {
        background: rgba(255, 255, 255, 0.15);
        color: #fff;
      }
      .hy-aio-btn-danger {
        border-color: rgba(255, 71, 87, 0.4);
        color: #ff6b81;
      }
      .hy-aio-btn-danger:hover {
        background: #ff4757;
        color: #fff;
      }

      /* 直播间拦截遮罩 */
      #hy-intercept-overlay {
        position: fixed;
        inset: 0;
        background: rgba(10, 10, 15, 0.95);
        z-index: 2147483646;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .hy-intercept-box {
        background: #1c1c24;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 16px;
        padding: 32px 36px;
        text-align: center;
        color: #fff;
        max-width: 420px;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.8);
      }
      .hy-intercept-icon {
        font-size: 48px;
        margin-bottom: 12px;
      }
      .hy-intercept-desc {
        color: rgba(255, 255, 255, 0.5);
        font-size: 13px;
        margin: 10px 0 20px;
      }
      .hy-intercept-actions {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .hy-aio-btn-text {
        background: transparent;
        color: rgba(255, 255, 255, 0.45);
        font-size: 12px;
        cursor: pointer;
        border: none;
      }
      .hy-aio-btn-text:hover {
        color: #fff;
      }

      /* 轻量 Toast 提示 */
      #hy-aio-toast-box {
        position: fixed;
        bottom: 30px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        gap: 8px;
        pointer-events: none;
      }
      .hy-aio-toast {
        background: rgba(28, 28, 32, 0.94);
        color: #fff;
        padding: 9px 18px;
        border-radius: 20px;
        font-size: 13px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.15);
        backdrop-filter: blur(8px);
        transition: opacity 0.25s, transform 0.25s;
        text-align: center;
      }
      .hy-aio-toast-success {
        border-color: rgba(46, 213, 115, 0.4);
        color: #2ed573;
      }
      .hy-aio-toast.hide {
        opacity: 0;
        transform: translateY(6px);
      }
    `;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  function updateBadgeQuality(text) {
    if (!badgeEl) return;
    const qTag = badgeEl.querySelector('.hy-aio-tag-quality');
    if (qTag && text) {
      qTag.textContent = text;
    }
  }

  function updateBadgeStatus(status) {
    if (!badgeEl) return;
    const qTag = badgeEl.querySelector('.hy-aio-tag-quality');
    if (qTag) {
      qTag.textContent = status;
    }
  }

  function updateBadgeVisibility() {
    if (!badgeEl) return;
    badgeEl.style.display = config.showFloatBadge ? 'flex' : 'none';
  }

  function updateBadge() {
    if (!badgeEl) return;
    updateBadgeVisibility();

    const isRoom = isLiveRoom();
    const icon = badgeEl.querySelector('.hy-aio-icon');
    const qTag = badgeEl.querySelector('.hy-aio-tag-quality');
    const adTag = badgeEl.querySelector('.hy-aio-tag-ad');
    const streamerTag = badgeEl.querySelector('.hy-aio-tag-streamer');

    if (isRoom) {
      if (icon) icon.textContent = '⚡';
      if (qTag) qTag.style.display = 'inline-block';
      if (adTag) {
        adTag.style.display = 'inline-block';
        adTag.textContent = `净 ${blockedAdCounter > 0 ? blockedAdCounter : '✓'}`;
      }
      if (streamerTag) streamerTag.style.display = 'none';
    } else {
      if (icon) icon.textContent = '🛡️';
      if (qTag) qTag.style.display = 'none';
      if (adTag) adTag.style.display = 'none';
      if (streamerTag) {
        streamerTag.style.display = 'inline-block';
        streamerTag.textContent = `已屏蔽 ${blockedList.length}`;
      }
    }
  }

  function createBadge() {
    if (document.getElementById('hy-aio-badge')) return;

    badgeEl = document.createElement('div');
    badgeEl.id = 'hy-aio-badge';
    badgeEl.title = '点击呼出虎牙全能助手控制中心 (快捷键: Alt + H)';
    badgeEl.innerHTML = `
      <span class="hy-aio-icon">⚡</span>
      <span style="font-weight:600;">虎牙全能</span>
      <span class="hy-aio-tag hy-aio-tag-quality">加载中</span>
      <span class="hy-aio-tag hy-aio-tag-ad">净 0</span>
      <span class="hy-aio-tag hy-aio-tag-streamer" style="display:none;">已屏蔽 0</span>
    `;

    badgeEl.addEventListener('click', () => openModal());
    (document.body || document.documentElement).appendChild(badgeEl);
    updateBadge();
  }

  function createModal() {
    if (document.getElementById('hy-aio-modal-overlay')) return;

    modalOverlay = document.createElement('div');
    modalOverlay.id = 'hy-aio-modal-overlay';
    modalOverlay.innerHTML = `
      <div class="hy-aio-card" role="dialog" aria-modal="true">
        <!-- 头部 -->
        <div class="hy-aio-header">
          <div class="hy-aio-header-title">
            <span>⚡ 虎牙全能助手</span>
            <span class="hy-aio-badge-tag">v3.0.0</span>
          </div>
          <button class="hy-aio-close-btn" id="hy-aio-close-btn" title="关闭 (Esc)">✕</button>
        </div>

        <!-- 多标签选项栏 -->
        <div class="hy-aio-tabs">
          <button class="hy-aio-tab-btn active" data-tab="0">📺 画质与观影</button>
          <button class="hy-aio-tab-btn" data-tab="1">🛡️ 广告与净化</button>
          <button class="hy-aio-tab-btn" data-tab="2">🚫 主播黑名单</button>
          <button class="hy-aio-tab-btn" data-tab="3">⚙️ 全局设置</button>
        </div>

        <!-- 面板内容体 -->
        <div class="hy-aio-body">
          <!-- Tab 0: 画质与观影 -->
          <div class="hy-aio-tab-pane active" id="hy-pane-0">
            <div class="hy-aio-item">
              <div class="hy-aio-item-info">
                <div class="hy-aio-item-title">🔓 解锁扫码画质限制</div>
                <div class="hy-aio-item-desc">免客户端/手机APP扫码绑定，自由无限制切换原画、蓝光等高规格画质</div>
              </div>
              <label class="hy-aio-switch">
                <input type="checkbox" id="hy-chk-unlock" ${config.unlockQuality ? 'checked' : ''}>
                <span class="hy-aio-slider"></span>
              </label>
            </div>

            <div class="hy-aio-item">
              <div class="hy-aio-item-info">
                <div class="hy-aio-item-title">🎯 偏好目标画质</div>
                <div class="hy-aio-item-desc">进入直播间自动选择的清晰度；若目标画质不存在则回退至最高可用画质</div>
              </div>
              <select class="hy-aio-select" id="hy-sel-quality">
                <option value="highest" ${config.preferredQuality === 'highest' ? 'selected' : ''}>最高画质 (第一项)</option>
                <option value="原画" ${config.preferredQuality === '原画' ? 'selected' : ''}>原画 优先</option>
                <option value="蓝光" ${config.preferredQuality === '蓝光' ? 'selected' : ''}>蓝光 优先</option>
                <option value="超清" ${config.preferredQuality === '超清' ? 'selected' : ''}>超清 优先</option>
                <option value="高清" ${config.preferredQuality === '高清' ? 'selected' : ''}>高清 优先</option>
              </select>
            </div>

            <div class="hy-aio-item">
              <div class="hy-aio-item-info">
                <div class="hy-aio-item-title">🎬 自动进入观影模式</div>
                <div class="hy-aio-item-desc">进入直播间后自动切换为网页全屏(展开半屏)，视野宽阔免打扰</div>
              </div>
              <label class="hy-aio-switch">
                <input type="checkbox" id="hy-chk-theater" ${config.autoTheater ? 'checked' : ''}>
                <span class="hy-aio-slider"></span>
              </label>
            </div>

            <div class="hy-aio-item">
              <div class="hy-aio-item-info">
                <div class="hy-aio-item-title">⏭️ 自动跳过片头广告</div>
                <div class="hy-aio-item-desc">毫秒级监测并自动点击播放器片头广告跳过按钮</div>
              </div>
              <label class="hy-aio-switch">
                <input type="checkbox" id="hy-chk-skip-ad" ${config.skipAds ? 'checked' : ''}>
                <span class="hy-aio-slider"></span>
              </label>
            </div>

            <div class="hy-aio-item">
              <div class="hy-aio-item-info">
                <div class="hy-aio-item-title">🧭 路由与切台监听</div>
                <div class="hy-aio-item-desc">单页应用切台换主播或网址改变时，自动重新触发画质解锁与优化流程</div>
              </div>
              <label class="hy-aio-switch">
                <input type="checkbox" id="hy-chk-nav" ${config.watchNavigation ? 'checked' : ''}>
                <span class="hy-aio-slider"></span>
              </label>
            </div>

            <div style="display:flex; gap:10px; margin-top:4px;">
              <button class="hy-aio-btn hy-aio-btn-run" id="hy-btn-run" style="flex:1;">🚀 立即运行画质优化</button>
              <button class="hy-aio-btn hy-aio-btn-secondary" id="hy-btn-theater" style="flex:1;">🎬 切换网页全屏</button>
            </div>
          </div>

          <!-- Tab 1: 广告与净化 -->
          <div class="hy-aio-tab-pane" id="hy-pane-1">
            <div class="hy-aio-item">
              <div class="hy-aio-item-info">
                <div class="hy-aio-item-title">💬 聊天栏上方商业横幅广告</div>
                <div class="hy-aio-item-desc">彻底清除横幅大图广告，聊天列表自动向上顶格自适应伸展</div>
              </div>
              <label class="hy-aio-switch">
                <input type="checkbox" id="hy-chk-blockSidebarAd" ${config.blockSidebarAd ? 'checked' : ''}>
                <span class="hy-aio-slider"></span>
              </label>
            </div>

            <div class="hy-aio-item">
              <div class="hy-aio-item-info">
                <div class="hy-aio-item-title">🛒 播放器悬浮营销挂件 & 插件</div>
                <div class="hy-aio-item-desc">屏蔽小黄车、上热门、甜蜜互动、更多活动、扩展 iframe 插件等</div>
              </div>
              <label class="hy-aio-switch">
                <input type="checkbox" id="hy-chk-blockPlayerWidgets" ${config.blockPlayerWidgets ? 'checked' : ''}>
                <span class="hy-aio-slider"></span>
              </label>
            </div>

            <div class="hy-aio-item">
              <div class="hy-aio-item-info">
                <div class="hy-aio-item-title">📱 播放器二维码与APP下载浮层</div>
                <div class="hy-aio-item-desc">移除左下角吉祥物与「下载虎牙直播APP」常驻二维码</div>
              </div>
              <label class="hy-aio-switch">
                <input type="checkbox" id="hy-chk-blockPlayerQrcode" ${config.blockPlayerQrcode ? 'checked' : ''}>
                <span class="hy-aio-slider"></span>
              </label>
            </div>

            <div class="hy-aio-item">
              <div class="hy-aio-item-info">
                <div class="hy-aio-item-title">🎁 宝箱、首充礼包与百宝箱</div>
                <div class="hy-aio-item-desc">隐藏浮动宝箱动画、周星打榜入口、礼物栏「首充礼包」与抽奖百宝箱</div>
              </div>
              <label class="hy-aio-switch">
                <input type="checkbox" id="hy-chk-blockTreasureAndPresents" ${config.blockTreasureAndPresents ? 'checked' : ''}>
                <span class="hy-aio-slider"></span>
              </label>
            </div>

            <div class="hy-aio-item">
              <div class="hy-aio-item-info">
                <div class="hy-aio-item-title">💧 播放器虎牙Logo水印</div>
                <div class="hy-aio-item-desc">屏蔽右上角常驻官方水印，画面100%纯净原画呈现</div>
              </div>
              <label class="hy-aio-switch">
                <input type="checkbox" id="hy-chk-blockWatermark" ${config.blockWatermark ? 'checked' : ''}>
                <span class="hy-aio-slider"></span>
              </label>
            </div>

            <div class="hy-aio-item">
              <div class="hy-aio-item-info">
                <div class="hy-aio-item-title">🖼️ 顶部头图背景与活动横幅</div>
                <div class="hy-aio-item-desc">屏蔽顶栏背景商业营销与赛事通栏广告</div>
              </div>
              <label class="hy-aio-switch">
                <input type="checkbox" id="hy-chk-blockTopBanners" ${config.blockTopBanners ? 'checked' : ''}>
                <span class="hy-aio-slider"></span>
              </label>
            </div>

            <div class="hy-aio-item">
              <div class="hy-aio-item-info">
                <div class="hy-aio-item-title">🎮 游戏商业推广与页尾推荐</div>
                <div class="hy-aio-item-desc">清除右侧栏游戏推广小卡片与页面底部推荐</div>
              </div>
              <label class="hy-aio-switch">
                <input type="checkbox" id="hy-chk-blockBusinessGame" ${config.blockBusinessGame ? 'checked' : ''}>
                <span class="hy-aio-slider"></span>
              </label>
            </div>

            <div class="hy-aio-item">
              <div class="hy-aio-item-info">
                <div class="hy-aio-item-title">📢 聊天室系统宣传长文与推广卡片</div>
                <div class="hy-aio-item-desc">过滤聊天区顶部大段官方宣传富文本消息</div>
              </div>
              <label class="hy-aio-switch">
                <input type="checkbox" id="hy-chk-blockChatRichAds" ${config.blockChatRichAds ? 'checked' : ''}>
                <span class="hy-aio-slider"></span>
              </label>
            </div>

            <div class="hy-aio-item">
              <div class="hy-aio-item-info">
                <div class="hy-aio-item-title">🏎️ 聊天区进场座驾广播 (可选)</div>
                <div class="hy-aio-item-desc">过滤贵族和座驾进场提示，保持弹幕区整洁</div>
              </div>
              <label class="hy-aio-switch">
                <input type="checkbox" id="hy-chk-blockChatNobleEnter" ${config.blockChatNobleEnter ? 'checked' : ''}>
                <span class="hy-aio-slider"></span>
              </label>
            </div>

            <div class="hy-aio-item">
              <div class="hy-aio-item-info">
                <div class="hy-aio-item-title">✨ 聊天区小额送礼滚屏 (可选)</div>
                <div class="hy-aio-item-desc">过滤荧光棒等小额送礼滚屏刷屏</div>
              </div>
              <label class="hy-aio-switch">
                <input type="checkbox" id="hy-chk-blockChatGifts" ${config.blockChatGifts ? 'checked' : ''}>
                <span class="hy-aio-slider"></span>
              </label>
            </div>

            <div class="hy-aio-item">
              <div class="hy-aio-item-info">
                <div class="hy-aio-item-title">🚪 自动关闭未登录弹窗 (可选)</div>
                <div class="hy-aio-item-desc">定时检查并自动关闭提示登录的居中弹窗</div>
              </div>
              <label class="hy-aio-switch">
                <input type="checkbox" id="hy-chk-autoCloseLoginPopup" ${config.autoCloseLoginPopup ? 'checked' : ''}>
                <span class="hy-aio-slider"></span>
              </label>
            </div>
          </div>

          <!-- Tab 2: 主播黑名单 -->
          <div class="hy-aio-tab-pane" id="hy-pane-2">
            <div class="hy-aio-form-row">
              <input type="text" id="hy-input-streamer-id" class="hy-aio-input" placeholder="输入房间号、网址或主播名 (如 229085 或 红莲)" />
              <input type="text" id="hy-input-streamer-remark" class="hy-aio-input hy-aio-input-remark" placeholder="备注 (可选)" />
              <button id="hy-btn-streamer-add" class="hy-aio-btn hy-aio-btn-primary" style="padding:7px 14px;">+ 添加</button>
            </div>

            <div class="hy-aio-bar">
              <span id="hy-streamer-stat">已屏蔽 ${blockedList.length} 个主播 | 当前隐藏 ${filteredStreamerCount} 个卡片</span>
              <input type="text" id="hy-streamer-search" class="hy-aio-search" placeholder="筛选列表..." />
            </div>

            <div class="hy-aio-list-box" id="hy-streamer-list-container">
              <!-- 动态填充 -->
            </div>

            <div class="hy-aio-item" style="margin-top:6px;">
              <div class="hy-aio-item-info">
                <div class="hy-aio-item-title">🚫 卡片右上角悬停屏蔽按钮</div>
                <div class="hy-aio-item-desc">鼠标移至列表卡片时，右上角浮现一键快捷屏蔽小按钮</div>
              </div>
              <label class="hy-aio-switch">
                <input type="checkbox" id="hy-chk-quick-btn" ${config.showQuickBtn ? 'checked' : ''}>
                <span class="hy-aio-slider"></span>
              </label>
            </div>

            <div class="hy-aio-item">
              <div class="hy-aio-item-info">
                <div class="hy-aio-item-title">↩️ 误入屏蔽间直接返回首页</div>
                <div class="hy-aio-item-desc">若关闭则默认静音并弹出拦截遮罩供您选择</div>
              </div>
              <label class="hy-aio-switch">
                <input type="checkbox" id="hy-chk-redirect" ${config.autoRedirect ? 'checked' : ''}>
                <span class="hy-aio-slider"></span>
              </label>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
              <div style="display:flex; gap:6px;">
                <button id="hy-btn-export" class="hy-aio-btn-sm" title="导出黑名单为JSON文件">导出配置</button>
                <button id="hy-btn-import" class="hy-aio-btn-sm" title="从JSON文件导入黑名单">导入配置</button>
                <input type="file" id="hy-file-input" style="display:none;" accept=".json" />
              </div>
              <button id="hy-btn-clear-streamers" class="hy-aio-btn-sm hy-aio-btn-danger">清空黑名单</button>
            </div>
          </div>

          <!-- Tab 3: 全局设置 -->
          <div class="hy-aio-tab-pane" id="hy-pane-3">
            <div class="hy-aio-item">
              <div class="hy-aio-item-info">
                <div class="hy-aio-item-title">📌 显示快捷悬浮徽标</div>
                <div class="hy-aio-item-desc">在页面右下角显示状态徽标；关闭后仍可通过快捷键 Alt + H 或油猴菜单唤出设置</div>
              </div>
              <label class="hy-aio-switch">
                <input type="checkbox" id="hy-chk-badge" ${config.showFloatBadge ? 'checked' : ''}>
                <span class="hy-aio-slider"></span>
              </label>
            </div>

            <div class="hy-aio-item">
              <div class="hy-aio-item-info">
                <div class="hy-aio-item-title">⌨️ 快捷操作说明</div>
                <div class="hy-aio-item-desc">
                  • <b>Alt + H</b>：随时唤出 / 关闭本控制中心<br>
                  • <b>Esc</b>：快速关闭控制中心弹窗<br>
                  • <b>油猴扩展菜单</b>：支持一键切换网页全屏、重新优化或屏蔽当前主播
                </div>
              </div>
            </div>

            <div class="hy-aio-item">
              <div class="hy-aio-item-info">
                <div class="hy-aio-item-title">ℹ️ 脚本信息与开源协议</div>
                <div class="hy-aio-item-desc">
                  版本：<b>v3.0.0 (一体化全能整合版)</b><br>
                  开源仓库：<a href="https://github.com/guodonglu/tampermonkey-scripts" target="_blank" style="color:#ff9f43; text-decoration:none;">github.com/guodonglu/tampermonkey-scripts</a>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 底部保存栏 -->
        <div class="hy-aio-footer">
          <button class="hy-aio-btn hy-aio-btn-secondary" id="hy-btn-reset">恢复默认</button>
          <div style="display:flex; gap:8px;">
            <button class="hy-aio-btn hy-aio-btn-secondary" id="hy-btn-cancel">取消</button>
            <button class="hy-aio-btn hy-aio-btn-primary" id="hy-btn-save">保存并应用</button>
          </div>
        </div>
      </div>
    `;

    (document.body || document.documentElement).appendChild(modalOverlay);

    // 绑定多标签切换
    const tabBtns = modalOverlay.querySelectorAll('.hy-aio-tab-btn');
    const panes = modalOverlay.querySelectorAll('.hy-aio-tab-pane');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabIndex = parseInt(btn.getAttribute('data-tab'), 10);
        switchTab(tabIndex);
      });
    });

    // 关闭按钮与遮罩点击
    document.getElementById('hy-aio-close-btn').addEventListener('click', closeModal);
    document.getElementById('hy-btn-cancel').addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeModal();
    });

    // 动作按钮
    document.getElementById('hy-btn-run').addEventListener('click', () => {
      readModalInputs();
      saveConfig();
      closeModal();
      runner.execute();
    });

    document.getElementById('hy-btn-theater').addEventListener('click', () => {
      toggleTheaterMode();
    });

    document.getElementById('hy-btn-reset').addEventListener('click', () => {
      config = Object.assign({}, DEFAULT_CONFIG);
      saveConfig();
      syncModalInputs();
      showToast('已恢复默认配置', 'success');
      runner.execute();
    });

    document.getElementById('hy-btn-save').addEventListener('click', () => {
      readModalInputs();
      saveConfig();
      closeModal();
      showToast('配置已保存并生效', 'success');
      runner.execute();
    });

    // 主播添加与检索
    const inputStreamerId = document.getElementById('hy-input-streamer-id');
    const inputStreamerRemark = document.getElementById('hy-input-streamer-remark');
    const addStreamerBtn = document.getElementById('hy-btn-streamer-add');

    const handleAddStreamer = () => {
      const raw = inputStreamerId.value;
      const remark = inputStreamerRemark.value;
      if (!raw.trim()) {
        showToast('请输入房间号、网址或主播名', 'info');
        return;
      }
      const res = addBlockedItem(raw, remark);
      if (res.success) {
        showToast(`已屏蔽：${res.id}`, 'success');
        inputStreamerId.value = '';
        inputStreamerRemark.value = '';
      } else {
        showToast(res.msg, 'info');
      }
    };

    addStreamerBtn.addEventListener('click', handleAddStreamer);
    inputStreamerId.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleAddStreamer();
    });

    document.getElementById('hy-streamer-search').addEventListener('input', (e) => {
      updateStreamerUIList(e.target.value);
    });

    // 清空黑名单
    document.getElementById('hy-btn-clear-streamers').addEventListener('click', () => {
      if (blockedList.length === 0) return;
      if (confirm('确定要清空所有已屏蔽的主播黑名单吗？')) {
        blockedList = [];
        saveList();
        showToast('已清空主播黑名单', 'info');
      }
    });

    // 导入 / 导出
    document.getElementById('hy-btn-export').addEventListener('click', () => {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(blockedList, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `huya_blocked_streamers_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    });

    const fileInput = document.getElementById('hy-file-input');
    document.getElementById('hy-btn-import').addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target.result);
          if (Array.isArray(parsed)) {
            let addedCount = 0;
            parsed.forEach(item => {
              const id = typeof item === 'string' ? item : item.id;
              const remark = item.remark || '';
              if (id) {
                const normId = id.toLowerCase().trim();
                const exists = blockedList.some(b => (b.id || '').toLowerCase() === normId);
                if (!exists) {
                  blockedList.push({
                    id: normId,
                    remark: remark,
                    date: item.date || new Date().toLocaleDateString()
                  });
                  addedCount++;
                }
              }
            });
            saveList();
            showToast(`成功导入 ${addedCount} 个主播`, 'success');
          } else {
            showToast('导入文件格式不正确', 'info');
          }
        } catch (err) {
          showToast('解析 JSON 失败', 'info');
        }
        fileInput.value = '';
      };
      reader.readAsText(file);
    });

    updateStreamerUIList();
  }

  function switchTab(index) {
    if (!modalOverlay) return;
    config.activeTab = index;
    const tabBtns = modalOverlay.querySelectorAll('.hy-aio-tab-btn');
    const panes = modalOverlay.querySelectorAll('.hy-aio-tab-pane');
    tabBtns.forEach((btn, i) => {
      btn.classList.toggle('active', i === index);
    });
    panes.forEach((pane, i) => {
      pane.classList.toggle('active', i === index);
    });
  }

  function readModalInputs() {
    if (!modalOverlay) return;
    config.unlockQuality = document.getElementById('hy-chk-unlock').checked;
    config.preferredQuality = document.getElementById('hy-sel-quality').value;
    config.autoTheater = document.getElementById('hy-chk-theater').checked;
    config.skipAds = document.getElementById('hy-chk-skip-ad').checked;
    config.watchNavigation = document.getElementById('hy-chk-nav').checked;

    config.blockSidebarAd = document.getElementById('hy-chk-blockSidebarAd').checked;
    config.blockPlayerWidgets = document.getElementById('hy-chk-blockPlayerWidgets').checked;
    config.blockPlayerQrcode = document.getElementById('hy-chk-blockPlayerQrcode').checked;
    config.blockTreasureAndPresents = document.getElementById('hy-chk-blockTreasureAndPresents').checked;
    config.blockWatermark = document.getElementById('hy-chk-blockWatermark').checked;
    config.blockTopBanners = document.getElementById('hy-chk-blockTopBanners').checked;
    config.blockBusinessGame = document.getElementById('hy-chk-blockBusinessGame').checked;
    config.blockChatRichAds = document.getElementById('hy-chk-blockChatRichAds').checked;
    config.blockChatNobleEnter = document.getElementById('hy-chk-blockChatNobleEnter').checked;
    config.blockChatGifts = document.getElementById('hy-chk-blockChatGifts').checked;
    config.autoCloseLoginPopup = document.getElementById('hy-chk-autoCloseLoginPopup').checked;

    config.showQuickBtn = document.getElementById('hy-chk-quick-btn').checked;
    config.autoRedirect = document.getElementById('hy-chk-redirect').checked;
    config.showFloatBadge = document.getElementById('hy-chk-badge').checked;
  }

  function syncModalInputs() {
    if (!modalOverlay) return;
    document.getElementById('hy-chk-unlock').checked = config.unlockQuality;
    document.getElementById('hy-sel-quality').value = config.preferredQuality;
    document.getElementById('hy-chk-theater').checked = config.autoTheater;
    document.getElementById('hy-chk-skip-ad').checked = config.skipAds;
    document.getElementById('hy-chk-nav').checked = config.watchNavigation;

    document.getElementById('hy-chk-blockSidebarAd').checked = config.blockSidebarAd;
    document.getElementById('hy-chk-blockPlayerWidgets').checked = config.blockPlayerWidgets;
    document.getElementById('hy-chk-blockPlayerQrcode').checked = config.blockPlayerQrcode;
    document.getElementById('hy-chk-blockTreasureAndPresents').checked = config.blockTreasureAndPresents;
    document.getElementById('hy-chk-blockWatermark').checked = config.blockWatermark;
    document.getElementById('hy-chk-blockTopBanners').checked = config.blockTopBanners;
    document.getElementById('hy-chk-blockBusinessGame').checked = config.blockBusinessGame;
    document.getElementById('hy-chk-blockChatRichAds').checked = config.blockChatRichAds;
    document.getElementById('hy-chk-blockChatNobleEnter').checked = config.blockChatNobleEnter;
    document.getElementById('hy-chk-blockChatGifts').checked = config.blockChatGifts;
    document.getElementById('hy-chk-autoCloseLoginPopup').checked = config.autoCloseLoginPopup;

    document.getElementById('hy-chk-quick-btn').checked = config.showQuickBtn;
    document.getElementById('hy-chk-redirect').checked = config.autoRedirect;
    document.getElementById('hy-chk-badge').checked = config.showFloatBadge;

    switchTab(config.activeTab || 0);
    updateStreamerUIList();
  }

  function updateStreamerUIList(filterQuery = '') {
    const container = document.getElementById('hy-streamer-list-container');
    if (!container) return;

    const query = (filterQuery || '').trim().toLowerCase();
    const displayList = blockedList.filter(item => {
      if (!item || !item.id) return false;
      if (!query) return true;
      return item.id.toLowerCase().includes(query) || (item.remark && item.remark.toLowerCase().includes(query));
    });

    const statText = document.getElementById('hy-streamer-stat');
    if (statText) {
      statText.textContent = `已屏蔽 ${blockedList.length} 个主播 | 当前隐藏 ${filteredStreamerCount} 个卡片`;
    }

    if (displayList.length === 0) {
      container.innerHTML = `<div class="hy-aio-list-empty">${query ? '无匹配的主播' : '暂无屏蔽的主播，输入房间号或主播名即可添加'}</div>`;
      return;
    }

    container.innerHTML = displayList.map(item => `
      <div class="hy-aio-list-item">
        <div>
          <a class="hy-aio-item-id" href="https://www.huya.com/${encodeURIComponent(item.id)}" target="_blank" title="打开直播间">${escapeHtml(item.id)}</a>
          ${item.remark ? `<span class="hy-aio-item-remark">(${escapeHtml(item.remark)})</span>` : ''}
          <span class="hy-aio-item-date">${item.date || ''}</span>
        </div>
        <button class="hy-aio-btn-del" data-id="${escapeHtml(item.id)}" title="取消屏蔽">删除</button>
      </div>
    `).join('');

    container.querySelectorAll('.hy-aio-btn-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        removeBlockedItem(id);
        showToast(`已解除屏蔽：${id}`, 'info');
      });
    });
  }

  function openModal(defaultTab) {
    if (!modalOverlay) createModal();
    if (typeof defaultTab === 'number') {
      config.activeTab = defaultTab;
    }
    syncModalInputs();
    countBlockedElements();
    updateBadge();
    modalOverlay.classList.add('open');
  }

  function closeModal() {
    if (modalOverlay) {
      modalOverlay.classList.remove('open');
    }
  }

  function toggleModal(tabIndex) {
    if (modalOverlay && modalOverlay.classList.contains('open')) {
      closeModal();
    } else {
      openModal(tabIndex);
    }
  }

  // =========================================================================
  // 7. 油猴菜单命令与初始化入口 (Menu Commands & Bootstrap)
  // =========================================================================
  function registerMenuCommands() {
    if (typeof GM_registerMenuCommand !== 'function') return;

    GM_registerMenuCommand('⚙️ 打开虎牙全能控制中心', () => {
      openModal();
    });

    GM_registerMenuCommand('🎬 切换网页全屏 / 观影模式', () => {
      toggleTheaterMode();
    });

    GM_registerMenuCommand('🔄 立即重新优化当前画质', () => {
      runner.execute();
    });

    const currentSlug = getCurrentRoomSlug();
    if (currentSlug) {
      GM_registerMenuCommand(`🚫 屏蔽当前直播间 (${currentSlug})`, () => {
        const res = addBlockedItem(currentSlug, '当前直播间');
        if (res.success) {
          showToast(`已将当前直播间 [${currentSlug}] 加入屏蔽`, 'success');
          checkAndInterceptRoom();
        } else {
          showToast(res.msg, 'info');
        }
      });
    }
  }

  function init() {
    injectStyles();
    hookHistory();
    registerMenuCommands();

    // 快捷键 Alt + H 切换面板，Esc 关闭面板
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
      if (e.altKey && (e.key === 'h' || e.key === 'H')) {
        toggleModal();
      }
    });

    // 检查直播间拦截
    checkAndInterceptRoom();

    const onDomReady = () => {
      createBadge();
      createModal();

      // 在详情页运行优化流程，在列表页运行卡片过滤
      if (isLiveRoom()) {
        runner.execute();
      } else {
        applyStreamerFilter();
      }

      // 监听列表页动态加载 (瀑布流 / 换页)
      streamerObserver.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true
      });

      // 阶段性补刀过滤与统计更新
      [300, 800, 1500, 3000].forEach(delay => {
        setTimeout(() => {
          countBlockedElements();
          applyStreamerFilter();
          checkAndInterceptRoom();
          updateBadge();
        }, delay);
      });

      // 周期性低频维护 (登录弹窗检查)
      setInterval(checkLoginPopup, 5000);
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onDomReady, { once: true });
    } else {
      onDomReady();
    }

    // 页面缓存恢复处理
    window.addEventListener('pageshow', (event) => {
      if (event.persisted && isLiveRoom()) runner.execute();
    });
    window.addEventListener('pagehide', () => {
      clearTimeout(navigationTimer);
      runner.abort();
    });
  }

  // 暴露给单元测试钩子 (若在 Node 测试环境中)
  if (typeof globalThis !== 'undefined' && globalThis.__HUYA_AIO_TEST_HOOK__) {
    globalThis.__HUYA_AIO_TEST_HOOK__({
      runner,
      applyQuality,
      applyAdSkipper,
      applyTheaterMode,
      toggleTheaterMode,
      handleUrlChange,
      init,
      config,
      DEFAULT_CONFIG,
      SELECTORS,
      parseInput,
      addBlockedItem,
      removeBlockedItem,
      isCardBlocked,
      buildCSS,
      countBlockedElements,
      setBadgeUpdater(fn) { updateBadgeQuality = fn; },
      prepareInit() { injectStyles = () => {}; createBadge = () => {}; createModal = () => {}; }
    });
  }

  init();
})();
