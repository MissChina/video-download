# M3U8 视频下载器（v8.3.0）

跨平台 M3U8/HLS 视频下载工具，自研高速管线，无需依赖 FFmpeg。

## 下载

发布版本请前往 [Releases](https://github.com/MissChina/video-download/releases)：

- **Windows**: `M3U8下载器-x.x.x-Windows.exe`
- **Android**: `M3U8-Downloader-vx.x.x.apk`

## 主要特性

- 自研 HLS → MP4 管线，支持 H.264/AAC，默认 16 段并发下载
- 全新玻璃拟态界面，实时卡片展示速度、内存与失败率
- AES-128 自动解密，按段重试与乱序重排
- 内存池与磁盘溢写协同，长片段场景内存保持可控
- Context Isolation 安全架构，Preload 脚本隔离 Node.js API

## 使用方法

1. 打开应用，粘贴 M3U8 地址
2. 选定保存路径与线程数
3. 点击「开始下载」
4. 完成后在保存目录中找到生成的 MP4 文件

## 从源码构建

```bash
git clone https://github.com/MissChina/video-download.git
cd video-download
npm install
npm start          # 开发模式
npm run build:win  # 构建 Windows
```

## 许可证

MIT License - Copyright (c) 2026 MissChina
