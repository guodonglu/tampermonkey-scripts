// ==UserScript==
// @name         HuyaLiveOptimizer | 虎牙直播优化器 (原版归档)
// @namespace    https://github.com/mks155
// @homepageURL  https://github.com/mks155/HuyaLiveOptimizer
// @icon         https://www.huya.com/favicon.ico
// @version      1.0.1
// @description  Automatically unlock quality restrictions, switch to highest/specified quality, and enter theater mode for Huya Live | 自动解锁画质限制、切换最高/指定画质、进入观影模式
// @author       mks155
// @copyright 2025, mks155 (https://github.com/mks155)
// @match        *://*.huya.com/*
// @grant        unsafeWindow
// @license      MIT
// @noframes
// @downloadURL https://openuserjs.org/install/mks155/HuyaLiveOptimizer_虎牙直播优化器.user.js
// @updateURL https://openuserjs.org/meta/mks155/HuyaLiveOptimizer_虎牙直播优化器.meta.js
// ==/UserScript==

(function() {
    'use strict';

    // 配置项
    const CONFIG = {
        RETRY_TIMES: 3,           // 重试次数
        RETRY_DELAY: 1000,        // 重试间隔(ms)
        QUALITY_SWITCH_DELAY: 800, // 画质切换后等待时间(ms)
        AD_SKIP_MAX_TRIES: 20,    // 广告跳过最大尝试次数
        AD_SKIP_INTERVAL: 500     // 广告跳过尝试间隔(ms)
    };

    class HuyaQualitySwitcher {
        constructor() {
            this.$ = unsafeWindow.$;
            this.initialized = false;
            this.retryCount = 0;
            this.executionStarted = false; // 防止重复执行
        }

        // 等待jQuery加载
        async waitForJQuery() {
            return new Promise((resolve) => {
                const checkJQuery = () => {
                    if (typeof unsafeWindow.$ !== 'undefined') {
                        this.$ = unsafeWindow.$;
                        resolve(true);
                    } else {
                        setTimeout(checkJQuery, 100);
                    }
                };
                checkJQuery();
            });
        }

        // 等待元素加载
        async waitForElement(selector, timeout = 10000) {
            return new Promise((resolve) => {
                const startTime = Date.now();

                const checkElement = () => {
                    const element = this.$(selector);
                    if (element.length > 0) {
                        resolve(element);
                    } else if (Date.now() - startTime > timeout) {
                        reject(new Error(`等待元素超时: ${selector}`));
                    } else {
                        setTimeout(checkElement, 500);
                    }
                };

                checkElement();
            });
        }

        // 解除扫码限制
        async removeQRCodeRestriction() {
            try {
                const $qualityList = this.$(".player-videotype-list li");
                if ($qualityList.length === 0) {
                    throw new Error("画质列表未找到");
                }

                let restrictionRemoved = false;
                $qualityList.each((_, li) => {
                    const $li = this.$(li);
                    const dataObj = $li.data("data");
                    if (dataObj && dataObj.status !== 0) {
                        dataObj.status = 0;
                        restrictionRemoved = true;
                    }
                });

                return true;
            } catch (error) {
                console.error("解除扫码限制失败:", error);
                throw error;
            }
        }


        // 切换画质
        async switchQuality() {
            try {
                const $qualityList = this.$(".player-videotype-list li");
                const $currentQuality = this.$(".player-videotype-cur");

                if ($qualityList.length === 0 || $currentQuality.length === 0) {
                    throw new Error("画质列表未找到");
                }

                const currentQualityText = $currentQuality.text().trim();

                // 切换到最高画质
                const $targetElement = $qualityList.first();
                const targetQuality = $targetElement.text().trim();

                if (currentQualityText !== targetQuality) {
                    $targetElement.click();
                } else {
                    return true;
                }

                // 等待画质切换完成
                const switchSuccess = await this.waitForQualitySwitch(targetQuality);
                return switchSuccess;

            } catch (error) {
                console.error("切换画质失败:", error);
                throw error;
            }
        }

        // 等待画质切换完成
        async waitForQualitySwitch(targetQuality) {
            return new Promise((resolve) => {
                const startTime = Date.now();
                const maxWaitTime = 5000;

                const checkQuality = () => {
                    const $currentQuality = this.$(".player-videotype-cur");
                    const currentQualityText = $currentQuality.text().trim();

                    if (currentQualityText === targetQuality) {
                        resolve(true);
                    } else if (Date.now() - startTime > maxWaitTime) {
                        console.warn(`画质切换超时，当前画质: ${currentQualityText}`);
                        resolve(false);
                    } else {
                        setTimeout(checkQuality, 200);
                    }
                };

                checkQuality();
            });
        }

        // 进入观影模式
        async enterTheaterMode() {
            try {
                const $theaterBtn = this.$("#player-fullpage-btn");
                if ($theaterBtn.length === 0) {
                    throw new Error("观影模式按钮未找到");
                }

                // 检查是否已经在观影模式
                if (!$theaterBtn.hasClass("player-narrowpage")) {
                    $theaterBtn.click();
                }
                return true;

            } catch (error) {
                console.error("进入观影模式失败:", error);
                throw error;
            }
        }

        // 跳过广告 - 多次尝试点击跳过按钮
        async skipAd() {
            return new Promise((resolve) => {
                let attempts = 0;
                let adSkipped = false;

                const trySkip = () => {
                    attempts++;
                    if (attempts > CONFIG.AD_SKIP_MAX_TRIES) {
                        if (!adSkipped) {
                            console.log("广告跳过：已达最大尝试次数，停止检测");
                        }
                        resolve(adSkipped);
                        return;
                    }

                    // 多种可能的跳过按钮选择器（.ab-skip 为虎牙广告跳过按钮实际类名）
                    const skipSelectors = [
                        ".ab-skip",
                        ".ad-tip .skip",
                        ".ad-skip",
                        ".skip-ad",
                        ".ad-close",
                        ".video-ad-skip",
                        ".player-ad-tip",
                        ".ad-countdown .skip",
                        "[class*='skip']",
                        "[class*='ad'] [class*='close']",
                        ".player-ad-close",
                        ".ad-tip-content",
                    ];

                    for (const selector of skipSelectors) {
                        try {
                            const $el = this.$(selector);
                            if ($el.length > 0 && $el.is(":visible")) {
                                $el.click();
                                adSkipped = true;
                                console.log(`广告跳过：成功点击跳过按钮 (选择器: ${selector}, 第${attempts}次尝试)`);
                                resolve(true);
                                return;
                            }
                        } catch (e) {
                            // 忽略单个选择器的错误
                        }
                    }

                    // 通过文本内容查找"跳过"按钮
                    try {
                        const $allElements = this.$("span, button, a, div");
                        $allElements.each((_, el) => {
                            if (adSkipped) return false;
                            const $el = this.$(el);
                            const text = $el.text().trim();
                            if ((text === "跳过" || text.includes("跳过") || text === "跳过广告") && $el.is(":visible")) {
                                $el.click();
                                adSkipped = true;
                                console.log(`广告跳过：通过文本匹配成功点击跳过按钮 (文本: "${text}", 第${attempts}次尝试)`);
                                resolve(true);
                                return false;
                            }
                        });
                        if (adSkipped) return;
                    } catch (e) {
                        // 忽略错误
                    }

                    setTimeout(trySkip, CONFIG.AD_SKIP_INTERVAL);
                };

                // 延迟1秒后开始尝试，等待广告加载
                setTimeout(trySkip, 1000);
            });
        }

        // 初始化播放器 - 按顺序执行所有步骤
        async initPlayer() {
            // 防止重复执行
            if (this.executionStarted) {
                return;
            }
            this.executionStarted = true;

            try {
                // 等待页面完全稳定后再执行
                await new Promise(resolve => setTimeout(resolve, 2000));

                // 等待播放器加载完成
                await this.waitForElement("#player-fullpage-btn", 15000);
                await this.waitForElement(".player-videotype-list li", 5000);

                // 尝试跳过广告（异步并行，不阻塞后续步骤）
                this.skipAd();

                // 解除扫码限制
                await this.removeQRCodeRestriction();

                // 切换画质
                await this.switchQuality();

                // 等待画质切换稳定
                await new Promise(resolve => setTimeout(resolve, CONFIG.QUALITY_SWITCH_DELAY));

                // 进入观影模式
                await this.enterTheaterMode();

                this.initialized = true;
                console.log("虎牙画质切换完成");

            } catch (error) {
                console.error("播放器初始化失败:", error);
                // 重置执行标志，允许重试
                this.executionStarted = false;

                // 重试机制
                if (this.retryCount < CONFIG.RETRY_TIMES) {
                    this.retryCount++;
                    setTimeout(() => this.initPlayer(), CONFIG.RETRY_DELAY);
                }
            }
        }

        // 主入口
        async initialize() {
            try {
                await this.waitForJQuery();

                // 等待页面完全加载后再开始
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', () => {
                        // 额外等待页面稳定
                        setTimeout(() => this.initPlayer(), 1000);
                    });
                } else {
                    // 页面已加载，等待稳定
                    setTimeout(() => this.initPlayer(), 1000);
                }

            } catch (error) {
                console.error("脚本初始化失败:", error);
            }
        }
    }

    // 启动脚本
    new HuyaQualitySwitcher().initialize();

})();
