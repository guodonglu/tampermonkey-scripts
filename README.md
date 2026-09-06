# Tampermonkey Scripts (油猴插件脚本集合)

这是一个个人自用与维护的油猴用户脚本（Tampermonkey / Violentmonkey / ScriptCat）开源仓库。每个脚本独立存放于单独的子目录中，包含完整的脚本源码与详细使用说明。

---

## 📂 脚本目录列表

| 脚本名称 | 目录 / 源码 | 适用站点 | 主要功能说明 |
| :--- | :--- | :--- | :--- |
| **虎牙主播屏蔽器** | [`huya-streamer-blocker/`](./huya-streamer-blocker/) <br> ([`脚本源码`](./huya-streamer-blocker/huya-streamer-blocker.user.js)) | `huya.com` | 支持按房间号、网址或主播名在列表页彻底隐藏主播卡片；仅列表页展示悬浮管理标签；误入直播间自动拦截静音；卡片快捷一键屏蔽。 |

---

## 🚀 安装与使用指南

1. **安装脚本管理器扩展**：
   * [Tampermonkey（篡改猴）](https://www.tampermonkey.net/)
   * [Violentmonkey（暴力猴）](https://violentmonkey.github.io/)
   * [ScriptCat（脚本猫）](https://scriptcat.org/)
2. **安装所需脚本**：
   * 点击上方表格中对应脚本的「脚本源码」链接，复制全部代码。
   * 打开浏览器的脚本管理器 -> 选择「添加新脚本」-> 粘贴代码并保存即可。

---

## 🛠️ 项目结构

```text
油猴脚本/
├── .gitignore
├── README.md                      # 仓库主索引文档
└── huya-streamer-blocker/          # 虎牙直播主播屏蔽器目录
    ├── README.md                  # 该脚本的使用说明
    └── huya-streamer-blocker.user.js # 脚本源码 (.user.js)
```

---

## 📄 开源许可

[MIT License](LICENSE)
