# -*- coding: utf-8 -*-
"""
M3U8下载器 - 主程序入口
"""
import sys
import os

# 添加父目录到Python路径
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, parent_dir)

from main import main

if __name__ == '__main__':
    main()