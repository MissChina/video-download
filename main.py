#!/usr/bin/env python3
"""
M3U8 视频下载器 - 主启动脚本
直接运行此文件启动应用
"""
import sys
import os

# 确保项目根目录在 Python 路径中
project_root = os.path.dirname(os.path.abspath(__file__))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

def main():
    """主函数 - 启动图形界面应用"""
    try:
        from m3u8_downloader.gui.main_window import MainWindow
        
        # 启动主窗口
        app = MainWindow()
        app.run()
        
    except KeyboardInterrupt:
        print("\n程序被用户中断")
        sys.exit(0)
    except Exception as e:
        print(f"启动失败: {e}")
        input("按任意键退出...")
        sys.exit(1)

if __name__ == '__main__':
    main()