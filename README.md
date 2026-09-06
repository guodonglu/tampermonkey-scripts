# 🧭 油猴脚本导航中心 (Tampermonkey Scripts Hub)

> 本仓库用于统一管理、分发与索引个人编写的各类浏览器用户脚本（支持 **Tampermonkey** / **Violentmonkey** / **ScriptCat** 等）。每个脚本均拥有独立的专属目录、使用文档及持续维护更新。

---

## ⚡ 脚本快速导航与一键安装

| 脚本名称 | 适用站点 | ⚡ 一键安装 | 📖 详细文档 | 版本 | 核心功能简介 |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **虎牙画质优化与观影增强器** | `huya.com` | [点击一键安装](https://raw.githubusercontent.com/guodonglu/tampermonkey-scripts/main/huya-live-optimizer/huya-live-optimizer.user.js) | [查看说明](./huya-live-optimizer/README.md) | `v2.0.2` | 自动免扫码解锁原画/蓝光画质限制、切换最高/指定画质、自动进入观影模式（网页全屏）、毫秒级跳过片头广告、切台监听与毛玻璃设置面板。 |
| **虎牙广告与干扰屏蔽器** | `huya.com` | [点击一键安装](https://raw.githubusercontent.com/guodonglu/tampermonkey-scripts/main/huya-ad-blocker/huya-ad-blocker.user.js) | [查看说明](./huya-ad-blocker/README.md) | `v1.0.0` | 彻底屏蔽聊天栏上方商业广告（聊天栏自动顶格铺满）、小黄车/互动插件等悬浮营销、APP下载二维码、首充百宝箱、视频水印等。 |
| **虎牙主播屏蔽器** | `huya.com` | [点击一键安装](https://raw.githubusercontent.com/guodonglu/tampermonkey-scripts/main/huya-streamer-blocker/huya-streamer-blocker.user.js) | [查看说明](./huya-streamer-blocker/README.md) | `v1.3.0` | 支持房间号/链接/主播名彻底屏蔽隐藏卡片；误入拦截静音；仅列表页展示悬浮管理标签。 |

> 💡 **提示**：若浏览器已安装 Tampermonkey，直接点击「**点击一键安装**」即可自动弹出脚本安装界面。

---

## 🗂️ 脚本分类索引

### 📺 1. 视频与直播增强类
* **[虎牙画质优化与观影增强器 (huya-live-optimizer)](./huya-live-optimizer/)**
  * **主文件**：[`huya-live-optimizer.user.js`](./huya-live-optimizer/huya-live-optimizer.user.js)
  * **核心功能**：
    * 自动免扫码解除原画、蓝光8M/4M等全画质扫码绑定限制，支持动态 hover 实时解锁。
    * 智能切换至最高画质或所选的偏好画质（原画/蓝光/超清等）。
    * 进入直播间自动开启网页全屏（观影模式），去除遮挡沉浸观播。
    * 毫秒级精准跳过片头广告，0 冗余 CPU 占用。
    * 深度监听 SPA 路由变动，切台换主播自动重新应用优化。
    * 提供暗色毛玻璃控制面板与快捷悬浮徽标，支持油猴菜单控制。

* **[虎牙广告与干扰屏蔽器 (huya-ad-blocker)](./huya-ad-blocker/)**
  * **主文件**：[`huya-ad-blocker.user.js`](./huya-ad-blocker/huya-ad-blocker.user.js)
  * **核心功能**：
    * 移除聊天栏上方商业大图广告，聊天列表自动顶格自适应伸展。
    * 清除播放器内所有悬浮营销挂件（小黄车、上热门、甜蜜互动、更多活动、拓展 iframe 插件等）。
    * 屏蔽左下角吉祥物与「下载虎牙直播APP」二维码浮层。
    * 清除浮动百宝箱、周星榜、礼物栏首充礼包等抽奖及充值诱导入口。
    * 屏蔽播放器右上角虎牙 Logo 水印。
    * 净化聊天室系统长篇警告长文与富文本推广卡片。
    * 提供右下角拦截计数状态徽标与毛玻璃可视化开关面板，无感秒级过滤。

* **[虎牙主播屏蔽器 (huya-streamer-blocker)](./huya-streamer-blocker/)**
  * **主文件**：[`huya-streamer-blocker.user.js`](./huya-streamer-blocker/huya-streamer-blocker.user.js)
  * **核心功能**：
    * 列表页（首页、分区分类页、全部直播、搜索页）卡片彻底隐藏（`display: none !important`），后方卡片顺畅补齐。
    * 仅在列表页显示右侧悬浮管理入口，进入直播间播放详情页时自动隐藏，观播无遮挡。
    * 误入已屏蔽直播间时自动停止播放并静音，弹出拦截友好提示遮罩。
    * 支持快捷键 `Alt + H` 随时唤起/关闭管理面板。
    * 卡片悬停一键快捷屏蔽按钮，支持黑名单 JSON 导入与导出。

---

## 🚀 新手安装与使用指引

1. **安装脚本管理器扩展**（若尚未安装）：
   * [Tampermonkey（篡改猴）官方网址](https://www.tampermonkey.net/)（推荐）
   * [Violentmonkey（暴力猴）官方网址](https://violentmonkey.github.io/)
   * [ScriptCat（脚本猫）官方网址](https://scriptcat.org/)
2. **安装仓库中的脚本**：
   * **方式一（推荐）**：直接点击上方表格中的 [点击一键安装](https://raw.githubusercontent.com/guodonglu/tampermonkey-scripts/main/huya-live-optimizer/huya-live-optimizer.user.js) 链接，扩展会自动捕获并提示安装。
   * **方式二（手动）**：打开对应脚本目录下的 `.user.js` 文件，复制全部源码，在油猴扩展中点击「添加新脚本」粘贴保存。
3. **刷新页面生效**：
   * 打开对应脚本支持的网站（如虎牙直播），脚本即可自动加载并生效。

---

## 📁 仓库目录结构规范

```text
tampermonkey-scripts/
├── .gitignore                         # Git 忽略配置
├── README.md                          # 🧭 仓库导航与脚本总目录（本文档）
│
├── huya-live-optimizer/               # 脚本1：虎牙画质优化与观影增强器
│   ├── README.md                      # 脚本详细配置说明与图文指引
│   ├── huya-live-optimizer.user.js    # 重构版优化器脚本源码 (.user.js)
│   └── huya-live-optimizer.original.user.js # 原版脚本归档
│
├── huya-ad-blocker/                   # 脚本2：虎牙全方位广告屏蔽器
│   ├── README.md                      # 脚本详细配置说明与图文指引
│   └── huya-ad-blocker.user.js        # 脚本安装源码 (.user.js)
│
└── huya-streamer-blocker/             # 脚本3：虎牙主播屏蔽器
    ├── README.md                      # 脚本详细配置说明与图文指引
    └── huya-streamer-blocker.user.js  # 脚本安装源码 (.user.js)
```

---

## 📄 开源协议

本项目采用 [MIT License](LICENSE) 许可协议。
