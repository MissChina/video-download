/**
 * Logger 模块 - Web 版本
 * 使用 console 和 localStorage
 */
class Logger {
    constructor() {
        this.logs = {
            runtime: [],
            download: [],
            error: []
        };
        this.maxLogs = 500;
        this.loadFromStorage();
    }

    loadFromStorage() {
        try {
            const stored = localStorage.getItem('m3u8_logs');
            if (stored) {
                this.logs = JSON.parse(stored);
            }
        } catch (e) {
            console.warn('Failed to load logs from storage');
        }
    }

    saveToStorage() {
        try {
            localStorage.setItem('m3u8_logs', JSON.stringify(this.logs));
        } catch (e) {
            console.warn('Failed to save logs to storage');
        }
    }

    formatTime() {
        const now = new Date();
        return now.toLocaleString('zh-CN', { hour12: false });
    }

    addLog(type, message, data = null) {
        const logEntry = {
            time: this.formatTime(),
            message,
            data
        };

        if (!this.logs[type]) {
            this.logs[type] = [];
        }

        this.logs[type].push(logEntry);

        // 限制日志数量
        if (this.logs[type].length > this.maxLogs) {
            this.logs[type] = this.logs[type].slice(-this.maxLogs);
        }

        this.saveToStorage();
    }

    info(message, data = null) {
        console.log(`[INFO] ${message}`, data || '');
        this.addLog('runtime', `[INFO] ${message}`, data);
    }

    warn(message, error = null) {
        console.warn(`[WARN] ${message}`, error || '');
        this.addLog('runtime', `[WARN] ${message}`, error ? error.message : null);
    }

    error(message, error = null) {
        console.error(`[ERROR] ${message}`, error || '');
        this.addLog('error', `[ERROR] ${message}`, error ? { message: error.message, stack: error.stack } : null);
    }

    fatal(message, error = null) {
        console.error(`[FATAL] ${message}`, error || '');
        this.addLog('error', `[FATAL] ${message}`, error ? { message: error.message, stack: error.stack } : null);
    }

    download(info) {
        this.addLog('download', 'Download record', info);
    }

    getRecentLogs(type = 'runtime', limit = 500) {
        const logs = this.logs[type] || [];
        return logs.slice(-limit).map(log => {
            let result = `[${log.time}] ${log.message}`;
            if (log.data) {
                result += `\n${JSON.stringify(log.data, null, 2)}`;
            }
            return result;
        }).join('\n');
    }

    clearLogs(type = null) {
        if (type) {
            this.logs[type] = [];
        } else {
            this.logs = { runtime: [], download: [], error: [] };
        }
        this.saveToStorage();
    }

    getLogDirectory() {
        return 'localStorage (Browser)';
    }
}

// 创建全局实例
const logger = new Logger();

// 导出为ES模块，同时设置为全局变量供非模块脚本使用
window.logger = logger;
export default logger;
