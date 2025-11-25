import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

// 从本地node_modules导入FFmpeg核心文件 - 使用正确的导出路径
import coreURL from '@ffmpeg/core-mt?url';
import wasmURL from '@ffmpeg/core-mt/wasm?url';
import workerURL from '@ffmpeg/core-mt/worker?url';

/**
 * FFmpeg Worker - Web/Android 版本
 * 使用本地 ffmpeg.wasm 核心文件进行视频处理
 * 已嵌入FFmpeg核心，无需网络加载
 */
class FFmpegWorker {
    constructor() {
        this.ffmpeg = null;
        this.isLoaded = false;
    }

    /**
     * 加载 FFmpeg WASM - 从本地文件
     */
    async load() {
        if (this.isLoaded) {
            return;
        }

        try {
            console.log('正在加载 FFmpeg.wasm（本地）...');
            this.ffmpeg = new FFmpeg();

            // 设置日志回调
            this.ffmpeg.on('log', ({ message }) => {
                console.log(`FFmpeg: ${message}`);
            });

            // 将本地文件转换为Blob URL
            const coreBlobURL = await toBlobURL(coreURL, 'text/javascript');
            const wasmBlobURL = await toBlobURL(wasmURL, 'application/wasm');
            const workerBlobURL = await toBlobURL(workerURL, 'text/javascript');

            await this.ffmpeg.load({
                coreURL: coreBlobURL,
                wasmURL: wasmBlobURL,
                workerURL: workerBlobURL
            });

            this.isLoaded = true;
            console.log('✅ FFmpeg.wasm 加载成功（本地文件，已嵌入）');
        } catch (error) {
            console.error('FFmpeg.wasm 加载失败', error);
            throw new Error('FFmpeg.wasm 加载失败: ' + error.message);
        }
    }

    /**
     * 合并视频片段 - Web版本
     * @param {Uint8Array[]} segmentDataArray - 片段数据数组
     * @param {Function} onProgress - 进度回调
     * @returns {Uint8Array} 合并后的视频数据
     */
    async mergeSegments(segmentDataArray, onProgress = null) {
        try {
            // 确保 FFmpeg 已加载
            if (!this.isLoaded) {
                await this.load();
            }

            console.log(`开始使用 FFmpeg.wasm 合并 ${segmentDataArray.length} 个片段`);

            if (onProgress) {
                onProgress(0, 'FFmpeg初始化中...');
            }

            // 创建文件列表
            const listContent = segmentDataArray.map((_, index) => {
                return `file 'segment_${index}.ts'`;
            }).join('\n');

            // 写入文件列表到虚拟文件系统
            await this.ffmpeg.writeFile('filelist.txt', listContent);
            console.log('文件列表已写入虚拟文件系统');

            // 将所有片段数据写入虚拟文件系统
            for (let i = 0; i < segmentDataArray.length; i++) {
                const data = segmentDataArray[i];
                await this.ffmpeg.writeFile(`segment_${i}.ts`, data);

                if (onProgress && (i + 1) % 50 === 0) {
                    const percent = Math.floor(((i + 1) / segmentDataArray.length) * 30);
                    onProgress(percent, `加载片段: ${i + 1}/${segmentDataArray.length}`);
                }
            }

            console.log('所有片段已加载到虚拟文件系统');

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

            console.log('FFmpeg 合并完成');

            if (onProgress) {
                onProgress(85, '正在读取结果...');
            }

            // 读取输出文件
            const data = await this.ffmpeg.readFile('output.mp4');

            console.log('视频合并完成');

            if (onProgress) {
                onProgress(100, '合并完成');
            }

            // 清理虚拟文件系统
            await this.cleanup(segmentDataArray.length);

            return data;
        } catch (error) {
            console.error('FFmpeg.wasm 合并失败', error);
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

            console.log('虚拟文件系统已清理');
        } catch (error) {
            console.warn('清理虚拟文件系统时出错', error);
        }
    }

    /**
     * 检查是否已加载
     */
    isReady() {
        return this.isLoaded;
    }
}

export default FFmpegWorker;
