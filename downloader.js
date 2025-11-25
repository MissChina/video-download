const axios = require('axios');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const logger = require('./logger');

/**
 * M3U8 Downloader v6.0.1 - 完全重写版本
 *
 * 核心特性：
 * 1. 全局失败检测 - 20个片段失败率>50%立即停止
 * 2. 强制MP4输出 - 无论输入什么文件名，最终都是MP4
 * 3. 简化日志 - 避免白屏
 * 4. 异步日志写入 - 不阻塞主进程
 */

// Axios实例
const browserAxios = axios.create({
    httpsAgent: new (require('https').Agent)({
        rejectUnauthorized: false
    }),
    maxRedirects: 5,
    decompress: true
});

class M3U8Downloader {
    constructor() {
        this.isCanceled = false;
        this.progressCallback = null;

        // 全局计数器
        this.globalCompleted = 0;
        this.globalFailed = 0;
        this.failureDetails = [];

        // 配置
        this.BATCH_SIZE = 100;
        this.MAX_MEMORY_SEGMENTS = 200;
    }

    /**
     * 主下载方法
     */
    async download(m3u8Url, outputFile, options = {}) {
        const {
            maxWorkers = 16,
            timeout = 30000,
            retry = 3,
            progressCallback = null
        } = options;

        const startTime = Date.now();

        // 🔥 关键：强制最终文件为MP4格式
        const baseFileName = this.getBaseFileName(outputFile);
        const outputDir = path.dirname(outputFile);
        const tempTsFile = path.join(outputDir, `${baseFileName}.temp.ts`);
        const finalMp4File = path.join(outputDir, `${baseFileName}.mp4`);

        logger.info(`========== M3U8下载器 v6.0.1 ==========`);
        logger.info(`输出文件: ${finalMp4File}`);
        logger.runtime(`开始下载任务 → ${path.basename(finalMp4File)}`);

        this.isCanceled = false;
        this.progressCallback = progressCallback;
        this.globalCompleted = 0;
        this.globalFailed = 0;
        this.failureDetails = [];

        try {
            // 步骤1: 获取M3U8
            this.updateProgress(5, '获取M3U8...');
            const m3u8Content = await this.fetchM3U8(m3u8Url, timeout);

            // 步骤2: 解析片段
            this.updateProgress(10, '解析片段...');
            const segments = this.parseM3U8(m3u8Content, m3u8Url);

            if (segments.length === 0) {
                throw new Error('未找到视频片段');
            }

            logger.info(`共 ${segments.length} 个片段`);
            this.updateProgress(15, `共${segments.length}片段`);

            // 步骤3: 下载TS片段
            logger.runtime(`开始下载 ${segments.length} 个片段...`);
            await this.downloadAllSegments(segments, tempTsFile, maxWorkers, timeout, retry);

            // 步骤4: 转换为MP4
            this.updateProgress(85, '转换MP4...');
            logger.info(`转换: ${tempTsFile} → ${finalMp4File}`);
            logger.runtime('正在转换为MP4格式...');

            await this.convertToMp4(tempTsFile, finalMp4File);

            // 删除临时文件
            await fs.unlink(tempTsFile);

            this.updateProgress(100, '完成');

            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            const stats = await fs.stat(finalMp4File);
            const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

            logger.info(`========== 下载完成 ==========`);
            logger.info(`文件: ${finalMp4File}`);
            logger.info(`大小: ${sizeMB} MB`);
            logger.info(`耗时: ${duration} 秒`);
            logger.runtime(`✅ 完成: ${path.basename(finalMp4File)} (${sizeMB}MB)`);

            return true;

        } catch (error) {
            logger.error('下载失败', error);
            logger.runtime(`❌ 失败: ${error.message}`);

            // 清理临时文件
            if (fsSync.existsSync(tempTsFile)) {
                await fs.unlink(tempTsFile).catch(() => {});
            }

            throw error;
        }
    }

    /**
     * 获取基础文件名（去掉扩展名）
     */
    getBaseFileName(filePath) {
        const basename = path.basename(filePath);
        // 去掉所有可能的扩展名
        return basename.replace(/\.(ts|mp4|mkv|avi|flv)$/i, '').replace(/\.\w+$/, '');
    }

    /**
     * 下载所有片段
     */
    async downloadAllSegments(segments, outputFile, maxWorkers, timeout, retry) {
        const totalSegments = segments.length;
        const useBatchMode = totalSegments > this.MAX_MEMORY_SEGMENTS;

        // 确保目录存在
        await fs.mkdir(path.dirname(outputFile), { recursive: true });

        const writeStream = fsSync.createWriteStream(outputFile, { flags: 'w' });

        try {
            const referer = this.getReferer(segments[0].url);
            const batchSize = useBatchMode ? this.BATCH_SIZE : totalSegments;

            for (let batchStart = 0; batchStart < totalSegments; batchStart += batchSize) {
                if (this.isCanceled) {
                    throw new Error('用户取消');
                }

                const batchEnd = Math.min(batchStart + batchSize, totalSegments);
                const currentBatch = segments.slice(batchStart, batchEnd);

                const batchResults = await this.downloadBatchWithFailFast(
                    currentBatch,
                    maxWorkers,
                    timeout,
                    retry,
                    referer,
                    batchStart
                );

                // 写入文件
                if (batchResults.length > 0) {
                    const merged = Buffer.concat(batchResults);
                    await new Promise((resolve, reject) => {
                        writeStream.write(merged, (err) => err ? reject(err) : resolve());
                    });
                }
            }

            await new Promise(resolve => writeStream.end(resolve));

            logger.info(`下载完成: ${this.globalCompleted}/${totalSegments}`);

        } catch (error) {
            writeStream.close();
            if (fsSync.existsSync(outputFile)) {
                await fs.unlink(outputFile);
            }
            throw error;
        }
    }

    /**
     * 下载批次（带快速失败）
     */
    async downloadBatchWithFailFast(segments, maxWorkers, timeout, retry, referer, globalOffset) {
        const results = [];

        for (let i = 0; i < segments.length; i += maxWorkers) {
            if (this.isCanceled) break;

            const batch = segments.slice(i, i + maxWorkers);
            const promises = batch.map(seg => this.downloadSegment(seg, timeout, retry, referer));
            const batchResults = await Promise.all(promises);

            // 收集结果
            for (let j = 0; j < batchResults.length; j++) {
                const result = batchResults[j];
                const segment = batch[j];

                if (result.success) {
                    results.push(result.data);
                    this.globalCompleted++;
                } else {
                    this.globalFailed++;
                    this.failureDetails.push({
                        index: globalOffset + i + j,
                        error: result.error
                    });
                }
            }

            // 更新进度
            const total = this.globalCompleted + this.globalFailed;
            const progress = 20 + Math.floor((this.globalCompleted / (total + segments.length - i - batch.length)) * 65);
            this.updateProgress(progress, `${this.globalCompleted}/${total}`);

            // 🔥 全局失败检测
            if (total >= 20) {
                const failureRate = (this.globalFailed / total) * 100;

                if (failureRate > 50) {
                    logger.error(`🚨 失败率过高: ${failureRate.toFixed(1)}% (${this.globalFailed}/${total})`);
                    logger.error(`前3个失败:`);

                    this.failureDetails.slice(0, 3).forEach(detail => {
                        logger.error(`  片段 ${detail.index}: ${detail.error}`);
                    });

                    throw new Error(
                        `失败率过高 (${failureRate.toFixed(1)}%)\n\n` +
                        `可能原因:\n` +
                        `1. 服务器拒绝请求 (403/401)\n` +
                        `2. 链接已过期\n` +
                        `3. 需要Cookie认证\n` +
                        `4. 网络问题\n\n` +
                        `请在浏览器中测试链接`
                    );
                }
            }
        }

        return results;
    }

    /**
     * 下载单个片段
     */
    async downloadSegment(segment, timeout, retry, referer) {
        for (let attempt = 0; attempt < retry; attempt++) {
            if (this.isCanceled) {
                return { success: false, error: 'canceled' };
            }

            try {
                const headers = this.getBrowserHeaders(referer);

                const response = await browserAxios.get(segment.url, {
                    headers,
                    timeout,
                    responseType: 'arraybuffer'
                });

                if (response.status !== 200) {
                    throw new Error(`HTTP ${response.status}`);
                }

                return {
                    success: true,
                    data: Buffer.from(response.data)
                };

            } catch (error) {
                const errorMsg = this.getErrorMessage(error);

                if (attempt < retry - 1) {
                    // 只记录第一次重试
                    if (attempt === 0) {
                        logger.warn(`片段 ${segment.index}: ${errorMsg} - 重试`);
                    }
                    await this.sleep(1000);
                } else {
                    return { success: false, error: errorMsg };
                }
            }
        }

        return { success: false, error: 'max retries' };
    }

    /**
     * 转换TS到MP4
     */
    async convertToMp4(inputTs, outputMp4) {
        try {
            const { FFmpeg } = await import('@ffmpeg/ffmpeg');
            const { toBlobURL } = await import('@ffmpeg/util');

            const ffmpeg = new FFmpeg();

            // 日志过滤（避免过多日志）
            let logCount = 0;
            ffmpeg.on('log', ({ message }) => {
                if (message.includes('time=') && logCount++ % 10 === 0) {
                    logger.info(`转换中...`);
                }
            });

            logger.info('加载FFmpeg...');

            const coreBasePath = path.join(__dirname, 'node_modules', '@ffmpeg', 'core-mt', 'dist', 'esm');
            const coreURL = await toBlobURL(path.join(coreBasePath, 'ffmpeg-core.js'), 'text/javascript');
            const wasmURL = await toBlobURL(path.join(coreBasePath, 'ffmpeg-core.wasm'), 'application/wasm');
            const workerURL = await toBlobURL(path.join(coreBasePath, 'ffmpeg-core.worker.js'), 'text/javascript');

            await ffmpeg.load({ coreURL, wasmURL, workerURL });

            // 读取输入
            const inputData = await fs.readFile(inputTs);
            await ffmpeg.writeFile('input.ts', new Uint8Array(inputData));

            // 转换
            logger.info('执行转换...');
            await ffmpeg.exec(['-i', 'input.ts', '-c', 'copy', '-movflags', '+faststart', 'output.mp4']);

            // 读取输出
            const outputData = await ffmpeg.readFile('output.mp4');

            // 写入文件
            await fs.writeFile(outputMp4, outputData);

            logger.info(`MP4已保存: ${outputMp4}`);

            // 清理
            await ffmpeg.deleteFile('input.ts');
            await ffmpeg.deleteFile('output.mp4');

        } catch (error) {
            logger.error('MP4转换失败', error);
            throw new Error(`MP4转换失败: ${error.message}`);
        }
    }

    /**
     * 获取M3U8内容
     */
    async fetchM3U8(url, timeout) {
        try {
            const headers = this.getBrowserHeaders(this.getReferer(url));

            const response = await browserAxios.get(url, {
                headers,
                timeout,
                responseType: 'text'
            });

            if (response.status !== 200) {
                throw new Error(`HTTP ${response.status}`);
            }

            if (!response.data || typeof response.data !== 'string') {
                throw new Error('M3U8内容为空');
            }

            return response.data;

        } catch (error) {
            const errorMsg = this.getErrorMessage(error);
            logger.error(`获取M3U8失败: ${errorMsg}`, error);
            throw new Error(`获取M3U8失败: ${errorMsg}`);
        }
    }

    /**
     * 解析M3U8
     */
    parseM3U8(content, baseUrl) {
        const lines = content.split('\n').map(l => l.trim()).filter(l => l);
        const segments = [];
        let index = 0;

        for (const line of lines) {
            if (line.startsWith('#')) continue;

            if (line.endsWith('.ts') || line.includes('.ts?')) {
                let url = line;

                if (!url.startsWith('http')) {
                    const baseUrlObj = new URL(baseUrl);
                    if (url.startsWith('/')) {
                        url = `${baseUrlObj.protocol}//${baseUrlObj.host}${url}`;
                    } else {
                        const basePath = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
                        url = basePath + url;
                    }
                }

                segments.push({ index: index++, url });
            }
        }

        return segments;
    }

    /**
     * 获取浏览器请求头
     */
    getBrowserHeaders(referer) {
        return {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Pragma': 'no-cache',
            'Referer': referer,
            'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'cross-site'
        };
    }

    /**
     * 获取Referer
     */
    getReferer(url) {
        try {
            const urlObj = new URL(url);
            return `${urlObj.protocol}//${urlObj.host}/`;
        } catch {
            return url;
        }
    }

    /**
     * 获取错误信息
     */
    getErrorMessage(error) {
        if (error.response) {
            return `HTTP ${error.response.status}`;
        } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            return 'timeout';
        } else if (error.code === 'ENOTFOUND') {
            return 'dns error';
        } else {
            return error.message || 'unknown';
        }
    }

    /**
     * 更新进度
     */
    updateProgress(percent, message) {
        if (this.progressCallback) {
            this.progressCallback(percent, message);
        }
    }

    /**
     * 延迟
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 取消下载
     */
    cancel() {
        this.isCanceled = true;
        logger.warn('下载已取消');
        logger.runtime('用户取消下载');
    }
}

module.exports = M3U8Downloader;
