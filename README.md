# 🧭 油猴脚本导航中心 (Tampermonkey Scripts Hub)

> 本仓库用于统一管理、分发与索引个人编写的各类浏览器用户脚本（支持 **Tampermonkey** / **Violentmonkey** / **ScriptCat** 等）。每个脚本均拥有独立的专属目录、使用文档及持续维护更新。

---

## ⚡ 脚本快速导航与一键安装

| 脚本名称 | 适用站点 | ⚡ 一键安装 | 📖 详细文档 | 版本 | 核心功能简介 |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **虎牙主播屏蔽器** | `huya.com` | [点击一键安装](https://raw.githubusercontent.com/guodonglu/tampermonkey-scripts/main/huya-streamer-blocker/huya-streamer-blocker.user.js) | [查看说明](./huya-streamer-blocker/README.md) | `v1.3.0` | 支持房间号/链接/主播名彻底屏蔽隐藏卡片；误入拦截静音；仅列表页展示悬浮管理标签。 |

> 💡 **提示**：若浏览器已安装 Tampermonkey，直接点击「**点击一键安装**」即可自动弹出脚本安装界面。

---

## 🗂️ 脚本分类索引

### 📺 1. 视频与直播增强类
* **[虎牙主播屏蔽器 (huya-streamer-blocker)](./huya-streamer-blocker/)**
  * **主文件**：[`huya-streamer-blocker.user.js`](./huya-streamer-blocker/huya-streamer-blocker.user.js)
  * **支持特性**：
    * 列表页（首页、分区分类页、全部直播、搜索页）卡片彻底隐藏（`display: none !important`），后方卡片顺畅补齐。
    * 仅在列表页显示右侧悬浮管理入口，进入直播间播放详情页时自动隐藏，观播无遮挡。
    * 误入已屏蔽直播间时自动停止播放并静音，弹出拦截友好提示遮罩。
    * 支持快捷键 `Alt + H` 随时唤起/关闭管理面板。
    * 卡片悬停一键快捷屏蔽按钮，支持黑名单 JSON 导入与导出。

---

### 🛠️ 2. 工具与效率增强类
*(持续开发与更新中...)*

---

## 🚀 新手安装与使用指引

1. **安装脚本管理器扩展**（若尚未安装）：
   * [Tampermonkey（篡改猴）官方网址](https://www.tampermonkey.net/)（推荐）
   * [Violentmonkey（暴力猴）官方网址](https://violentmonkey.github.io/)
   * [ScriptCat（脚本猫）官方网址](https://scriptcat.org/)
2. **安装仓库中的脚本**：
   * **方式一（推荐）**：直接点击上方表格中的 [点击一键安装](https://raw.githubusercontent.com/guodonglu/tampermonkey-scripts/main/huya-streamer-blocker/huya-streamer-blocker.user.js) 链接，扩展会自动捕获并提示安装。
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
└── huya-streamer-blocker/             # 脚本1：虎牙主播屏蔽器
    ├── README.md                      # 脚本详细配置说明与图文指引
    └── huya-streamer-blocker.user.js  # 脚本安装源码 (.user.js)
```

---

## 📝 新脚本归档指南

如需向本仓库添加新的油猴脚本：
1. 在仓库根目录下新建以脚本英文命名的独立文件夹（如 `douyu-cleaner/`）。
2. 在该文件夹下放置 `xxx.user.js` 脚本源码以及独立的 `README.md` 使用文档。
3. 更新本导航文档（根目录 `README.md`）中的表格与分类索引。

---

## 📄 开源协议

本项目采用 [MIT License](LICENSE) 许可协议。
