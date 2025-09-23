# -*- coding: utf-8 -*-
"""
关于面板 - 重新设计，优化空间分配
"""
import tkinter as tk
from tkinter import ttk
import os
import platform
import sys

try:
    from .styles import setup_styles, get_font
    from .improved_scrollable import ImprovedScrollableFrame
except ImportError:
    from m3u8_downloader.gui.styles import setup_styles, get_font
    from m3u8_downloader.gui.improved_scrollable import ImprovedScrollableFrame


class AboutPanel(ttk.Frame):
    def __init__(self, master):
        super().__init__(master)
        self._build_ui()
    
    def _build_ui(self):
        """构建优化的关于界面"""
        setup_styles()
        
        # 主容器
        main_container = ttk.Frame(self)
        main_container.pack(fill='both', expand=True, padx=15, pady=15)
        
        # 使用网格布局
        main_container.grid_rowconfigure(1, weight=1)  # 让滚动区域可扩展
        main_container.grid_columnconfigure(0, weight=1)

        # === 应用信息区域 (固定高度, 顶部) ===
        app_card = ttk.LabelFrame(main_container, text="📱 应用信息", style='Card.TLabelframe')
        app_card.grid(row=0, column=0, sticky='ew', pady=(0, 10))
        
        app_inner = ttk.Frame(app_card)
        app_inner.pack(fill='x', padx=20, pady=15)
        
        # 应用图标和基本信息 (横向布局)
        info_frame = ttk.Frame(app_inner)
        info_frame.pack(fill='x')
        
        # 左侧应用信息
        left_info = ttk.Frame(info_frame)
        left_info.pack(side='left', fill='x', expand=True)
        
        ttk.Label(
            left_info,
            text="🎬 M3U8 下载器",
            font=get_font('title'),
            foreground='#2c3e50'
        ).pack(anchor='w')
        
        ttk.Label(
            left_info,
            text="版本 v2.5.0 | 现代化HLS视频下载工具",
            font=get_font('default'),
            foreground='#7f8c8d'
        ).pack(anchor='w', pady=(5, 10))
        
        # 功能特点 (精简)
        features_text = "✨ 支持AES加密解析  •  🚀 多线程并发下载  •  🎯 智能重试机制  •  💾 多格式输出"
        ttk.Label(
            left_info,
            text=features_text,
            font=get_font('caption'),
            foreground='#27ae60',
            wraplength=400
        ).pack(anchor='w')
        
        # 右侧快速统计
        stats_frame = ttk.Frame(info_frame)
        stats_frame.pack(side='right', padx=(20, 0))
        
        stats_data = [
            ("支持格式", "MP4/MKV/TS"),
            ("最大线程", "64"),
            ("加密支持", "AES-128")
        ]
        
        for label, value in stats_data:
            stat_item = ttk.Frame(stats_frame)
            stat_item.pack(anchor='e', pady=2)
            
            ttk.Label(
                stat_item,
                text=f"{label}:",
                font=get_font('caption'),
                foreground='#6c757d'
            ).pack(side='left')
            
            ttk.Label(
                stat_item,
                text=value,
                font=get_font('caption'),
                foreground='#2c3e50'
            ).pack(side='right', padx=(8, 0))

        # === 详细信息区域 (可滚动, 占大部分空间) ===
        details_card = ttk.LabelFrame(main_container, text="📋 详细信息", style='Card.TLabelframe')
        details_card.grid(row=1, column=0, sticky='nsew')
        
        # 使用改进的滚动框架
        scroll_frame = ImprovedScrollableFrame(details_card, height=350)
        scroll_frame.pack(fill='both', expand=True, padx=5, pady=5)
        
        details_inner = scroll_frame.scrollable_frame
        
        # === 技术规格区域 ===
        tech_section = ttk.Frame(details_inner)
        tech_section.pack(fill='x', padx=15, pady=(10, 0))
        
        ttk.Label(tech_section, text="⚙️ 技术规格", font=get_font('subtitle')).pack(anchor='w', pady=(0, 10))
        
        # 技术信息网格 (2列布局)
        tech_grid = ttk.Frame(tech_section)
        tech_grid.pack(fill='x', padx=10)
        
        tech_data = [
            ("开发语言", "Python 3.9+"),
            ("GUI框架", "Tkinter/ttk"),
            ("网络库", "Requests + urllib3"),
            ("加密库", "Cryptography"),
            ("多媒体", "FFmpeg 集成"),
            ("并发处理", "Threading + Queue"),
            ("配置格式", "JSON + INI"),
            ("日志系统", "Python logging")
        ]
        
        for i, (key, value) in enumerate(tech_data):
            row = i // 2
            col = i % 2
            
            item_frame = ttk.Frame(tech_grid)
            item_frame.grid(row=row, column=col, sticky='w', padx=(0, 30), pady=3)
            
            ttk.Label(
                item_frame,
                text=f"{key}:",
                font=get_font('default'),
                foreground='#495057'
            ).pack(side='left')
            
            ttk.Label(
                item_frame,
                text=value,
                font=get_font('default'),
                foreground='#6c757d'
            ).pack(side='left', padx=(8, 0))
        
        # 配置网格权重
        tech_grid.columnconfigure(0, weight=1)
        tech_grid.columnconfigure(1, weight=1)
        
        # 分隔线
        ttk.Separator(details_inner, orient='horizontal').pack(fill='x', pady=20)
        
        # === 支持格式区域 ===
        formats_section = ttk.Frame(details_inner)
        formats_section.pack(fill='x', padx=15, pady=(0, 15))
        
        ttk.Label(formats_section, text="🎯 支持功能", font=get_font('subtitle')).pack(anchor='w', pady=(0, 10))
        
        # 功能列表 (3列布局)
        features_grid = ttk.Frame(formats_section)
        features_grid.pack(fill='x', padx=10)
        
        features_data = [
            "📥 M3U8/HLS 下载",
            "🔐 AES-128 解密",
            "⚡ 多线程并发",
            "🎬 视频合并",
            "📱 现代化界面",
            "💾 多格式输出",
            "🔄 自动重试",
            "📊 实时进度",
            "⚙️ 丰富设置"
        ]
        
        for i, feature in enumerate(features_data):
            row = i // 3
            col = i % 3
            
            ttk.Label(
                features_grid,
                text=feature,
                font=get_font('default'),
                foreground='#27ae60'
            ).grid(row=row, column=col, sticky='w', padx=(0, 20), pady=2)
        
        # 配置网格权重
        for i in range(3):
            features_grid.columnconfigure(i, weight=1)
        
        # 分隔线
        ttk.Separator(details_inner, orient='horizontal').pack(fill='x', pady=20)
        
        # === 系统信息区域 ===
        system_section = ttk.Frame(details_inner)
        system_section.pack(fill='x', padx=15, pady=(0, 15))
        
        ttk.Label(system_section, text="💻 系统环境", font=get_font('subtitle')).pack(anchor='w', pady=(0, 10))
        
        # 获取系统信息（移除Python相关信息）
        try:
            system_info = {
                "操作系统": f"{platform.system()} {platform.release()}",
                "系统架构": platform.architecture()[0],
                "处理器": platform.processor() or "未知处理器",
                "用户目录": os.path.expanduser("~")
            }
        except:
            system_info = {"系统信息": "获取失败"}
        
        # 系统信息网格 (2列布局)
        system_grid = ttk.Frame(system_section)
        system_grid.pack(fill='x', padx=10)
        
        for i, (key, value) in enumerate(system_info.items()):
            row = i // 2
            col = i % 2
            
            info_frame = ttk.Frame(system_grid)
            info_frame.grid(row=row, column=col, sticky='ew', padx=(0, 25), pady=3)
            
            # 标签
            ttk.Label(
                info_frame,
                text=f"{key}:",
                font=get_font('default'),
                foreground='#495057'
            ).pack(anchor='w')
            
            # 值（处理长文本）
            display_value = str(value)
            if len(display_value) > 35:
                display_value = display_value[:32] + "..."
            
            ttk.Label(
                info_frame,
                text=display_value,
                font=get_font('caption'),
                foreground='#6c757d'
            ).pack(anchor='w', padx=(10, 0))
        
        # 配置网格权重
        system_grid.columnconfigure(0, weight=1)
        system_grid.columnconfigure(1, weight=1)
        
        # 分隔线
        ttk.Separator(details_inner, orient='horizontal').pack(fill='x', pady=20)
        
        # === 开源信息和链接区域 ===
        footer_section = ttk.Frame(details_inner)
        footer_section.pack(fill='x', padx=15, pady=(0, 20))
        
        ttk.Label(footer_section, text="📄 开源信息", font=get_font('subtitle')).pack(anchor='w', pady=(0, 10))
        
        # 版权信息
        copyright_frame = ttk.Frame(footer_section)
        copyright_frame.pack(fill='x', padx=10)
        
        copyright_text = "© 2025 M3U8 Video Downloader. 开源项目"
        ttk.Label(
            copyright_frame,
            text=copyright_text,
            font=get_font('default'),
            foreground='#6c757d'
        ).pack(anchor='w', pady=(0, 8))
        
        # 链接信息
        links_text = "🔗 项目地址: https://github.com/MissChina/video-download"
        ttk.Label(
            copyright_frame,
            text=links_text,
            font=get_font('caption'),
            foreground='#0d6efd'
        ).pack(anchor='w', pady=(0, 5))
        
        # 功能信息
        feature_text = "📧 问题反馈  •  ⭐ 给项目点星  •  🤝 欢迎贡献"
        ttk.Label(
            copyright_frame,
            text=feature_text,
            font=get_font('caption'),
            foreground='#0d6efd'
        ).pack(anchor='w')
        
        # 感谢信息
        thanks_text = "💖 感谢所有开源贡献者和用户的支持！"
        ttk.Label(
            copyright_frame,
            text=thanks_text,
            font=get_font('caption'),
            foreground='#e74c3c'
        ).pack(anchor='w', pady=(8, 0))
        
        # 为滚动框架重新绑定所有组件的鼠标滚轮
        self.after(100, lambda: scroll_frame.add_widget_mousewheel(details_inner))