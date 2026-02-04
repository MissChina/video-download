'use strict';

const fsp = require('fs/promises');
const path = require('path');

const logger = require('./logger');
const PipelineController = require('./src/core/pipelineController');
const MetricsCenter = require('./src/core/metricsCenter');
const { version: APP_VERSION } = require('./package.json');

class M3U8Downloader {
    constructor() {
        this.controller = null;
        this.metrics = null;
        this.progressCallback = null;
        this.resolvePromise = null;
        this.rejectPromise = null;
        this.statusMessage = '就绪';
        this.inProgress = false;
        this.finished = false;
        this.failureTriggered = false;
        this.canceled = false;
        this.metricsListener = null;
        this.stateListener = null;
        this.retryListener = null;
        this.segmentFailedListener = null;
        this.errorListener = null;
        this.completedListener = null;
        this.stoppedListener = null;
        this.taskStart = 0;
        this.sourceUrl = '';
        this.targetFile = '';
        this.headers = {};
    }

    async download(url, outputFile, options = {}) {
        if (this.inProgress) {
            throw new Error('已有任务正在运行，请稍候');
        }

        if (!url || typeof url !== 'string') {
            throw new Error('请输入有效的 M3U8 链接');
        }

        const normalizedOutput = this._normalizeOutput(outputFile);
        const {
            maxWorkers = 16,
            timeout = 30000,
            retry = 3,
            progressCallback = null,
            headers = {},
            userAgent = 'VideoDownloader/1.0'
        } = options;

        this.progressCallback = typeof progressCallback === 'function' ? progressCallback : null;
        this.statusMessage = '正在解析M3U8...';
        this.taskStart = Date.now();
        this.sourceUrl = url;
        this.targetFile = normalizedOutput;
        this.headers = headers || {};
        this.inProgress = true;
        this.finished = false;
        this.failureTriggered = false;
        this.canceled = false;

        logger.info(`========== 自研管线 v${APP_VERSION} ==========`);
        logger.info(`源地址: ${url}`);
        logger.info(`输出文件: ${normalizedOutput}`);
        logger.runtime(`开始下载任务 → ${path.basename(normalizedOutput)}`);

        this.metrics = new MetricsCenter();
        this.controller = new PipelineController({
            concurrent: Math.max(1, maxWorkers),
            timeout,
            retry,
            metrics: this.metrics,
            userAgent
        });

        this._bindEvents();
        this._emitProgress(1, this.statusMessage, this._composeMetrics(this.metrics.snapshot(), { total: 0, completed: 0, failed: 0 }));

        try {
            await this.controller.start({
                url,
                output: normalizedOutput,
                headers: this.headers
            });
        } catch (error) {
            logger.error('解析清单失败', error);
            this.statusMessage = '下载失败';
            this._emitProgress(0, this.statusMessage, this._composeMetrics(this.metrics.snapshot(), this.controller?.getStatus?.() || { total: 0, completed: 0, failed: 0 }));
            this._cleanup();
            throw error;
        }

        const status = this.controller.getStatus();
        if (status.total > 0) {
            logger.info(`共 ${status.total} 个片段，开始并发下载`);
        }

        return new Promise((resolve, reject) => {
            this.resolvePromise = resolve;
            this.rejectPromise = reject;
        });
    }

    async cancel(reason = '用户取消') {
        if (!this.inProgress || !this.controller || this.finished) {
            return false;
        }

        this.canceled = true;
        logger.warn('下载已取消');
        logger.runtime('用户取消下载');

        try {
            await this.controller.stop(reason);
        } catch (error) {
            logger.warn('停止管线时出现问题', error);
        }

        const status = this.controller?.getStatus?.() || { total: 0, completed: 0, failed: 0 };
        this.statusMessage = '已停止';
        this._emitProgress(0, this.statusMessage, this._composeMetrics(this.metrics?.snapshot?.() || null, status));

        logger.download({
            url: this.sourceUrl,
            filename: path.basename(this.targetFile || '未知文件'),
            status: 'canceled',
            error: reason
        });

        this._resolve(false);
        return true;
    }

    _bindEvents() {
        if (!this.controller || !this.metrics) {
            return;
        }

        this.metricsListener = snapshot => this._handleMetrics(snapshot);
        this.metrics.on('update', this.metricsListener);

        this.stateListener = state => this._handleState(state);
        this.controller.on('state', this.stateListener);

        this.retryListener = payload => this._handleRetry(payload);
        this.controller.on('retry', this.retryListener);

        this.segmentFailedListener = payload => this._handleSegmentFailure(payload);
        this.controller.on('segment-failed', this.segmentFailedListener);

        this.errorListener = payload => this._handlePipelineError(payload);
        this.controller.on('error', this.errorListener);

        this.completedListener = payload => {
            this.controller.off('completed', this.completedListener);
            Promise.resolve(this._handleCompleted(payload)).catch(err => this._reject(err));
        };
        this.controller.on('completed', this.completedListener);

        this.stoppedListener = reason => {
            this.controller.off('stopped', this.stoppedListener);
            this._handleStopped(reason);
        };
        this.controller.on('stopped', this.stoppedListener);
    }

    _handleMetrics(snapshot) {
        if (!this.controller || this.finished) {
            return;
        }

        const status = this.controller.getStatus();
        const total = status.total || 0;
        const completed = status.completed || 0;
        const failed = status.failed || 0;
        const processed = completed + failed;

        if (!this.failureTriggered && processed >= 20 && failed / processed > 0.5) {
            this.failureTriggered = true;
            const failureRate = (failed / processed) * 100;
            const summary = `失败率过高 (${failureRate.toFixed(1)}%)，任务已终止`;
            logger.error(summary);
            this.statusMessage = '失败率过高';
            this._emitProgress(
                total ? Math.min(Math.floor((completed / total) * 100), 99) : 0,
                this.statusMessage,
                this._composeMetrics(snapshot, status)
            );
            logger.download({
                url: this.sourceUrl,
                filename: path.basename(this.targetFile || '未知文件'),
                status: 'failed',
                error: summary
            });
            this.controller.stop('失败率过高').catch(err => logger.warn('停止管线失败', err));
            this._reject(new Error(summary));
            return;
        }

        const percent = total ? Math.min(Math.floor((completed / total) * 100), this.statusMessage.includes('封装') ? 99 : 95) : 0;
        this._emitProgress(percent, this.statusMessage, this._composeMetrics(snapshot, status));
    }

    _handleState(state) {
        if (this.finished) {
            return;
        }

        switch (state) {
            case 'preparing':
                this.statusMessage = '正在解析M3U8...';
                break;
            case 'downloading':
                this.statusMessage = '片段下载中...';
                break;
            case 'finalizing':
                this.statusMessage = '正在封装MP4...';
                break;
            case 'completed':
                this.statusMessage = '✅ 下载完成';
                break;
            case 'idle':
                if (!this.canceled && !this.finished) {
                    this.statusMessage = '已停止';
                }
                break;
            default:
                break;
        }

        const status = this.controller?.getStatus?.() || { total: 0, completed: 0, failed: 0 };
        const snapshot = this.metrics?.snapshot?.() || null;
        this._emitProgress(status.total ? Math.min(Math.floor((status.completed / status.total) * 100), 99) : 0, this.statusMessage, this._composeMetrics(snapshot, status));
    }

    _handleRetry({ segment, attempt, error }) {
        const index = segment?.index ?? segment?.sequence ?? '未知';
        const message = error?.message || (typeof error === 'string' ? error : '未知错误');
        logger.warn(`片段 ${index} 第 ${attempt} 次重试: ${message}`);
    }

    _handleSegmentFailure({ segment, error }) {
        const index = segment?.index ?? segment?.sequence ?? '未知';
        const message = error?.message || (typeof error === 'string' ? error : '未知错误');
        logger.warn(`片段 ${index} 下载失败: ${message}`);
    }

    _handlePipelineError(payload) {
        if (this.finished) {
            return;
        }

        const err = payload?.error instanceof Error ? payload.error : new Error(payload?.error?.message || payload?.error || '未知错误');

        if (payload?.stage === 'finalize') {
            logger.error('封装 MP4 过程中出现错误', err);
            logger.download({
                url: this.sourceUrl,
                filename: path.basename(this.targetFile || '未知文件'),
                status: 'failed',
                error: err.message
            });
            this.statusMessage = '封装失败';
            this._reject(err);
            return;
        }

        if (payload?.segment) {
            const index = payload.segment.index ?? payload.segment.sequence ?? '未知';
            logger.error(`片段 ${index} 解析失败`, err);
        } else {
            logger.error('下载过程中捕获异常', err);
        }
    }

    async _handleCompleted(result) {
        if (this.finished) {
            return;
        }

        const durationSeconds = (Date.now() - this.taskStart) / 1000;
        let fileSize = 0;

        try {
            const stats = await fsp.stat(this.targetFile);
            fileSize = stats.size;
        } catch (error) {
            logger.warn('无法获取文件大小', error);
        }

        const status = this.controller?.getStatus?.() || { total: 0, completed: 0, failed: 0 };
        const snapshot = this.metrics?.snapshot?.() || null;
        this.statusMessage = '✅ 下载完成';
        this._emitProgress(100, this.statusMessage, this._composeMetrics(snapshot, status));

        logger.info('========== 下载完成 ==========');
        logger.info(`文件: ${this.targetFile}`);
        if (result && typeof result.total === 'number') {
            const failed = result.failed || 0;
            logger.info(`片段统计: 完成 ${result.total - failed}/${result.total}，失败 ${failed}`);
        }
        if (fileSize > 0) {
            logger.info(`大小: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
        }
        logger.info(`耗时: ${durationSeconds.toFixed(2)} 秒`);
        logger.runtime(`✅ 完成: ${path.basename(this.targetFile)}`);

        logger.download({
            url: this.sourceUrl,
            filename: path.basename(this.targetFile),
            status: 'success',
            fileSize,
            duration: `${durationSeconds.toFixed(2)}s`
        });

        this._resolve(true);
    }

    _handleStopped(reason) {
        if (this.finished || this.canceled) {
            return;
        }
        logger.warn(`管线提前停止: ${reason || '未知原因'}`);
    }

    _emitProgress(percent, message, metrics) {
        if (this.progressCallback) {
            this.progressCallback(percent, message, metrics);
        }
    }

    _composeMetrics(snapshot, status) {
        const base = snapshot || { speed: { instant: 0, average: 0 }, downloadedBytes: 0, elapsedSeconds: 0 };
        const elapsed = base.elapsedSeconds || (this.taskStart ? (Date.now() - this.taskStart) / 1000 : 0);

        return {
            instantSpeed: base.speed?.instant || 0,
            averageSpeed: base.speed?.average || 0,
            downloadedBytes: base.downloadedBytes || 0,
            elapsedSeconds: elapsed,
            memoryBytes: this._readMemoryUsage(),
            completedSegments: status.completed || 0,
            failedSegments: status.failed || 0,
            totalSegments: status.total || 0
        };
    }

    _readMemoryUsage() {
        try {
            const usage = process.memoryUsage?.();
            return usage?.rss || 0;
        } catch {
            return 0;
        }
    }

    _normalizeOutput(target) {
        if (!target || typeof target !== 'string') {
            throw new Error('输出路径无效');
        }

        const directory = path.dirname(target);
        const base = path.basename(target, path.extname(target));
        return path.join(directory, `${base}.mp4`);
    }

    _resolve(result) {
        if (this.finished) {
            return;
        }
        this.finished = true;
        if (this.resolvePromise) {
            this.resolvePromise(result);
        }
        this._cleanup();
    }

    _reject(error) {
        if (this.finished) {
            return;
        }
        this.finished = true;
        if (this.rejectPromise) {
            this.rejectPromise(error);
        } else {
            throw error;
        }
        this._cleanup();
    }

    _cleanup() {
        if (this.metrics && this.metricsListener) {
            this.metrics.off('update', this.metricsListener);
        }

        if (this.controller) {
            if (this.stateListener) this.controller.off('state', this.stateListener);
            if (this.retryListener) this.controller.off('retry', this.retryListener);
            if (this.segmentFailedListener) this.controller.off('segment-failed', this.segmentFailedListener);
            if (this.errorListener) this.controller.off('error', this.errorListener);
            if (this.completedListener) this.controller.off('completed', this.completedListener);
            if (this.stoppedListener) this.controller.off('stopped', this.stoppedListener);
        }

        this.metricsListener = null;
        this.stateListener = null;
        this.retryListener = null;
        this.segmentFailedListener = null;
        this.errorListener = null;
        this.completedListener = null;
        this.stoppedListener = null;

        this.controller = null;
        this.metrics = null;
        this.progressCallback = null;
        this.resolvePromise = null;
        this.rejectPromise = null;
        this.inProgress = false;
    }
}

module.exports = M3U8Downloader;
