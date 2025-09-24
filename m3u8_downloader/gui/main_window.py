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
        self.root.title("🎬 M3U8 视频下载器 - 旗舰版")
        
        # 设置更合适的窗口尺寸
        self.root.geometry("1000x700")
        self.root.minsize(900, 600)
        
        # 窗口居中显示
        self.root.update_idletasks()
        screen_width = self.root.winfo_screenwidth()
        screen_height = self.root.winfo_screenheight()
        x = (screen_width // 2) - (1000 // 2)
        y = (screen_height // 2) - (700 // 2)
        self.root.geometry(f"1000x700+{x}+{y}")
        
        # 设置窗口属性
        self.root.configure(bg='#f0f2f5')  # 更柔和的背景色
        self.root.resizable(True, True)
        
        # 设置窗口图标和属性
        try:
            # 设置窗口透明度和阴影效果（Windows 10/11）
            self.root.attributes('-alpha', 0.98)
            # 设置窗口置顶（可选）
            # self.root.attributes('-topmost', True)
        except:
            pass
        
        # 设置样式
        self.style = setup_styles()
        
        self._setup_ui()
        
    def _setup_ui(self):
        """设置简洁的用户界面"""
        # 主容器 - 减少边距，去掉标题区域
        self.main_frame = ttk.Frame(self.root)
        self.main_frame.pack(fill='both', expand=True, padx=20, pady=15)
        
        # 直接创建标签页容器，去掉标题区域
        self.notebook = ttk.Notebook(self.main_frame)
        self.notebook.pack(fill='both', expand=True, pady=(0, 15))
        
        # 创建面板
        self.download_panel = DownloadPanel(self.notebook)
        self.settings_panel = SettingsPanel(self.notebook)
        self.about_panel = AboutPanel(self.notebook)
        
        # 添加标签页 - 使用更好的图标和间距
        self.notebook.add(self.download_panel, text='   📥 下载中心   ')
        self.notebook.add(self.settings_panel, text='   ⚙️ 系统设置   ')
        self.notebook.add(self.about_panel, text='   ℹ️ 关于软件   ')
        
        # 设置默认选中第一个标签页
        self.notebook.select(0)
        
        # 底部状态栏 - 现代化设计
        footer_frame = ttk.Frame(self.main_frame)
        footer_frame.pack(fill='x', side='bottom')
        
        # 优雅的分隔线
        separator_bottom = ttk.Separator(footer_frame, orient='horizontal')
        separator_bottom.pack(fill='x', pady=(20, 25))
        
        status_container = ttk.Frame(footer_frame)
        status_container.pack(fill='x')
        
        # 左侧实时状态
        left_status = ttk.Frame(status_container)
        left_status.pack(side='left')
        
        self.status_var = tk.StringVar(value="💤 系统就绪，等待任务...")
        status_label = ttk.Label(
            left_status, 
            textvariable=self.status_var,
            font=get_font('default', 11),
            foreground='#2563eb'
        )
        status_label.pack(side='left')
        
        # 中间快捷提示
        center_frame = ttk.Frame(status_container)
        center_frame.pack(expand=True)
        
        quick_help = ttk.Label(
            center_frame,
            text="💡 快捷键：Ctrl+V 粘贴链接 | Enter 开始下载 | Esc 取消下载",
            font=get_font('small'),
            foreground='#64748b'
        )
        quick_help.pack()
        
        # 右侧版权和版本信息
        right_info = ttk.Frame(status_container)
        right_info.pack(side='right')
        
        copyright_label = ttk.Label(
            right_info,
            text="© 2025 MissChina | 旗舰版 v2.5",
            font=get_font('small'),
            foreground='#64748b'
        )
        copyright_label.pack(anchor='e')
        
        # 在线帮助链接
        help_label = ttk.Label(
            right_info,
            text="📖 在线帮助",
            font=get_font('small'),
            foreground='#2563eb',
            cursor='hand2'
        )
        help_label.pack(anchor='e', pady=(2, 0))
        
        # 绑定帮助点击事件
        help_label.bind('<Button-1>', self._show_help)
        
    def _check_system_status(self):
        """检查系统状态"""
        def check_status():
            try:
                # 这里可以添加系统状态检查逻辑
                # 由于删除了标题区域，这些状态指示器不再存在
                pass
                    
            except Exception as e:
                # 处理异常
                pass
        
        # 异步检查避免阻塞UI
        import threading
        threading.Thread(target=check_status, daemon=True).start()
        
    def _show_help(self, event):
        """显示帮助信息"""
        from tkinter import messagebox
        help_text = """
🎬 M3U8 视频下载器 - 旗舰版 v2.5

📖 使用帮助：

1. 📥 下载视频：
   • 在"视频链接输入"区域粘贴M3U8链接
   • 设置保存目录和文件名
   • 选择输出格式和下载线程数
   • 点击"开始下载"按钮

2. ⚙️ 系统设置：
   • FFmpeg管理：一键安装和配置
   • 网络设置：代理、超时、重试等
   • 高级选项：日志、临时文件等

3. 🔧 快捷键：
   • Ctrl+V：粘贴链接
   • Enter：开始下载
   • Esc：取消下载

4. 💡 技巧：
   • 支持拖拽链接到输入框
   • 自动选择最佳视频质量
   • 智能重试失败的片段

📧 技术支持：misschinadev@example.com
🌐 官方网站：https://m3u8downloader.com
        """
        messagebox.showinfo("使用帮助", help_text)
        
    def run(self):
        """运行主程序"""
        self.root.mainloop()