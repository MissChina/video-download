'use strict';

const state = { threadCount: 16, isDownloading: false, appVersion: '0.0.0', defaultSavePath: '' };
let el = {};

async function init() {
    try {
        state.appVersion = await window.electronAPI.getAppVersion();
        state.defaultSavePath = await window.electronAPI.getDownloadsPath();

        el = {
            versionLabel: document.getElementById('version-label'),
            aboutVersion: document.getElementById('about-version'),
            urlInput: document.getElementById('url-input'),
            savePath: document.getElementById('save-path'),
            filename: document.getElementById('filename'),
            threadCount: document.getElementById('thread-count'),
            timeout: document.getElementById('timeout'),
            retry: document.getElementById('retry'),
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
            statDownloaded: document.getElementById('stat-downloaded'),
            statSegments: document.getElementById('stat-segments'),
            statMemory: document.getElementById('stat-memory'),
            footerStatus: document.getElementById('footer-status'),
            saveSettingsBtn: document.getElementById('save-settings-btn'),
            refreshLogsBtn: document.getElementById('refresh-logs-btn'),
            openLogDirBtn: document.getElementById('open-log-dir-btn'),
            logContent: document.getElementById('log-content')
        };

        loadSettings();
        bindEvents();
        setupIPC();
        setupTabs();

        el.versionLabel.textContent = 'v' + state.appVersion;
        if (el.aboutVersion) el.aboutVersion.textContent = 'v' + state.appVersion;
        el.threadCount.textContent = state.threadCount;

        log('M3U8 下载器已启动');
        log('粘贴视频链接后点击开始下载');
    } catch (err) {
        console.error('初始化失败:', err);
    }
}

function loadSettings() {
    const saved = localStorage.getItem('threadCount');
    if (saved) state.threadCount = Math.min(64, Math.max(1, parseInt(saved) || 16));
    const path = localStorage.getItem('savePath');
    el.savePath.value = path || state.defaultSavePath;
    const settings = JSON.parse(localStorage.getItem('settings') || '{}');
    if (settings.timeout) el.timeout.value = settings.timeout;
    if (settings.retry) el.retry.value = settings.retry;
}

function setupTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.onclick = () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.content').forEach(c => c.classList.add('hidden'));
            tab.classList.add('active');
            document.getElementById('tab-' + tab.dataset.tab).classList.remove('hidden');
        };
    });
}

function bindEvents() {
    el.pasteBtn.onclick = () => { const t = window.electronAPI.readClipboard(); if (t) { el.urlInput.value = t.trim(); log('已粘贴'); } };
    el.clearBtn.onclick = () => { el.urlInput.value = ''; log('已清空'); };
    el.browseBtn.onclick = async () => { const f = await window.electronAPI.selectFolder(); if (f) { el.savePath.value = f; localStorage.setItem('savePath', f); log('已选择: ' + f); } };
    el.decreaseBtn.onclick = () => { if (state.threadCount > 1) { state.threadCount--; el.threadCount.textContent = state.threadCount; localStorage.setItem('threadCount', state.threadCount); } };
    el.increaseBtn.onclick = () => { if (state.threadCount < 64) { state.threadCount++; el.threadCount.textContent = state.threadCount; localStorage.setItem('threadCount', state.threadCount); } };
    el.startBtn.onclick = startDownload;
    el.stopBtn.onclick = stopDownload;
    el.clearLogBtn.onclick = () => { el.logBox.innerHTML = ''; log('日志已清除'); };
    el.urlInput.onkeypress = (e) => { if (e.key === 'Enter' && !state.isDownloading) startDownload(); };
    if (el.saveSettingsBtn) el.saveSettingsBtn.onclick = () => { localStorage.setItem('settings', JSON.stringify({ timeout: el.timeout.value, retry: el.retry.value })); log('设置已保存'); };
    if (el.refreshLogsBtn) el.refreshLogsBtn.onclick = async () => { try { const c = await window.electronAPI.getRecentLogs('runtime'); el.logContent.textContent = c || '暂无日志'; } catch (e) { el.logContent.textContent = '加载失败'; } };
    if (el.openLogDirBtn) el.openLogDirBtn.onclick = () => window.electronAPI.openLogDir();
}

function setupIPC() {
    window.electronAPI.onDownloadProgress((d) => updateProgress(d.percent, d.message, d.metrics));
    window.electronAPI.onDownloadComplete((d) => { if (d.success) { log('下载完成: ' + d.outputFile); updateProgress(100, '完成'); } else { log('下载失败'); updateProgress(0, '失败'); } finishDownload(); });
    window.electronAPI.onDownloadError((d) => { log('错误: ' + d.error); updateProgress(0, '错误'); finishDownload(); });
}

async function startDownload() {
    const url = el.urlInput.value.trim();
    if (!url) { log('请输入视频链接'); return; }
    if (!url.startsWith('http')) { log('请输入有效的HTTP链接'); return; }
    const savePath = el.savePath.value || state.defaultSavePath;
    const filename = el.filename.value || 'video';
    const timeout = parseInt(el.timeout.value || '30') * 1000;
    const retry = parseInt(el.retry.value || '3');
    localStorage.setItem('savePath', savePath);
    localStorage.setItem('settings', JSON.stringify({ timeout: el.timeout.value, retry: el.retry.value }));
    const exists = await window.electronAPI.fsExists(savePath);
    if (!exists) await window.electronAPI.fsMkdir(savePath);
    const outputFile = await window.electronAPI.pathJoin(savePath, filename + '.mp4');
    state.isDownloading = true;
    el.startBtn.disabled = true;
    el.stopBtn.disabled = false;
    log('开始下载...');
    log('线程: ' + state.threadCount);
    updateProgress(0, '下载中');
    try { await window.electronAPI.startDownload({ url, outputFile, threads: state.threadCount, timeout, retry }); } catch (e) { log('启动失败: ' + e.message); finishDownload(); }
}

async function stopDownload() { try { await window.electronAPI.cancelDownload(); log('已停止'); updateProgress(0, '已停止'); } catch (e) { log('停止失败'); } finishDownload(); }

function finishDownload() { state.isDownloading = false; el.startBtn.disabled = false; el.stopBtn.disabled = true; }

function updateProgress(percent, status, metrics) {
    const p = Math.min(100, Math.max(0, Math.round(percent)));
    el.progressPercent.textContent = p + '%';
    el.progressFill.style.width = p + '%';
    el.statusText.textContent = status;
    el.footerStatus.textContent = status;
    if (metrics) {
        el.statSpeed.textContent = formatSpeed(metrics.instantSpeed || 0);
        el.statDownloaded.textContent = formatBytes(metrics.downloadedBytes || 0);
        if (metrics.totalSegments) el.statSegments.textContent = (metrics.completedSegments || 0) + '/' + metrics.totalSegments;
        if (metrics.memoryBytes) el.statMemory.textContent = formatBytes(metrics.memoryBytes);
    }
}

function log(msg) {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const line = document.createElement('div');
    line.className = 'log-line';
    line.textContent = '[' + time + '] ' + msg;
    el.logBox.appendChild(line);
    el.logBox.scrollTop = el.logBox.scrollHeight;
    el.footerStatus.textContent = msg;
}

function formatSpeed(bps) { if (bps < 1024) return bps.toFixed(0) + ' B/s'; if (bps < 1024 * 1024) return (bps / 1024).toFixed(1) + ' KB/s'; return (bps / 1024 / 1024).toFixed(2) + ' MB/s'; }
function formatBytes(bytes) { if (bytes < 1024) return bytes + ' B'; if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'; return (bytes / 1024 / 1024).toFixed(2) + ' MB'; }

document.addEventListener('DOMContentLoaded', init);
