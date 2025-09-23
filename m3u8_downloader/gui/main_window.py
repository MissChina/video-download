# -*- coding: utf-8 -*-
"""
主窗口界面 - 简洁版
"""
import tkinter as tk
from tkinter import ttk
from .styles import setup_styles, get_font
from .download_panel import DownloadPanel
from .settings_panel import SettingsPanel
from .about_panel import AboutPanel

class MainWindow:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("M3U8 视频下载器")
        self.root.geometry("1100x850")  # 增加窗口尺寸
        self.root.minsize(900, 700)  # 设置最小尺寸
        self.root.minsize(950, 750)
        
        # 窗口居中
        self.root.update_idletasks()
        x = (self.root.winfo_screenwidth() // 2) - (1000 // 2)
        y = (self.root.winfo_screenheight() // 2) - (800 // 2)
        self.root.geometry(f"1100x850+{x}+{y}")
        
        # 设置现代化背景
        self.root.configure(bg='#f8f9fa')
        
        # 设置样式
        self.style = setup_styles()
        
        self._setup_ui()
        
    def _setup_ui(self):
        """设置简洁的用户界面"""
        # 主容器
        main_frame = ttk.Frame(self.root)
        main_frame.pack(fill='both', expand=True, padx=25, pady=20)
        
        # 顶部标题
        header_frame = ttk.Frame(main_frame)
        header_frame.pack(fill='x', pady=(0, 25))
        
        title_label = ttk.Label(
            header_frame,
            text="🎬 M3U8 视频下载器",
            font=get_font('title', 18)
        )
        title_label.pack(side='left')
        
        version_label = ttk.Label(
            header_frame,
            text="v2.0",
            font=get_font('caption'),
            foreground='#0d6efd'
        )
        version_label.pack(side='right')
        
        # 标签页
        self.notebook = ttk.Notebook(main_frame)
        self.notebook.pack(fill='both', expand=True, pady=(0, 20))
        
        # 创建面板
        self.download_panel = DownloadPanel(self.notebook)
        self.settings_panel = SettingsPanel(self.notebook)
        self.about_panel = AboutPanel(self.notebook)
        
        # 添加标签页
        self.notebook.add(self.download_panel, text='   📥 下载   ')
        self.notebook.add(self.settings_panel, text='   ⚙️ 设置   ')
        self.notebook.add(self.about_panel, text='   ℹ️ 关于   ')
        
        # 底部状态栏
        footer_frame = ttk.Frame(main_frame)
        footer_frame.pack(fill='x', side='bottom')
        
        ttk.Separator(footer_frame, orient='horizontal').pack(fill='x', pady=(10, 15))
        
        status_container = ttk.Frame(footer_frame)
        status_container.pack(fill='x')
        
        self.status_var = tk.StringVar(value="💤 就绪")
        status_label = ttk.Label(
            status_container, 
            textvariable=self.status_var,
            font=get_font('caption'),
            foreground='#0d6efd'
        )
        status_label.pack(side='left')
        
        copyright_label = ttk.Label(
            status_container,
            text="© 2025 MissChina",
            font=get_font('caption'),
            foreground='#6c757d'
        )
        copyright_label.pack(side='right')
        
    def run(self):
        """运行主程序"""
        self.root.mainloop()