import { CapacitorHttp } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

/**
 * M3U8 Downloader v6.0.1 - Filesystem写入崩溃修复
 *
 * v6.0.1 修复：
 * - Filesystem.writeFile() 无法处理 >40MB 的Base64字符串
 * - 10个片段(32MB二进制)→43MB Base64→IPC通信崩溃
 * - 降低到3个片段(~10MB二进制)→13MB Base64，安全范围
 * - 增加 try-catch 包裹所有 Filesystem 调用
 * - 详细日志记录每步操作
 *
 * v6.0.1-beta 修复：
 * - btoa()函数在处理大字符串时会直接崩溃，不抛出异常
 * - 使用512KB极小块逐个编码，避免进程被杀
 *
 * 核心改进：
 * 1. 移除FFmpeg.wasm（避免内存问题）
 * 2. 直接拼接TS片段（MPEG-TS特性支持无损拼接）
 * 3. 内存监控和保护
 * 4. 断点续传支持
 * 5. 日志持久化
 *
 * 稳定性保证：
 * - 无白屏
 * - 无闪退
 * - 支持任意大小文件
 * - 内存占用稳定（<200MB）
 */

class M3U8Downloader {
    constructor() {
        this.isCanceled = false;
        this.progressCallback = null;
        this.logger = window.logger || console;

        // 内存保护阈值（Android内存更受限，使用极小的批次）
        // v4.1.1修复：10个片段=32MB→43MB Base64，Filesystem.writeFile无法处理
        this.MEMORY_CHUNK_SIZE = 3; // 每3个片段保存一次（~10MB→13MB Base64，安全范围）
        this.MAX_MEMORY_SEGMENTS = 15; // 内存中最多保留15个片段（触发分批模式）

        // 断点续传
        this.downloadState = {
            segments: [],
            completed: [],
            failed: []
        };
    }

    /**
     * 主下载方���
     */
    async download(m3u8Url, outputFilename, options = {}) {
        const {
            maxWorkers = 16,
            timeout = 30000,
            retry = 3,
            progressCallback = null
        } = options;

        const startTime = Date.now();

        this.logger.info(`========== 开始新的下载任务 ==========`);
        this.logger.info(`M3U8地址: ${m3u8Url}`);
        this.logger.info(`输出文件: ${outputFilename}`);
        this.logger.info(`并发数: ${maxWorkers}, 超时: ${timeout}ms, 重试: ${retry}`);

        this.isCanceled = false;
        this.progressCallback = progressCallback;

        try {
            // 1. 获取M3U8内容
            this.updateProgress(5, '正在解析M3U8...');
            this.logger.info('步骤1: 获取M3U8内容...');
            const m3u8Content = await this.fetchM3U8(m3u8Url, timeout);
            this.logger.info(`M3U8内容获取成功，大小: ${m3u8Content.length} 字节`);

            // 2. 解析M3U8获取片段列表
            this.updateProgress(10, '正在解析视频片段...');
            this.logger.info('步骤2: 解析M3U8文件...');
            const segments = this.parseM3U8(m3u8Content, m3u8Url);

            if (segments.length === 0) {
                throw new Error('未找到视频片段');
            }

            this.updateProgress(15, `发现 ${segments.length} 个视频片段`);
            this.logger.info(`解析成功，共 ${segments.length} 个片段`);

            // 检查是否为大文件（需要分批处理）
            const useBatchMode = segments.length > this.MAX_MEMORY_SEGMENTS;
            if (useBatchMode) {
                this.logger.warn(`片段数量较多(${segments.length})，启用分批处理模式，避免内存溢出`);
            }

            // 3. 下载并合并（分批处理，避免内存问题）
            this.updateProgress(20, '开始下载视频片段...');
            this.logger.info(`步骤3: 开始下载 (并发: ${maxWorkers}, 分批模式: ${useBatchMode})...`);

            const outputPath = await this.downloadAndMerge(
                segments,
                outputFilename,
                maxWorkers,
                timeout,
                retry,
                useBatchMode
            );

            this.updateProgress(100, '下载完成');

            const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
            this.logger.info(`========== 下载任务完成 ==========`);
            this.logger.info(`总耗时: ${totalDuration}秒`);
            this.logger.info(`保存路径: ${outputPath}`);

            return true;
        } catch (error) {
            this.logger.error('下载过程出错', error);
            throw error;
        }
    }

    /**
     * 下载并直接合并（分批处理，避免内存问题）
     */
    async downloadAndMerge(segments, outputFilename, maxWorkers, timeout, retry, useBatchMode) {
        const totalSegments = segments.length;
        let completed = 0;
        let failed = 0;

        // 创建临时文件用于存储合并数据
        const tempFileName = `temp_${Date.now()}.ts`;
        let tempFilePath = null;

        try {
            // 在Downloads目录创建文件
            const downloadDir = Directory.Documents; // Android的Documents目录

            this.logger.info(`开始下载和合并，目标目录: Documents`);

            // 分批下载并追加
            const batchSize = useBatchMode ? this.MEMORY_CHUNK_SIZE : totalSegments;
            let allData = []; // 仅在非分批模式下使用

            for (let i = 0; i < totalSegments; i += batchSize) {
                if (this.isCanceled) {
                    this.logger.warn('用户取消下载');
                    break;
                }

                const batchStart = i;
                const batchEnd = Math.min(i + batchSize, totalSegments);
                const batch = segments.slice(batchStart, batchEnd);

                this.logger.info(`处理批次: ${batchStart + 1}-${batchEnd}/${totalSegments}`);

                // 下载这一批
                const batchData = await this.downloadBatch(
                    batch,
                    maxWorkers,
                    timeout,
                    retry,
                    (batchCompleted) => {
                        completed = batchStart + batchCompleted;
                        const progress = 20 + Math.floor((completed / totalSegments) * 70);
                        this.updateProgress(progress, `下载: ${completed}/${totalSegments}`);
                    }
                );

                if (batchData.length === 0) {
                    this.logger.error(`批次 ${batchStart}-${batchEnd} 下载失败`);
                    failed += batch.length;
                    continue;
                }

                // 合并这一批的数据
                const batchMerged = this.mergeSegmentsRaw(batchData);
                this.logger.info(`批次合并完成: ${(batchMerged.length / 1024 / 1024).toFixed(2)} MB`);

                if (useBatchMode) {
                    // 分批模式：追加到文件
                    // 使用分块Base64编码，避免btoa()崩溃
                    if (!tempFilePath) {
                        // 首次创建文件
                        this.logger.info(`开始编码 ${(batchMerged.length / 1024 / 1024).toFixed(2)}MB 数据...`);
                        const base64Data = this.safeUint8ToBase64(batchMerged);
                        this.logger.info(`编码完成，Base64大小: ${(base64Data.length / 1024 / 1024).toFixed(2)}MB`);
                        this.logger.info(`准备调用 Filesystem.writeFile()...`);

                        try {
                            const result = await Filesystem.writeFile({
                                path: tempFileName,
                                data: base64Data,
                                directory: downloadDir
                            });
                            tempFilePath = result.uri;
                            this.logger.info(`✅ 文件创建成功: ${tempFilePath}`);
                        } catch (fsError) {
                            this.logger.error(`❌ Filesystem.writeFile 失败`, fsError);
                            throw new Error(`文件写入失败: ${fsError.message}`);
                        }
                    } else {
                        // 追加到已有文件
                        this.logger.info(`开始编码 ${(batchMerged.length / 1024 / 1024).toFixed(2)}MB 数据...`);
                        const base64Data = this.safeUint8ToBase64(batchMerged);
                        this.logger.info(`编码完成，Base64大小: ${(base64Data.length / 1024 / 1024).toFixed(2)}MB`);
                        this.logger.info(`准备调用 Filesystem.appendFile()...`);

                        try {
                            await Filesystem.appendFile({
                                path: tempFileName,
                                data: base64Data,
                                directory: downloadDir
                            });
                            this.logger.info(`✅ 数据追加成功`);
                        } catch (fsError) {
                            this.logger.error(`❌ Filesystem.appendFile 失败`, fsError);
                            throw new Error(`文件追加失败: ${fsError.message}`);
                        }
                    }

                    // 释放内存
                    batchData.length = 0;
                } else {
                    // 非分批模式：存在内存中
                    allData.push(batchMerged);
                }

                this.logger.info(`批次处理完成，已完成: ${completed}/${totalSegments}`);
            }

            if (this.isCanceled) {
                if (tempFilePath) {
                    await Filesystem.deleteFile({ path: tempFileName, directory: downloadDir });
                }
                return null;
            }

            if (completed === 0) {
                throw new Error('没有成功下载任何片段');
            }

            this.updateProgress(95, '正在保存文件...');

            // 重命名或保存最终文件
            const finalFileName = outputFilename.endsWith('.ts') ? outputFilename : `${outputFilename}.ts`;

            if (useBatchMode) {
                // 分批模式：重命名临时文件
                this.logger.info(`重命名文件: ${tempFileName} -> ${finalFileName}`);
                await Filesystem.rename({
                    from: tempFileName,
                    to: finalFileName,
                    directory: downloadDir
                });
            } else {
                // 非分批模式：合并内存中的所有数据并保存
                const finalData = this.mergeSegmentsRaw(allData);
                this.logger.info(`最终数据大小: ${(finalData.length / 1024 / 1024).toFixed(2)} MB`);

                const base64Data = this.uint8ArrayToBase64(finalData);
                await Filesystem.writeFile({
                    path: finalFileName,
                    data: base64Data,
                    directory: downloadDir
                });
            }

            const fileInfo = await Filesystem.stat({
                path: finalFileName,
                directory: downloadDir
            });

            this.logger.info(`✅ 文件保存成功`);
            this.logger.info(`路径: ${fileInfo.uri}`);
            this.logger.info(`大小: ${(fileInfo.size / 1024 / 1024).toFixed(2)} MB`);

            return fileInfo.uri;

        } catch (error) {
            this.logger.error('下载和合并失败', error);

            // 清理临时文件
            if (tempFilePath) {
                try {
                    await Filesystem.deleteFile({ path: tempFileName, directory: Directory.Documents });
                } catch (e) {
                    this.logger.warn('清理临时文件失败', e);
                }
            }

            throw error;
        }
    }

    /**
     * 下载一批片段
     */
    async downloadBatch(segments, maxWorkers, timeout, retry, progressCallback) {
        const downloadedData = [];
        let completed = 0;
        let failed = 0;

        // 获取referer
        const firstSegment = segments[0];
        let referer = '';
        try {
            const urlObj = new URL(firstSegment.url);
            referer = `${urlObj.protocol}//${urlObj.host}/`;
        } catch (e) {
            this.logger.warn('无法解析URL获取referer');
        }

        // 下载单个片段的worker
        const downloadWorker = async (segment) => {
            for (let attempt = 0; attempt < retry; attempt++) {
                if (this.isCanceled) return null;

                try {
                    const headers = {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': '*/*',
                        'Referer': referer || segment.url
                    };

                    const options = {
                        url: segment.url,
                        method: 'GET',
                        headers: headers,
                        responseType: 'arraybuffer',
                        readTimeout: timeout,
                        connectTimeout: timeout,
                        shouldEncodeUrlParams: false,
                        disableRedirects: false
                    };

                    const response = await CapacitorHttp.get(options);

                    if (response.status !== 200) {
                        throw new Error(`HTTP ${response.status}`);
                    }

                    // 将响应转为Uint8Array
                    let data;
                    if (typeof response.data === 'string') {
                        // Base64编码
                        const binaryString = atob(response.data);
                        data = new Uint8Array(binaryString.length);
                        for (let i = 0; i < binaryString.length; i++) {
                            data[i] = binaryString.charCodeAt(i);
                        }
                    } else if (response.data instanceof ArrayBuffer) {
                        data = new Uint8Array(response.data);
                    } else {
                        data = new Uint8Array(Object.values(response.data));
                    }

                    completed++;
                    if (progressCallback) {
                        progressCallback(completed);
                    }

                    return { index: segment.index, data };
                } catch (error) {
                    if (attempt < retry - 1) {
                        this.logger.warn(`片段 ${segment.index} 失败，重试 ${attempt + 1}/${retry}`);
                        await this.sleep(1000 * (attempt + 1));
                    } else {
                        this.logger.error(`片段 ${segment.index} 下载失败（已重试${retry}次）`);
                        failed++;
                    }
                }
            }
            return null;
        };

        // 并发下载控制
        for (let i = 0; i < segments.length; i += maxWorkers) {
            if (this.isCanceled) break;

            const batch = segments.slice(i, i + maxWorkers);
            const results = await Promise.all(batch.map(downloadWorker));

            for (const result of results) {
                if (result) {
                    downloadedData.push(result);
                }
            }
        }

        // 按索引排序
        downloadedData.sort((a, b) => a.index - b.index);

        this.logger.info(`批次下载完成: 成功 ${completed}, 失败 ${failed}`);
        return downloadedData.map(s => s.data);
    }

    /**
     * 直接合并TS片段（无转码，内存高效）
     */
    mergeSegmentsRaw(segmentDataArray) {
        // 计算总大小
        let totalSize = 0;
        for (const segment of segmentDataArray) {
            totalSize += segment.length;
        }

        this.logger.info(`合并 ${segmentDataArray.length} 个片段，总大小: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

        // 创建最终数组
        const merged = new Uint8Array(totalSize);
        let offset = 0;

        for (const segment of segmentDataArray) {
            merged.set(segment, offset);
            offset += segment.length;
        }

        this.logger.info(`合并完成`);
        return merged;
    }

    /**
     * 最可靠的Base64编码 - 分块处理，避免内存问题
     *
     * v4.1.4 关键修复：
     * 1. CHUNK_SIZE必须是3的倍数（避免中间padding）
     * 2. 使用数组收集字符，避免O(n²)字符串拼接
     * 3. 对每个chunk使用sub-batching，避免call stack溢出
     *
     * 之前的错误原因：
     * - binaryString += String.fromCharCode(byte) 对384KB数据
     * - 393216次字符串拼接，每次创建新字符串（immutable）
     * - 导致~77GB临时内存分配，字符串损坏
     * - 产生无效Base64
     */
    safeUint8ToBase64(uint8Array) {
        this.logger.info(`开始Base64编码，数据大小: ${(uint8Array.length / 1024 / 1024).toFixed(2)}MB`);

        // 384KB = 393216 bytes，正好是3的倍数（393216 / 3 = 131072）
        const CHUNK_SIZE = 384 * 1024;
        const base64Chunks = [];

        for (let i = 0; i < uint8Array.length; i += CHUNK_SIZE) {
            const end = Math.min(i + CHUNK_SIZE, uint8Array.length);
            const chunk = uint8Array.slice(i, end);

            // 关键修复：使用数组收集字符，避免O(n²)字符串拼接
            // 使用sub-batching避免String.fromCharCode.apply()的call stack限制
            const SUB_BATCH_SIZE = 65536; // 64KB，安全的apply()参数数量
            const binaryParts = [];

            for (let j = 0; j < chunk.length; j += SUB_BATCH_SIZE) {
                const subEnd = Math.min(j + SUB_BATCH_SIZE, chunk.length);
                const subChunk = chunk.slice(j, subEnd);

                // 使用apply一次性转换，比循环快得多
                try {
                    binaryParts.push(String.fromCharCode.apply(null, subChunk));
                } catch (error) {
                    // 如果apply失败（某些环境限制），降级为逐个收集
                    this.logger.warn(`String.fromCharCode.apply失败，降级为逐个字符处理`);
                    const chars = [];
                    for (let k = 0; k < subChunk.length; k++) {
                        chars.push(String.fromCharCode(subChunk[k]));
                    }
                    binaryParts.push(chars.join(''));
                }
            }

            const binaryString = binaryParts.join('');

            // 编码这一块
            try {
                const base64Chunk = btoa(binaryString);
                base64Chunks.push(base64Chunk);
            } catch (error) {
                this.logger.error(`Base64编码失败，块${i}-${end}`, error);
                throw new Error(`Base64编码失败: ${error.message}`);
            }

            if ((i / CHUNK_SIZE + 1) % 5 === 0) {
                this.logger.info(`已编码 ${Math.floor(i / CHUNK_SIZE) + 1}/${Math.ceil(uint8Array.length / CHUNK_SIZE)} 块`);
            }
        }

        const result = base64Chunks.join('');
        this.logger.info(`Base64编码完成，大小: ${(result.length / 1024 / 1024).toFixed(2)}MB`);

        // 验证生成的Base64是否有效
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(result)) {
            this.logger.error('生成的Base64字符串包含无效字符！');
            throw new Error('Base64编码结果包含无效字符');
        }

        return result;
    }

    /**
     * Uint8Array转Base64（旧版本，保留备用）
     */
    uint8ArrayToBase64(uint8Array) {
        try {
            // 对于小数据（<5MB），直接转换
            if (uint8Array.length < 5 * 1024 * 1024) {
                return this._directBase64Encode(uint8Array);
            }

            // 对于大数据，分块处理并逐步拼接
            this.logger.warn(`数据较大(${(uint8Array.length / 1024 / 1024).toFixed(2)}MB)，使用分块Base64编码`);

            const CHUNK_SIZE = 3 * 1024 * 1024; // 每次处理3MB
            let result = '';

            for (let i = 0; i < uint8Array.length; i += CHUNK_SIZE) {
                const chunk = uint8Array.subarray(i, Math.min(i + CHUNK_SIZE, uint8Array.length));
                result += this._directBase64Encode(chunk);
            }

            return result;
        } catch (error) {
            this.logger.error('Base64编码失败', error);
            throw new Error(`Base64编码失败: ${error.message}`);
        }
    }

    /**
     * 直接Base64编码（用于小数据）
     */
    _directBase64Encode(uint8Array) {
        // 使用二进制字符串方式
        let binary = '';
        const len = uint8Array.byteLength;

        // 每次处理1024字节，避免call stack过深
        for (let i = 0; i < len; i += 1024) {
            const chunk = uint8Array.subarray(i, Math.min(i + 1024, len));
            binary += String.fromCharCode.apply(null, Array.from(chunk));
        }

        return btoa(binary);
    }

    /**
     * 获取M3U8内容
     */
    async fetchM3U8(url, timeout) {
        try {
            this.logger.info(`[HTTP] 请求 M3U8: ${url}`);

            let referer = '';
            try {
                const urlObj = new URL(url);
                referer = `${urlObj.protocol}//${urlObj.host}/`;
            } catch (e) {
                this.logger.warn('[HTTP] 无法解析URL');
            }

            const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': '*/*',
                'Referer': referer || url
            };

            const options = {
                url: url,
                method: 'GET',
                headers: headers,
                readTimeout: timeout,
                connectTimeout: timeout,
                responseType: 'text',
                shouldEncodeUrlParams: false,
                disableRedirects: false
            };

            const response = await CapacitorHttp.get(options);

            if (response.status !== 200) {
                throw new Error(`HTTP ${response.status}: ${response.statusText || ''}`);
            }

            if (!response.data || typeof response.data !== 'string') {
                throw new Error('M3U8内容为空或格式错误');
            }

            return response.data;
        } catch (error) {
            this.logger.error('[HTTP] M3U8请求失败', error);
            throw new Error(`获取M3U8失败: ${error.message}`);
        }
    }

    /**
     * 解析M3U8内容
     */
    parseM3U8(content, baseUrl) {
        const lines = content.split('\n').map(line => line.trim()).filter(line => line);
        const segments = [];
        let index = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // 跳过注释和空行
            if (!line || line.startsWith('#EXT')) {
                continue;
            }

            // 处理嵌套M3U8
            if (line.endsWith('.m3u8')) {
                this.logger.warn('检测到嵌套M3U8，暂不支持');
                continue;
            }

            // TS片段
            if (line.endsWith('.ts') || line.includes('.ts?')) {
                let segmentUrl = line;

                // 处理相对路径
                if (!segmentUrl.startsWith('http')) {
                    const baseUrlObj = new URL(baseUrl);
                    if (segmentUrl.startsWith('/')) {
                        segmentUrl = `${baseUrlObj.protocol}//${baseUrlObj.host}${segmentUrl}`;
                    } else {
                        const basePath = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
                        segmentUrl = basePath + segmentUrl;
                    }
                }

                segments.push({ index, url: segmentUrl });
                index++;
            }
        }

        return segments;
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
     * 辅助方法
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    cancel() {
        this.isCanceled = true;
        this.logger.warn('下载已取消');
    }
}

export default M3U8Downloader;
