// ==UserScript==
// @name         虎牙全能助手 (GitHub 动态同步版)
// @name:en      Huya All-in-One Toolkit (Dynamic GitHub Loader)
// @namespace    https://github.com/guodonglu/tampermonkey-scripts
// @homepageURL  https://github.com/guodonglu/tampermonkey-scripts/tree/main/huya-all-in-one
// @icon         https://www.huya.com/favicon.ico
// @version      1.0.0
// @description  虎牙全能助手动态加载器：一次安装，每次进入虎牙自动从 GitHub / CDN 同步最新核心代码；采用 SWR 本地毫秒级即时缓存，0 广告闪烁，永远保持最新，无需反复手动更新油猴插件！
// @author       guodonglu, mks155
// @match        *://*.huya.com/*
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @connect      raw.githubusercontent.com
// @connect      fastly.jsdelivr.net
// @connect      cdn.jsdelivr.net
// @connect      ghproxy.net
// @run-at       document-start
// @license      MIT
// @noframes
// @updateURL    https://raw.githubusercontent.com/guodonglu/tampermonkey-scripts/main/huya-all-in-one/huya-all-in-one.loader.user.js
// @downloadURL  https://raw.githubusercontent.com/guodonglu/tampermonkey-scripts/main/huya-all-in-one/huya-all-in-one.loader.user.js
// ==/UserScript==

(function () {
  'use strict';

  // =========================================================================
  // 1. 常量与缓存配置 (Constants & Cache Storage)
  // =========================================================================
  const STORAGE_KEY_CODE = 'hy_aio_cached_code';
  const STORAGE_KEY_VER = 'hy_aio_cached_version';
  const STORAGE_KEY_UPDATED_AT = 'hy_aio_cached_time';

  // 多镜像源备份：优先直连 GitHub Raw，备用 fastly / cdn / ghproxy 加速代理
  const REMOTE_SOURCES = [
    (t) => `https://raw.githubusercontent.com/guodonglu/tampermonkey-scripts/main/huya-all-in-one/huya-all-in-one.user.js?t=${t}`,
    (t) => `https://ghproxy.net/https://raw.githubusercontent.com/guodonglu/tampermonkey-scripts/main/huya-all-in-one/huya-all-in-one.user.js?t=${t}`,
    (t) => `https://fastly.jsdelivr.net/gh/guodonglu/tampermonkey-scripts@main/huya-all-in-one/huya-all-in-one.user.js?t=${t}`,
    (t) => `https://cdn.jsdelivr.net/gh/guodonglu/tampermonkey-scripts@main/huya-all-in-one/huya-all-in-one.user.js?t=${t}`
  ];

  // =========================================================================
  // 2. 状态提示小浮窗 (Lightweight Modern Toast)
  // =========================================================================
  function showToast(message, duration = 3600) {
    const toast = document.createElement('div');
    toast.className = 'hy-loader-toast';
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 68px;
      right: 24px;
      background: rgba(15, 23, 42, 0.94);
      color: #f8fafc;
      padding: 10px 16px;
      border-radius: 8px;
      border: 1px solid rgba(255, 168, 0, 0.45);
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 0 12px rgba(255, 168, 0, 0.2);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif;
      font-size: 13px;
      font-weight: 500;
      line-height: 1.4;
      z-index: 99999999;
      pointer-events: none;
      opacity: 0;
      transform: translateY(12px) scale(0.96);
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    const mount = () => {
      const container = document.body || document.documentElement;
      if (!container) return;
      container.appendChild(toast);
      const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb) => setTimeout(cb, 16);
      raf(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0) scale(1)';
      });
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(12px) scale(0.96)';
        setTimeout(() => toast.remove(), 300);
      }, duration);
    };

    if (document.body || document.documentElement) {
      mount();
    } else {
      document.addEventListener('DOMContentLoaded', mount, { once: true });
    }
  }

  // =========================================================================
  // 3. 版本号与脚本校验工具 (Validation & Extraction)
  // =========================================================================
  function extractVersion(code) {
    const match = code.match(/@version\s+([^\r\n]+)/);
    return match ? match[1].trim() : '未知';
  }

  function isValidUserScript(code) {
    return (
      typeof code === 'string' &&
      code.includes('// ==UserScript==') &&
      code.includes('huya-all-in-one') &&
      code.includes('(function ()')
    );
  }

  // =========================================================================
  // 4. 多镜像安全拉取网络层 (Fetch with Multi-Source Fallback)
  // =========================================================================
  function fetchRemoteScript(index = 0, timestamp = Date.now()) {
    return new Promise((resolve, reject) => {
      if (index >= REMOTE_SOURCES.length) {
        reject(new Error('所有 GitHub / CDN 镜像均无法连通，请检查网络'));
        return;
      }

      const targetUrl = REMOTE_SOURCES[index](timestamp);
      GM_xmlhttpRequest({
        method: 'GET',
        url: targetUrl,
        timeout: 8000,
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        onload: (res) => {
          if (res.status === 200 && isValidUserScript(res.responseText)) {
            resolve({ code: res.responseText, sourceUrl: targetUrl });
          } else {
            console.warn(`[虎牙全能助手·动态加载器] 节点 ${index + 1} 响应异常(${res.status})，尝试下一节点...`);
            fetchRemoteScript(index + 1, timestamp).then(resolve).catch(reject);
          }
        },
        onerror: () => {
          console.warn(`[虎牙全能助手·动态加载器] 节点 ${index + 1} 连接失败，尝试备用节点...`);
          fetchRemoteScript(index + 1, timestamp).then(resolve).catch(reject);
        },
        ontimeout: () => {
          console.warn(`[虎牙全能助手·动态加载器] 节点 ${index + 1} 请求超时，尝试备用节点...`);
          fetchRemoteScript(index + 1, timestamp).then(resolve).catch(reject);
        }
      });
    });
  }

  // =========================================================================
  // 5. 核心代码执行引擎 (Execution Engine)
  // =========================================================================
  function executeScript(code, source = 'cache') {
    try {
      // eval 在当前函数作用域内执行，完整保留 GM_*、unsafeWindow 等全部油猴特权 API
      eval(code);
      console.log(`[虎牙全能助手·动态加载器] 核心功能已就绪 (来源: ${source})`);
      return true;
    } catch (err) {
      console.error(`[虎牙全能助手·动态加载器] 执行核心代码出错:`, err);
      return false;
    }
  }

  // =========================================================================
  // 6. 油猴菜单控制入口 (Tampermonkey Menu Commands)
  // =========================================================================
  function registerMenuCommands() {
    if (typeof GM_registerMenuCommand !== 'function') return;

    GM_registerMenuCommand('⚡ 强制检查并同步 GitHub 最新代码', () => {
      showToast('🔍 正在连接 GitHub 拉取最新脚本代码...');
      fetchRemoteScript(0, Date.now())
        .then(({ code }) => {
          const remoteVer = extractVersion(code);
          GM_setValue(STORAGE_KEY_CODE, code);
          GM_setValue(STORAGE_KEY_VER, remoteVer);
          GM_setValue(STORAGE_KEY_UPDATED_AT, Date.now());
          showToast(`✅ 已同步最新版本 (v${remoteVer})！1秒后自动刷新...`, 2000);
          setTimeout(() => location.reload(), 1200);
        })
        .catch((err) => {
          showToast(`❌ 同步失败: ${err.message}`, 4000);
        });
    });

    GM_registerMenuCommand('🗑️ 清除本地缓存重新拉取', () => {
      GM_deleteValue(STORAGE_KEY_CODE);
      GM_deleteValue(STORAGE_KEY_VER);
      GM_deleteValue(STORAGE_KEY_UPDATED_AT);
      showToast('🗑️ 本地代码缓存已清空，即将刷新页面重新拉取...', 1800);
      setTimeout(() => location.reload(), 1000);
    });

    GM_registerMenuCommand('ℹ️ 查看动态加载器状态', () => {
      const ver = GM_getValue(STORAGE_KEY_VER, '未缓存');
      const time = GM_getValue(STORAGE_KEY_UPDATED_AT, 0);
      const timeStr = time ? new Date(time).toLocaleString() : '未同步';
      alert(`⚡ 虎牙全能助手 (动态同步版)\n\n• 当前运行版本: v${ver}\n• 上次同步时间: ${timeStr}\n• 同步策略: SWR 毫秒级秒开 + 后台静默热更新\n• 源码仓库: github.com/guodonglu/tampermonkey-scripts`);
    });
  }

  // =========================================================================
  // 7. SWR 启动与后台无缝同步调度 (Stale-While-Revalidate Engine)
  // =========================================================================
  function init() {
    registerMenuCommands();

    const cachedCode = GM_getValue(STORAGE_KEY_CODE, '');
    const cachedVer = GM_getValue(STORAGE_KEY_VER, '');
    let executed = false;

    // 阶段 1: SWR 秒开——如果本地已有缓存代码，立即在 document-start 执行，确保 0 延迟注入样式与去广告，无任何广告闪现
    if (cachedCode && isValidUserScript(cachedCode)) {
      executeScript(cachedCode, `本地缓存 v${cachedVer || 'unknown'}`);
      executed = true;
    }

    // 阶段 2: 后台异步静默同步 GitHub 最新代码 (首次无缓存时直接前台等待执行)
    fetchRemoteScript(0, Date.now())
      .then(({ code }) => {
        const remoteVer = extractVersion(code);
        const hasUpdate = (remoteVer !== cachedVer) || (code.length !== cachedCode.length);

        if (hasUpdate) {
          GM_setValue(STORAGE_KEY_CODE, code);
          GM_setValue(STORAGE_KEY_VER, remoteVer);
          GM_setValue(STORAGE_KEY_UPDATED_AT, Date.now());
          console.log(`[虎牙全能助手·动态加载器] 发现新版本: v${remoteVer} (本地旧版: v${cachedVer || 'none'})，已更新本地缓存`);

          if (!executed) {
            // 首次安装，之前无本地缓存：下载完毕后立即执行
            executeScript(code, `GitHub 远程实时拉取 v${remoteVer}`);
            showToast(`⚡ 虎牙全能助手 (v${remoteVer}) 已就绪！已开启全方位纯净体验`);
          } else {
            // 本地刚才已运行缓存版本：静默更新缓存并在右下角轻量气泡提醒用户
            showToast(`⚡ 虎牙全能助手已静默同步至 GitHub 最新版 (v${remoteVer})，下次刷新自动生效`);
          }
        } else {
          console.log(`[虎牙全能助手·动态加载器] 当前缓存已是最新版 (v${cachedVer})`);
        }
      })
      .catch((err) => {
        if (!executed) {
          console.error('[虎牙全能助手·动态加载器] 首次拉取失败且无可用本地缓存:', err);
          showToast('⚠️ 虎牙全能助手加载失败，请检查网络连接或开启代理', 5000);
        } else {
          console.warn('[虎牙全能助手·动态加载器] 后台检查更新失败，继续使用本地稳定缓存:', err.message);
        }
      });
  }

  init();
})();
