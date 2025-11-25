const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Logger v6.0.1 - 完全重写版本
 *
 * 特性：
 * 1. 每次启动创建新的日志文件（按启动时间）
 * 2. 异步写入，不阻塞主进程
 * 3. 简化日志格式
 * 4. 自动清理30天前的旧日志
 */
class Logger {
    constructor() {
        // 日志目录
        this.logDir = path.join(os.homedir(), 'AppData', 'Local', 'M3U8Downloader', 'logs');

        // 当前会话的日志文件（按启动时间命名）
        const sessionTime = this.getSessionTimestamp();
        this.currentLogFile = path.join(this.logDir, `session-${sessionTime}.log`);

        // 写入队列（避免阻塞）
        this.writeQueue = [];
        this.isWriting = false;

        // 初始化
        this.init();
    }

    /**
     * 初始化日志系统
     */
    init() {
        try {
            // 确保日志目录存在
            if (!fs.existsSync(this.logDir)) {
                fs.mkdirSync(this.logDir, { recursive: true });
            }

            // 写入会话开始标记
            const startMsg = `\n${'='.repeat(80)}\n` +
                           `M3U8下载器 v6.0.1 - 会话开始\n` +
                           `启动时间: ${this.getBeijingTime()}\n` +
                           `${'='.repeat(80)}\n\n`;

            fs.writeFileSync(this.currentLogFile, startMsg, 'utf8');

            // 清理旧日志
            this.cleanOldLogs();

        } catch (error) {
            console.error('日志系统初始化失败:', error);
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
     * 获取北京时间字符串
     */
    getBeijingTime() {
        const now = new Date();
        const beijingTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
        return beijingTime.toISOString().replace('T', ' ').replace('Z', '').substring(0, 19);
    }

    /**
     * 异步写入日志（核心方法）
     */
    async writeLogAsync(content) {
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
            const batch = this.writeQueue.splice(0, 10); // 每次最多写入10条
            const content = batch.join('');

            await fs.promises.appendFile(this.currentLogFile, content, 'utf8');
        } catch (error) {
            console.error('写入日志失败:', error);
        }

        // 继续处理队列
        setImmediate(() => this.processQueue());
    }

    /**
     * 记录信息
     */
    info(message) {
        const log = `[${this.getBeijingTime()}] [INFO] ${message}\n`;
        console.log(log.trim());
        this.writeLogAsync(log);
    }

    /**
     * 记录警告
     */
    warn(message) {
        const log = `[${this.getBeijingTime()}] [WARN] ${message}\n`;
        console.warn(log.trim());
        this.writeLogAsync(log);
    }

    /**
     * 记录错误
     */
    error(message, err = null) {
        let log = `[${this.getBeijingTime()}] [ERROR] ${message}\n`;

        if (err) {
            log += `  错误: ${err.message}\n`;
            if (err.stack) {
                log += `  堆栈: ${err.stack.split('\n')[1]?.trim()}\n`;
            }
        }

        console.error(log.trim());
        this.writeLogAsync(log);
    }

    /**
     * 记录运行时信息（用户可见）
     */
    runtime(message) {
        const log = `[${this.getBeijingTime()}] ${message}\n`;
        console.log(log.trim());
        this.writeLogAsync(log);
    }

    /**
     * 记录下载记录
     */
    download(data) {
        const { url, filename, status, fileSize, duration, error } = data;

        let log = `\n${'='.repeat(60)}\n`;
        log += `[${this.getBeijingTime()}] 下载记录\n`;
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
            const files = fs.readdirSync(this.logDir);
            const now = Date.now();
            const thirtyDays = 30 * 24 * 60 * 60 * 1000;

            files.forEach(file => {
                const filePath = path.join(this.logDir, file);
                const stats = fs.statSync(filePath);

                if (now - stats.mtime.getTime() > thirtyDays) {
                    fs.unlinkSync(filePath);
                    console.log(`清理旧日志: ${file}`);
                }
            });
        } catch (error) {
            console.error('清理日志失败:', error);
        }
    }

    /**
     * 获取日志目录
     */
    getLogDirectory() {
        return this.logDir;
    }

    /**
     * 获取当前日志文件内容
     */
    getRecentLogs(type = 'current', maxLines = 500) {
        try {
            if (!fs.existsSync(this.currentLogFile)) {
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
            return fs.readdirSync(this.logDir)
                .filter(f => f.endsWith('.log'))
                .map(f => ({
                    name: f,
                    path: path.join(this.logDir, f),
                    size: fs.statSync(path.join(this.logDir, f)).size,
                    mtime: fs.statSync(path.join(this.logDir, f)).mtime
                }))
                .sort((a, b) => b.mtime - a.mtime);
        } catch (error) {
            return [];
        }
    }
}

// 导出单例
module.exports = new Logger();
