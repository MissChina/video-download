# M3U8 Video Downloader

A cross-platform M3U8/HLS video stream downloader, supporting Windows and Android.

[English](#english) | [中文](#中文)

---

## English

### Features

- M3U8/HLS video stream download
- Automatic AES-128 decryption
- Multi-threaded concurrent download (up to 32 threads)
- Auto-convert to MP4 format (Windows)
- Built-in FFmpeg.wasm, no additional installation required

### Download

Go to [Releases](https://github.com/MissChina/video-download/releases) to download the latest version:

- **Windows**: `M3U8下载器-x.x.x-Windows.exe`
- **Android**: `M3U8-Downloader-vx.x.x.apk`

### Usage

1. Open the application
2. Paste M3U8 video URL
3. Set filename and thread count
4. Click "Start Download"

### Tech Stack

| Platform | Technology |
|----------|------------|
| Windows | Electron + Node.js |
| Android | Capacitor + Web |
| Video Processing | FFmpeg.wasm |

### Build from Source

```bash
# Clone the repository
git clone https://github.com/MissChina/video-download.git
cd video-download

# Install dependencies
npm install

# Run in development mode
npm start

# Build for Windows
npm run build:win

# Build for all platforms
npm run build
```

### License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

## 中文

### 功能特性

- 支持 M3U8/HLS 视频流下载
- AES-128 加密自动解密
- 多线程并发下载（最高 32 线程）
- 自动转换为 MP4 格式（Windows）
- 内置 FFmpeg.wasm，无需额外安装

### 下载

前往 [Releases](https://github.com/MissChina/video-download/releases) 下载最新版本：

- **Windows**: `M3U8下载器-x.x.x-Windows.exe`
- **Android**: `M3U8-Downloader-vx.x.x.apk`

### 使用方法

1. 打开应用
2. 粘贴 M3U8 视频链接
3. 设置文件名和线程数
4. 点击"开始下载"

### 技术栈

| 平台 | 技术 |
|------|------|
| Windows | Electron + Node.js |
| Android | Capacitor + Web |
| 视频处理 | FFmpeg.wasm |

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/MissChina/video-download.git
cd video-download

# 安装依赖
npm install

# 开发模式运行
npm start

# 构建 Windows 版本
npm run build:win

# 构建所有平台
npm run build
```

### 开源协议

本项目采用 **MIT 许可证** 开源 - 详见 [LICENSE](LICENSE) 文件。

---

Copyright (c) 2025 MissChina
