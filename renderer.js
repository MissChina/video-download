'use strict';

/**
 * Renderer.js v8.1.0
 * 渲染进程 - 使用 preload 暴露的安全 API
 */

// 全局状态
const state = {
    currentTab: 'download',
    threadCount: 16,
    isDownloading: false,
    currentLogType: 'runtime',
    isLogUnlocked: false,
    memoryIdleTimer: null,
    appVersion: '0.0.0',
    defaultSavePath: ''
};

// DOM 元素缓存
let elements = {};

// 事件监听器清理函数
let cleanupFunctions = [];

// ==================== 初始化 ====================

async function init() {
    try {
        // 获取应用版本
        state.appVersion = await window.electronAPI.getAppVersion();

        // 获取默认下载路径
        state.defaultSavePath = await window.electronAPI.getDownloadsPath();

        // 缓存 DOM 元素
        cacheElements();

        // 从本地存储恢复设置
        loadStoredSettings();

        // 绑定事件
        bindEvents();

        // 设置 IPC 监听
        setupIpcListeners();

        // 初始化 UI
        updateVersionDisplay();
        syncThreadSetting();
        resetStats();
        initMemoryMonitor();
        switchTab(state.currentTab);

        // 初始日志
        addLog(`欢迎使用 M3U8 视频下载器 v${state.appVersion}`);
        addLog('自研高速封装管线已启用，无需 FFmpeg');
        addLog('请输入视频链接，然后点击开始下载');
        setStatus('就绪');

    } catch (error) {
        console.error('初始化失败:', error);
        alert('应用初始化失败，请查看控制台');
    }
}

function cacheElements() {
    elements = {
        versionLabel: document.getElementById('version-label'),
        aboutVersion: document.getElementById('about-version'),
        footerStatus: document.getElementById('footer-status'),
        tabBtns: Array.from(document.querySelectorAll('.tab-btn')),
        tabPanels: Array.from(document.querySelectorAll('.tab-panel')),
        urlInput: document.getElementById('url-input'),
        savePathInput: document.getElementById('save-path'),
        filenameInput: document.getElementById('filename'),
        threadCountInput: document.getElementById('thread-count'),
        pasteBtn: document.getElementById('paste-btn'),
        clearBtn: document.getElementById('clear-btn'),
        browseBtn: document.getElementById('browse-btn'),
        decreaseBtn: document.getElementById('decrease-btn'),
        increaseBtn: document.getElementById('increase-btn'),
        startBtn: document.getElementById('start-btn'),
        stopBtn: document.getElementById('stop-btn'),
        clearLogBtn: document.getElementById('clear-log-btn'),
        logBox: document.getElementById('log-box'),
        statusText: document.getElementById('status-text'),
        progressPercent: document.getElementById('progress-percent'),
        progressFill: document.getElementById('progress-fill'),
        statSpeed: document.getElementById('stat-speed'),
        statAverage: document.getElementById('stat-average'),
        statDownloaded: document.getElementById('stat-downloaded'),
        statSegments: document.getElementById('stat-segments'),
        statMemory: document.getElementById('stat-memory'),
        statRuntime: document.getElementById('stat-runtime'),
        timeoutInput: document.getElementById('timeout'),
        retryInput: document.getElementById('retry'),
        logPassword: document.getElementById('log-password'),
        passwordSection: document.getElementById('password-section'),
        logsContent: document.getElementById('logs-content'),
        logTypeBtns: Array.from(document.querySelectorAll('.log-type-btn')),
        logTypeLabel: document.getElementById('log-type-label'),
        logContent: document.getElementById('log-content'),
        refreshLogsBtn: document.getElementById('refresh-logs-btn'),
        openLogDirBtn: document.getElementById('open-log-dir-btn'),
        unlockLogsBtn: document.getElementById('unlock-logs-btn'),
        saveSettingsBtn: document.getElementById('save-settings-btn')
    };
}

function loadStoredSettings() {
    // 线程数
    const storedThread = parseInt(localStorage.getItem('threadCount'), 10);
    if (Number.isInteger(storedThread) && storedThread >= 1 && storedThread <= 64) {
        state.threadCount = storedThread;
    }

    // 保存路径
    const storedPath = localStorage.getItem('savePath');
    if (elements.savePathInput) {
        elements.savePathInput.value = storedPath || state.defaultSavePath;
    }

    // 其他设置
    const savedSettings = localStorage.getItem('settings');
    if (savedSettings) {
        try {
            const settings = JSON.parse(savedSettings);
            if (elements.timeoutInput) elements.timeoutInput.value = settings.timeout || 30;
            if (elements.retryInput) elements.retryInput.value = settings.retry || 3;
        } catch (e) {
            // 忽略解析错误
        }
    }
}

function updateVersionDisplay() {
    if (elements.versionLabel) {
        elements.versionLabel.textContent = `v${state.appVersion}`;
    }
    if (elements.aboutVersion) {
        elements.aboutVersion.textContent = `Version ${state.appVersion}`;
    }
}

// ==================== 事件绑定 ====================

function bindEvents() {
    // 标签页切换
    elements.tabBtns.forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // 下载控制
    bindClick(elements.pasteBtn, pasteUrl);
    bindClick(elements.clearBtn, clearUrl);
    bindClick(elements.browseBtn, browseFolder);
    bindClick(elements.startBtn, startDownload);
    bindClick(elements.stopBtn, stopDownload);
    bindClick(elements.clearLogBtn, clearLog);

    // 线程控制
    bindClick(elements.decreaseBtn, decreaseThread);
    bindClick(elements.increaseBtn, increaseThread);

    // 设置
    bindClick(elements.saveSettingsBtn, saveSettings);

    // 日志功能
    bindClick(elements.unlockLogsBtn, unlockLogs);
    bindClick(elements.refreshLogsBtn, refreshLogs);
    bindClick(elements.openLogDirBtn, openLogDirectory);

    elements.logTypeBtns.forEach(btn => {
        btn.addEventListener('click', () => switchLogType(btn.dataset.logType));
    });

    // 回车键开始下载
    if (elements.urlInput) {
        elements.urlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !state.isDownloading) {
                startDownload();
            }
        });
    }

    // 按钮初始状态
    if (elements.stopBtn) elements.stopBtn.disabled = true;
}

function bindClick(element, handler) {
    if (element) {
        element.addEventListener('click', () => safeCall(handler));
    }
}

function setupIpcListeners() {
    // 下载进度
    const cleanupProgress = window.electronAPI.onDownloadProgress((data) => {
        updateProgress(data.percent, data.message, data.metrics);
    });
    cleanupFunctions.push(cleanupProgress);

    // 下载完成
    const cleanupComplete = window.electronAPI.onDownloadComplete((data) => {
        if (data.success) {
            addLog(`🎉 下载完成: ${data.outputFile}`);
            updateProgress(100, '✅ 下载完成');
        } else {
            addLog('❌ 下载失败或已取消');
            updateProgress(0, '下载失败');
        }
        finishDownload();
    });
    cleanupFunctions.push(cleanupComplete);

    // 下载错误
    const cleanupError = window.electronAPI.onDownloadError((data) => {
        addLog(`❌ 下载错误: ${data.error}`);
        updateProgress(0, '下载失败');
        finishDownload();
    });
    cleanupFunctions.push(cleanupError);
}

// ==================== 标签页 ====================

function switchTab(tab) {
    state.currentTab = tab;

    elements.tabBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    elements.tabPanels.forEach(panel => {
        panel.classList.toggle('active', panel.id === tab);
    });

    setStatus(`当前页面: ${getTabName(tab)}`);
}

function getTabName(tab) {
    const names = { download: '下载', settings: '设置', about: '关于', logs: '日志查看' };
    return names[tab] || '下载';
}

// ==================== URL 操作 ====================

async function pasteUrl() {
    try {
        const text = window.electronAPI.readClipboard();
        if (text) {
            elements.urlInput.value = text.trim();
            addLog('已粘贴链接');
        } else {
            addLog('剪贴板为空');
        }
    } catch (error) {
        addLog('❌ 粘贴失败');
    }
}

function clearUrl() {
    if (elements.urlInput) {
        elements.urlInput.value = '';
        addLog('已清空链接');
    }
}

// ==================== 文件夹选择 ====================

async function browseFolder() {
    try {
        const folder = await window.electronAPI.selectFolder();
        if (folder) {
            elements.savePathInput.value = folder;
            localStorage.setItem('savePath', folder);
            addLog(`已选择目录: ${folder}`);
        }
    } catch (error) {
        addLog('❌ 选择文件夹失败');
    }
}

// ==================== 线程控制 ====================

function syncThreadSetting() {
    if (elements.threadCountInput) {
        elements.threadCountInput.value = state.threadCount;
    }
    localStorage.setItem('threadCount', String(state.threadCount));
}

function decreaseThread() {
    if (state.threadCount > 1) {
        state.threadCount--;
        syncThreadSetting();
    }
}

function increaseThread() {
    if (state.threadCount < 64) {
        state.threadCount++;
        syncThreadSetting();
    }
}

// ==================== 日志显示 ====================

function addLog(message) {
    const now = new Date();
    const time = now.toLocaleTimeString('zh-CN', { hour12: false });

    if (!elements.logBox) {
        console.log(`[${time}] ${message}`);
        return;
    }

    const logLine = document.createElement('div');
    logLine.className = 'log-line';
    logLine.textContent = `[${time}] ${message}`;
    elements.logBox.appendChild(logLine);
    elements.logBox.scrollTop = elements.logBox.scrollHeight;

    setStatus(message);
}

function clearLog() {
    if (elements.logBox) {
        elements.logBox.innerHTML = '';
        addLog('日志已清除');
    }
}

function setStatus(text) {
    if (elements.statusText) {
        elements.statusText.textContent = text || '';
    }
    if (elements.footerStatus) {
        elements.footerStatus.textContent = text || '';
    }
}

// ==================== 进度更新 ====================

function updateProgress(percent, status, metrics = null) {
    const safePercent = Math.min(Math.max(Math.round(percent), 0), 100);

    if (elements.progressPercent) {
        elements.progressPercent.textContent = `${safePercent}%`;
    }
    if (elements.progressFill) {
        elements.progressFill.style.width = `${safePercent}%`;
    }

    setStatus(status);

    if (metrics) {
        updateStats(metrics);
    }
}

// ==================== 下载控制 ====================

async function startDownload() {
    const url = elements.urlInput?.value?.trim();

    if (!url) {
        setStatus('❌ 请输入视频链接');
        addLog('❌ 错误: 请输入视频链接');
        return;
    }

    if (!url.toLowerCase().startsWith('http')) {
        setStatus('❌ 请输入有效的 HTTP 链接');
        addLog('❌ 错误: 请输入有效的HTTP链接');
        return;
    }

    const savePath = elements.savePathInput?.value || state.defaultSavePath;
    const filename = elements.filenameInput?.value || 'video';
    const timeout = parseInt(elements.timeoutInput?.value || '30') * 1000;
    const retry = parseInt(elements.retryInput?.value || '3');

    // 确保保存目录存在
    const pathExists = await window.electronAPI.fsExists(savePath);
    if (!pathExists) {
        const created = await window.electronAPI.fsMkdir(savePath);
        if (!created) {
            addLog('❌ 保存目录无效或无法创建');
            return;
        }
    }

    localStorage.setItem('savePath', savePath);

    const outputFile = await window.electronAPI.pathJoin(savePath, `${filename}.mp4`);

    // 更新 UI 状态
    state.isDownloading = true;
    if (elements.startBtn) elements.startBtn.disabled = true;
    if (elements.stopBtn) elements.stopBtn.disabled = false;

    setStatus('🚀 正在开始下载');
    addLog(`🚀 开始下载: ${url}`);
    addLog(`📁 保存到: ${outputFile}`);
    addLog(`⚡ 使用 ${state.threadCount} 个线程`);

    resetStats();
    updateProgress(0, '正在解析M3U8...');

    // 发起下载请求
    try {
        await window.electronAPI.startDownload({
            url,
            outputFile,
            threads: state.threadCount,
            timeout,
            retry
        });
    } catch (error) {
        addLog(`❌ 启动下载失败: ${error.message}`);
        finishDownload();
    }
}

async function stopDownload() {
    try {
        await window.electronAPI.cancelDownload();
        addLog('⏹ 下载已停止');
        updateProgress(0, '已停止');
    } catch (error) {
        addLog('❌ 停止下载失败');
    }
    finishDownload();
}

function finishDownload() {
    state.isDownloading = false;
    if (elements.startBtn) elements.startBtn.disabled = false;
    if (elements.stopBtn) elements.stopBtn.disabled = true;
}

// ==================== 设置 ====================

function saveSettings() {
    const timeout = elements.timeoutInput?.value || '30';
    const retry = elements.retryInput?.value || '3';

    const settings = {
        timeout: parseInt(timeout),
        retry: parseInt(retry)
    };

    localStorage.setItem('settings', JSON.stringify(settings));

    addLog('💾 设置已保存');
    setStatus('设置已保存');

    setTimeout(() => setStatus('就绪'), 2000);
}

// ==================== 日志查看功能 ====================

async function unlockLogs() {
    const password = elements.logPassword?.value;

    if (!password) {
        alert('请输入密码');
        return;
    }

    try {
        const isValid = await window.electronAPI.verifyLogPassword(password);

        if (isValid) {
            state.isLogUnlocked = true;
            if (elements.passwordSection) elements.passwordSection.style.display = 'none';
            if (elements.logsContent) elements.logsContent.style.display = 'block';

            await refreshLogs();
            setStatus('日志已解锁');
        } else {
            alert('密码错误！');
            if (elements.logPassword) {
                elements.logPassword.value = '';
                elements.logPassword.focus();
            }
        }
    } catch (error) {
        alert('验证失败，请重试');
    }
}

async function switchLogType(type) {
    state.currentLogType = type;

    elements.logTypeBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.logType === type);
    });

    const labels = {
        'runtime': '运行日志',
        'download': '下载记录',
        'error': '错误日志'
    };

    if (elements.logTypeLabel) {
        elements.logTypeLabel.textContent = labels[type] || '日志';
    }

    await refreshLogs();
}

async function refreshLogs() {
    if (!state.isLogUnlocked) return;

    try {
        if (elements.logContent) {
            elements.logContent.textContent = '加载中...';
        }

        const logContent = await window.electronAPI.getRecentLogs(state.currentLogType);

        if (elements.logContent) {
            elements.logContent.textContent = logContent || '暂无日志内容';
            elements.logContent.scrollTop = elements.logContent.scrollHeight;
        }

        const typeNames = {
            'runtime': '运行日志',
            'download': '下载记录',
            'error': '错误日志'
        };
        setStatus(`${typeNames[state.currentLogType] || '日志'}已刷新`);

    } catch (error) {
        if (elements.logContent) {
            elements.logContent.textContent = '加载日志失败：' + error.message;
        }
    }
}

async function openLogDirectory() {
    try {
        const result = await window.electronAPI.openLogDir();
        if (result.success) {
            setStatus('已打开日志目录');
        } else {
            alert('打开日志目录失败：' + result.error);
        }
    } catch (error) {
        alert('打开日志目录失败');
    }
}

// ==================== 状态监控 ====================

function updateStats(metrics) {
    if (!metrics || !elements.statSpeed) return;

    const {
        instantSpeed,
        averageSpeed,
        downloadedBytes,
        totalSegments,
        completedSegments,
        failedSegments,
        elapsedSeconds,
        memoryBytes
    } = metrics;

    elements.statSpeed.textContent = formatSpeed(instantSpeed || 0);
    elements.statAverage.textContent = `平均 ${formatSpeed(averageSpeed || 0)}`;
    elements.statDownloaded.textContent = formatBytes(downloadedBytes || 0);

    if (totalSegments && totalSegments > 0) {
        elements.statSegments.textContent = `${completedSegments}/${totalSegments} 片段`;
    } else {
        const completed = completedSegments || 0;
        const failed = failedSegments || 0;
        elements.statSegments.textContent = `${completed} 完成 / ${failed} 失败`;
    }

    elements.statRuntime.textContent = `运行 ${formatDuration(elapsedSeconds || 0)}`;

    if (typeof memoryBytes === 'number') {
        updateMemoryUsage(memoryBytes);
    }
}

function resetStats() {
    if (!elements.statSpeed) return;
    elements.statSpeed.textContent = '0 MB/s';
    elements.statAverage.textContent = '平均 0 MB/s';
    elements.statDownloaded.textContent = '0 MB';
    elements.statSegments.textContent = '0 / 0 片段';
    elements.statMemory.textContent = '0 MB';
    elements.statRuntime.textContent = '运行 0s';
}

function initMemoryMonitor() {
    if (state.memoryIdleTimer) {
        clearInterval(state.memoryIdleTimer);
    }

    state.memoryIdleTimer = setInterval(async () => {
        if (state.isDownloading) return;

        try {
            const memoryBytes = await window.electronAPI.getMemoryInfo();
            if (memoryBytes > 0) {
                updateMemoryUsage(memoryBytes);
            }
        } catch (error) {
            // 忽略错误
        }
    }, 5000);
}

function updateMemoryUsage(memoryBytes) {
    if (elements.statMemory) {
        elements.statMemory.textContent = formatBytes(memoryBytes || 0);
    }
}

// ==================== 工具函数 ====================

function safeCall(fn) {
    try {
        const result = fn();
        if (result instanceof Promise) {
            result.catch(error => {
                console.error('操作失败:', error);
                addLog(`❌ 操作失败: ${error.message}`);
            });
        }
    } catch (error) {
        console.error('操作失败:', error);
        addLog(`❌ 操作失败: ${error.message}`);
    }
}

function formatSpeed(bytesPerSecond) {
    if (!bytesPerSecond || bytesPerSecond <= 0) {
        return '0 MB/s';
    }

    const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    let unitIndex = 0;
    let value = bytesPerSecond;

    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex++;
    }

    return `${value.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

function formatBytes(bytes) {
    if (!bytes || bytes <= 0) {
        return '0 MB';
    }

    const units = ['B', 'KB', 'MB', 'GB'];
    let unitIndex = 0;
    let value = bytes;

    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex++;
    }

    const precision = unitIndex === 0 ? 0 : unitIndex === 1 ? 1 : 2;
    return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function formatDuration(seconds) {
    const totalSeconds = Math.max(Math.round(seconds), 0);
    if (totalSeconds <= 0) {
        return '0s';
    }

    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (hrs > 0) {
        return `${hrs}h${mins.toString().padStart(2, '0')}m`;
    }

    if (mins > 0) {
        return `${mins}m${secs.toString().padStart(2, '0')}s`;
    }

    return `${secs}s`;
}

// ==================== 启动 ====================

document.addEventListener('DOMContentLoaded', init);

// 清理函数（页面卸载时）
window.addEventListener('beforeunload', () => {
    if (state.memoryIdleTimer) {
        clearInterval(state.memoryIdleTimer);
    }
    cleanupFunctions.forEach(cleanup => cleanup && cleanup());
});
