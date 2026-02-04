'use strict';

const { EventEmitter } = require('events');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

class DiskSpill extends EventEmitter {
  constructor(options = {}) {
    super();
    this.threshold = options.threshold || 128 * 1024 * 1024;
    this.tempDir = options.tempDir || path.join(os.tmpdir(), 'video-download-spill');
    this.prefix = options.prefix || 'spill';
    this.files = new Map();
    this.size = 0;

    try {
      fs.mkdirSync(this.tempDir, { recursive: true });
    } catch (error) {
      // 目录创建失败时抛错让上层处理
      throw new Error(`无法创建临时目录: ${error.message}`);
    }
  }

  async write(buffer) {
    if (!Buffer.isBuffer(buffer)) {
      throw new TypeError('DiskSpill 仅支持 Buffer 数据');
    }

    const filePath = this.#createPath();
    await fsp.writeFile(filePath, buffer);

    const descriptor = { type: 'file', path: filePath, size: buffer.length };
    this.files.set(filePath, descriptor);
    this.size += buffer.length;
    this.emit('spill', descriptor);
    return descriptor;
  }

  createReadStream(descriptor) {
    if (!descriptor || !descriptor.path) {
      throw new Error('缺少有效的磁盘分流描述符');
    }
    return fs.createReadStream(descriptor.path);
  }

  async remove(descriptor) {
    if (!descriptor || !descriptor.path) {
      return;
    }

    const tracked = this.files.get(descriptor.path);
    if (!tracked && !(await this.#exists(descriptor.path))) {
      return;
    }

    try {
      await fsp.unlink(descriptor.path);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    if (tracked) {
      this.size = Math.max(0, this.size - (tracked.size || 0));
      this.files.delete(descriptor.path);
    }

    this.emit('remove', descriptor);
  }

  async cleanup() {
    const tasks = [];
    for (const descriptor of this.files.values()) {
      tasks.push(this.remove(descriptor));
    }
    await Promise.allSettled(tasks);
    this.files.clear();
    this.size = 0;
  }

  getUsage() {
    return { files: this.files.size, size: this.size };
  }

  #createPath() {
    const suffix = crypto.randomBytes(6).toString('hex');
    return path.join(this.tempDir, `${this.prefix}-${Date.now()}-${suffix}.bin`);
  }

  async #exists(target) {
    try {
      await fsp.access(target, fs.constants.F_OK);
      return true;
    } catch (error) {
      return false;
    }
  }
}

module.exports = DiskSpill;
