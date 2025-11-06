const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { exec } = require('child_process');
const execPromise = promisify(exec);

/**
 * FFmpeg 安装管理器
 * 自动下载、解压和配置 FFmpeg
 */
class FFmpegInstaller {
    constructor() {
        // FFmpeg 安装目录：应用数据目录
        this.appDataDir = path.join(require('os').homedir(), 'AppData', 'Local', 'M3U8Downloader');
        this.ffmpegDir = path.join(this.appDataDir, 'ffmpeg');
        this.ffmpegBin = path.join(this.ffmpegDir, 'bin');
        this.ffmpegExe = path.join(this.ffmpegBin, 'ffmpeg.exe');

        // FFmpeg 下载源列表（按优先级排序）
        // 用户可以替换为自己的下载链接
        this.downloadUrls = [
            // 国内镜像（用户自行提供）- 最快
            // 'https://你的cdn.com/ffmpeg-master-latest-win64-gpl.zip',

            // GitHub Release - 官方源
            'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',

            // GitHub 镜像站（备用）
            'https://ghproxy.com/https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',

            // 可添加更多备用源...
        ];

        this.currentUrlIndex = 0;
    }

    // 确保目录存在
    ensureDir(dir) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    // 检查FFmpeg是否已安装
    async checkInstalled() {
        try {
            // 检查本地安装
            if (fs.existsSync(this.ffmpegExe)) {
                return { installed: true, path: this.ffmpegExe };
            }

            // 检查系统PATH
            await execPromise('ffmpeg -version', { timeout: 3000 });
            return { installed: true, path: 'system' };
        } catch (error) {
            return { installed: false };
        }
    }

    // 尝试从多个源下载
    async downloadWithFallback(destPath, onProgress) {
        const errors = [];

        for (let i = 0; i < this.downloadUrls.length; i++) {
            const url = this.downloadUrls[i];

            // 跳过注释的URL
            if (url.trim().startsWith('//')) continue;

            try {
                onProgress({
                    stage: 'download',
                    message: `正在从源 ${i + 1} 下载...`,
                    percent: 0
                });

                await this.downloadFile(url, destPath, (percent, downloaded, total) => {
                    const sizeMB = (downloaded / 1024 / 1024).toFixed(1);
                    const totalMB = (total / 1024 / 1024).toFixed(1);
                    onProgress({
                        stage: 'download',
                        message: `下载中 (源${i + 1})... ${sizeMB}MB / ${totalMB}MB`,
                        percent
                    });
                });

                // 下载成功
                return destPath;

            } catch (error) {
                errors.push({ url, error: error.message });

                // 如果不是最后一个源，尝试下一个
                if (i < this.downloadUrls.length - 1) {
                    onProgress({
                        stage: 'download',
                        message: `源 ${i + 1} 失败，尝试下一个源...`,
                        percent: 0
                    });
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }

        // 所有源都失败
        throw new Error(`所有下载源均失败:\n${errors.map(e => `${e.url}: ${e.error}`).join('\n')}`);
    }
    downloadFile(url, destPath, onProgress) {
        return new Promise((resolve, reject) => {
            const protocol = url.startsWith('https') ? https : http;
            const file = fs.createWriteStream(destPath);

            protocol.get(url, (response) => {
                // 处理重定向
                if (response.statusCode === 302 || response.statusCode === 301) {
                    file.close();
                    fs.unlinkSync(destPath);
                    return this.downloadFile(response.headers.location, destPath, onProgress)
                        .then(resolve)
                        .catch(reject);
                }

                if (response.statusCode !== 200) {
                    file.close();
                    fs.unlinkSync(destPath);
                    return reject(new Error(`下载失败: HTTP ${response.statusCode}`));
                }

                const totalSize = parseInt(response.headers['content-length'], 10);
                let downloadedSize = 0;

                response.on('data', (chunk) => {
                    downloadedSize += chunk.length;
                    if (onProgress && totalSize) {
                        const percent = Math.floor((downloadedSize / totalSize) * 100);
                        onProgress(percent, downloadedSize, totalSize);
                    }
                });

                response.pipe(file);

                file.on('finish', () => {
                    file.close();
                    resolve(destPath);
                });
            }).on('error', (err) => {
                fs.unlinkSync(destPath);
                reject(err);
            });
        });
    }

    // 解压ZIP文件（Windows）
    async extractZip(zipPath, destDir) {
        this.ensureDir(destDir);

        // 使用PowerShell解压
        const psCommand = `
            Add-Type -AssemblyName System.IO.Compression.FileSystem;
            [System.IO.Compression.ZipFile]::ExtractToDirectory('${zipPath}', '${destDir}')
        `.replace(/\n/g, '');

        try {
            await execPromise(`powershell -Command "${psCommand}"`, { timeout: 60000 });
        } catch (error) {
            throw new Error(`解压失败: ${error.message}`);
        }
    }

    // 安装FFmpeg
    async install(onProgress) {
        try {
            onProgress({ stage: 'check', message: '检查现有安装...' });

            // 检查是否已安装
            const check = await this.checkInstalled();
            if (check.installed) {
                onProgress({ stage: 'complete', message: 'FFmpeg 已安装' });
                return { success: true, message: 'FFmpeg 已安装' };
            }

            // 创建目录
            this.ensureDir(this.appDataDir);
            this.ensureDir(this.ffmpegDir);

            const zipPath = path.join(this.appDataDir, 'ffmpeg.zip');

            // 下载FFmpeg（尝试多个源）
            onProgress({ stage: 'download', message: '正在下载 FFmpeg...', percent: 0 });

            await this.downloadWithFallback(zipPath, onProgress);

            // 解压
            onProgress({ stage: 'extract', message: '正在解压...', percent: 50 });
            await this.extractZip(zipPath, this.ffmpegDir);

            // 查找解压后的ffmpeg.exe
            onProgress({ stage: 'setup', message: '正在配置...', percent: 80 });

            // FFmpeg解压后通常在一个子目录中
            const extractedDirs = fs.readdirSync(this.ffmpegDir);
            const ffmpegFolder = extractedDirs.find(d => d.startsWith('ffmpeg-'));

            if (ffmpegFolder) {
                const sourceBin = path.join(this.ffmpegDir, ffmpegFolder, 'bin');
                if (fs.existsSync(sourceBin)) {
                    // 复制bin目录下的文件到目标位置
                    this.ensureDir(this.ffmpegBin);
                    const binFiles = fs.readdirSync(sourceBin);
                    for (const file of binFiles) {
                        fs.copyFileSync(
                            path.join(sourceBin, file),
                            path.join(this.ffmpegBin, file)
                        );
                    }
                }
            }

            // 清理下载文件
            fs.unlinkSync(zipPath);

            // 验证安装
            if (!fs.existsSync(this.ffmpegExe)) {
                throw new Error('FFmpeg 安装失败：未找到可执行文件');
            }

            // 添加到PATH（当前进程）
            process.env.PATH = `${this.ffmpegBin};${process.env.PATH}`;

            onProgress({ stage: 'complete', message: '安装完成！', percent: 100 });

            return {
                success: true,
                message: 'FFmpeg 安装成功',
                path: this.ffmpegExe
            };

        } catch (error) {
            onProgress({ stage: 'error', message: error.message });
            throw error;
        }
    }

    // 卸载FFmpeg
    async uninstall() {
        try {
            if (fs.existsSync(this.ffmpegDir)) {
                // 递归删除目录
                fs.rmSync(this.ffmpegDir, { recursive: true, force: true });
            }
            return { success: true, message: 'FFmpeg 已卸载' };
        } catch (error) {
            throw new Error(`卸载失败: ${error.message}`);
        }
    }

    // 获取FFmpeg路径
    getFFmpegPath() {
        if (fs.existsSync(this.ffmpegExe)) {
            return this.ffmpegExe;
        }
        return 'ffmpeg'; // 使用系统PATH中的
    }
}

module.exports = FFmpegInstaller;
