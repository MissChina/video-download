# M3U8 视频下载器（v8.1.0）

跨平台 M3U8/HLS 视频下载工具，自研高速管线，无需依赖 FFmpeg。

## 主要特性

- 自研 HLS → MP4 管线，支持 H.264/AAC，默认 16 段并发下载
- 全新玻璃拟态界面，实时卡片展示速度、内存与失败率
- AES-128 自动解密，按段重试与乱序重排
- 内存池与磁盘溢写协同，长片段场景内存保持可控
- 实时指标：下载速度、缓冲占用、音视频样本数、错误队列
- Context Isolation 安全架构，Preload 脚本隔离 Node.js API

## 下载

发布版本请前往 [Releases](https://github.com/MissChina/video-download/releases)：

- Windows：`M3U8下载器-x.x.x-Windows.exe`
- Linux：`M3U8下载器-x.x.x-Linux.AppImage`
- macOS：`M3U8下载器-x.x.x-macOS.dmg`

## 使用方法

1. 打开应用，粘贴 M3U8 地址
2. 选定保存路径与线程数
3. 点击「开始下载」，实时监控面板将展示速度、内存与片段进度
4. 完成后在保存目录中找到生成的 MP4 文件

## 技术架构

| 模块 | 描述 |
|------|------|
| Electron 主进程 | 任务编排、IPC 通讯、日志收集 |
| Preload 脚本 | 安全暴露 API，隔离渲染进程 |
| Renderer UI | 玻璃拟态面板，展示实时指标 |
| PlaylistParser | 解析 M3U8 清单，提取片段与密钥信息 |
| SegmentFetcher | 带重试的并发下载器，支持自定义 Header |
| BufferPool & DiskSpill | 内存块复用 + 阈值溢写，控制内存压力 |
| mux.js Transmuxer | TS 片段转封装为标准 MP4 流 |
| MetricsCenter | 汇总速度、缓冲、样本、错误并推送至 UI |

## 从源码构建

```bash
# 克隆仓库
git clone https://github.com/MissChina/video-download.git
cd video-download

# 安装依赖
npm install

# 开发模式
npm start

# 构建各平台安装包
npm run build:win    # Windows
npm run build:linux  # Linux
npm run build:mac    # macOS
```

## 常见问题

- **密钥下载失败**：目标站点可能需要自定义 Header/Cookie，请确认链接携带完整鉴权信息。
- **生成的 MP4 无法播放**：确认源流为 H.264/AAC 编码，其他编码暂未支持。
- **下载速度不足**：默认 16 并发，可在界面中调整；同时确认网络是否有限制。

## 许可证

本项目采用 MIT 许可，详见 [LICENSE](LICENSE)。

Copyright (c) 2026 MissChina
