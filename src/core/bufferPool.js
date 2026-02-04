'use strict';

class BufferPool {
  constructor(options = {}) {
    this.chunkSize = options.chunkSize || 1024 * 512; // 512KB
    this.maxSize = options.maxSize || 1024 * 1024 * 128; // 128MB
    this.pool = [];
    this.currentSize = 0;
  }

  acquire(size) {
    const targetSize = Math.max(size, this.chunkSize);
    const index = this.pool.findIndex(buf => buf.length >= targetSize);
    if (index !== -1) {
      const buf = this.pool.splice(index, 1)[0];
      this.currentSize -= buf.length;
      return buf.slice(0, size);
    }
    return Buffer.allocUnsafe(size);
  }

  release(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length > this.maxSize) {
      return;
    }

    this.pool.push(buffer);
    this.currentSize += buffer.length;
    this.shrink();
  }

  shrink() {
    while (this.currentSize > this.maxSize) {
      const buf = this.pool.shift();
      if (!buf) break;
      this.currentSize -= buf.length;
    }
  }

  clear() {
    this.pool = [];
    this.currentSize = 0;
  }
}

module.exports = BufferPool;
