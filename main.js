'use strict';

const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const logger = require('./logger');

// 禁用GPU加速，提高稳定性
app.disableHardwareAcceleration();

// 移除默认菜单栏
Menu.setApplicationMenu(null);

// 应用版本
const APP_VERSION = require('./package.json').version;

// 密码哈希 (使用 SHA-256 哈希存储，而非明文)
// 原密码的哈希值，可通过配置文件或环境变量覆盖
const DEFAULT_PASSWORD_HASH = '77a54ad70ad5ff952c1d817ea33714bbae3e988efbbfa3a9d0b0045c8e3e0a14';

function hashPassword(password) {
    return crypto.createHash('sha256').update(password, 'utf8').digest('hex');
}

// 从环境变量或配置读取密码哈希
function getPasswordHash() {
    // 优先使用环境变量
    if (process.env.M3U8_LOG_PASSWORD_HASH) {
        return process.env.M3U8_LOG_PASSWORD_HASH;
    }
    // 其次读取配置文件
    const configPath = path.join(app.getPath('userData'), 'config.json');
    try {
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (config.logPasswordHash) {
                return config.logPasswordHash;
            }
        }
    } catch (error) {
        logger.warn('读取配置文件失败', error);
    }
    return DEFAULT_PASSWORD_HASH;
}

let mainWindow;
let activeDownloader = null;

// 全局错误处理
process.on('uncaughtException', (error) => {
    logger.fatal('未捕获的异常', error);
});

process.on('unhandledRejection', (reason) => {
    logger.error('未处理的Promise拒绝', new Error(String(reason)));
});

function createWindow() {
    try {
        const windowOptions = {
            width: 1000,
            height: 700,
            minWidth: 800,
            minHeight: 550,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.js'),
                sandbox: false
            }
        };

        // 只有图标文件存在时才设置图标
        const iconPath = path.join(__dirname, 'icon.ico');
        if (fs.existsSync(iconPath)) {
            windowOptions.icon = iconPath;
        }

        mainWindow = new BrowserWindow(windowOptions);

        mainWindow.loadFile('index.html').catch(error => {
            logger.fatal('加载HTML文件失败', error);
        });

        // 监听渲染进程崩溃
        mainWindow.webContents.on('render-process-gone', (event, details) => {
            logger.fatal('渲染进程崩溃', new Error(`reason: ${details.reason}, exitCode: ${details.exitCode}`));
        });

        mainWindow.on('unresponsive', () => {
            logger.error('窗口无响应');
        });

        mainWindow.on('responsive', () => {
            logger.warn('窗口已恢复响应');
        });

        mainWindow.on('closed', () => {
            mainWindow = null;
        });

    } catch (error) {
        logger.fatal('创建窗口失败', error);
        app.quit();
    }
}

// 应用准备就绪
app.whenReady().then(() => {
    createWindow();
}).catch(error => {
    logger.fatal('应用初始化失败', error);
    app.quit();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// ==================== IPC 处理器 ====================

// 选择文件夹
ipcMain.handle('select-folder', async () => {
    try {
        if (!mainWindow) {
            logger.error('主窗口不存在，无法打开文件夹选择对话框');
            return null;
        }

        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory']
        });

        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
            return null;
        }

        return result.filePaths[0];
    } catch (error) {
        logger.error('选择文件夹失败', error);
        return null;
    }
});

// 获取应用版本
ipcMain.handle('get-app-version', () => APP_VERSION);

// 获取日志目录
ipcMain.handle('get-log-dir', () => {
    try {
        return logger.getLogDirectory();
    } catch (error) {
        logger.error('获取日志目录失败', error);
        return null;
    }
});

// 获取最近的日志
ipcMain.handle('get-recent-logs', (event, type = 'runtime') => {
    try {
        return logger.getRecentLogs(type, 500);
    } catch (error) {
        logger.error('获取日志内容失败', error);
        return '无法读取日志';
    }
});

// 打开日志目录
ipcMain.handle('open-log-dir', async () => {
    try {
        const logDir = logger.getLogDirectory();
        await shell.openPath(logDir);
        return { success: true, path: logDir };
    } catch (error) {
        logger.error('打开日志目录失败', error);
        return { success: false, error: error.message };
    }
});

// 验证密码 (使用哈希比较)
ipcMain.handle('verify-log-password', (event, password) => {
    const inputHash = hashPassword(password);
    const storedHash = getPasswordHash();
    return crypto.timingSafeEqual(
        Buffer.from(inputHash, 'hex'),
        Buffer.from(storedHash, 'hex')
    );
});

// 路径操作
ipcMain.handle('path-join', (event, ...args) => path.join(...args));
ipcMain.handle('path-dirname', (event, p) => path.dirname(p));
ipcMain.handle('path-basename', (event, p, ext) => path.basename(p, ext));
ipcMain.handle('get-homedir', () => os.homedir());
ipcMain.handle('get-downloads-path', () => path.join(os.homedir(), 'Downloads'));

// 文件系统操作
ipcMain.handle('fs-exists', (event, p) => fs.existsSync(p));
ipcMain.handle('fs-mkdir', async (event, p) => {
    try {
        await fs.promises.mkdir(p, { recursive: true });
        return true;
    } catch (error) {
        logger.error('创建目录失败', error);
        return false;
    }
});

// 下载任务管理
ipcMain.handle('start-download', async (event, options) => {
    if (activeDownloader) {
        return { success: false, error: '已有任务正在运行' };
    }

    try {
        const M3U8Downloader = require('./downloader');
        activeDownloader = new M3U8Downloader();

        const { url, outputFile, threads, timeout, retry } = options;

        const success = await activeDownloader.download(url, outputFile, {
            maxWorkers: threads,
            timeout: timeout,
            retry: retry,
            progressCallback: (percent, message, metrics) => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('download-progress', {
                        percent,
                        message,
                        metrics
                    });
                }
            }
        });

        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('download-complete', { success, outputFile });
        }

        activeDownloader = null;
        return { success };

    } catch (error) {
        logger.error('下载任务失败', error);
        activeDownloader = null;

        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('download-error', { error: error.message });
        }

        return { success: false, error: error.message };
    }
});

ipcMain.handle('cancel-download', async () => {
    if (activeDownloader) {
        try {
            await activeDownloader.cancel();
            activeDownloader = null;
            return { success: true };
        } catch (error) {
            logger.warn('取消下载失败', error);
            return { success: false, error: error.message };
        }
    }
    return { success: true };
});
