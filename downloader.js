const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const logger = require('./logger');

const execPromise = promisify(exec);

// 创建一个自定义的axios实例，模拟真实浏览器
const browserAxios = axios.create({
    // 不验证SSL证书，避免某些网站的证书问题
    httpsAgent: new (require('https').Agent)({
        rejectUnauthorized: false
    }),
    // 自动处理重定向
    maxRedirects: 5,
    // 支持gzip压缩
    decompress: true
});

class M3U8Downloader {
    constructor() {
        this.isCanceled = false;
        this.progressCallback = null;
    }

    // 下载M3U8视频
    async download(m3u8Url, outputFile, options = {}) {
        const {
            maxWorkers = 16,
            timeout = 30000,
            retry = 3,
            progressCallback = null
        } = options;

        const startTime = Date.now();

        logger.info(`========== 开始新的下载任务 ==========`);
        logger.info(`M3U8地址: ${m3u8Url}`);
        logger.info(`输出文件: ${outputFile}`);
        logger.info(`并发数: ${maxWorkers}, 超时: ${timeout}ms, 重试次数: ${retry}`);

        logger.runtime(`开始下载: ${outputFile}`);
        logger.runtime(`M3U8地址: ${m3u8Url}`);
        logger.runtime(`线程数: ${maxWorkers}, 超时: ${timeout}ms, 重试: ${retry}次`);

        this.isCanceled = false;
        this.progressCallback = progressCallback;

        let tempDir = null;

        try {
            // 1. 获取M3U8内容
            this.updateProgress(5, '正在解析M3U8...');
            logger.info('步骤1: 获取M3U8内容...');
            logger.runtime('步骤1: 正在获取M3U8内容...');
            const m3u8Content = await this.fetchM3U8(m3u8Url, timeout);
            logger.info(`M3U8内容获取成功，大小: ${m3u8Content.length} 字节`);
            logger.runtime(`M3U8内容获取成功，大小: ${m3u8Content.length} 字节`);

            // 2. 解析M3U8获取片段列表
            this.updateProgress(10, '正在解析视频片段...');
            logger.info('步骤2: 解析M3U8文件...');
            logger.runtime('步骤2: 正在解析M3U8文件...');
            const segments = this.parseM3U8(m3u8Content, m3u8Url);

            if (segments.length === 0) {
                logger.error('M3U8解析失败', new Error('未找到视频片段'));
                throw new Error('未找到视频片段');
            }

            this.updateProgress(15, `发现 ${segments.length} 个视频片段`);
            logger.info(`解析成功，共发现 ${segments.length} 个视频片段`);
            logger.runtime(`解析成功，共发现 ${segments.length} 个视频片段`);

            // 3. 创建临时目录
            tempDir = path.join(path.dirname(outputFile), '.temp_' + Date.now());
            await fs.mkdir(tempDir, { recursive: true });
            logger.info(`临时目录创建成功: ${tempDir}`);
            logger.runtime(`临时目录创建成功: ${tempDir}`);

            // 4. 下载所有片段
            this.updateProgress(20, '开始下载视频片段...');
            logger.info(`步骤3: 开始下载视频片段 (并发数: ${maxWorkers})...`);
            logger.runtime(`步骤3: 开始下载视频片段 (并发数: ${maxWorkers})...`);
            const segmentStartTime = Date.now();
            const downloadedFiles = await this.downloadSegments(
                segments,
                tempDir,
                maxWorkers,
                timeout,
                retry
            );
            const downloadDuration = ((Date.now() - segmentStartTime) / 1000).toFixed(2);
            logger.info(`片段下载完成，耗时: ${downloadDuration}秒，成功: ${downloadedFiles.length}/${segments.length}`);
            logger.runtime(`片段下载完成，耗时: ${downloadDuration}秒，成功: ${downloadedFiles.length}/${segments.length}`);

            if (this.isCanceled) {
                logger.warn('下载已被用户取消');
                await this.cleanup(tempDir);
                return false;
            }

            if (downloadedFiles.length === 0) {
                logger.error('下载片段失败', new Error('没有成功下载任何片段'));
                throw new Error('没有成功下载任何片段');
            }

            if (downloadedFiles.length < segments.length) {
                logger.warn(`部分片段下载失败: ${downloadedFiles.length}/${segments.length}`);
            }

            // 5. 合并片段
            this.updateProgress(90, '正在合并视频...');
            logger.info('步骤4: 合并视频片段...');
            logger.runtime('步骤4: 正在合并视频片段...');
            await this.mergeSegments(downloadedFiles, outputFile);
            logger.info(`视频合并成功: ${outputFile}`);
            logger.runtime(`视频合并成功: ${outputFile}`);

            // 6. 清理临时文件
            this.updateProgress(95, '正在清理临时文件...');
            logger.info('步骤5: 清理临时文件...');
            logger.runtime('步骤5: 正在清理临时文件...');
            await this.cleanup(tempDir);
            logger.info('临时文件清理完成');
            logger.runtime('临时文件清理完成');

            this.updateProgress(100, '下载完成');
            logger.info(`========== 下载任务完成 ==========`);

            // 记录下载成功日志
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            const stats = await fs.stat(outputFile);
            logger.runtime(`下载完成: ${outputFile}, 耗时: ${duration}秒, 大小: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);

            logger.download({
                url: m3u8Url,
                filename: path.basename(outputFile),
                outputPath: outputFile,
                status: '下载成功',
                fileSize: stats.size,
                duration: `${duration}秒`,
                threadCount: maxWorkers
            });

            return true;

        } catch (error) {
            logger.error('下载失败', error);

            // 记录下载失败日志
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            logger.runtime(`下载失败: ${outputFile}, 耗时: ${duration}秒, 错误: ${error.message}`);

            logger.download({
                url: m3u8Url,
                filename: path.basename(outputFile),
                outputPath: outputFile,
                status: '下载失败',
                duration: `${duration}秒`,
                threadCount: maxWorkers,
                error: error.message
            });

            // 清理临时文件
            if (tempDir) {
                try {
                    await this.cleanup(tempDir);
                } catch (cleanupError) {
                    logger.error('清理临时文件失败', cleanupError);
                }
            }

            throw error;
        }
    }

    // 获取M3U8内容
    async fetchM3U8(url, timeout) {
        try {
            // 解析URL
            const urlObj = new URL(url);
            const baseUrl = `${urlObj.protocol}//${urlObj.host}`;

            // 完整的浏览器请求头，按Chrome的顺序
            const response = await browserAxios.get(url, {
                timeout,
                headers: {
                    'Accept': '*/*',
                    'Accept-Encoding': 'identity',  // 明确不要压缩（某些CDN要求）
                    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                    'Host': urlObj.host,
                    'Pragma': 'no-cache',
                    'Referer': baseUrl + '/',  // 设置为网站首页
                    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                    'Sec-Ch-Ua-Mobile': '?0',
                    'Sec-Ch-Ua-Platform': '"Windows"',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-origin',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                validateStatus: function (status) {
                    return status >= 200 && status < 500; // 接受所有状态码，稍后处理
                }
            });

            if (response.status !== 200) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return response.data;
        } catch (error) {
            const errorMsg = `无法获取M3U8: ${error.message}`;
            logger.error(errorMsg, error);
            throw new Error(errorMsg);
        }
    }

    // 解析M3U8
    parseM3U8(content, baseUrl) {
        try {
            const lines = content.split('\n').filter(line => line.trim());
            const segments = [];
            const baseUrlObj = new URL(baseUrl);
            const basePath = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();

                // 跳过注释和空行
                if (!line || line.startsWith('#')) {
                    continue;
                }

                // 解析片段URL
                let segmentUrl;
                if (line.startsWith('http://') || line.startsWith('https://')) {
                    segmentUrl = line;
                } else if (line.startsWith('/')) {
                    segmentUrl = `${baseUrlObj.protocol}//${baseUrlObj.host}${line}`;
                } else {
                    segmentUrl = basePath + line;
                }

                segments.push(segmentUrl);
            }

            return segments;
        } catch (error) {
            logger.error('M3U8解析失败', error);
            throw new Error(`M3U8解析失败: ${error.message}`);
        }
    }

    // 下载所有片段
    async downloadSegments(segments, tempDir, maxWorkers, timeout, retry) {
        const downloadedFiles = [];
        const total = segments.length;
        const progress = { completed: 0 }; // 使用对象来共享进度

        // 创建下载任务队列
        const queue = segments.map((url, index) => ({
            url,
            index,
            outputPath: path.join(tempDir, `segment_${index.toString().padStart(6, '0')}.ts`)
        }));

        // 并发下载
        const workers = [];
        for (let i = 0; i < Math.min(maxWorkers, queue.length); i++) {
            workers.push(this.downloadWorker(queue, downloadedFiles, total, progress, timeout, retry));
        }

        await Promise.all(workers);

        return downloadedFiles.sort((a, b) => a.index - b.index).map(f => f.path);
    }

    // 下载工作线程
    async downloadWorker(queue, downloadedFiles, total, progress, timeout, retry) {
        while (queue.length > 0 && !this.isCanceled) {
            const task = queue.shift();
            if (!task) break;

            let success = false;
            let lastError = null;

            for (let attempt = 0; attempt <= retry; attempt++) {
                try {
                    if (attempt > 0) {
                        logger.info(`重试片段 ${task.index + 1}/${total} (第${attempt}次重试)`);
                    }
                    await this.downloadSegment(task.url, task.outputPath, timeout);
                    downloadedFiles.push({ index: task.index, path: task.outputPath });
                    progress.completed++;

                    const percent = 20 + Math.floor((progress.completed / total) * 70);
                    this.updateProgress(percent, `下载中... ${progress.completed}/${total}`);

                    // 每10个片段记录一次进度
                    if (progress.completed % 10 === 0 || progress.completed === total) {
                        logger.info(`下载进度: ${progress.completed}/${total} (${((progress.completed/total)*100).toFixed(1)}%)`);
                    }

                    success = true;
                    break;
                } catch (error) {
                    lastError = error;
                    if (attempt < retry) {
                        await this.sleep(1000 * (attempt + 1));
                    }
                }
            }

            if (!success) {
                logger.error(`片段 ${task.index + 1}/${total} 下载失败 (URL: ${task.url.substring(0, 100)}...)`, lastError);
            }
        }
    }

    // 下载单个片段
    async downloadSegment(url, outputPath, timeout) {
        try {
            // 解析URL
            const urlObj = new URL(url);
            const baseUrl = `${urlObj.protocol}//${urlObj.host}`;

            // 使用完整的浏览器请求头
            const response = await browserAxios.get(url, {
                timeout,
                responseType: 'arraybuffer',
                headers: {
                    'Accept': '*/*',
                    'Accept-Encoding': 'identity',
                    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                    'Host': urlObj.host,
                    'Pragma': 'no-cache',
                    'Range': 'bytes=0-',  // 支持断点续传
                    'Referer': baseUrl + '/',
                    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                    'Sec-Ch-Ua-Mobile': '?0',
                    'Sec-Ch-Ua-Platform': '"Windows"',
                    'Sec-Fetch-Dest': 'video',  // 表明这是视频请求
                    'Sec-Fetch-Mode': 'no-cors',
                    'Sec-Fetch-Site': 'cross-site',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                validateStatus: function (status) {
                    // 接受200和206（部分内容）
                    return (status >= 200 && status < 300) || status === 206;
                }
            });

            // 将 ArrayBuffer 转换为 Buffer
            await fs.writeFile(outputPath, Buffer.from(response.data));
        } catch (error) {
            // 只在重试失败后记录错误
            throw error;
        }
    }

    // 合并片段
    async mergeSegments(segmentFiles, outputFile) {
        const listFile = outputFile + '.list.txt';

        try {
            // 创建文件列表
            const fileList = segmentFiles.map(f => `file '${f}'`).join('\n');
            await fs.writeFile(listFile, fileList);
            logger.info(`创建FFmpeg文件列表: ${listFile} (${segmentFiles.length}个片段)`);

            // 获取FFmpeg路径
            let ffmpegPath = 'ffmpeg';
            try {
                const { ipcRenderer } = require('electron');
                const customPath = await ipcRenderer.invoke('get-ffmpeg-path');
                if (customPath) {
                    ffmpegPath = customPath;
                    logger.info(`使用FFmpeg路径: ${ffmpegPath}`);
                }
            } catch (e) {
                logger.info('使用系统FFmpeg');
            }

            try {
                // 使用FFmpeg合并
                const command = `"${ffmpegPath}" -f concat -safe 0 -i "${listFile}" -c copy "${outputFile}" -y`;
                logger.info(`执行FFmpeg合并命令: ${command}`);
                await execPromise(command);
                logger.info('FFmpeg合并成功');
            } catch (ffmpegError) {
                logger.warn('FFmpeg合并失败，使用简单合并', ffmpegError);
                // 如果FFmpeg失败，尝试简单合并
                await this.simpleMerge(segmentFiles, outputFile);
            }
        } catch (error) {
            logger.error('合并片段失败', error);
            throw error;
        } finally {
            // 删除列表文件
            try {
                await fs.unlink(listFile);
                logger.info('删除临时列表文件');
            } catch (e) {
                // 忽略删除失败
            }
        }
    }

    // 简单合并（不使用FFmpeg）
    async simpleMerge(segmentFiles, outputFile) {
        try {
            logger.info('使用简单合并方式（直接拼接）');
            const writeStream = require('fs').createWriteStream(outputFile);

            for (let i = 0; i < segmentFiles.length; i++) {
                const file = segmentFiles[i];
                const data = await fs.readFile(file);
                writeStream.write(data);

                // 每100个片段记录一次进度
                if ((i + 1) % 100 === 0 || i === segmentFiles.length - 1) {
                    logger.info(`简单合并进度: ${i + 1}/${segmentFiles.length}`);
                }
            }

            return new Promise((resolve, reject) => {
                writeStream.end(() => {
                    logger.info('简单合并完成');
                    resolve();
                });
                writeStream.on('error', (error) => {
                    logger.error('简单合并写入失败', error);
                    reject(error);
                });
            });
        } catch (error) {
            logger.error('简单合并失败', error);
            throw error;
        }
    }

    // 清理临时文件
    async cleanup(tempDir) {
        try {
            const files = await fs.readdir(tempDir);
            for (const file of files) {
                await fs.unlink(path.join(tempDir, file));
            }
            await fs.rmdir(tempDir);
        } catch (error) {
            logger.error('清理临时文件失败', error);
            // 不抛出异常，清理失败不应该影响整体流程
        }
    }

    // 更新进度
    updateProgress(percent, message) {
        if (this.progressCallback) {
            this.progressCallback(percent, message);
        }
    }

    // 取消下载
    cancel() {
        this.isCanceled = true;
    }

    // 延迟函数
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = M3U8Downloader;
