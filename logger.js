'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Logger v8.0.0 - 重构版本
 *
 * 特性：
 * 1. 每次启动创建新的日志文件（按启动时间）
 * 2. 异步写入，不阻塞主进程
 * 3. 跨平台日志目录支持
 * 4. 自动清理30天前的旧日志
 * 5. 完整的日志级别支持 (info, warn, error, fatal)
 */

// 延迟获取版本号，避免循环依赖
let APP_VERSION = null;
function getAppVersion() {
    if (APP_VERSION === null) {
        try {
            APP_VERSION = require('./package.json').version;
        } catch {
            APP_VERSION = 'unknown';
        }
    }
    return APP_VERSION;
}

class Logger {
    constructor() {
        this.logDir = this.getLogDirectory();
        this.currentLogFile = null;
        this.writeQueue = [];
        this.isWriting = false;
        this.initialized = false;
    }

    /**
     * 获取跨平台日志目录
     */
    getLogDirectory() {
        const platform = os.platform();
        const appName = 'M3U8Downloader';

        switch (platform) {
            case 'win32':
                // Windows: %LOCALAPPDATA%\M3U8Downloader\logs
                return path.join(
                    process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
                    appName,
                    'logs'
                );
            case 'darwin':
                // macOS: ~/Library/Logs/M3U8Downloader
                return path.join(os.homedir(), 'Library', 'Logs', appName);
            default:
                // Linux: ~/.local/share/M3U8Downloader/logs
                return path.join(
                    process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'),
                    appName,
                    'logs'
                );
        }
    }

    /**
     * 延迟初始化日志系统
     */
    init() {
        if (this.initialized) return;

        try {
            // 确保日志目录存在
            if (!fs.existsSync(this.logDir)) {
                fs.mkdirSync(this.logDir, { recursive: true });
            }

            // 当前会话的日志文件（按启动时间命名）
            const sessionTime = this.getSessionTimestamp();
            this.currentLogFile = path.join(this.logDir, `session-${sessionTime}.log`);

            // 写入会话开始标记
            const startMsg = `\n${'='.repeat(80)}\n` +
                `M3U8下载器 v${getAppVersion()} - 会话开始\n` +
                `启动时间: ${this.getLocalTime()}\n` +
                `平台: ${os.platform()} ${os.release()}\n` +
                `${'='.repeat(80)}\n\n`;

            fs.writeFileSync(this.currentLogFile, startMsg, 'utf8');

            // 清理旧日志
            this.cleanOldLogs();

            this.initialized = true;
        } catch (error) {
            console.error('日志系统初始化失败:', error);
        }
    }

    /**
     * 确保已初始化
     */
    ensureInit() {
        if (!this.initialized) {
            this.init();
        }
    }

    /**
     * 获取会话时间戳（用于文件名）
     */
    getSessionTimestamp() {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        const h = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        const s = String(now.getSeconds()).padStart(2, '0');
        return `${y}${m}${d}-${h}${min}${s}`;
    }

    /**
     * 获取本地时间字符串（修复时区问题）
     */
    getLocalTime() {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        const h = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        const s = String(now.getSeconds()).padStart(2, '0');
        return `${y}-${m}-${d} ${h}:${min}:${s}`;
    }

    /**
     * 异步写入日志（核心方法）
     */
    async writeLogAsync(content) {
        this.ensureInit();

        if (!this.currentLogFile) {
            console.log(content);
            return;
        }

        this.writeQueue.push(content);

        if (!this.isWriting) {
            this.processQueue();
        }
    }

    /**
     * 处理写入队列
     */
    async processQueue() {
        if (this.writeQueue.length === 0) {
            this.isWriting = false;
            return;
        }

        this.isWriting = true;

        try {
            const batch = this.writeQueue.splice(0, 10);
            const content = batch.join('');

            await fs.promises.appendFile(this.currentLogFile, content, 'utf8');
        } catch (error) {
            console.error('写入日志失败:', error);
        }

        // 继续处理队列
        setImmediate(() => this.processQueue());
    }

    /**
     * 格式化日志消息
     */
    formatMessage(level, message, err = null) {
        let log = `[${this.getLocalTime()}] [${level}] ${message}\n`;

        if (err) {
            log += `  错误: ${err.message || err}\n`;
            if (err.stack) {
                const stackLine = err.stack.split('\n')[1]?.trim();
                if (stackLine) {
                    log += `  堆栈: ${stackLine}\n`;
                }
            }
        }

        return log;
    }

    /**
     * 记录信息
     */
    info(message) {
        const log = this.formatMessage('INFO', message);
        console.log(log.trim());
        this.writeLogAsync(log);
    }

    /**
     * 记录警告
     */
    warn(message, err = null) {
        const log = this.formatMessage('WARN', message, err);
        console.warn(log.trim());
        this.writeLogAsync(log);
    }

    /**
     * 记录错误
     */
    error(message, err = null) {
        const log = this.formatMessage('ERROR', message, err);
        console.error(log.trim());
        this.writeLogAsync(log);
    }

    /**
     * 记录致命错误
     */
    fatal(message, err = null) {
        const log = this.formatMessage('FATAL', message, err);
        console.error(log.trim());
        this.writeLogAsync(log);
    }

    /**
     * 记录运行时信息（用户可见）
     */
    runtime(message) {
        const log = `[${this.getLocalTime()}] ${message}\n`;
        console.log(log.trim());
        this.writeLogAsync(log);
    }

    /**
     * 记录下载记录
     */
    download(data) {
        this.ensureInit();

        const { url, filename, status, fileSize, duration, error } = data;

        let log = `\n${'='.repeat(60)}\n`;
        log += `[${this.getLocalTime()}] 下载记录\n`;
        log += `状态: ${status}\n`;
        log += `文件: ${filename}\n`;

        if (fileSize) {
            log += `大小: ${(fileSize / 1024 / 1024).toFixed(2)} MB\n`;
        }

        if (duration) {
            log += `耗时: ${duration}\n`;
        }

        if (error) {
            log += `错误: ${error}\n`;
        }

        log += `链接: ${url}\n`;
        log += `${'='.repeat(60)}\n\n`;

        console.log(log);
        this.writeLogAsync(log);
    }

    /**
     * 清理30天前的旧日志
     */
    cleanOldLogs() {
        try {
            if (!fs.existsSync(this.logDir)) {
                return;
            }

            const files = fs.readdirSync(this.logDir);
            const now = Date.now();
            const thirtyDays = 30 * 24 * 60 * 60 * 1000;

            files.forEach(file => {
                if (!file.endsWith('.log')) return;

                const filePath = path.join(this.logDir, file);
                try {
                    const stats = fs.statSync(filePath);
                    if (now - stats.mtime.getTime() > thirtyDays) {
                        fs.unlinkSync(filePath);
                        console.log(`清理旧日志: ${file}`);
                    }
                } catch (error) {
                    // 忽略单个文件的错误
                }
            });
        } catch (error) {
            console.error('清理日志失败:', error);
        }
    }

    /**
     * 获取当前日志文件内容
     */
    getRecentLogs(type = 'current', maxLines = 500) {
        this.ensureInit();

        try {
            if (!this.currentLogFile || !fs.existsSync(this.currentLogFile)) {
                return '暂无日志';
            }

            const content = fs.readFileSync(this.currentLogFile, 'utf8');
            const lines = content.split('\n');

            if (lines.length <= maxLines) {
                return content;
            }

            return lines.slice(-maxLines).join('\n');
        } catch (error) {
            return `读取日志失败: ${error.message}`;
        }
    }

    /**
     * 获取所有日志文件
     */
    getAllLogFiles() {
        try {
            if (!fs.existsSync(this.logDir)) {
                return [];
            }

            return fs.readdirSync(this.logDir)
                .filter(f => f.endsWith('.log'))
                .map(f => {
                    const filePath = path.join(this.logDir, f);
                    const stats = fs.statSync(filePath);
                    return {
                        name: f,
                        path: filePath,
                        size: stats.size,
                        mtime: stats.mtime
                    };
                })
                .sort((a, b) => b.mtime - a.mtime);
        } catch (error) {
            return [];
        }
    }
}

// 导出单例
module.exports = new Logger();
