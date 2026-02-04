'use strict';

const { contextBridge, ipcRenderer, clipboard } = require('electron');

/**
 * Preload 脚本 - 安全地暴露 API 给渲染进程
 * 启用 contextIsolation 后，渲染进程无法直接访问 Node.js API
 * 通过 contextBridge 暴露安全的接口
 */

contextBridge.exposeInMainWorld('electronAPI', {
    // 文件夹选择
    selectFolder: () => ipcRenderer.invoke('select-folder'),

    // 日志相关
    getLogDir: () => ipcRenderer.invoke('get-log-dir'),
    getRecentLogs: (type) => ipcRenderer.invoke('get-recent-logs', type),
    openLogDir: () => ipcRenderer.invoke('open-log-dir'),
    verifyLogPassword: (password) => ipcRenderer.invoke('verify-log-password', password),

    // 剪贴板
    readClipboard: () => clipboard.readText(),

    // 系统信息
    getPlatform: () => process.platform,
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),

    // 内存信息
    getMemoryInfo: async () => {
        try {
            const info = await process.getProcessMemoryInfo();
            return info?.residentSet ? info.residentSet * 1024 : 0;
        } catch {
            return 0;
        }
    },

    // 文件系统操作 (安全封装)
    pathJoin: (...args) => ipcRenderer.invoke('path-join', ...args),
    pathDirname: (p) => ipcRenderer.invoke('path-dirname', p),
    pathBasename: (p, ext) => ipcRenderer.invoke('path-basename', p, ext),
    fsExists: (p) => ipcRenderer.invoke('fs-exists', p),
    fsMkdir: (p) => ipcRenderer.invoke('fs-mkdir', p),
    getHomedir: () => ipcRenderer.invoke('get-homedir'),
    getDownloadsPath: () => ipcRenderer.invoke('get-downloads-path'),

    // 下载任务
    startDownload: (options) => ipcRenderer.invoke('start-download', options),
    cancelDownload: () => ipcRenderer.invoke('cancel-download'),

    // 下载进度监听
    onDownloadProgress: (callback) => {
        const handler = (event, data) => callback(data);
        ipcRenderer.on('download-progress', handler);
        return () => ipcRenderer.removeListener('download-progress', handler);
    },

    onDownloadComplete: (callback) => {
        const handler = (event, data) => callback(data);
        ipcRenderer.on('download-complete', handler);
        return () => ipcRenderer.removeListener('download-complete', handler);
    },

    onDownloadError: (callback) => {
        const handler = (event, data) => callback(data);
        ipcRenderer.on('download-error', handler);
        return () => ipcRenderer.removeListener('download-error', handler);
    }
});

// 暴露安全的 console 包装
contextBridge.exposeInMainWorld('logger', {
    log: (...args) => console.log(...args),
    warn: (...args) => console.warn(...args),
    error: (...args) => console.error(...args)
});
