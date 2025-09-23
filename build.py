#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
M3U8 视频下载器构建脚本
用于将项目打包为独立可执行文件
"""
import os
import sys
import shutil
import subprocess
import platform
from pathlib import Path

# 项目信息
PROJECT_NAME = "M3U8Downloader"
VERSION = "2.5.0"
MAIN_SCRIPT = "main.py"
ICON_PATH = None  # 可以添加图标路径

def check_pyinstaller():
    """检查并安装PyInstaller"""
    try:
        import PyInstaller
        print("✅ PyInstaller 已安装")
        return True
    except ImportError:
        print("❌ PyInstaller 未安装，正在安装...")
        try:
            subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'pyinstaller'])
            print("✅ PyInstaller 安装成功")
            return True
        except subprocess.CalledProcessError:
            print("❌ PyInstaller 安装失败")
            return False

def clean_build_dirs():
    """清理构建目录"""
    dirs_to_clean = ['build', 'dist', '__pycache__']
    files_to_clean = ['*.spec']
    
    for dir_name in dirs_to_clean:
        if os.path.exists(dir_name):
            print(f"🧹 清理目录: {dir_name}")
            shutil.rmtree(dir_name, ignore_errors=True)
    
    # 清理spec文件
    for spec_file in Path('.').glob('*.spec'):
        print(f"🧹 清理文件: {spec_file}")
        spec_file.unlink(missing_ok=True)

def build_executable():
    """构建可执行文件"""
    print(f"🚀 开始构建 {PROJECT_NAME} v{VERSION}")
    
    # 构建命令 - 使用python -m调用pyinstaller
    cmd = [
        sys.executable, '-m', 'PyInstaller',
        '--onefile',           # 打包为单个文件
        '--windowed',          # 不显示控制台窗口
        '--clean',             # 清理临时文件
        f'--name={PROJECT_NAME}',
        '--add-data=m3u8_downloader;m3u8_downloader',  # 包含整个模块
    ]
    
    # 添加图标（如果存在）
    if ICON_PATH and os.path.exists(ICON_PATH):
        cmd.extend(['--icon', ICON_PATH])
    
    # 隐藏导入
    hidden_imports = [
        'tkinter',
        'tkinter.ttk',
        'tkinter.filedialog',
        'tkinter.messagebox',
        'requests',
        'threading',
        'queue',
        'json',
        're',
        'os',
        'sys',
        'pathlib',
        'urllib.parse',
        'urllib.request',
        'zipfile',
        'subprocess',
        'concurrent.futures',
        'Crypto.Cipher.AES',
        'm3u8_downloader.core.downloader',
        'm3u8_downloader.core.decryptor',
        'm3u8_downloader.core.merger',
        'm3u8_downloader.ffmpeg.manager',
        'm3u8_downloader.gui.main_window',
        'm3u8_downloader.gui.download_panel',
        'm3u8_downloader.gui.settings_panel',
        'm3u8_downloader.gui.about_panel',
        'm3u8_downloader.gui.improved_scrollable',
        'm3u8_downloader.gui.styles',
        'm3u8_downloader.config.settings',
    ]
    
    for import_name in hidden_imports:
        cmd.extend(['--hidden-import', import_name])
    
    # 添加主脚本
    cmd.append(MAIN_SCRIPT)
    
    print("📦 执行构建命令:")
    print(" ".join(cmd))
    
    try:
        result = subprocess.run(cmd, check=True, capture_output=True, text=True)
        print("✅ 构建成功!")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ 构建失败: {e}")
        print(f"错误输出: {e.stderr}")
        return False

def post_build_actions():
    """构建后操作"""
    dist_dir = Path('dist')
    if not dist_dir.exists():
        print("❌ 构建目录不存在")
        return False
    
    executable_name = f"{PROJECT_NAME}.exe" if platform.system() == "Windows" else PROJECT_NAME
    executable_path = dist_dir / executable_name
    
    if executable_path.exists():
        size_mb = executable_path.stat().st_size / (1024 * 1024)
        print(f"📁 可执行文件: {executable_path}")
        print(f"📊 文件大小: {size_mb:.2f} MB")
        
        # 创建发布文件夹
        release_dir = Path('release')
        release_dir.mkdir(exist_ok=True)
        
        # 复制可执行文件到发布目录
        release_path = release_dir / executable_name
        shutil.copy2(executable_path, release_path)
        print(f"📦 发布文件: {release_path}")
        
        # 复制必要文件
        for file_name in ['README.md', 'LICENSE', 'requirements.txt']:
            if os.path.exists(file_name):
                shutil.copy2(file_name, release_dir / file_name)
                print(f"📄 复制文件: {file_name}")
        
        return True
    else:
        print(f"❌ 找不到可执行文件: {executable_path}")
        return False

def main():
    """主函数"""
    print("🔧 M3U8 下载器构建工具")
    print("=" * 50)
    
    # 检查环境
    if not check_pyinstaller():
        sys.exit(1)
    
    # 清理构建目录
    clean_build_dirs()
    
    # 构建可执行文件
    if not build_executable():
        print("❌ 构建失败!")
        sys.exit(1)
    
    # 构建后处理
    if not post_build_actions():
        print("❌ 后处理失败!")
        sys.exit(1)
    
    print("🎉 构建完成!")
    print("💡 提示: 可执行文件位于 release/ 目录中")

if __name__ == "__main__":
    main()