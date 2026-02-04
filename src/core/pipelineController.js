'use strict';

const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const crypto = require('crypto');

const PlaylistParser = require('./playlistParser');
const SegmentFetcher = require('./segmentFetcher');
const BufferPool = require('./bufferPool');
const DiskSpill = require('./diskSpill');
const MetricsCenter = require('./metricsCenter');
const muxjs = require('mux.js');

class PipelineController extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      concurrent: 8,
      retry: 3,
      timeout: 15000,
      bufferPool: { chunkSize: 1024 * 1024, maxSize: 128 * 1024 * 1024 },
      diskSpill: { threshold: 256 * 1024 * 1024 },
      metrics: null,
      ...options
    };

    this.state = 'idle';
    this.metrics = this.options.metrics || new MetricsCenter();
    this.bufferPool = new BufferPool(this.options.bufferPool);
    this.diskSpill = new DiskSpill(this.options.diskSpill);
    this.playlistParser = new PlaylistParser(options.playlistParser);
    this.fetcher = new SegmentFetcher({
      concurrent: this.options.concurrent,
      retry: this.options.retry,
      timeout: this.options.timeout,
      userAgent: options.userAgent
    });

    this.keyCache = new Map();

    this.outputStream = null;
    this.segmentTotal = 0;
    this.segmentCompleted = 0;
    this.segmentFailed = 0;
    this.currentTask = null;
    this.pendingSegments = new Map();
    this.nextSequence = 0;
    this.processing = null;
    this.transmuxer = null;
    this.initSegmentWritten = false;

    this.handleSegmentBound = payload => this.handleSegment(payload);
    this.handleErrorBound = payload => this.handleSegmentError(payload);
    this.handleRetryBound = payload => this.emit('retry', payload);

    this.fetcher.on('segment', this.handleSegmentBound);
    this.fetcher.on('error', this.handleErrorBound);
    this.fetcher.on('retry', this.handleRetryBound);
    this.#createTransmuxer();
  }

  async start(task) {
    if (this.state !== 'idle') {
      throw new Error('管线尚未完成，无法重复启动');
    }

    if (!task || !task.url || !task.output) {
      throw new Error('任务参数不完整，缺少 url 或 output');
    }

    this.state = 'preparing';
    this.emit('state', this.state);
    this.metrics.reset();

    this.currentTask = {
      url: task.url,
      output: task.output,
      headers: task.headers || {},
      baseUrl: task.baseUrl || this.#inferBase(task.url)
    };

    const manifest = task.manifest || (await this.#fetchManifest(task.url, task.headers));
    const playlist = this.playlistParser.parse(manifest, this.currentTask.baseUrl);

    this.segmentTotal = playlist.segments.length;
    if (this.segmentTotal === 0) {
      throw new Error('清单中不存在可下载片段');
    }

    this.pendingSegments.clear();
    this.nextSequence = playlist.sequence;
    this.#createTransmuxer();

    this.state = 'downloading';
    this.emit('state', this.state);

    await this.#prepareOutput(task.output);

    playlist.segments.forEach((segment, index) => {
      const enriched = {
        ...segment,
        index,
        sequence: playlist.sequence + index,
        headers: this.currentTask.headers
      };
      this.fetcher.enqueue(enriched, playlist.sequence + index);
    });
  }

  async stop(reason = '用户停止') {
    if (this.state === 'idle') {
      return;
    }

    this.fetcher.stop();
    await this.diskSpill.cleanup();
    await this.#closeOutput();

    this.state = 'idle';
    this.emit('state', this.state);
    this.emit('stopped', reason);
  }

  async handleSegment({ segment, data }) {
    this.metrics.recordDownload(data.length);
    this.pendingSegments.set(segment.sequence ?? segment.index ?? 0, { segment, data });
    await this.#drainPipeline();
    await this.#maybeFinalize();
  }

  async handleSegmentError({ segment, error }) {
    this.segmentFailed += 1;
    this.metrics.pushError(error);
    this.emit('segment-failed', { segment, error });

    const key = segment.sequence ?? segment.index ?? 0;
    if (!this.pendingSegments.has(key)) {
      this.pendingSegments.set(key, { segment, errorOnly: true });
    }

    await this.#drainPipeline();
    await this.#maybeFinalize();
  }

  async finalize() {
    if (this.state === 'finalizing' || this.state === 'idle') {
      return;
    }

    this.state = 'finalizing';
    this.emit('state', this.state);

    try {
      await this.#drainPipeline(true);
      await this.#closeOutput();
      await this.diskSpill.cleanup();
      this.state = 'completed';
      this.emit('state', this.state);
      this.emit('completed', {
        total: this.segmentTotal,
        failed: this.segmentFailed
      });
    } catch (error) {
      this.metrics.pushError(error);
      await this.stop('输出失败');
      this.emit('error', { stage: 'finalize', error });
    } finally {
      this.segmentTotal = 0;
      this.segmentCompleted = 0;
      this.segmentFailed = 0;
      this.currentTask = null;
      this.keyCache.clear();
    }
  }

  getStatus() {
    return {
      state: this.state,
      total: this.segmentTotal,
      completed: this.segmentCompleted,
      failed: this.segmentFailed,
      metrics: this.metrics.snapshot()
    };
  }

  async #fetchManifest(url, headers = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeout);

    try {
      const response = await fetch(url, {
        headers,
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`清单请求失败: HTTP ${response.status}`);
      }
      return await response.text();
    } finally {
      clearTimeout(timeout);
    }
  }

  async #consumeData(segment, data) {
    let payload = data;

    if (segment.key) {
      const keyInfo = await this.#resolveKey(segment);
      const decipher = crypto.createDecipheriv('aes-128-cbc', keyInfo.key, keyInfo.iv);
      payload = Buffer.concat([decipher.update(payload), decipher.final()]);
    }

    this.transmuxer.push(payload);
    this.transmuxer.flush();
  }

  async #prepareOutput(target) {
    const directory = path.dirname(target);
    await fs.promises.mkdir(directory, { recursive: true });
    this.outputStream = fs.createWriteStream(target);
  }

  async #closeOutput() {
    if (!this.outputStream) {
      return;
    }

    await new Promise(resolve => {
      this.outputStream.end(resolve);
    });
    this.outputStream = null;
  }

  writeChunk(chunk) {
    if (this.outputStream && chunk && chunk.length > 0) {
      this.outputStream.write(chunk);
    }
  }

  #handleTransmuxSegment(segment) {
    if (!this.initSegmentWritten && segment.initSegment?.byteLength) {
      this.writeChunk(Buffer.from(segment.initSegment));
      this.initSegmentWritten = true;
    }

    if (segment.data?.byteLength) {
      this.writeChunk(Buffer.from(segment.data));
    }

    if (segment.video?.samples?.length) {
      this.metrics.recordMux('video', segment.video.samples.length);
    }

    if (segment.audio?.samples?.length) {
      this.metrics.recordMux('audio', segment.audio.samples.length);
    }
  }

  async #resolveKey(segment) {
    if (!segment.key || !segment.key.uri) {
      throw new Error('缺少密钥信息');
    }

    let keyBuffer = this.keyCache.get(segment.key.uri);
    if (!keyBuffer) {
      const response = await fetch(segment.key.uri, {
        headers: this.currentTask?.headers
      });
      if (!response.ok) {
        throw new Error(`密钥请求失败: HTTP ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      keyBuffer = Buffer.from(arrayBuffer);
      this.keyCache.set(segment.key.uri, keyBuffer);
    }

    if (keyBuffer.length !== 16) {
      throw new Error('AES-128 密钥长度不正确');
    }

    let iv = segment.key.iv;
    if (!iv && typeof segment.key.generateIV === 'function') {
      iv = segment.key.generateIV(segment.sequence ?? segment.index ?? 0);
    }

    if (!iv || iv.length !== 16) {
      throw new Error('缺少有效的 IV');
    }

    return { key: keyBuffer, iv };
  }

  #inferBase(target) {
    try {
      const base = new URL(target);
      base.pathname = path.posix.dirname(base.pathname || '/');
      if (!base.pathname.endsWith('/')) {
        base.pathname += '/';
      }
      return base.toString();
    } catch (error) {
      return null;
    }
  }

  async #drainPipeline(force = false) {
    if (this.processing) {
      return this.processing;
    }

    this.processing = (async () => {
      while (this.pendingSegments.has(this.nextSequence)) {
        const payload = this.pendingSegments.get(this.nextSequence);
        this.pendingSegments.delete(this.nextSequence);
        if (payload?.errorOnly) {
          this.nextSequence += 1;
          this.metrics.recordBuffer(this.bufferPool.currentSize, this.diskSpill.getUsage().size);
          continue;
        }
        try {
          await this.#consumeData(payload.segment, payload.data);
          this.segmentCompleted += 1;
        } catch (error) {
          this.segmentFailed += 1;
          this.metrics.pushError(error);
          this.emit('error', { segment: payload.segment, error });
        }
        this.nextSequence += 1;
        this.metrics.recordBuffer(this.bufferPool.currentSize, this.diskSpill.getUsage().size);
      }

      if (force && this.pendingSegments.size === 0 && this.segmentCompleted + this.segmentFailed === this.segmentTotal) {
        this.transmuxer.flush();
      }
    })();

    try {
      await this.processing;
    } finally {
      this.processing = null;
    }
  }

  async #maybeFinalize() {
    if (this.state !== 'downloading' && this.state !== 'finalizing') {
      return;
    }

    if (this.segmentTotal > 0 && this.segmentCompleted + this.segmentFailed === this.segmentTotal && this.pendingSegments.size === 0) {
      await this.finalize();
    }
  }

  #createTransmuxer() {
    this.initSegmentWritten = false;
    this.transmuxer = new muxjs.Transmuxer({
      keepOriginalTimestamps: true,
      alignGopsAtAudioFrames: true
    });
    this.transmuxer.on('data', segment => this.#handleTransmuxSegment(segment));
    this.transmuxer.on('done', () => {});
  }
}

module.exports = PipelineController;
