# -*- coding: utf-8 -*-
"""
设置面板 - 重新设计，合理的空间分配
"""
import tkinter as tk
from tkinter import ttk, messagebox
import threading

try:
    from ..ffmpeg.manager import FFmpegManager
    from .styles import setup_styles, get_font
    from .improved_scrollable import ImprovedScrollableFrame
except ImportError:
    from m3u8_downloader.ffmpeg.manager import FFmpegManager
    from m3u8_downloader.gui.styles import setup_styles, get_font
    from m3u8_downloader.gui.improved_scrollable import ImprovedScrollableFrame


class SettingsPanel(ttk.Frame):
    def __init__(self, master):
        super().__init__(master)
        self.ff = FFmpegManager()
        self._build_ui()
    
    def _build_ui(self):
        """构建用户界面 - 重新设计空间分配"""
        setup_styles()
        
        # 主容器 - 减少边距
        main_container = ttk.Frame(self)
        main_container.pack(fill='both', expand=True, padx=15, pady=15)

        # === 使用网格布局进行空间分配 ===
        main_container.grid_rowconfigure(1, weight=1)  # 让滚动区域可扩展
        main_container.grid_columnconfigure(0, weight=1)

        # === FFmpeg 管理区域 (固定高度) ===
        ffmpeg_card = ttk.LabelFrame(main_container, text="🔧 FFmpeg 工具", style='Card.TLabelframe')
        ffmpeg_card.grid(row=0, column=0, sticky='ew', pady=(0, 10))
        
        ffmpeg_inner = ttk.Frame(ffmpeg_card)
        ffmpeg_inner.pack(fill='x', padx=15, pady=10)
        
        # 紧凑的状态显示
        status_frame = ttk.Frame(ffmpeg_inner)
        status_frame.pack(fill='x')
        
        self.ffmpeg_status = tk.StringVar(value="检测中...")
        status_label = ttk.Label(
            status_frame, 
            textvariable=self.ffmpeg_status,
            font=get_font('default'),
            foreground='#0d6efd'
        )
        status_label.pack(side='left')
        
        # 按钮组合
        button_frame = ttk.Frame(status_frame)
        button_frame.pack(side='right')
        
        self.download_btn = ttk.Button(
            button_frame, 
            text="🚀 一键安装", 
            command=self._auto_install_ffmpeg,
            style='Primary.TButton'
        )
        self.download_btn.pack(side='left', padx=(0, 5))
        
        ttk.Button(
            button_frame, 
            text="🔄 检测", 
            command=self._update_ffmpeg_status
        ).pack(side='left')
        
        # 进度条（紧凑）
        self.progress_frame = ttk.Frame(ffmpeg_inner)
        self.progress = ttk.Progressbar(
            self.progress_frame, 
            mode='indeterminate',
            style='Modern.Horizontal.TProgressbar'
        )
        self.progress.pack(fill='x', pady=(5, 0))
        
        self.download_status = tk.StringVar()
        ttk.Label(
            self.progress_frame, 
            textvariable=self.download_status,
            font=get_font('caption'),
            foreground='#6c757d'
        ).pack(anchor='w')

        # === 主要设置区域 (可滚动，占用大部分空间) ===
        settings_card = ttk.LabelFrame(main_container, text="⚙️ 应用设置", style='Card.TLabelframe')
        settings_card.grid(row=1, column=0, sticky='nsew', pady=(0, 10))
        
        # 使用改进的滚动框架，指定高度
        scroll_frame = ImprovedScrollableFrame(settings_card, height=400)
        scroll_frame.pack(fill='both', expand=True, padx=5, pady=5)
        
        settings_inner = scroll_frame.scrollable_frame
        
        # === 基础设置区域 ===
        basic_section = ttk.Frame(settings_inner)
        basic_section.pack(fill='x', padx=15, pady=(10, 15))
        
        # 界面主题
        ttk.Label(basic_section, text="🎨 界面主题", font=get_font('subtitle')).pack(anchor='w', pady=(0, 8))
        
        theme_frame = ttk.Frame(basic_section)
        theme_frame.pack(fill='x', padx=10)
        
        self.theme_var = tk.StringVar(value="现代")
        ttk.Radiobutton(
            theme_frame,
            text="现代风格",
            variable=self.theme_var,
            value="现代",
            style='Modern.TRadiobutton'
        ).pack(side='left', padx=(0, 20))
        
        ttk.Radiobutton(
            theme_frame,
            text="经典风格",
            variable=self.theme_var,
            value="经典",
            style='Modern.TRadiobutton'
        ).pack(side='left')
        
        # 分隔线
        ttk.Separator(settings_inner, orient='horizontal').pack(fill='x', pady=15)
        
        # === 下载设置区域 ===
        download_section = ttk.Frame(settings_inner)
        download_section.pack(fill='x', padx=15, pady=(0, 15))
        
        ttk.Label(download_section, text="📥 下载设置", font=get_font('subtitle')).pack(anchor='w', pady=(0, 8))
        
        # 默认线程数 - 只使用外部按钮控制
        thread_frame = ttk.Frame(download_section)
        thread_frame.pack(fill='x', padx=10, pady=3)
        
        ttk.Label(thread_frame, text="并发线程:", font=get_font('default')).pack(side='left')
        
        # 线程控制组合
        workers_control = ttk.Frame(thread_frame)
        workers_control.pack(side='left', padx=(10, 10))
        
        # 减少按钮
        ttk.Button(workers_control, text='－', style='Counter.TButton', 
                  command=lambda: self.default_workers.set(max(1, self.default_workers.get()-1))).pack(side='left')
        
        # 数值显示框（只读）
        self.default_workers = tk.IntVar(value=16)
        workers_entry = ttk.Entry(
            workers_control,
            textvariable=self.default_workers,
            width=6,
            state='readonly',
            justify='center'
        )
        workers_entry.pack(side='left', padx=(2, 2))
        
        # 增加按钮
        ttk.Button(workers_control, text='＋', style='Counter.TButton', 
                  command=lambda: self.default_workers.set(min(64, self.default_workers.get()+1))).pack(side='left')
        
        ttk.Label(thread_frame, text="(推荐: 8-32)", font=get_font('caption'), foreground='#6c757d').pack(side='left', padx=(10, 0))
        
        # 超时设置 - 只使用外部按钮控制
        timeout_frame = ttk.Frame(download_section)
        timeout_frame.pack(fill='x', padx=10, pady=3)
        ttk.Label(timeout_frame, text="连接超时:", font=get_font('default')).pack(side='left')
        
        # 超时控制组合
        timeout_control = ttk.Frame(timeout_frame)
        timeout_control.pack(side='left', padx=(10, 10))
        
        # 减少按钮
        ttk.Button(timeout_control, text='－', style='Counter.TButton', 
                  command=lambda: self.timeout_var.set(max(5, self.timeout_var.get()-1))).pack(side='left')
        
        # 数值显示框（只读）
        self.timeout_var = tk.IntVar(value=30)
        timeout_entry = ttk.Entry(
            timeout_control,
            textvariable=self.timeout_var,
            width=6,
            state='readonly',
            justify='center'
        )
        timeout_entry.pack(side='left', padx=(2, 2))
        
        # 增加按钮
        ttk.Button(timeout_control, text='＋', style='Counter.TButton', 
                  command=lambda: self.timeout_var.set(min(300, self.timeout_var.get()+1))).pack(side='left')
        
        ttk.Label(timeout_frame, text="秒", font=get_font('caption'), foreground='#6c757d').pack(side='left')
        
        # 重试次数 - 只使用外部按钮控制
        retry_frame = ttk.Frame(download_section)
        retry_frame.pack(fill='x', padx=10, pady=3)
        ttk.Label(retry_frame, text="重试次数:", font=get_font('default')).pack(side='left')
        
        # 重试控制组合
        retry_control = ttk.Frame(retry_frame)
        retry_control.pack(side='left', padx=(10, 10))
        
        # 减少按钮
        ttk.Button(retry_control, text='－', style='Counter.TButton', 
                  command=lambda: self.retry_var.set(max(0, self.retry_var.get()-1))).pack(side='left')
        
        # 数值显示框（只读）
        self.retry_var = tk.IntVar(value=3)
        retry_entry = ttk.Entry(
            retry_control,
            textvariable=self.retry_var,
            width=6,
            state='readonly',
            justify='center'
        )
        retry_entry.pack(side='left', padx=(2, 2))
        
        # 增加按钮
        ttk.Button(retry_control, text='＋', style='Counter.TButton', 
                  command=lambda: self.retry_var.set(min(10, self.retry_var.get()+1))).pack(side='left')
        
        # 分隔线
        ttk.Separator(settings_inner, orient='horizontal').pack(fill='x', pady=15)
        
        # === 网络设置区域 ===
        network_section = ttk.Frame(settings_inner)
        network_section.pack(fill='x', padx=15, pady=(0, 15))
        
        ttk.Label(network_section, text="🌐 网络配置", font=get_font('subtitle')).pack(anchor='w', pady=(0, 8))
        
        # User-Agent
        ua_frame = ttk.Frame(network_section)
        ua_frame.pack(fill='x', padx=10, pady=3)
        
        ttk.Label(ua_frame, text="User-Agent:", font=get_font('default')).pack(anchor='w')
        
        self.user_agent = tk.StringVar(value="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        ttk.Entry(
            ua_frame,
            textvariable=self.user_agent,
            font=get_font('default'),
            style='Large.TEntry'
        ).pack(fill='x', pady=(5, 0))
        
        # 代理设置
        proxy_frame = ttk.Frame(network_section)
        proxy_frame.pack(fill='x', padx=10, pady=(8, 3))
        
        ttk.Label(proxy_frame, text="HTTP代理 (可选):", font=get_font('default')).pack(anchor='w')
        
        self.proxy_url = tk.StringVar()
        proxy_entry = ttk.Entry(
            proxy_frame,
            textvariable=self.proxy_url,
            font=get_font('default'),
            style='Large.TEntry'
        )
        proxy_entry.pack(fill='x', pady=(5, 0))
        
        ttk.Label(
            proxy_frame,
            text="格式: http://user:pass@host:port",
            font=get_font('caption'),
            foreground='#6c757d'
        ).pack(anchor='w', pady=(2, 0))
        
        # 分隔线
        ttk.Separator(settings_inner, orient='horizontal').pack(fill='x', pady=15)
        
        # === 高级选项区域 ===
        advanced_section = ttk.Frame(settings_inner)
        advanced_section.pack(fill='x', padx=15, pady=(0, 15))
        
        ttk.Label(advanced_section, text="🔧 高级选项", font=get_font('subtitle')).pack(anchor='w', pady=(0, 8))
        
        # 选项复选框
        options_frame = ttk.Frame(advanced_section)
        options_frame.pack(fill='x', padx=10)
        
        self.keep_temp = tk.BooleanVar(value=False)
        ttk.Checkbutton(
            options_frame,
            text="保留临时文件（调试用）",
            variable=self.keep_temp,
            style='Modern.TCheckbutton'
        ).pack(anchor='w', pady=2)
        
        self.verbose_log = tk.BooleanVar(value=False)
        ttk.Checkbutton(
            options_frame,
            text="启用详细日志输出",
            variable=self.verbose_log,
            style='Modern.TCheckbutton'
        ).pack(anchor='w', pady=2)
        
        self.auto_play = tk.BooleanVar(value=False)
        ttk.Checkbutton(
            options_frame,
            text="下载完成后自动播放",
            variable=self.auto_play,
            style='Modern.TCheckbutton'
        ).pack(anchor='w', pady=2)
        
        self.minimize_tray = tk.BooleanVar(value=False)
        ttk.Checkbutton(
            options_frame,
            text="最小化到系统托盘",
            variable=self.minimize_tray,
            style='Modern.TCheckbutton'
        ).pack(anchor='w', pady=2)
        
        self.show_console = tk.BooleanVar(value=False)
        ttk.Checkbutton(
            options_frame,
            text="显示控制台窗口",
            variable=self.show_console,
            style='Modern.TCheckbutton'
        ).pack(anchor='w', pady=2)

        # === 保存按钮区域 (固定在底部) ===
        save_frame = ttk.Frame(main_container)
        save_frame.grid(row=2, column=0, sticky='ew', pady=(0, 5))
        
        ttk.Button(
            save_frame,
            text="💾 保存所有设置",
            command=self._save_settings,
            style='Primary.TButton'
        ).pack(side='right')
        
        ttk.Label(
            save_frame,
            text="修改设置后请记得保存",
            font=get_font('caption'),
            foreground='#6c757d'
        ).pack(side='left')

        # 初始化状态
        self._update_ffmpeg_status()
        
        # 为滚动框架重新绑定所有组件的鼠标滚轮
        self.after(100, lambda: scroll_frame.add_widget_mousewheel(settings_inner))
        
    def _update_ffmpeg_status(self):
        """更新FFmpeg状态"""
        def check_status():
            if self.ff.is_available():
                self.ffmpeg_status.set("✅ FFmpeg 已安装")
                self.download_btn.configure(text="✅ 已安装", state='disabled')
            else:
                self.ffmpeg_status.set("❌ FFmpeg 未安装")
                self.download_btn.configure(text="⬇️ 下载", state='normal')
        
        threading.Thread(target=check_status, daemon=True).start()
    
    def _auto_install_ffmpeg(self):
        """一键自动安装FFmpeg"""
        def install():
            try:
                self.progress_frame.pack(fill='x', pady=(8, 0))
                self.progress.start()
                self.download_btn.configure(state='disabled')
                
                def progress_callback(message):
                    self.download_status.set(message)
                
                # 使用新的一键安装功能
                if self.ff.auto_install_and_configure(progress_callback):
                    self.download_status.set("🎉 FFmpeg一键安装配置完成!")
                    self._update_ffmpeg_status()
                    messagebox.showinfo("成功", "FFmpeg已成功安装并配置完成！")
                else:
                    self.download_status.set("❌ 安装失败")
                    messagebox.showerror("错误", "FFmpeg一键安装失败，请检查网络连接或手动安装")
                    
            except Exception as e:
                self.download_status.set("❌ 安装失败")
                messagebox.showerror("错误", f"安装过程中发生错误：{str(e)}")
            finally:
                self.progress.stop()
                self.download_btn.configure(state='normal')
        
        threading.Thread(target=install, daemon=True).start()
    
    def _download_ffmpeg(self):
        """备用下载方法（保持兼容性）"""
        self._auto_install_ffmpeg()
    
    def _save_settings(self):
        """保存设置"""
        # 这里可以添加设置保存逻辑
        messagebox.showinfo("设置", "✅ 设置已保存成功!")