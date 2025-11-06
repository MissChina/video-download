const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

// 延迟加载 logger，避免初始化时失败
let logger;
try {
    logger = require('./logger');
} catch (error) {
    console.error('Logger 加载失败:', error);
    // 创建一个简单的替代 logger
    logger = {
        error: (msg, err) => console.error(msg, err),
        warn: (msg, err) => console.warn(msg, err),
        fatal: (msg, err) => console.error('FATAL:', msg, err)
    };
}

// 全局错误处理
window.addEventListener('error', (event) => {
    logger.error('全局错误', new Error(event.message + ' at ' + event.filename + ':' + event.lineno));
    event.preventDefault();
});

window.addEventListener('unhandledrejection', (event) => {
    logger.error('未处理的Promise拒绝', new Error(event.reason));
    event.preventDefault();
});

// 初始化
let currentTab = 'download';
let threadCount = 16;
let isDownloading = false;
let currentLogType = 'runtime'; // 当前查看的日志类型
let isLogUnlocked = false; // 日志是否已解锁

// DOM元素 - 将在 DOMContentLoaded 后初始化
let elements = {};

// 初始化DOM元素引用
function initElements() {
    elements = {
        // 标签页
        tabBtns: document.querySelectorAll('.tab-btn'),
        tabPanels: document.querySelectorAll('.tab-panel'),

        // 下载页面
        urlInput: document.getElementById('url-input'),
        pasteBtn: document.getElementById('paste-btn'),
        clearBtn: document.getElementById('clear-btn'),
        savePathInput: document.getElementById('save-path'),
        browseBtn: document.getElementById('browse-btn'),
        filenameInput: document.getElementById('filename'),
        formatSelect: document.getElementById('format'),
        threadCountInput: document.getElementById('thread-count'),
        decreaseBtn: document.getElementById('decrease-btn'),
        increaseBtn: document.getElementById('increase-btn'),
        startBtn: document.getElementById('start-btn'),
        stopBtn: document.getElementById('stop-btn'),
        statusText: document.getElementById('status-text'),
        progressPercent: document.getElementById('progress-percent'),
        progressFill: document.getElementById('progress-fill'),
        logBox: document.getElementById('log-box'),
        clearLogBtn: document.getElementById('clear-log-btn'),

        // FFmpeg状态（首页）
        ffmpegStatusHome: document.getElementById('ffmpeg-status-home'),
        checkFfmpegHomeBtn: document.getElementById('check-ffmpeg-home'),

        // 设置页面
        ffmpegStatusText: document.getElementById('ffmpeg-status-text'),
        installFfmpegBtn: document.getElementById('install-ffmpeg-btn'),
        checkFfmpegBtn: document.getElementById('check-ffmpeg-btn'),
        installProgress: document.getElementById('install-progress'),
        installStatusText: document.getElementById('install-status-text'),
        timeoutInput: document.getElementById('timeout'),
        retryInput: document.getElementById('retry'),
        saveSettingsBtn: document.getElementById('save-settings-btn'),

        // 日志查看页面
        logPassword: document.getElementById('log-password'),
        unlockLogsBtn: document.getElementById('unlock-logs-btn'),
        passwordSection: document.getElementById('password-section'),
        logsContent: document.getElementById('logs-content'),
        logTypeBtns: document.querySelectorAll('.log-type-btn'),
        refreshLogsBtn: document.getElementById('refresh-logs-btn'),
        openLogDirBtn: document.getElementById('open-log-dir-btn'),
        logTypeLabel: document.getElementById('log-type-label'),
        logContent: document.getElementById('log-content'),

        // 状态栏
        footerStatus: document.getElementById('footer-status')
    };
}

// 初始化设置
function init() {
    try {
        // 首先初始化DOM元素引用
        initElements();
        // 设置默认保存路径
        const defaultPath = path.join(os.homedir(), 'Downloads');

        // 确保下载目录存在
        if (!fs.existsSync(defaultPath)) {
            try {
                fs.mkdirSync(defaultPath, { recursive: true });
            } catch (err) {
                logger.error('创建下载目录失败', err);
            }
        }

        elements.savePathInput.value = defaultPath;

        // 标签页切换
        elements.tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                try {
                    const tab = btn.dataset.tab;
                    switchTab(tab);
                } catch (error) {
                    logger.error('切换标签页失败', error);
                }
            });
        });

        // 下载页面事件
        elements.pasteBtn.addEventListener('click', () => safeCall(pasteUrl));
        elements.clearBtn.addEventListener('click', () => safeCall(clearUrl));
        elements.browseBtn.addEventListener('click', () => safeCall(browseFolder));
        elements.decreaseBtn.addEventListener('click', () => safeCall(decreaseThread));
        elements.increaseBtn.addEventListener('click', () => safeCall(increaseThread));
        elements.startBtn.addEventListener('click', () => safeCall(startDownload));
        elements.stopBtn.addEventListener('click', () => safeCall(stopDownload));
        elements.clearLogBtn.addEventListener('click', () => safeCall(clearLog));

        // 设置页面事件
        elements.checkFfmpegBtn.addEventListener('click', () => safeCall(checkFFmpeg));
        elements.installFfmpegBtn.addEventListener('click', () => safeCall(installFFmpeg));
        elements.saveSettingsBtn.addEventListener('click', () => safeCall(saveSettings));

        // 首页FFmpeg检测
        elements.checkFfmpegHomeBtn.addEventListener('click', () => safeCall(checkFFmpegHome));

        // 日志查看页面事件
        elements.unlockLogsBtn.addEventListener('click', () => safeCall(unlockLogs));
        elements.logPassword.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                safeCall(unlockLogs);
            }
        });
        elements.logTypeBtns.forEach(btn => {
            btn.addEventListener('click', () => safeCall(() => switchLogType(btn.dataset.logType)));
        });
        elements.refreshLogsBtn.addEventListener('click', () => safeCall(refreshLogs));
        elements.openLogDirBtn.addEventListener('click', () => safeCall(openLogDirectory));

        // 回车键开始下载
        elements.urlInput.addEventListener('keypress', (e) => {
            try {
                if (e.key === 'Enter' && !isDownloading) {
                    startDownload();
                }
            } catch (error) {
                logger.error('回车键处理失败', error);
            }
        });

        // 初始化检查FFmpeg
        checkFFmpeg();
        checkFFmpegHome();

        addLog('欢迎使用 M3U8 视频下载器');
        addLog('请输入视频链接，然后点击开始下载');

    } catch (error) {
        logger.fatal('初始化失败', error);
        alert('应用初始化失败，请查看错误日志');
    }
}

// 安全调用函数（捕获所有错误）
function safeCall(fn) {
    try {
        const result = fn();
        if (result instanceof Promise) {
            result.catch(error => {
                logger.error(`函数 ${fn.name} 执行失败`, error);
                addLog(`❌ 操作失败: ${error.message}`);
            });
        }
    } catch (error) {
        logger.error(`函数 ${fn.name} 执行失败`, error);
        addLog(`❌ 操作失败: ${error.message}`);
    }
}

// 标签页切换
function switchTab(tab) {
    currentTab = tab;

    elements.tabBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    elements.tabPanels.forEach(panel => {
        panel.classList.toggle('active', panel.id === tab);
    });

    elements.footerStatus.textContent = `当前页面: ${getTabName(tab)}`;
}

function getTabName(tab) {
    const names = { download: '下载', settings: '设置', about: '关于', logs: '日志查看' };
    return names[tab] || '下载';
}

// URL操作
function pasteUrl() {
    try {
        const clipboard = require('electron').clipboard;
        const text = clipboard.readText();
        if (text) {
            elements.urlInput.value = text.trim();
            addLog('已粘贴链接');
        } else {
            addLog('剪贴板为空');
        }
    } catch (error) {
        logger.error('粘贴链接失败', error);
        addLog('❌ 粘贴失败');
    }
}

function clearUrl() {
    elements.urlInput.value = '';
    addLog('已清空链接');
}

// 浏览文件夹
async function browseFolder() {
    try {
        const folder = await ipcRenderer.invoke('select-folder');
        if (folder) {
            elements.savePathInput.value = folder;
            addLog(`已选择目录: ${folder}`);
        }
    } catch (error) {
        logger.error('选择文件夹失败', error);
        addLog('❌ 选择文件夹失败');
    }
}

// 线程数控制
function decreaseThread() {
    if (threadCount > 1) {
        threadCount--;
        elements.threadCountInput.value = threadCount;
    }
}

function increaseThread() {
    if (threadCount < 64) {
        threadCount++;
        elements.threadCountInput.value = threadCount;
    }
}

// 日志
function addLog(message) {
    const now = new Date();
    const time = now.toLocaleTimeString('zh-CN', { hour12: false });
    const logLine = document.createElement('div');
    logLine.className = 'log-line';
    logLine.textContent = `[${time}] ${message}`;
    elements.logBox.appendChild(logLine);
    elements.logBox.scrollTop = elements.logBox.scrollHeight;
}

function clearLog() {
    elements.logBox.innerHTML = '';
    addLog('日志已清除');
}

// 更新进度
function updateProgress(percent, status) {
    elements.progressPercent.textContent = `${percent}%`;
    elements.progressFill.style.width = `${percent}%`;
    elements.statusText.textContent = status;
}

// 开始下载
async function startDownload() {
    try {
        const url = elements.urlInput.value.trim();

        if (!url) {
            addLog('❌ 错误: 请输入视频链接');
            return;
        }

        if (!url.toLowerCase().startsWith('http')) {
            addLog('❌ 错误: 请输入有效的HTTP链接');
            return;
        }

        const savePath = elements.savePathInput.value;
        const filename = elements.filenameInput.value || 'video';
        const format = elements.formatSelect.value;
        const threads = threadCount;
        const timeout = parseInt(elements.timeoutInput.value) * 1000;
        const retry = parseInt(elements.retryInput.value);

        // 验证保存路径
        if (!fs.existsSync(savePath)) {
            try {
                fs.mkdirSync(savePath, { recursive: true });
            } catch (err) {
                logger.error('创建保存目录失败', err);
                addLog('❌ 保存目录无效或无法创建');
                return;
            }
        }

        const outputFile = path.join(savePath, `${filename}.${format}`);

        isDownloading = true;
        elements.startBtn.disabled = true;
        elements.stopBtn.disabled = false;

        addLog(`🚀 开始下载: ${url}`);
        addLog(`📁 保存到: ${outputFile}`);
        addLog(`⚡ 使用 ${threads} 个线程`);

        updateProgress(0, '正在解析M3U8...');

        // 实际下载
        try {
            const M3U8Downloader = require('./downloader');
            const downloader = new M3U8Downloader();

            const success = await downloader.download(url, outputFile, {
                maxWorkers: threads,
                timeout: timeout,
                retry: retry,
                progressCallback: (percent, message) => {
                    updateProgress(percent, message);
                    // 只在控制台显示，不记录到日志文件
                }
            });

            if (success) {
                addLog(`🎉 下载完成: ${outputFile}`);
                updateProgress(100, '✅ 下载完成');
            } else {
                addLog('❌ 下载失败或已取消');
                logger.warn('下载失败或被用户取消', new Error('Download failed or canceled'));
                updateProgress(0, '下载失败');
            }

        } catch (error) {
            logger.error('下载过程出错', error);
            addLog(`❌ 下载错误: ${error.message}`);
            updateProgress(0, '下载失败');
        } finally {
            isDownloading = false;
            elements.startBtn.disabled = false;
            elements.stopBtn.disabled = true;
        }

    } catch (error) {
        logger.fatal('开始下载函数异常', error);
        addLog('❌ 下载失败，请查看错误日志');
        isDownloading = false;
        elements.startBtn.disabled = false;
        elements.stopBtn.disabled = true;
    }
}

// 停止下载
function stopDownload() {
    isDownloading = false;
    elements.startBtn.disabled = false;
    elements.stopBtn.disabled = true;
    updateProgress(0, '已停止');
    addLog('⏹ 下载已停止');
}

// 检查FFmpeg（首页）
async function checkFFmpegHome() {
    try {
        elements.ffmpegStatusHome.textContent = '检测中...';
        elements.ffmpegStatusHome.className = 'status-text checking';

        const result = await ipcRenderer.invoke('check-ffmpeg');

        if (result.installed) {
            elements.ffmpegStatusHome.textContent = '✅ ' + result.message;
            elements.ffmpegStatusHome.className = 'status-text success';
        } else {
            elements.ffmpegStatusHome.textContent = '⚠️ ' + result.message;
            elements.ffmpegStatusHome.className = 'status-text error';
        }
    } catch (error) {
        logger.error('检测FFmpeg失败（首页）', error);
        elements.ffmpegStatusHome.textContent = '❌ 检测失败';
        elements.ffmpegStatusHome.className = 'status-text error';
    }
}

// 检查FFmpeg（设置页）
async function checkFFmpeg() {
    try {
        elements.ffmpegStatusText.textContent = '检测中...';

        const result = await ipcRenderer.invoke('check-ffmpeg');

        if (result.installed) {
            elements.ffmpegStatusText.textContent = '✓ ' + result.message;
            elements.installFfmpegBtn.disabled = true;
            elements.installFfmpegBtn.textContent = '已安装';
        } else {
            elements.ffmpegStatusText.textContent = '✗ ' + result.message;
            elements.installFfmpegBtn.disabled = false;
            elements.installFfmpegBtn.textContent = '一键安装';
        }
    } catch (error) {
        logger.error('检测FFmpeg失败', error);
        elements.ffmpegStatusText.textContent = '✗ 检测失败';
    }
}

// 安装FFmpeg（真实实现）
async function installFFmpeg() {
    try {
        elements.installProgress.style.display = 'block';
        elements.installStatusText.textContent = '准备安装...';
        elements.installFfmpegBtn.disabled = true;

        // 监听安装进度
        ipcRenderer.on('ffmpeg-install-progress', (event, progress) => {
            if (progress.percent !== undefined) {
                elements.installStatusText.textContent = `${progress.message} ${progress.percent}%`;
            } else {
                elements.installStatusText.textContent = progress.message;
            }

            // 同时在日志中显示
            if (progress.stage === 'download' || progress.stage === 'extract') {
                addLog(`📦 ${progress.message}`);
            }
        });

        addLog('🔽 开始安装 FFmpeg...');

        // 调用主进程进行安装
        const result = await ipcRenderer.invoke('install-ffmpeg');

        // 移除进度监听器
        ipcRenderer.removeAllListeners('ffmpeg-install-progress');

        if (result.success) {
            elements.installStatusText.textContent = '✅ 安装成功！';
            elements.installProgress.style.display = 'none';
            addLog('✅ FFmpeg 安装成功');

            // 重新检测
            await checkFFmpeg();
            await checkFFmpegHome();
        } else {
            elements.installStatusText.textContent = `❌ ${result.message}`;
            elements.installProgress.style.display = 'none';
            elements.installFfmpegBtn.disabled = false;
            addLog(`❌ 安装失败: ${result.message}`);
            logger.error('FFmpeg安装失败', new Error(result.message));
        }

    } catch (error) {
        elements.installStatusText.textContent = '❌ 安装失败';
        elements.installProgress.style.display = 'none';
        elements.installFfmpegBtn.disabled = false;
        addLog(`❌ 安装错误: ${error.message}`);
        logger.error('FFmpeg安装异常', error);
    }
}

// 保存设置
function saveSettings() {
    const timeout = elements.timeoutInput.value;
    const retry = elements.retryInput.value;

    // 保存设置到本地存储
    const settings = {
        timeout: parseInt(timeout),
        retry: parseInt(retry)
    };

    localStorage.setItem('settings', JSON.stringify(settings));

    addLog('💾 设置已保存');
    elements.footerStatus.textContent = '设置已保存';

    setTimeout(() => {
        elements.footerStatus.textContent = '就绪';
    }, 2000);
}

// 加载设置
function loadSettings() {
    const saved = localStorage.getItem('settings');
    if (saved) {
        const settings = JSON.parse(saved);
        elements.timeoutInput.value = settings.timeout || 30;
        elements.retryInput.value = settings.retry || 3;
    }
}

// ==================== 日志查看功能 ====================

// 解锁日志
async function unlockLogs() {
    const password = elements.logPassword.value;

    if (!password) {
        alert('请输入密码');
        return;
    }

    try {
        const isValid = await ipcRenderer.invoke('verify-log-password', password);

        if (isValid) {
            isLogUnlocked = true;
            elements.passwordSection.style.display = 'none';
            elements.logsContent.style.display = 'block';

            // 加载初始日志
            await refreshLogs();

            elements.footerStatus.textContent = '日志已解锁';
        } else {
            alert('密码错误！');
            elements.logPassword.value = '';
            elements.logPassword.focus();
        }
    } catch (error) {
        logger.error('验证密码失败', error);
        alert('验证失败，请重试');
    }
}

// 切换日志类型
async function switchLogType(type) {
    currentLogType = type;

    // 更新按钮样式
    elements.logTypeBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.logType === type);
    });

    // 更新标签
    const labels = {
        'runtime': '运行日志',
        'download': '下载记录',
        'error': '错误日志'
    };
    elements.logTypeLabel.textContent = labels[type] || '日志';

    // 刷新日志内容
    await refreshLogs();
}

// 刷新日志
async function refreshLogs() {
    if (!isLogUnlocked) {
        return;
    }

    try {
        elements.logContent.textContent = '加载中...';

        const logContent = await ipcRenderer.invoke('get-recent-logs', currentLogType);

        elements.logContent.textContent = logContent || '暂无日志内容';

        // 滚动到底部
        elements.logContent.scrollTop = elements.logContent.scrollHeight;

        elements.footerStatus.textContent = `${currentLogType === 'runtime' ? '运行日志' : currentLogType === 'download' ? '下载记录' : '错误日志'}已刷新`;
    } catch (error) {
        logger.error('刷新日志失败', error);
        elements.logContent.textContent = '加载日志失败：' + error.message;
    }
}

// 打开日志目录
async function openLogDirectory() {
    try {
        const result = await ipcRenderer.invoke('open-log-dir');

        if (result.success) {
            elements.footerStatus.textContent = '已打开日志目录';
        } else {
            alert('打开日志目录失败：' + result.error);
        }
    } catch (error) {
        logger.error('打开日志目录失败', error);
        alert('打开日志目录失败');
    }
}

// ==================== 日志查看功能结束 ====================

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    init();
    loadSettings();
});
