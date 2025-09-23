#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
项目清理脚本
用于清理Python缓存、临时文件等
"""
import os
import shutil
import glob
from pathlib import Path

def clean_pycache():
    """清理Python缓存目录"""
    print("🧹 清理Python缓存文件...")
    cache_dirs = list(Path('.').rglob('__pycache__'))
    for cache_dir in cache_dirs:
        if cache_dir.is_dir():
            print(f"  删除: {cache_dir}")
            shutil.rmtree(cache_dir, ignore_errors=True)
    
    # 清理.pyc文件
    pyc_files = list(Path('.').rglob('*.pyc'))
    for pyc_file in pyc_files:
        print(f"  删除: {pyc_file}")
        pyc_file.unlink(missing_ok=True)

def clean_build_files():
    """清理构建文件"""
    print("🧹 清理构建文件...")
    build_dirs = ['build', 'dist', '.eggs', '*.egg-info']
    
    for pattern in build_dirs:
        if '*' in pattern:
            # 处理通配符模式
            for path in glob.glob(pattern):
                if os.path.isdir(path):
                    print(f"  删除目录: {path}")
                    shutil.rmtree(path, ignore_errors=True)
                else:
                    print(f"  删除文件: {path}")
                    try:
                        os.remove(path)
                    except:
                        pass
        else:
            # 处理普通目录名
            if os.path.exists(pattern):
                print(f"  删除目录: {pattern}")
                shutil.rmtree(pattern, ignore_errors=True)
    
    # 清理spec文件
    spec_files = list(Path('.').glob('*.spec'))
    for spec_file in spec_files:
        print(f"  删除: {spec_file}")
        spec_file.unlink(missing_ok=True)

def clean_temp_files():
    """清理临时文件"""
    print("🧹 清理临时文件...")
    temp_patterns = [
        '*.tmp', '*.temp', '*.log', '*.bak', '*.swp', 
        '*~', '.DS_Store', 'Thumbs.db', '*.orig'
    ]
    
    for pattern in temp_patterns:
        temp_files = list(Path('.').rglob(pattern))
        for temp_file in temp_files:
            print(f"  删除: {temp_file}")
            temp_file.unlink(missing_ok=True)

def clean_ide_files():
    """清理IDE文件（可选）"""
    print("🧹 清理IDE临时文件...")
    ide_patterns = [
        '.vscode/settings.json.bak',
        '.idea/workspace.xml',
        '*.sublime-workspace'
    ]
    
    for pattern in ide_patterns:
        if '*' in pattern:
            ide_files = list(Path('.').rglob(pattern))
            for ide_file in ide_files:
                print(f"  删除: {ide_file}")
                ide_file.unlink(missing_ok=True)
        elif os.path.exists(pattern):
            print(f"  删除: {pattern}")
            os.remove(pattern)

def main():
    """主函数"""
    print("🔧 M3U8下载器项目清理工具")
    print("=" * 40)
    
    # 获取项目根目录
    os.chdir(Path(__file__).parent)
    
    # 执行清理
    clean_pycache()
    clean_build_files()
    clean_temp_files()
    clean_ide_files()
    
    print("✅ 清理完成!")
    print("💡 项目已整理干净，可以进行构建或提交")

if __name__ == "__main__":
    main()