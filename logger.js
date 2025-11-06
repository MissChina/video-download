const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * 日志记录器
 * 记录错误、警告、运行日志和下载记录信息
 */
class Logger {
    constructor() {
        // 日志目录：用户目录/AppData/Local/M3U8Downloader/logs
        this.logDir = path.join(os.homedir(), 'AppData', 'Local', 'M3U8Downloader', 'logs');
        this.maxLogSize = 10 * 1024 * 1024; // 10MB
        this.maxLogFiles = 10; // 最多保留10个日志文件

        this.ensureLogDir();
    }

    // 确保日志目录存在
    ensureLogDir() {
        try {
            if (!fs.existsSync(this.logDir)) {
                fs.mkdirSync(this.logDir, { recursive: true });
            }
        } catch (error) {
            console.error('无法创建日志目录:', error);
        }
    }

    // 获取当前日志文件路径
    getCurrentLogFile(type = 'error') {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        return path.join(this.logDir, `${type}-${today}.log`);
    }

    // 格式化错误信息
    formatError(level, message, error = null) {
        const timestamp = new Date().toISOString();
        let logEntry = `[${timestamp}] [${level}] ${message}`;

        if (error) {
            logEntry += `\n错误详情: ${error.message}`;
            if (error.stack) {
                logEntry += `\n堆栈信息:\n${error.stack}`;
            }
        }

        logEntry += '\n' + '-'.repeat(80) + '\n';
        return logEntry;
    }

    // 写入日志
    writeLog(content, type = 'error') {
        try {
            const logFile = this.getCurrentLogFile(type);

            // 检查文件大小，如果超过限制则轮转
            if (fs.existsSync(logFile)) {
                const stats = fs.statSync(logFile);
                if (stats.size > this.maxLogSize) {
                    this.rotateLog(logFile);
                }
            }

            // 追加日志
            fs.appendFileSync(logFile, content, 'utf8');

            // 清理旧日志
            this.cleanOldLogs(type);
        } catch (error) {
            console.error('写入日志失败:', error);
        }
    }

    // 日志轮转
    rotateLog(logFile) {
        try {
            const timestamp = Date.now();
            const newName = logFile.replace('.log', `-${timestamp}.log`);
            fs.renameSync(logFile, newName);
        } catch (error) {
            console.error('日志轮转失败:', error);
        }
    }

    // 清理旧日志（只保留最近的几个文件）
    cleanOldLogs(type = 'error') {
        try {
            const files = fs.readdirSync(this.logDir)
                .filter(f => f.startsWith(`${type}-`) && f.endsWith('.log'))
                .map(f => ({
                    name: f,
                    path: path.join(this.logDir, f),
                    time: fs.statSync(path.join(this.logDir, f)).mtime.getTime()
                }))
                .sort((a, b) => b.time - a.time);

            // 删除超出数量限制的旧文件
            if (files.length > this.maxLogFiles) {
                files.slice(this.maxLogFiles).forEach(file => {
                    try {
                        fs.unlinkSync(file.path);
                    } catch (e) {
                        console.error('删除旧日志失败:', e);
                    }
                });
            }
        } catch (error) {
            console.error('清理旧日志失败:', error);
        }
    }

    // 记录错误
    error(message, error = null) {
        const logContent = this.formatError('ERROR', message, error);
        this.writeLog(logContent);
        console.error(logContent);
    }

    // 记录致命错误
    fatal(message, error = null) {
        const logContent = this.formatError('FATAL', message, error);
        this.writeLog(logContent);
        console.error(logContent);
    }

    // 记录警告（失败但不是严重错误）
    warn(message, error = null) {
        const logContent = this.formatError('WARN', message, error);
        this.writeLog(logContent);
        console.warn(logContent);
    }

    // 记录信息（正常的进度和状态）
    info(message) {
        const timestamp = new Date().toISOString();
        const logContent = `[${timestamp}] [INFO] ${message}\n`;
        this.writeLog(logContent, 'error');
        console.log(logContent);
    }

    // 记录运行日志（详细的运行时信息）
    runtime(message) {
        const timestamp = new Date().toISOString();
        const logContent = `[${timestamp}] ${message}\n`;
        this.writeLog(logContent, 'runtime');
        console.log(logContent);
    }

    // 记录下载记录
    download(data) {
        const timestamp = new Date().toISOString();
        const { url, filename, outputPath, status, fileSize, duration, threadCount, error } = data;

        let logContent = `\n${'='.repeat(80)}\n`;
        logContent += `[${timestamp}]\n`;
        logContent += `状态: ${status}\n`;
        logContent += `文件名: ${filename}\n`;
        logContent += `保存路径: ${outputPath}\n`;
        logContent += `视频链接: ${url}\n`;
        logContent += `线程数: ${threadCount || 'N/A'}\n`;

        if (fileSize) {
            logContent += `文件大小: ${(fileSize / 1024 / 1024).toFixed(2)} MB\n`;
        }

        if (duration) {
            logContent += `耗时: ${duration}\n`;
        }

        if (error) {
            logContent += `错误信息: ${error}\n`;
        }

        logContent += `${'='.repeat(80)}\n`;

        this.writeLog(logContent, 'download');
        console.log(logContent);
    }

    // 获取日志目录路径（用于用户查看）
    getLogDirectory() {
        return this.logDir;
    }

    // 读取最新的日志内容（最多1000行）
    getRecentLogs(type = 'error', maxLines = 1000) {
        try {
            const logFile = this.getCurrentLogFile(type);
            if (!fs.existsSync(logFile)) {
                return `暂无${type === 'error' ? '错误' : type === 'runtime' ? '运行' : '下载记录'}日志`;
            }

            const content = fs.readFileSync(logFile, 'utf8');
            const lines = content.split('\n');

            if (lines.length <= maxLines) {
                return content;
            }

            return lines.slice(-maxLines).join('\n');
        } catch (error) {
            return `读取日志失败: ${error.message}`;
        }
    }

    // 获取所有日志文件列表
    getAllLogFiles() {
        try {
            const files = fs.readdirSync(this.logDir)
                .filter(f => f.endsWith('.log'))
                .map(f => ({
                    name: f,
                    path: path.join(this.logDir, f),
                    size: fs.statSync(path.join(this.logDir, f)).size,
                    mtime: fs.statSync(path.join(this.logDir, f)).mtime
                }))
                .sort((a, b) => b.mtime - a.mtime);

            return files;
        } catch (error) {
            console.error('获取日志文件列表失败:', error);
            return [];
        }
    }
}

// 导出单例
module.exports = new Logger();
