# -*- coding: utf-8 -*-
"""
优化的UI样式配置 - 现代简洁风格
"""
import tkinter as tk
from tkinter import ttk, font

def setup_styles():
    """配置优化的UI样式"""
    style = ttk.Style()
    
    # 使用现代主题
    try:
        if tk.TkVersion >= 8.6:
            style.theme_use('clam')  # 现代化主题
        else:
            style.theme_use('default')
    except:
        style.theme_use('default')
    
    # 配置颜色方案
    colors = {
        'bg_primary': '#f8f9fa',      # 主背景
        'bg_secondary': '#ffffff',     # 次级背景
        'bg_accent': '#e9ecef',        # 强调背景
        'bg_card': '#ffffff',          # 卡片背景
        'border': '#dee2e6',           # 边框颜色
        'border_focus': '#86b7fe',     # 聚焦边框
        'text_primary': '#212529',     # 主要文字
        'text_secondary': '#6c757d',   # 次要文字
        'text_muted': '#9ca3af',       # 静音文字
        'accent': '#0d6efd',           # 强调色（蓝色）
        'accent_hover': '#0b5ed7',     # 强调色悬停
        'success': '#198754',          # 成功色（绿色）
        'success_hover': '#157347',    # 成功色悬停
        'warning': '#fd7e14',          # 警告色（橙色）
        'danger': '#dc3545',           # 危险色（红色）
        'danger_hover': '#bb2d3b',     # 危险色悬停
        'tool': '#6c757d',             # 工具按钮色
        'tool_hover': '#5c636a',       # 工具按钮悬停
    }
    
    # === 基础样式配置 ===
    style.configure('TFrame', background=colors['bg_primary'])
    style.configure('TLabelframe', 
                   background=colors['bg_primary'], 
                   borderwidth=1, 
                   relief='solid')
    style.configure('TLabelframe.Label', 
                   background=colors['bg_primary'],
                   foreground=colors['text_primary'], 
                   font=get_font('subtitle'))
    
    # === 卡片样式 ===
    style.configure('Card.TLabelframe',
                   background=colors['bg_primary'],
                   borderwidth=2,
                   relief='solid')
    style.configure('Card.TLabelframe.Label',
                   background=colors['bg_primary'],
                   foreground=colors['text_primary'],
                   font=get_font('subtitle'))
    
    # === 按钮样式 ===
    # 默认按钮
    style.configure('TButton', 
                   background=colors['bg_secondary'],
                   foreground=colors['text_primary'],
                   borderwidth=1,
                   focuscolor='none',
                   font=get_font('default'),
                   padding=(12, 8))
    
    style.map('TButton',
              background=[('active', colors['bg_accent']),
                         ('pressed', colors['border'])],
              bordercolor=[('focus', colors['accent'])])
    
    # 主要按钮样式 - 增强版
    style.configure('Primary.TButton',
                   background=colors['accent'],
                   foreground='white',
                   font=get_font('subtitle'),  # 使用更大字体
                   padding=(20, 15),  # 增加内边距
                   relief='flat')
    
    style.map('Primary.TButton',
              background=[('active', colors['accent_hover']),
                         ('pressed', '#0a58ca')],
              relief=[('pressed', 'flat')])
    
    # 成功按钮样式  
    style.configure('Success.TButton',
                   background=colors['success'],
                   foreground='white',
                   font=get_font('default'),
                   padding=(10, 6))
    
    style.map('Success.TButton',
              background=[('active', colors['success_hover']),
                         ('pressed', '#0f5132')])
    
    # 危险按钮样式 - 增强版
    style.configure('Danger.TButton',
                   background=colors['danger'],
                   foreground='white',
                   font=get_font('subtitle'),  # 使用更大字体
                   padding=(20, 15),  # 增加内边距
                   relief='flat')
    
    style.map('Danger.TButton',
              background=[('active', colors['danger_hover']),
                         ('pressed', '#a02834')],
              relief=[('pressed', 'flat')])
    
    # 工具按钮样式
    style.configure('Tool.TButton',
                   background=colors['bg_secondary'],
                   foreground=colors['tool'],
                   borderwidth=1,
                   font=get_font('default'),
                   padding=(10, 6))
    
    style.map('Tool.TButton',
              background=[('active', colors['bg_accent']),
                         ('pressed', colors['border'])],
              foreground=[('active', colors['tool_hover'])])
    
    # === 输入框样式 ===
    style.configure('TEntry',
                   fieldbackground=colors['bg_secondary'],
                   borderwidth=1,
                   insertcolor=colors['text_primary'],
                   font=get_font('default'),
                   padding=(8, 6))
    
    style.configure('Large.TEntry',
                   fieldbackground=colors['bg_secondary'],
                   borderwidth=2,
                   insertcolor=colors['accent'],
                   font=get_font('default'),
                   padding=(12, 8))
    
    style.map('TEntry',
              bordercolor=[('focus', colors['border_focus'])])
    style.map('Large.TEntry',
              bordercolor=[('focus', colors['accent']),
                          ('active', colors['accent'])])
    
    # === 下拉框样式 ===
    style.configure('Modern.TCombobox',
                   fieldbackground=colors['bg_secondary'],
                   borderwidth=2,
                   font=get_font('default'),
                   padding=(10, 8))
    
    style.map('Modern.TCombobox',
              bordercolor=[('focus', colors['accent'])])
    
    # === 数字输入框样式 ===
    style.configure('Modern.TSpinbox',
                   fieldbackground=colors['bg_secondary'],
                   borderwidth=2,
                   insertcolor=colors['accent'],
                   font=get_font('default'),
                   padding=(8, 6))
    
    style.map('Modern.TSpinbox',
              bordercolor=[('focus', colors['accent'])])
    
    # === 单选按钮样式 ===
    style.configure('Modern.TRadiobutton',
                   background=colors['bg_primary'],
                   foreground=colors['text_primary'],
                   font=get_font('default'),
                   focuscolor='none')
    
    style.map('Modern.TRadiobutton',
              background=[('active', colors['bg_primary'])])
    style.configure('Modern.TCheckbutton',
                   background=colors['bg_primary'],
                   foreground=colors['text_primary'],
                   font=get_font('default'),
                   focuscolor='none')
    
    style.map('Modern.TCheckbutton',
              background=[('active', colors['bg_primary'])])
    
    # === 标签样式 ===
    style.configure('TLabel',
                   background=colors['bg_primary'],
                   foreground=colors['text_primary'],
                   font=get_font('default'))
    
    style.configure('Heading.TLabel',
                   font=get_font('title'),
                   foreground=colors['text_primary'])
    
    style.configure('Caption.TLabel',
                   font=get_font('caption'),
                   foreground=colors['text_secondary'])
    
    # === 进度条样式 ===
    style.configure('TProgressbar',
                   background=colors['accent'],
                   borderwidth=0,
                   lightcolor=colors['accent'],
                   darkcolor=colors['accent'],
                   troughcolor=colors['bg_accent'])
    
    style.configure('Large.Horizontal.TProgressbar',
                   background=colors['accent'],
                   borderwidth=1,
                   relief='solid',
                   troughcolor=colors['bg_accent'],
                   thickness=12)
    
    style.configure('Modern.Horizontal.TProgressbar',
                   background=colors['accent'],
                   borderwidth=1,
                   relief='solid',
                   troughcolor=colors['bg_accent'],
                   thickness=8)
    
    # === Notebook 样式 ===
    style.configure('TNotebook',
                   background=colors['bg_primary'],
                   borderwidth=0)
    
    style.configure('TNotebook.Tab',
                   background=colors['bg_secondary'],
                   foreground=colors['text_primary'],
                   padding=[20, 12],
                   font=get_font('default'))
    
    style.map('TNotebook.Tab',
              background=[('selected', colors['bg_primary']),
                         ('active', colors['bg_accent'])],
              bordercolor=[('selected', colors['accent'])])
    
    return style

def get_font(style_name='default', size=None):
    """获取优化的字体配置"""
    font_configs = {
        'default': ('Microsoft YaHei UI', 9, 'normal'),
        'title': ('Microsoft YaHei UI', 12, 'bold'),
        'subtitle': ('Microsoft YaHei UI', 10, 'bold'),
        'caption': ('Microsoft YaHei UI', 8, 'normal'),
        'monospace': ('Consolas', 9, 'normal')
    }
    
    config = font_configs.get(style_name, font_configs['default'])
    actual_size = size if size is not None else config[1]
    
    return font.Font(family=config[0], size=actual_size, weight=config[2])