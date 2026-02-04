'use strict';

const { EventEmitter } = require('events');
const http = require('http');
const https = require('https');

class SegmentFetcher extends EventEmitter {
  constructor(options = {}) {
    super();
    this.concurrent = Math.max(1, options.concurrent || 4);
    this.retry = Math.max(0, options.retry || 2);
    this.timeout = options.timeout || 10000;
    this.userAgent = options.userAgent || 'VideoDownloader/1.0';
    this.queue = [];
    this.active = 0;
    this.stopped = false;
  }

  enqueue(segment, priority = 0) {
    this.queue.push({ segment, priority });
    this.queue.sort((a, b) => b.priority - a.priority);
    this.schedule();
  }

  stop() {
    this.stopped = true;
  }

  schedule() {
    if (this.stopped) return;
    while (this.active < this.concurrent && this.queue.length > 0) {
      const job = this.queue.shift();
      this.fetch(job.segment).catch(() => {});
    }
  }

  async fetch(segment) {
    this.active += 1;
    let attempt = 0;
    const url = segment.url;

    const tryFetch = () => new Promise((resolve, reject) => {
      const lib = url.startsWith('https') ? https : http;
      const abort = new AbortController();
      const timeoutId = setTimeout(() => {
        abort.abort();
        reject(new Error('请求超时'));
      }, this.timeout);

      const req = lib.get(url, {
        signal: abort.signal,
        headers: {
          'User-Agent': this.userAgent,
          ...segment.headers
        }
      }, res => {
        if (res.statusCode && res.statusCode >= 400) {
          clearTimeout(timeoutId);
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }

        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          clearTimeout(timeoutId);
          resolve(Buffer.concat(chunks));
        });
      });

      req.on('error', err => {
        clearTimeout(timeoutId);
        reject(err);
      });
    });

    const emitResult = payload => {
      this.active -= 1;
      this.emit('segment', payload);
      this.schedule();
    };

    const emitError = error => {
      this.active -= 1;
      this.emit('error', { segment, error });
      this.schedule();
    };

    while (attempt <= this.retry) {
      try {
        const data = await tryFetch();
        emitResult({ segment, data });
        return;
      } catch (err) {
        attempt += 1;
        if (attempt > this.retry) {
          emitError(err);
          return;
        }
        this.emit('retry', { segment, attempt, error: err });
        await new Promise(resolve => setTimeout(resolve, 300 * attempt));
      }
    }
  }
}

module.exports = SegmentFetcher;
