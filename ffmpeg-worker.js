const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

/**
 * FFmpeg Worker - 使用 ffmpeg.wasm 进行视频处理
 * 支持跨平台（Windows, Linux, macOS）
 *
 * 注意：@ffmpeg/ffmpeg 和 @ffmpeg/util 是 ES Module，
 * 需要使用动态 import() 加载
 */
class FFmpegWorker {
    constructor() {
        this.ffmpeg = null;
        this.isLoaded = false;
        this.FFmpegClass = null;
        this.toBlobURL = null;
        this.fetchFile = null;
    }

    /**
     * 加载 FFmpeg WASM - 使用本地文件
     */
    async load() {
        if (this.isLoaded) {
            return;
        }

        try {
            logger.info('正在加载 FFmpeg.wasm...');

            // 动态导入 ES Module
            if (!this.FFmpegClass) {
                logger.info('动态导入 @ffmpeg/ffmpeg...');
                const ffmpegModule = await import('@ffmpeg/ffmpeg');
                this.FFmpegClass = ffmpegModule.FFmpeg;

                logger.info('动态导入 @ffmpeg/util...');
                const utilModule = await import('@ffmpeg/util');
                this.toBlobURL = utilModule.toBlobURL;
                this.fetchFile = utilModule.fetchFile;
            }

            this.ffmpeg = new this.FFmpegClass();

            // 设置日志回调
            this.ffmpeg.on('log', ({ message }) => {
                logger.info(`FFmpeg: ${message}`);
            });

            // 获取本地 core 文件路径
            const coreBasePath = path.join(
                __dirname,
                'node_modules',
                '@ffmpeg',
                'core-mt',
                'dist',
                'esm'
            );

            // 读取本地文件并转换为 Blob URL
            const coreJsPath = path.join(coreBasePath, 'ffmpeg-core.js');
            const wasmPath = path.join(coreBasePath, 'ffmpeg-core.wasm');
            const workerPath = path.join(coreBasePath, 'ffmpeg-core.worker.js');

            logger.info(`Core 文件路径: ${coreBasePath}`);

            // 使用 toBlobURL 将本地文件转换为 Blob URL
            const coreURL = await this.toBlobURL(coreJsPath, 'text/javascript');
            const wasmURL = await this.toBlobURL(wasmPath, 'application/wasm');
            const workerURL = await this.toBlobURL(workerPath, 'text/javascript');

            await this.ffmpeg.load({
                coreURL,
                wasmURL,
                workerURL
            });

            this.isLoaded = true;
            logger.info('FFmpeg.wasm 加载成功（使用本地文件）');
        } catch (error) {
            logger.error('FFmpeg.wasm 加载失败', error);
            throw new Error('FFmpeg.wasm 加载失败: ' + error.message);
        }
    }

    /**
     * 合并视频片段
     * @param {string[]} segmentFiles - 片段文件路径数组
     * @param {string} outputFile - 输出文件路径
     * @param {Function} onProgress - 进度回调
     */
    async mergeSegments(segmentFiles, outputFile, onProgress = null) {
        try {
            // 确保 FFmpeg 已加载
            if (!this.isLoaded) {
                await this.load();
            }

            logger.info(`开始使用 FFmpeg.wasm 合并 ${segmentFiles.length} 个片段`);

            if (onProgress) {
                onProgress(0, 'FFmpeg初始化中...');
            }

            // 创建文件列表
            const listContent = segmentFiles.map((file, index) => {
                return `file 'segment_${index}.ts'`;
            }).join('\n');

            // 写入文件列表到虚拟文件系统
            await this.ffmpeg.writeFile('filelist.txt', listContent);
            logger.info('文件列表已写入虚拟文件系统');

            // 将所有片段文件写入虚拟文件系统
            for (let i = 0; i < segmentFiles.length; i++) {
                const file = segmentFiles[i];
                const data = await fs.readFile(file);
                await this.ffmpeg.writeFile(`segment_${i}.ts`, data);

                if (onProgress && (i + 1) % 50 === 0) {
                    const percent = Math.floor(((i + 1) / segmentFiles.length) * 30);
                    onProgress(percent, `加载片段: ${i + 1}/${segmentFiles.length}`);
                }
            }

            logger.info('所有片段已加载到虚拟文件系统');

            if (onProgress) {
                onProgress(35, '开始合并...');
            }

            // 执行 FFmpeg 合并命令
            await this.ffmpeg.exec([
                '-f', 'concat',
                '-safe', '0',
                '-i', 'filelist.txt',
                '-c', 'copy',
                'output.mp4'
            ]);

            logger.info('FFmpeg 合并完成');

            if (onProgress) {
                onProgress(85, '正在写入文件...');
            }

            // 读取输出文件
            const data = await this.ffmpeg.readFile('output.mp4');

            // 写入实际文件系统
            await fs.writeFile(outputFile, data);

            logger.info(`视频已保存: ${outputFile}`);

            if (onProgress) {
                onProgress(100, '合并完成');
            }

            // 清理虚拟文件系统
            await this.cleanup(segmentFiles.length);

            return true;
        } catch (error) {
            logger.error('FFmpeg.wasm 合并失败', error);
            throw error;
        }
    }

    /**
     * 清理虚拟文件系统
     */
    async cleanup(segmentCount) {
        try {
            // 删除临时文件
            await this.ffmpeg.deleteFile('filelist.txt');
            await this.ffmpeg.deleteFile('output.mp4');

            for (let i = 0; i < segmentCount; i++) {
                try {
                    await this.ffmpeg.deleteFile(`segment_${i}.ts`);
                } catch (e) {
                    // 忽略删除失败
                }
            }

            logger.info('虚拟文件系统已清理');
        } catch (error) {
            logger.warn('清理虚拟文件系统时出错', error);
        }
    }

    /**
     * 检查是否已加载
     */
    isReady() {
        return this.isLoaded;
    }
}

module.exports = FFmpegWorker;
