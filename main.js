const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');
const FFmpegInstaller = require('./ffmpeg-installer');

// 禁用GPU加速，提高稳定性
app.disableHardwareAcceleration();

// 移除默认菜单栏
Menu.setApplicationMenu(null);

// 创建FFmpeg安装器实例
const ffmpegInstaller = new FFmpegInstaller();

let mainWindow;

// 全局错误处理
process.on('uncaughtException', (error) => {
  logger.fatal('未捕获的异常', error);
  // 不要立即退出，让应用尝试恢复
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('未处理的Promise拒绝', new Error(reason));
});

function createWindow() {
  try {
    const windowOptions = {
      width: 900,
      height: 600,
      minWidth: 800,
      minHeight: 550,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
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

    // 监听渲染进程崩溃（使用新API）
    mainWindow.webContents.on('render-process-gone', (event, details) => {
      logger.fatal('渲染进程崩溃', new Error(`reason: ${details.reason}, exitCode: ${details.exitCode}`));
    });

    // 监听渲染进程未响应
    mainWindow.on('unresponsive', () => {
      logger.error('窗口无响应');
    });

    // 监听渲染进程恢复响应
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

// 获取日志目录
ipcMain.handle('get-log-dir', () => {
  try {
    return logger.getLogDirectory();
  } catch (error) {
    logger.error('获取日志目录失败', error);
    return null;
  }
});

// 获取最近的错误日志
ipcMain.handle('get-recent-logs', (event, type = 'error') => {
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
    const { shell } = require('electron');
    const logDir = logger.getLogDirectory();
    await shell.openPath(logDir);
    return { success: true, path: logDir };
  } catch (error) {
    logger.error('打开日志目录失败', error);
    return { success: false, error: error.message };
  }
});

// 验证密码
ipcMain.handle('verify-log-password', (event, password) => {
  const correctPassword = '2222';
  return password === correctPassword;
});

// 检查FFmpeg是否安装
ipcMain.handle('check-ffmpeg', async () => {
  try {
    const result = await ffmpegInstaller.checkInstalled();
    if (result.installed) {
      return { installed: true, message: 'FFmpeg 已安装', path: result.path };
    } else {
      return { installed: false, message: 'FFmpeg 未安装' };
    }
  } catch (error) {
    logger.error('检查FFmpeg失败', error);
    return { installed: false, message: 'FFmpeg 未安装' };
  }
});

// 安装FFmpeg
ipcMain.handle('install-ffmpeg', async (event) => {
  try {
    const result = await ffmpegInstaller.install((progress) => {
      // 向渲染进程发送进度更新
      event.sender.send('ffmpeg-install-progress', progress);
    });

    return { success: true, ...result };
  } catch (error) {
    logger.error('安装FFmpeg失败', error);
    return { success: false, message: error.message };
  }
});

// 获取FFmpeg路径
ipcMain.handle('get-ffmpeg-path', () => {
  try {
    return ffmpegInstaller.getFFmpegPath();
  } catch (error) {
    return null;
  }
});
