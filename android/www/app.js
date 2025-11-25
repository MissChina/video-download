import { Clipboard } from '@capacitor/clipboard';
import M3U8Downloader from './downloader.js';

/**
 * M3U8 Downloader - Android/Web 版本
 * 使用Capacitor原生API
 */

let downloader = null;
let isDownloading = false;
let currentTab = 'download';
let threadCount = 16;
let currentLogType = 'runtime';

// DOM元素
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

        // 设置页面
        timeoutInput: document.getElementById('timeout'),
        retryInput: document.getElementById('retry'),
        saveSettingsBtn: document.getElementById('save-settings-btn'),

        // 日志查看页面
        logTypeBtns: document.querySelectorAll('.log-type-btn'),
        refreshLogsBtn: document.getElementById('refresh-logs-btn'),
        clearAllLogsBtn: document.getElementById('clear-all-logs-btn'),
        copyLogsBtn: document.getElementById('copy-logs-btn'),
        logTypeLabel: document.getElementById('log-type-label'),
        logContent: document.getElementById('log-content'),

        // 状态栏
        footerStatus: document.getElementById('footer-status')
    };
}

// 初始化设置
async function init() {
    try {
        initElements();

        // 创建下载器实例
        downloader = new M3U8Downloader();

        // 标签页切换
        elements.tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                switchTab(tab);
            });
        });

        // 下载页面事件
        elements.pasteBtn.addEventListener('click', () => safeCall(pasteUrl));
        elements.clearBtn.addEventListener('click', () => safeCall(clearUrl));
        elements.decreaseBtn.addEventListener('click', () => safeCall(decreaseThread));
        elements.increaseBtn.addEventListener('click', () => safeCall(increaseThread));
        elements.startBtn.addEventListener('click', () => safeCall(startDownload));
        elements.stopBtn.addEventListener('click', () => safeCall(stopDownload));
        elements.clearLogBtn.addEventListener('click', () => safeCall(clearLog));

        // 设置页面事件
        elements.saveSettingsBtn.addEventListener('click', () => safeCall(saveSettings));

        // 日志查看页面事件
        elements.logTypeBtns.forEach(btn => {
            btn.addEventListener('click', () => safeCall(() => switchLogType(btn.dataset.logType)));
        });
        elements.refreshLogsBtn.addEventListener('click', () => safeCall(refreshLogs));
        elements.clearAllLogsBtn.addEventListener('click', () => safeCall(clearAllLogs));
        elements.copyLogsBtn.addEventListener('click', () => safeCall(copyLogs));

        // 回车键开始下载
        elements.urlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !isDownloading) {
                startDownload();
            }
        });

        // 加载设置
        loadSettings();

        addLog('欢迎使用 M3U8 视频下载器 Android 版 v6.0.1');
        addLog('基于 Capacitor + 原生API，无FFmpeg依赖');
        addLog('✨ v6.0.1 真正修复：字符串拼接性能问题');
        addLog('🐛 之前的根本原因：');
        addLog('   - 对384KB数据使用 binaryString += char（393216次循环）');
        addLog('   - JavaScript字符串不可变，每次+=创建新字符串');
        addLog('   - 导致~77GB临时内存分配，字符串损坏');
        addLog('✅ 现在使用：数组收集+String.fromCharCode.apply()');
        addLog('   - O(n)时间复杂度，无重复拷贝');
        addLog('   - 64KB sub-batch避免call stack限制');
        addLog('📦 输出格式：TS（可直接播放，兼容性最佳）');
        addLog('请输入视频链接，然后点击开始下载');

    } catch (error) {
        logger.fatal('初始化失败', error);
        alert('应用初始化失败: ' + error.message);
    }
}

// 安全调用函数
function safeCall(fn) {
    try {
        const result = fn();
        if (result instanceof Promise) {
            result.catch(error => {
                logger.error(`函数执行失败`, error);
                addLog(`❌ 操作失败: ${error.message}`);
            });
        }
    } catch (error) {
        logger.error(`函数执行失败`, error);
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

    const tabNames = { download: '下载', settings: '设置', about: '关于', logs: '日志查看' };
    elements.footerStatus.textContent = `当前页面: ${tabNames[tab] || '下载'}`;
}

// URL操作
async function pasteUrl() {
    try {
        addLog('正在读取剪贴板...');

        // 使用Capacitor Clipboard插件
        const result = await Clipboard.read();

        if (result && result.value) {
            const clipboardText = result.value.trim();

            if (!clipboardText) {
                addLog('⚠️ 剪贴板内容为空');
                addLog('💡 请先复制M3U8链接，然后再点击粘贴');
                return;
            }

            elements.urlInput.value = clipboardText;
            addLog(`✅ 已粘贴链接 (${clipboardText.length} 字符)`);

            // 自动识别是否为M3U8链接
            if (clipboardText.toLowerCase().includes('.m3u8') || clipboardText.toLowerCase().includes('m3u8')) {
                addLog('✓ 检测到 M3U8 链接');
            } else {
                addLog('⚠️ 链接似乎不是 M3U8 格式，请确认');
            }
        } else {
            addLog('⚠️ 剪贴板为空');
            addLog('💡 请先复制M3U8链接，然后再点击粘贴');
        }
    } catch (error) {
        logger.error('粘贴链接失败', error);

        // 详细的错误提示
        const errorMsg = error.message || '';

        if (errorMsg.includes('no data on the clipboard') || errorMsg.includes('clipboard is empty')) {
            addLog('⚠️ 剪贴板为空');
            addLog('💡 请先复制M3U8链接：');
            addLog('   1. 长按链接文本');
            addLog('   2. 选择"复制"');
            addLog('   3. 返回本应用点击"粘贴"按钮');
            addLog('或者：直接在上方输入框中手动粘贴链接');
        } else if (errorMsg.toLowerCase().includes('permission')) {
            addLog('❌ 剪贴板权限被拒绝');
            addLog('💡 解决方法：');
            addLog('   1. 打开系统设置');
            addLog('   2. 找到本应用权限设置');
            addLog('   3. 允许访问剪贴板');
        } else if (errorMsg.toLowerCase().includes('denied')) {
            addLog('❌ 剪贴板访问被拒绝');
            addLog('💡 请检查应用权限设置');
        } else {
            addLog(`❌ 粘贴失败: ${errorMsg || '未知错误'}`);
            addLog('💡 建议：直接在上方输入框中手动粘贴链接');
        }
    }
}

function clearUrl() {
    elements.urlInput.value = '';
    addLog('已清空链接');
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

        // URL 验证
        if (!url) {
            addLog('❌ 错误: 请输入视频链接');
            alert('请先输入视频链接');
            return;
        }

        if (!url.toLowerCase().startsWith('http')) {
            addLog('❌ 错误: 请输入有效的HTTP/HTTPS链接');
            alert('链接格式错误\n必须以 http:// 或 https:// 开头');
            return;
        }

        // M3U8 格式检查（警告，但不阻止）
        if (!url.toLowerCase().includes('.m3u8') && !url.toLowerCase().includes('m3u8')) {
            const confirm_result = confirm('链接似乎不是 M3U8 格式\n是否继续尝试下载？');
            if (!confirm_result) {
                addLog('⏹ 用户取消下载');
                return;
            }
        }

        const filename = elements.filenameInput.value.trim() || 'video';
        const format = elements.formatSelect.value;
        const threads = threadCount;
        const timeout = parseInt(elements.timeoutInput.value) * 1000;
        const retry = parseInt(elements.retryInput.value);

        // 验证文件名
        if (filename.includes('/') || filename.includes('\\')) {
            addLog('❌ 文件名不能包含 / 或 \\ 字符');
            alert('文件名格式错误');
            return;
        }

        isDownloading = true;
        elements.startBtn.disabled = true;
        elements.stopBtn.disabled = false;

        addLog('━━━━━━━━━━━━━━━━━━━���━');
        addLog(`🚀 开始下载任务`);
        addLog(`📺 链接: ${url.substring(0, 80)}${url.length > 80 ? '...' : ''}`);
        addLog(`📁 文件名: ${filename}.${format}`);
        addLog(`⚡ 线程数: ${threads}`);
        addLog(`⏱️ 超时: ${timeout/1000}秒, 重试: ${retry}次`);
        addLog('━━━━━━━━━━━━━━━━━━���━━');

        updateProgress(0, '正在初始化...');

        // 实际下载
        try {
            if (!downloader) {
                throw new Error('下载器未初始化，请刷新页面重试');
            }

            addLog('🔧 检查下载器状态...');
            updateProgress(5, '正在解析M3U8...');

            const success = await downloader.download(url, `${filename}.${format}`, {
                maxWorkers: threads,
                timeout: timeout,
                retry: retry,
                progressCallback: (percent, message) => {
                    updateProgress(percent, message);
                    // 重要进度里程碑也写入日志
                    if (percent === 20 || percent === 50 || percent === 90) {
                        addLog(`⏳ 进度: ${percent}% - ${message}`);
                    }
                }
            });

            if (success) {
                addLog('━━━━━━━━━━━━━━━━━━━━━');
                addLog(`🎉 下载完成: ${filename}.${format}`);
                addLog('━━━━━━━━━━━━���━━━━━━━━');
                updateProgress(100, '✅ 下载完成');

                // 在 Android 上可以使用 Capacitor 的 Filesystem API 保存文件
                if (typeof Capacitor !== 'undefined') {
                    addLog('💾 文件已保存到下载目录');
                }

                // 成功提示音（如果支持）
                try {
                    if (typeof navigator !== 'undefined' && navigator.vibrate) {
                        navigator.vibrate([200, 100, 200]);
                    }
                } catch (e) {
                    // 忽略
                }
            } else {
                addLog('━━━━━━━━━━━━━━━━━━━━━');
                addLog('❌ 下载失败或已取消');
                addLog('━━━━━━━━━━━━━━━━━━━━━');
                updateProgress(0, '下载失败');
            }

        } catch (error) {
            logger.error('下载过程出错', error);

            addLog('━━━━━━━━━━━━━━━━━━━━━');
            addLog('❌ 下载错误');
            addLog('━━━━━━━━━━━━━━━━━━━━━');

            // 详细的错误分析和提示
            const errorMsg = error.message || '未知错误';

            if (errorMsg.includes('403')) {
                addLog('🔒 HTTP 403 - 服务器拒绝访问');
                addLog('💡 可能的原因：');
                addLog('   • 视频网站有防盗链保护');
                addLog('   • 需要特定的 Referer 或 Cookie');
                addLog('   • IP 被限制或需要登录');
                addLog('💡 建议：');
                addLog('   • 尝试使用浏览器访问该链接');
                addLog('   • 检查链接是否需要登录');
                addLog('   • 联系视频网站管理员');
            } else if (errorMsg.includes('404')) {
                addLog('🔍 HTTP 404 - 文件不存在');
                addLog('💡 可能的原因：');
                addLog('   • M3U8 链接已过期');
                addLog('   • 链接地址错误');
                addLog('💡 建议：重新获取 M3U8 链接');
            } else if (errorMsg.includes('Network') || errorMsg.includes('timeout')) {
                addLog('🌐 网络错误');
                addLog('💡 可能的原因：');
                addLog('   • 网络连接不稳定');
                addLog('   • 服务器响应超时');
                addLog('   • 防火墙拦截');
                addLog('💡 建议：');
                addLog('   • 检查网络连接');
                addLog('   • 尝试增加超时时间');
                addLog('   • 切换网络环境');
            } else if (errorMsg.includes('CORS')) {
                addLog('🔐 跨域访问错误');
                addLog('💡 这不应该发生，请报告此问题');
            } else {
                addLog(`📄 错误详情: ${errorMsg}`);
                addLog('💡 建议：');
                addLog('   • 复制错误日志报告问题');
                addLog('   • 尝试使用不同的 M3U8 链接');
            }

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

// 保存设置
function saveSettings() {
    const timeout = elements.timeoutInput.value;
    const retry = elements.retryInput.value;

    const settings = {
        timeout: parseInt(timeout),
        retry: parseInt(retry)
    };

    localStorage.setItem('m3u8_settings', JSON.stringify(settings));

    addLog('💾 设置已保存');
    elements.footerStatus.textContent = '设置已保存';

    setTimeout(() => {
        elements.footerStatus.textContent = '就绪';
    }, 2000);
}

// 加载设置
function loadSettings() {
    const saved = localStorage.getItem('m3u8_settings');
    if (saved) {
        try {
            const settings = JSON.parse(saved);
            elements.timeoutInput.value = settings.timeout || 30;
            elements.retryInput.value = settings.retry || 3;
        } catch (e) {
            logger.warn('加载设置失败', e);
        }
    }
}

// 切换日志类型
function switchLogType(type) {
    currentLogType = type;

    elements.logTypeBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.logType === type);
    });

    const labels = {
        'runtime': '运行日志',
        'download': '下载记录',
        'error': '错误日志'
    };
    elements.logTypeLabel.textContent = labels[type] || '日志';

    refreshLogs();
}

// 刷新日志
function refreshLogs() {
    try {
        const logContent = logger.getRecentLogs(currentLogType, 500);
        elements.logContent.textContent = logContent || '暂无日志内容';
        elements.logContent.scrollTop = elements.logContent.scrollHeight;

        elements.footerStatus.textContent = '日志已刷新';
        setTimeout(() => {
            elements.footerStatus.textContent = '就绪';
        }, 2000);
    } catch (error) {
        logger.error('刷新日志失败', error);
        elements.logContent.textContent = '加载日志失败：' + error.message;
    }
}

// 清除所有日志
function clearAllLogs() {
    if (confirm('确定要清除所有日志吗？')) {
        logger.clearLogs();
        elements.logContent.textContent = '日志已清除';
        addLog('所有日志已清除');
        elements.footerStatus.textContent = '日志已清除';
    }
}

// 复制日志
async function copyLogs() {
    try {
        const logText = elements.logContent.textContent;

        if (!logText || logText === '暂无日志内容' || logText === '日志已清除') {
            addLog('⚠️ 没有可复制的日志');
            return;
        }

        // 使用Capacitor Clipboard插件
        await Clipboard.write({
            string: logText
        });

        addLog('✅ 日志已复制到剪贴板');
        elements.footerStatus.textContent = '日志已复制';

        setTimeout(() => {
            elements.footerStatus.textContent = '就绪';
        }, 2000);
    } catch (error) {
        logger.error('复制日志失败', error);
        addLog(`❌ 复制失败: ${error.message || '请检查剪贴板权限'}`);
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    init();
});

// 处理 Capacitor App 事件（如果在 Android 环境中）
if (typeof Capacitor !== 'undefined') {
    document.addEventListener('deviceready', () => {
        logger.info('Capacitor 环境已就绪');
        addLog('✅ Android 环境初始化完成');
    });
}
