// ==UserScript==
// @name         虎牙直播全方位广告与干扰元素屏蔽器
// @namespace    https://github.com/guodonglu/huya-ad-blocker
// @version      1.0.1
// @description  全网最强虎牙直播纯净净化脚本：彻底屏蔽直播间商业横幅广告、播放器悬浮营销挂件（小黄车/更多活动/互动插件）、APP下载二维码、顶部头图广告、首充百宝箱营销、视频水印、聊天区牛皮癣推广等。纯原生 CSS 极速过滤，0 CPU 开销，绝不卡顿。
// @author       guodonglu
// @match        *://*.huya.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  // ================= 1. 配置管理 =================
  const STORAGE_KEY_CONFIG = 'hy_adblock_config_v1';

  const DEFAULT_CONFIG = {
    blockSidebarAd: true,           // 聊天栏上方商业横幅广告（麦当劳等，隐藏后聊天栏自动顶格伸展）
    blockPlayerWidgets: true,       // 播放器悬浮营销挂件（小黄车、上热门、甜蜜互动、更多活动、插件iframe）
    blockPlayerQrcode: true,        // 播放器左下角APP下载二维码与吉祥物
    blockTreasureAndPresents: true, // 浮动宝箱、周星榜、首充礼包、百宝箱
    blockWatermark: true,           // 播放器画面水印（虎牙Logo）
    blockTopBanners: true,          // 顶部背景头图广告与活动横幅
    blockBusinessGame: true,        // 游戏推广、分类页商业横幅与页尾推荐
    blockChatRichAds: true,         // 聊天区系统宣传长文与富文本推广卡片
    blockChatNobleEnter: false,     // 聊天区贵族进场座驾播报（默认关闭）
    blockChatGifts: false,          // 聊天区小额送礼滚屏（默认关闭）
    autoCloseLoginPopup: false,     // 自动关闭未登录强制弹出的登录窗口（默认关闭）
    showFloatBadge: true            // 在页面右下角显示拦截器管理悬浮窗
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
    applyStyles();
    updateBadge();
  }

  // ================= 2. 纯 CSS 极速过滤引擎 (0 CPU 开销) =================
  // 核心原则：绝不使用全局 MutationObserver 循环查询 DOM，完全交由浏览器底层 C++ 样式引擎秒级渲染！
  const STYLE_TAG_ID = 'hy-adblocker-dynamic-style';

  function buildCSS() {
    const rules = [];

    // 1. 聊天栏上方商业广告横幅
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

  function applyStyles() {
    let style = document.getElementById(STYLE_TAG_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_TAG_ID;
      const target = document.head || document.documentElement;
      if (target) {
        target.appendChild(style);
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          (document.head || document.documentElement).appendChild(style);
        }, { once: true });
      }
    }
    style.textContent = buildCSS();
  }

  // 立即在 document-start 注入
  applyStyles();

  // ================= 3. 拦截统计与轻量检查 =================
  let blockedCounter = 0;

  // 仅在空闲/用户需要时计算一次，绝不在弹幕高频变动时持续轮询
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
      blockedCounter = count;
      return count;
    } catch (e) {
      return 0;
    }
  }

  // 轻量登录弹窗检查（低频定时，每 5 秒只检查一次）
  function checkLoginPopup() {
    if (!config.autoCloseLoginPopup) return;
    const closeBtn = document.querySelector('.udb-popup-close, .login-close, #UDBSdkLgn-close');
    if (closeBtn && closeBtn.offsetParent !== null) {
      closeBtn.click();
    }
  }

  // ================= 4. UI 界面：悬浮徽标与现代化设置面板 =================
  let modalContainer = null;
  let badgeContainer = null;

  function createUI() {
    if (document.getElementById('hy-adblocker-badge')) return;

    // 注入 UI 专用样式
    const uiStyle = document.createElement('style');
    uiStyle.textContent = `
      #hy-adblocker-badge {
        position: fixed;
        right: 18px;
        bottom: 72px;
        z-index: 99999;
        display: flex;
        align-items: center;
        gap: 6px;
        background: rgba(28, 28, 30, 0.85);
        color: #fff;
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 20px;
        padding: 6px 14px;
        font-size: 13px;
        cursor: pointer;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
        transition: all 0.25s ease;
        user-select: none;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
      }
      #hy-adblocker-badge:hover {
        background: rgba(255, 114, 0, 0.95);
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(255, 114, 0, 0.4);
      }
      #hy-adblocker-badge svg {
        width: 15px;
        height: 15px;
        fill: currentColor;
      }
      #hy-adblocker-badge .count-tag {
        background: rgba(255, 255, 255, 0.2);
        padding: 1px 6px;
        border-radius: 10px;
        font-size: 11px;
        font-weight: 600;
      }

      /* 设置模态弹窗 */
      #hy-adblocker-modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.65);
        backdrop-filter: blur(6px);
        z-index: 100000;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        visibility: hidden;
        transition: all 0.2s ease;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
      }
      #hy-adblocker-modal-overlay.open {
        opacity: 1;
        visibility: visible;
      }
      .hy-modal-card {
        background: #1e1e24;
        color: #f1f2f6;
        width: 520px;
        max-width: 92vw;
        max-height: 88vh;
        border-radius: 14px;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.1);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transform: scale(0.95);
        transition: transform 0.2s ease;
      }
      #hy-adblocker-modal-overlay.open .hy-modal-card {
        transform: scale(1);
      }
      .hy-modal-header {
        padding: 16px 20px;
        background: #25262e;
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }
      .hy-modal-header h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: #fff;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .hy-modal-close-btn {
        background: transparent;
        border: none;
        color: #999;
        font-size: 20px;
        cursor: pointer;
        padding: 0 4px;
        line-height: 1;
      }
      .hy-modal-close-btn:hover {
        color: #fff;
      }
      .hy-modal-body {
        padding: 16px 20px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .hy-toggle-group {
        background: rgba(255, 255, 255, 0.04);
        border-radius: 8px;
        padding: 10px 14px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        transition: background 0.15s ease;
      }
      .hy-toggle-group:hover {
        background: rgba(255, 255, 255, 0.07);
      }
      .hy-toggle-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .hy-toggle-title {
        font-size: 14px;
        font-weight: 500;
        color: #fff;
      }
      .hy-toggle-desc {
        font-size: 12px;
        color: #8f92a1;
      }

      /* Switch */
      .hy-switch {
        position: relative;
        display: inline-block;
        width: 44px;
        height: 24px;
        flex-shrink: 0;
      }
      .hy-switch input {
        opacity: 0;
        width: 0;
        height: 0;
      }
      .hy-slider {
        position: absolute;
        cursor: pointer;
        inset: 0;
        background-color: #4a4d57;
        transition: .25s;
        border-radius: 24px;
      }
      .hy-slider:before {
        position: absolute;
        content: "";
        height: 18px;
        width: 18px;
        left: 3px;
        bottom: 3px;
        background-color: white;
        transition: .25s;
        border-radius: 50%;
      }
      .hy-switch input:checked + .hy-slider {
        background-color: #ff7200;
      }
      .hy-switch input:checked + .hy-slider:before {
        transform: translateX(20px);
      }

      .hy-modal-footer {
        padding: 12px 20px;
        background: #25262e;
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
      }
      .hy-btn-reset {
        background: transparent;
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: #bbb;
        padding: 6px 14px;
        border-radius: 6px;
        font-size: 12px;
        cursor: pointer;
      }
      .hy-btn-reset:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
      }
      .hy-btn-save {
        background: #ff7200;
        border: none;
        color: #fff;
        padding: 6px 18px;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
      }
      .hy-btn-save:hover {
        background: #ff851b;
      }
    `;
    document.head.appendChild(uiStyle);

    // 1. 创建悬浮 Badge
    badgeContainer = document.createElement('div');
    badgeContainer.id = 'hy-adblocker-badge';
    badgeContainer.title = '点击打开虎牙纯净广告拦截设置';
    badgeContainer.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>
      <span>纯净模式</span>
      <span class="count-tag" id="hy-adblocker-count"></span>
    `;
    badgeContainer.addEventListener('click', () => openModal());
    badgeContainer.addEventListener('mouseenter', () => {
      countBlockedElements();
      updateBadge();
    });
    document.body.appendChild(badgeContainer);

    // 2. 创建设置 Modal
    modalContainer = document.createElement('div');
    modalContainer.id = 'hy-adblocker-modal-overlay';
    modalContainer.innerHTML = `
      <div class="hy-modal-card">
        <div class="hy-modal-header">
          <h3>
            <svg style="width:18px;height:18px;fill:#ff7200;" viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>
            虎牙广告拦截与纯净设置
          </h3>
          <button class="hy-modal-close-btn" id="hy-close-modal">&times;</button>
        </div>
        <div class="hy-modal-body">
          ${renderToggle('blockSidebarAd', '聊天栏商业横幅广告', '屏蔽麦当劳等商业广告横幅，聊天栏自动顶格铺满')}
          ${renderToggle('blockPlayerWidgets', '播放器悬浮营销挂件', '屏蔽小黄车、上热门、甜蜜互动、更多活动图标及插件')}
          ${renderToggle('blockPlayerQrcode', '播放器二维码与APP下载', '屏蔽左下角吉祥物及下载二维码浮层')}
          ${renderToggle('blockTreasureAndPresents', '宝箱与营销礼包入口', '屏蔽浮动百宝箱、周星榜、首充礼包等抽奖入口')}
          ${renderToggle('blockWatermark', '播放器画面水印', '屏蔽画面右上角的虎牙直播高清水印Logo')}
          ${renderToggle('blockTopBanners', '顶部头图背景与活动横幅', '屏蔽直播间顶部活动条与大面积宣传头图背景')}
          ${renderToggle('blockBusinessGame', '游戏推广与页脚推荐', '屏蔽直播间及分类页推荐游戏下载及页脚冗余内容')}
          ${renderToggle('blockChatRichAds', '聊天区系统宣传长文', '屏蔽24小时巡查长文警告及富文本推广条')}
          ${renderToggle('blockChatNobleEnter', '进场座驾与贵族广播', '屏蔽聊天室中谁驾临直播间的刷屏进场提示')}
          ${renderToggle('blockChatGifts', '聊天区小额送礼滚屏', '屏蔽聊天室连续送荧光棒等小额礼物刷屏')}
          ${renderToggle('autoCloseLoginPopup', '自动关闭未登录弹窗', '在未登录状态下自动关闭定时的强制登录弹出框')}
          ${renderToggle('showFloatBadge', '显示右下角管理悬浮标', '关闭后可随时通过油猴扩展菜单重新呼出本面板')}
        </div>
        <div class="hy-modal-footer">
          <button class="hy-btn-reset" id="hy-reset-config">恢复默认配置</button>
          <div style="display:flex;gap:8px;">
            <button class="hy-btn-save" id="hy-save-modal">保存并应用</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modalContainer);

    // 绑定事件
    document.getElementById('hy-close-modal').onclick = closeModal;
    modalContainer.onclick = (e) => {
      if (e.target === modalContainer) closeModal();
    };

    document.getElementById('hy-save-modal').onclick = () => {
      Object.keys(DEFAULT_CONFIG).forEach(k => {
        const inp = document.getElementById('toggle-' + k);
        if (inp) config[k] = inp.checked;
      });
      saveConfig();
      closeModal();
    };

    document.getElementById('hy-reset-config').onclick = () => {
      config = Object.assign({}, DEFAULT_CONFIG);
      syncModalInputs();
      saveConfig();
    };

    updateBadge();
  }

  function renderToggle(key, title, desc) {
    return `
      <div class="hy-toggle-group">
        <div class="hy-toggle-info">
          <span class="hy-toggle-title">${title}</span>
          <span class="hy-toggle-desc">${desc}</span>
        </div>
        <label class="hy-switch">
          <input type="checkbox" id="toggle-${key}" ${config[key] ? 'checked' : ''}>
          <span class="hy-slider"></span>
        </label>
      </div>
    `;
  }

  function syncModalInputs() {
    Object.keys(DEFAULT_CONFIG).forEach(k => {
      const inp = document.getElementById('toggle-' + k);
      if (inp) inp.checked = !!config[k];
    });
  }

  function openModal() {
    if (!modalContainer) createUI();
    countBlockedElements();
    updateBadge();
    syncModalInputs();
    modalContainer.classList.add('open');
  }

  function closeModal() {
    if (modalContainer) modalContainer.classList.remove('open');
  }

  function updateBadge() {
    if (!badgeContainer) return;
    badgeContainer.style.display = config.showFloatBadge ? 'flex' : 'none';
    const countEl = document.getElementById('hy-adblocker-count');
    if (countEl) {
      countEl.innerText = blockedCounter > 0 ? blockedCounter.toString() : '✓';
    }
  }

  // ================= 5. 油猴菜单命令 =================
  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('⚙️ 虎牙广告拦截与纯净设置', () => openModal());
    GM_registerMenuCommand('🔄 重新应用过滤规则', () => {
      applyStyles();
      countBlockedElements();
      updateBadge();
    });
  }

  // ================= 6. 周期与事件初始化 =================
  function init() {
    createUI();
    // 延迟 1.5 秒仅在页面加载稳定后统计一次，绝不在弹幕变动时高频循环
    setTimeout(() => {
      countBlockedElements();
      updateBadge();
    }, 1500);

    // 低频检查登录弹窗 (每 5 秒一次，不消耗 CPU)
    setInterval(checkLoginPopup, 5000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

})();
