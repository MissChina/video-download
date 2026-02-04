'use strict';

const { EventEmitter } = require('events');

class MetricsCenter extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxErrors = options.maxErrors || 10;
    this.reset();
  }

  reset() {
    this.state = {
      speed: { instant: 0, average: 0 },
      buffer: { inMemory: 0, onDisk: 0 },
      mux: { video: 0, audio: 0 },
      errors: [],
      downloadedBytes: 0,
      elapsedSeconds: 0
    };

    this.totalBytes = 0;
    this.startTime = Date.now();
    this.lastTick = Date.now();
    this.emit('update', this.snapshot());
  }

  recordDownload(bytes) {
    const now = Date.now();
    const delta = Math.max(1, now - this.lastTick);
    const elapsed = Math.max(1, now - this.startTime);

    this.totalBytes += bytes;
    this.state.speed.instant = Math.max(0, (bytes / delta) * 1000);
    this.state.speed.average = Math.max(0, (this.totalBytes / elapsed) * 1000);
    this.state.downloadedBytes = this.totalBytes;
    this.state.elapsedSeconds = Math.max(0, elapsed / 1000);

    this.lastTick = now;
    this.emit('update', this.snapshot());
  }

  recordBuffer(inMemory, onDisk) {
    const now = Date.now();
    this.state.elapsedSeconds = Math.max(0, (now - this.startTime) / 1000);
    this.state.buffer = {
      inMemory: Math.max(0, inMemory || 0),
      onDisk: Math.max(0, onDisk || 0)
    };
    this.emit('update', this.snapshot());
  }

  recordMux(type, count = 1) {
    const now = Date.now();
    this.state.elapsedSeconds = Math.max(0, (now - this.startTime) / 1000);
    if (!['video', 'audio'].includes(type)) {
      return;
    }
    this.state.mux[type] += Math.max(0, count);
    this.emit('update', this.snapshot());
  }

  pushError(error) {
    const now = Date.now();
    this.state.elapsedSeconds = Math.max(0, (now - this.startTime) / 1000);
    const payload = {
      message: typeof error === 'string' ? error : error?.message || '未知错误',
      time: Date.now()
    };
    this.state.errors = [payload, ...this.state.errors].slice(0, this.maxErrors);
    this.emit('update', this.snapshot());
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this.state));
  }
}

module.exports = MetricsCenter;
