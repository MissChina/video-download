# Windows 版自研 M3U8 → MP4 下载管线方案

## 目标

- 移除 FFmpeg/ffmpeg.wasm 依赖，完全使用自研逻辑完成 HLS (M3U8) 到 MP4 的封装。
- 维持高下载吞吐：默认 16 并发段，带宽充足时达到 80–100 Mbps。
- 保证低内存占用：常态 < 300 MB，长视频（2 小时）峰值 < 600 MB。
- 错误率低：片段失败率 < 1%，支持断点恢复与失败回退。
- UI 全面更新，展示实时速度、缓冲、合并状态，同时兼顾深色/浅色模式。

## 保留的现有能力

- 相对/绝对 URL 混合的片段解析逻辑。
- Referer 自动推断，维持当前 Headers 行为。
- 快速失败策略（>50% 失败自动终止并给出提示）。
- 日志记录、异步写队列与现有密码保护机制。

## 总体架构

```
┌────────────────────────────────────────┐
│              PipelineController        │
│    (Worker Orchestration + Metrics)   │
└────────────────────────────────────────┘
        ▲                ▲              
        │ metrics        │ events       
┌───────┴───────┐    ┌───┴────────┐    
│SegmentFetcher │    │TSParser     │    
│(并行下载)     │    │(TS → ES)    │    
└───────▲───────┘    └────▲───────┘    
        │ data buffer       │ frames   
        │                   │          
      BufferPool  ─────────► Mp4Muxer ──► FileWriter
        │                               (stream)
        ▼
    DiskSpill (阈值写盘)
```

## 模块设计

### 1. PlaylistParser
- 解析主/子清单，跟踪 `EXT-X-KEY`, `EXT-X-MAP`, `EXT-X-DISCONTINUITY`。
- 输出统一的 `SegmentDescriptor` 列表：包含 URL、序号、密钥、初始化段。

### 2. SegmentFetcher
- 基于 `global-agent` 强制代理可选；支持自定义 Header/Cookie。
- 并发池：Promise 调度器（最大并发 N），每个任务支持重试（指数退避）。
- 实时上报吞吐（bytes/s）、失败次数。
- 支持断点续传：落地 `.resume.json` 记录已完成段索引。

### 3. BufferPool & DiskSpill
- BufferPool 使用 `Buffer.allocUnsafe` 预分配若干 1MB 块，循环复用。
- 若缓存超阈值（默认 128MB）自动写入临时文件（DiskSpill），并返回可读流。

### 4. TSParser
- 按 188 字节解包，读取 PAT/PMT 建立 PID → 类型映射。
- 音频：支持 AAC LC (ADTS)；视频：H.264/AVC Baseline/Main/High。
- 生成 `AccessUnit`（含 PTS/DTS、NAL 单元、帧类型）。
- 处理 `EXT-X-DISCONTINUITY`: 重置时间戳基准。

### 5. Mp4Muxer
- 构建 `MovieBox` (moov) 与 `MediaDataBox` (mdat)。
- 采用增量写：先写占位 mdat，再写 moov 并回填大小。
- 封装功能：
  - H.264: 生成 avcC，写入 sample 表（stts、stsz、stsc、stco、ctts）。
  - AAC: 生成 esds，样本率/声道来自 ADTS。
  - FastStart: moov 写入前缓存 sample 表；完成后 moov 写到文件头。

### 6. MetricsCenter
- 结构体：
  - `speed.instant` / `speed.average`
  - `buffer.inMemory` / `buffer.onDisk`
  - `mux.samples.video/audio`
  - `errors.recent`
- 对接 Renderer 供 UI 刷新。

### 7. PipelineController
- 状态机：`Idle → Downloading → Muxing → Finalizing → Completed/Failed`。
- 负责 backpressure：当 BufferPool 占用过高时暂停 SegmentFetcher；Muxer 追上后恢复。
- 销毁流程：捕获异常，清理临时文件、释放 Buffer。

## UI 重构要点

- 使用 Vite + Vue 3 重写界面层（Electron renderer 仍允许 nodeIntegration 关掉）。
- 布局：
  - 左：任务控制（输入、历史记录、当前状态）。
  - 右：实时监控卡片（速度、内存、失败率）、日志视图。
- 主题：浅色主体，配色 `#1F2937` 文本 + `#3B82F6` 主按钮，圆角 12px。
- 字体：`"Inter", "Microsoft YaHei", sans-serif`。

## 迁移步骤

1. **初始化项目结构**
   - 新建 `src/core`, `src/services`, `src/ui`。
   - 迁移/删除旧 `downloader.js`, `renderer.js`，保留 `logger`。

2. **实现核心模块**（按序）
   1. PlaylistParser + 单元测试。
   2. SegmentFetcher（含 retry & metrics）。
   3. BufferPool + DiskSpill。
   4. TSParser（引入 fixtures 测试）。
   5. Mp4Muxer（先视频，后音频，最后整合）。
   6. PipelineController + MetricsCenter。

3. **Electron 主进程对接**
   - 替换现有 IPC：`start-download`, `cancel-download`, `get-metrics`, `get-history`。
   - 日志模块沿用。

4. **UI 重写**
   - 引入 Vite 构建 Vue；使用 `electron-vite` 或自定义脚手架。
   - 编写新的界面组件。

5. **测试与打包**
   - Jest/Vitest 单测。
   - `npm run test:integration`：模拟下载公共 HLS 样例。
   - 更新 `electron-builder` 配置，剔除 FFmpeg 相关文件。

6. **文档与自动化**
   - README 改为中文主文 + 英文附录。
   - Workflow 更新（Windows 构建 + 测试）。

## 风险与缓解

| 风险 | 说明 | 减缓措施 |
|------|------|----------|
| TS 解析复杂 | PTS/DTS、SPS/PPS 解析容易出错 | 引入公开样例，对照 mp4box 分析结果 |
| 性能不足 | JS 解析 + 写盘可能瓶颈 | 关键路径使用 BufferPool、WorkerThreads 并行 |
| AES 解密性能 | 如果大量加密 | 使用 Node crypto 的 `createDecipheriv` + streaming |
| UI 重写成本 | Vue + Electron 集成 | 采用 electron-vite 模板，组件化复用 |

## 里程碑

1. **M1**：完成 PlaylistParser + SegmentFetcher + 测试。（✅ 已交付）
2. **M2**：TSParser + Mp4Muxer 打通 Demo（无 UI）。（✅ 已交付）
3. **M3**：整合 PipelineController，CLI 方式下载成功。（✅ 已交付）
4. **M4**：Electron UI 重写，展示指标。（⬜ 进行中：渲染层待替换为 Vue 新界面）
5. **M5**：清理旧代码、更新文档、发布 v8.0.0。（✅ 已交付）
