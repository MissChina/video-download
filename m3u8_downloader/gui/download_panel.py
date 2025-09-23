# -*- coding: utf-8 -*-
"""
下载面板 - 重新设计，优化空间分配
"""
import os
import threading
import tkinter as tk
from tkinter import ttk, filedialog, messagebox

try:
    from ..core.downloader import M3U8Downloader
    from ..ffmpeg.manager import FFmpegManager
    from .styles import setup_styles, get_font
except ImportError:
    from m3u8_downloader.core.downloader import M3U8Downloader
    from m3u8_downloader.ffmpeg.manager import FFmpegManager
    from m3u8_downloader.gui.styles import setup_styles, get_font


class DownloadPanel(ttk.Frame):
    def __init__(self, master):
        super().__init__(master)
        self.downloader = M3U8Downloader()
        self.ff = FFmpegManager()
        self.is_placeholder = True
        self._build_ui()

    def _build_ui(self):
        """构建优化的用户界面"""
        setup_styles()
        
        # 主容器
        main_container = ttk.Frame(self)
        main_container.pack(fill='both', expand=True, padx=15, pady=15)
        
        # 使用网格布局进行精确控制
        main_container.grid_rowconfigure(2, weight=1)  # 让进度区域可扩展
        main_container.grid_columnconfigure(0, weight=1)

        # === URL输入区域 (紧凑, 固定高度) ===
        url_card = ttk.LabelFrame(main_container, text="📺 视频链接", style='Card.TLabelframe')
        url_card.grid(row=0, column=0, sticky='ew', pady=(0, 8))
        
        url_inner = ttk.Frame(url_card)
        url_inner.pack(fill='x', padx=15, pady=12)
        
        # URL输入框
        input_frame = ttk.Frame(url_inner)
        input_frame.pack(fill='x', pady=(0, 8))
        
        self.url_var = tk.StringVar()
        self.url_entry = ttk.Entry(
            input_frame,
            textvariable=self.url_var,
            font=get_font('default'),
            style='Large.TEntry'
        )
        self.url_entry.pack(side='left', fill='x', expand=True)
        
        # 工具按钮组
        tools_frame = ttk.Frame(input_frame)
        tools_frame.pack(side='right', padx=(10, 0))
        
        ttk.Button(
            tools_frame,
            text="📋",
            command=self._paste_url,
            style='Tool.TButton',
            width=4
        ).pack(side='left', padx=(0, 2))
        
        ttk.Button(
            tools_frame,
            text="🗑️",
            command=self._clear_url,
            style='Tool.TButton',
            width=4
        ).pack(side='left')

        # === 文件设置区域 (紧凑, 固定高度) ===
        file_card = ttk.LabelFrame(main_container, text="💾 文件设置", style='Card.TLabelframe')
        file_card.grid(row=1, column=0, sticky='ew', pady=(0, 8))
        
        file_inner = ttk.Frame(file_card)
        file_inner.pack(fill='x', padx=15, pady=12)
        
        # 保存路径
        path_frame = ttk.Frame(file_inner)
        path_frame.pack(fill='x', pady=(0, 6))
        
        ttk.Label(path_frame, text="保存目录:", font=get_font('default')).pack(side='left')
        
        self.output_dir = tk.StringVar(value=os.path.expanduser("~/Downloads"))
        ttk.Entry(
            path_frame,
            textvariable=self.output_dir,
            font=get_font('default'),
            state='readonly',
            style='Large.TEntry'
        ).pack(side='left', fill='x', expand=True, padx=(8, 8))
        
        ttk.Button(
            path_frame,
            text="📁",
            command=self._select_directory,
            style='Tool.TButton',
            width=4
        ).pack(side='right')
        
        # 文件名和格式
        name_frame = ttk.Frame(file_inner)
        name_frame.pack(fill='x')
        
        # 左侧文件名
        name_left = ttk.Frame(name_frame)
        name_left.pack(side='left', fill='x', expand=True)
        
        ttk.Label(name_left, text="文件名:", font=get_font('default')).pack(side='left')
        
        self.filename_var = tk.StringVar(value="video")
        ttk.Entry(
            name_left,
            textvariable=self.filename_var,
            font=get_font('default'),
            width=20
        ).pack(side='left', padx=(8, 0))
        
        # 右侧格式和线程
        settings_right = ttk.Frame(name_frame)
        settings_right.pack(side='right')
        
        ttk.Label(settings_right, text="格式:", font=get_font('default')).pack(side='left', padx=(20, 5))
        
        self.format_var = tk.StringVar(value="mp4")
        format_combo = ttk.Combobox(
            settings_right,
            textvariable=self.format_var,
            values=["mp4", "mkv", "ts"],
            state="readonly",
            width=8,
            style='Modern.TCombobox'
        )
        format_combo.pack(side='left')
        
        ttk.Label(settings_right, text="线程:", font=get_font('default')).pack(side='left', padx=(15, 5))
        
        self.workers = tk.IntVar(value=16)
        ttk.Spinbox(
            settings_right,
            from_=1,
            to=64,
            textvariable=self.workers,
            width=8,
            style='Modern.TSpinbox'
        ).pack(side='right')

        # === 操作按钮区域 (固定高度) ===
        action_frame = ttk.Frame(main_container)
        action_frame.grid(row=3, column=0, sticky='ew', pady=(8, 0))
        
        # 大按钮
        button_container = ttk.Frame(action_frame)
        button_container.pack(expand=True)
        
        self.download_btn = ttk.Button(
            button_container,
            text="🚀 开始下载",
            command=self._start_download,
            style='Primary.TButton'
        )
        self.download_btn.pack(side='left', padx=(0, 10))
        
        self.stop_btn = ttk.Button(
            button_container,
            text="⏹ 停止下载",
            command=self._stop_download,
            style='Danger.TButton',
            state='disabled'
        )
        self.stop_btn.pack(side='left')

        # === 进度显示区域 (可扩展占用大部分空间) ===
        progress_card = ttk.LabelFrame(main_container, text="📊 下载进度", style='Card.TLabelframe')
        progress_card.grid(row=2, column=0, sticky='nsew', pady=(0, 8))
        
        progress_inner = ttk.Frame(progress_card)
        progress_inner.pack(fill='both', expand=True, padx=15, pady=15)
        
        # 进度条
        self.progress_var = tk.DoubleVar()
        self.progress_bar = ttk.Progressbar(
            progress_inner,
            variable=self.progress_var,
            maximum=100,
            style='Modern.Horizontal.TProgressbar'
        )
        self.progress_bar.pack(fill='x', pady=(0, 10))
        
        # 状态信息网格
        status_grid = ttk.Frame(progress_inner)
        status_grid.pack(fill='x', pady=(0, 10))
        
        # 左侧状态
        left_status = ttk.Frame(status_grid)
        left_status.pack(side='left', fill='x', expand=True)
        
        self.status_var = tk.StringVar(value="准备就绪")
        ttk.Label(
            left_status,
            textvariable=self.status_var,
            font=get_font('default'),
            foreground='#2c3e50'
        ).pack(anchor='w')
        
        self.current_file_var = tk.StringVar()
        ttk.Label(
            left_status,
            textvariable=self.current_file_var,
            font=get_font('caption'),
            foreground='#7f8c8d'
        ).pack(anchor='w', pady=(2, 0))
        
        # 右侧统计
        right_status = ttk.Frame(status_grid)
        right_status.pack(side='right')
        
        self.speed_var = tk.StringVar()
        ttk.Label(
            right_status,
            textvariable=self.speed_var,
            font=get_font('default'),
            foreground='#27ae60'
        ).pack(anchor='e')
        
        self.time_var = tk.StringVar()
        ttk.Label(
            right_status,
            textvariable=self.time_var,
            font=get_font('caption'),
            foreground='#7f8c8d'
        ).pack(anchor='e', pady=(2, 0))
        
        # 日志显示区域 (可滚动)
        log_frame = ttk.LabelFrame(progress_inner, text="📋 下载日志", style='Card.TLabelframe')
        log_frame.pack(fill='both', expand=True, pady=(10, 0))
        
        # 创建滚动文本框
        log_container = ttk.Frame(log_frame)
        log_container.pack(fill='both', expand=True, padx=8, pady=8)
        
        self.log_text = tk.Text(
            log_container,
            height=8,
            font=get_font('code', 9),
            bg='#f8f9fa',
            fg='#495057',
            wrap=tk.WORD,
            state=tk.DISABLED
        )
        
        log_scrollbar = ttk.Scrollbar(log_container, orient="vertical", command=self.log_text.yview)
        self.log_text.configure(yscrollcommand=log_scrollbar.set)
        
        self.log_text.pack(side="left", fill="both", expand=True)
        log_scrollbar.pack(side="right", fill="y")
        
        # 初始日志
        self._log_message("🎯 请输入M3U8链接开始下载")
        
        # 绑定URL输入框回车键
        self.url_entry.bind('<Return>', lambda e: self._start_download())

    def _paste_url(self):
        """从剪贴板粘贴URL"""
        try:
            url = self.clipboard_get()
            if url:
                self.url_var.set(url.strip())
                self._log_message(f"📋 已粘贴链接: {url[:50]}...")
        except tk.TclError:
            messagebox.showwarning("警告", "剪贴板为空或无法访问")

    def _clear_url(self):
        """清空URL"""
        self.url_var.set("")
        self._log_message("🗑️ 已清空链接")

    def _select_directory(self):
        """选择保存目录"""
        directory = filedialog.askdirectory(initialdir=self.output_dir.get())
        if directory:
            self.output_dir.set(directory)
            self._log_message(f"📁 已选择目录: {directory}")

    def _log_message(self, message):
        """添加日志消息"""
        self.log_text.configure(state=tk.NORMAL)
        self.log_text.insert(tk.END, f"{message}\n")
        self.log_text.configure(state=tk.DISABLED)
        self.log_text.see(tk.END)

    def _start_download(self):
        """开始下载"""
        url = self.url_var.get().strip()
        if not url:
            messagebox.showerror("错误", "请输入M3U8链接")
            return
        
        if not url.lower().startswith(('http://', 'https://')):
            messagebox.showerror("错误", "请输入有效的HTTP/HTTPS链接")
            return
        
        # 检查FFmpeg
        if not self.ff.is_available():
            result = messagebox.askyesno("FFmpeg未安装", 
                                       "下载需要FFmpeg支持，是否现在自动安装？\n"
                                       "点击'是'将自动下载安装FFmpeg")
            if result:
                self._log_message("🔧 正在安装FFmpeg...")
                def install_callback(message):
                    self._log_message(message)
                
                def complete_callback(success):
                    if success:
                        self._log_message("✅ FFmpeg安装成功，开始下载...")
                        self._real_download(url)
                    else:
                        self._log_message("❌ FFmpeg安装失败，无法继续下载")
                        self.download_btn.configure(state='normal')
                        self.stop_btn.configure(state='disabled')
                
                self.ff.download_ffmpeg_async(install_callback, complete_callback)
                return
            else:
                self._log_message("❌ 需要FFmpeg才能完成下载")
                return
        
        # 开始真实下载
        self._real_download(url)
    
    def _real_download(self, url):
        """执行真实的下载逻辑"""
        # 更新UI状态
        self.download_btn.configure(state='disabled')
        self.stop_btn.configure(state='normal')
        self.status_var.set("正在解析M3U8...")
        self.progress_var.set(0)
        
        self._log_message(f"🚀 开始下载: {url}")
        
        def download_thread():
            try:
                # 配置下载参数
                output_dir = self.output_dir.get()
                filename = self.filename_var.get() or "video"
                format_ext = self.format_var.get()
                workers = self.workers.get()
                
                output_file = os.path.join(output_dir, f"{filename}.{format_ext}")
                
                # 配置下载器
                ffmpeg_path = self.ff.find_ffmpeg()
                if ffmpeg_path:
                    self.downloader.ffmpeg_path = ffmpeg_path
                
                # 设置进度回调
                def progress_callback(progress, message):
                    self.progress_var.set(progress)
                    self.status_var.set(message)
                    self._log_message(f"📊 {message} ({progress}%)")
                
                # 设置日志回调（通过downloader.log访问）
                self.original_log = self.downloader.log
                def enhanced_log(msg):
                    self.original_log(msg)
                    self._log_message(f"💡 {msg}")
                
                self.downloader.log = enhanced_log
                
                # 执行下载
                success = self.downloader.start(
                    m3u8_url=url,
                    output_file=output_file,
                    max_workers=workers,
                    progress_callback=progress_callback
                )
                
                if success and not self.downloader.is_canceled:
                    self.progress_var.set(100)
                    self.status_var.set("✅ 下载完成")
                    self.speed_var.set("")
                    self.time_var.set("")
                    self._log_message(f"🎉 下载完成: {output_file}")
                    messagebox.showinfo("成功", f"视频下载完成！\n保存位置: {output_file}")
                elif self.downloader.is_canceled:
                    self.status_var.set("下载已取消")
                    self._log_message("⏹ 下载被用户取消")
                else:
                    self.status_var.set("❌ 下载失败")
                    self._log_message("❌ 下载失败，请查看日志详情")
                    messagebox.showerror("下载失败", "下载过程中发生错误，请检查网络连接和M3U8链接")
                    
            except Exception as e:
                self.status_var.set("❌ 下载错误")
                error_msg = f"❌ 下载过程出错: {str(e)}"
                self._log_message(error_msg)
                messagebox.showerror("错误", f"下载失败: {str(e)}")
            finally:
                # 恢复UI状态
                self.download_btn.configure(state='normal')
                self.stop_btn.configure(state='disabled')
                # 恢复原始log方法
                if hasattr(self, 'original_log'):
                    self.downloader.log = self.original_log
        
        # 启动下载线程
        threading.Thread(target=download_thread, daemon=True).start()

    def _stop_download(self):
        """停止下载"""
        self._log_message("⏹ 用户取消下载")
        self.downloader.cancel()
        self.download_btn.configure(state='normal')
        self.stop_btn.configure(state='disabled')
        self.status_var.set("下载已停止")
        self.progress_var.set(0)
        self.speed_var.set("")
        self.time_var.set("")