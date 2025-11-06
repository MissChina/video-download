# M3U8 视频下载器

<div align="center">

一个功能强大的 M3U8/HLS 视频流下载工具，支持多线程下载、FFmpeg 自动安装、智能重试和详细日志记录。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-28.0+-green.svg)](https://www.electronjs.org/)
[![Platform](https://img.shields.io/badge/Platform-Windows-lightgrey.svg)](https://github.com)

</div>

---

## 📑 目录

- [快速开始](#-快速开始)
- [功能特性](#-功能特性)
- [系统要求](#-系统要求)
- [开发指南](#-开发指南)
- [项目结构](#-项目结构)
- [配置说明](#-配置说明)
- [常见问题](#-常见问题)
- [技术栈](#-技术栈)
- [许可证](#-许可证)

---

## 🚀 快速开始

### 普通用户

1. **下载应用**
   - 从 [Releases](../../releases) 页面下载最新版本
   - 推荐下载：`M3U8下载器-x.x.x-便携版.exe`（免安装，单文件运行）

2. **运行应用**
   - 双击 `.exe` 文件即可运行
   - **无需安装** Node.js、Python 或其他运行环境

3. **首次使用**
   - 打开应用后，点击"设置"标签页
   - 点击"一键安装 FFmpeg"（推荐，用于视频合并）
   - 等待安装完成

4. **开始下载**
   - 返回"下载"标签页
   - 粘贴或输入 M3U8 视频链接
   - 选择保存路径和文件名
   - 点击"开始下载"

### 开发者

```bash
# 克隆仓库
git clone <repository-url>
cd video-download

# 安装依赖
npm install

# 启动开发模式
npm start

# 打包应用
npm run build        # 生成安装版和便携版
npm run build:dir    # 仅生成未打包的目录（用于测试）
```

---

## ✨ 功能特性

### 核心功能
- ✅ **M3U8/HLS 视频流下载** - 支持标准 M3U8 格式和 HLS 流媒体
- ✅ **多线程并发下载** - 支持 1-64 线程，可自定义并发数
- ✅ **智能重试机制** - 下载失败自动重试，可配置重试次数
- ✅ **断点续传支持** - 支持 HTTP Range 请求
- ✅ **AES-128 解密** - 自动处理加密视频流（需 FFmpeg）

### 用户体验
- 🎨 **现代化界面** - 简洁直观的用户界面
- 📊 **实时进度显示** - 显示下载进度、速度和片段计数
- 📝 **详细日志系统** - 运行日志、下载记录、错误日志分类管理
- 🔐 **日志密码保护** - 敏感日志需要密码访问

### 技术特性
- 🚀 **无需运行环境** - 打包后无需安装 Node.js 等依赖
- 📦 **便携免安装** - 便携版单文件运行，删除即卸载
- 🔄 **FFmpeg 多源下载** - 支持多个下载源，自动故障转移
- 💾 **多格式输出** - 支持 MP4、MKV、TS、AVI 等格式
- 🌐 **完整请求头** - 模拟真实浏览器，突破部分防盗链限制

---

## 💻 系统要求

### 最低要求
- **操作系统**: Windows 7 SP1 / 8 / 10 / 11（64位）
- **内存**: 4GB RAM
- **磁盘空间**: 500MB（应用 + FFmpeg）
- **网络**: 稳定的互联网连接

### 推荐配置
- **操作系统**: Windows 10 / 11（64位）
- **内存**: 8GB RAM 或更高
- **磁盘空间**: 2GB 以上剩余空间
- **网络**: 10Mbps 或更快的网络连接

---

## 🔨 开发指南

### 环境准备

```bash
# 确保已安装 Node.js 16.0+
node --version

# 确保已安装 npm
npm --version
```

### 开发流程

```bash
# 1. 安装依赖
npm install

# 2. 启动开发模式（支持热重载）
npm start

# 3. 代码测试
# 修改代码后重启应用查看效果

# 4. 构建打包
npm run build:dir    # 快速构建（不压缩，用于测试）
npm run build        # 完整构建（生成安装包）
```

### 打包产物

运行 `npm run build` 后，在 `release/` 目录会生成：

```
release/
├── M3U8下载器-2.6.0-win-x64.exe           # NSIS 安装版 (~70MB)
├── M3U8下载器-2.6.0-便携版.exe             # 便携版 (~150MB) ⭐ 推荐
└── win-unpacked/                          # 未打包的完整应用目录
    └── M3U8下载器.exe                      # 可直接运行
```

### 自定义配置

#### 修改 FFmpeg 下载源

编辑 `ffmpeg-installer.js` 第 23-34 行：

```javascript
this.downloadUrls = [
    // 添加自定义 CDN（优先级最高）
    'https://your-cdn.com/ffmpeg-master-latest-win64-gpl.zip',

    // GitHub 官方源
    'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',

    // 镜像源（备用）
    'https://ghproxy.com/https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
];
```

#### 修改日志密码

编辑 `main.js` 第 156 行：

```javascript
const correctPassword = '2222'; // 修改为你的密码
```

---

## 📁 项目结构

```
video-download/
├── main.js                 # Electron 主进程（窗口管理、IPC 通信）
├── renderer.js             # 渲染进程（UI 逻辑、事件处理）
├── downloader.js           # M3U8 下载核心（解析、下载、合并）
���── logger.js               # 日志系统（分类记录、自动清理）
├── ffmpeg-installer.js     # FFmpeg 安装器（多源下载、自动解压）
├── index.html              # 应用界面结构
├── styles.css              # 界面样式
├── package.json            # 项目配置和依赖
├── LICENSE                 # MIT 许可证
├── README.md               # 项目文档
├── node_modules/           # 依赖包（开发时）
└── release/                # 构建产物（打包后）
```

### 核心模块说明

| 文件 | 功能 | 主要职责 |
|------|------|---------|
| `main.js` | 主进程 | 创建窗口、处理 IPC 消息、管理全局错误 |
| `renderer.js` | 渲染进程 | UI 交互、下载控制、状态更新 |
| `downloader.js` | 下载引擎 | M3U8 解析、片段下载、FFmpeg 合并 |
| `logger.js` | 日志系统 | 错误记录、日志轮转、文件管理 |
| `ffmpeg-installer.js` | FFmpeg 管理 | 下载、解压、配置 FFmpeg |

---

## ⚙️ 配置说明

### 下载参数

在"设置"页面可调整：

| 参数 | 默认值 | 范围 | 说明 |
|------|--------|------|------|
| 线程数 | 16 | 1-64 | 并发下载的线程数，过高可能被限速 |
| 连接超时 | 30秒 | 5-300秒 | 单个请求的超时时间 |
| 重试次数 | 3次 | 0-10次 | 下载失败后的重试次数 |

### 日志配置

日志存储位置：`%LOCALAPPDATA%\M3U8Downloader\logs\`

| 日志类型 | 文件名格式 | 说明 |
|----------|-----------|------|
| 运行日志 | `runtime-YYYY-MM-DD.log` | 记录应用运行状态和下载进度 |
| 下载记录 | `download-YYYY-MM-DD.log` | 记录每次下载任务的详细信息 |
| 错误日志 | `error-YYYY-MM-DD.log` | 记录错误和异常信息 |

日志自动管理：
- 单个日志文件最大 10MB，超过后自动轮转
- 每种类型最多保留 10 个日志文件
- 旧日志自动清理

---

## 🐛 常见问题

### 1. 应用打不开或闪退

**可能原因**：
- 被杀毒软件拦截
- 缺少系统依赖

**解决方法**：
1. 将应用添加到杀毒软件白名单
2. 尝试"以管理员身份运行"
3. 查看错误日志：
   ```
   Windows + R → 输入：%LOCALAPPDATA%\M3U8Downloader\logs
   ```
4. 检查系统是否为 64 位 Windows

### 2. FFmpeg 安装失败

**可能原因**：
- 网络连接问题
- GitHub 访问受限

**解决方法**：
1. 检查网络连接
2. 使用代理或 VPN
3. 配置国内镜像源（见[开发指南](#自定义配置)）
4. 手动安装 FFmpeg：
   - 下载 FFmpeg：https://github.com/BtbN/FFmpeg-Builds/releases
   - 解压到：`%LOCALAPPDATA%\M3U8Downloader\ffmpeg\bin\`

### 3. 下载速度慢

**可能原因**：
- 线程数设置过低
- 视频源服务器限速
- 网络带宽限制

**解决方法**：
1. 增加线程数（推荐 16-32）
2. 检查本地网络带宽
3. 尝试在网络空闲时下载
4. 某些视频源可能本身限速，无法突破

### 4. 视频下载后无法播放

**可能原因**：
- 视频文件不完整
- 需要特定解码器
- FFmpeg 未安装

**解决方法**：
1. 确保 FFmpeg 已安装
2. 重新下载视频
3. 使用专业播放器：
   - VLC Media Player
   - PotPlayer
   - MPC-HC
4. 尝试其他输出格式（MP4/MKV/TS）

### 5. 下载提示"无法获取 M3U8"

**可能原因**：
- 链接失效或错误
- 需要特殊权限
- 防盗链限制

**解决方法**：
1. 确认链接是 `.m3u8` 结尾
2. 在浏览器中测试链接是否可访问
3. 检查视频是否需要登录
4. 查看错误日志了解具体原因

### 6. 如何查看日志

**方法一**：通过应用内查看
1. 打开应用
2. 切换到"日志查看"标签页
3. 输入密码：`2222`
4. 选择日志类型查看

**方法二**：直接打开日志文件
```
Windows + R → 输入：%LOCALAPPDATA%\M3U8Downloader\logs
```

---

## 🛠️ 技术栈

### 核心技术
- **[Electron](https://www.electronjs.org/)** `v28.0+` - 跨平台桌面应用框架
- **[Node.js](https://nodejs.org/)** `v16.0+` - JavaScript 运行时
- **[Axios](https://axios-http.com/)** `v1.6+` - HTTP 请求库

### 工具和依赖
- **[FFmpeg](https://ffmpeg.org/)** - 视频处理和格式转换
- **[electron-builder](https://www.electron.build/)** - 应用打包工具

### 开发工具
- **Git** - 版本控制
- **npm** - 包管理器

---

## 📊 更新日志

### v2.6.0 (2025-11-06)
- ✅ 修复版本号不一致问题
- ✅ 优化 downloader.js 进度计数逻辑
- ✅ 移除不存在的图标文件引用
- ✅ 清理多余文件和目录
- ✅ 更新项目文档

### v2.5.0
- ✅ 添加日志查看功能
- ✅ 实现 FFmpeg 自动安装
- ✅ 优化下载进度显示
- ✅ 改进错误处理机制

---

## 📄 许可证

本项目采用 [MIT License](LICENSE) 开源协议。

**免责声明**：
- 本工具仅供学习和研究使用
- 请勿用于下载受版权保护的内容
- 使用本工具产生的任何法律问题由使用者自行承担

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### 贡献指南
1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

---

## 🌟 Star History

如果这个项目对你有帮助，请考虑给它一个 ⭐ Star！

---

<div align="center">

**开发者**: M3U8 Downloader Team
**最后更新**: 2025-11-06

</div>
