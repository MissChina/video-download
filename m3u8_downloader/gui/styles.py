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
    
    # 配置现代化颜色方案 - 全新设计
    colors = {
        # 主色调 - 深蓝色系
        'primary': '#2563eb',           # 主要蓝色
        'primary_hover': '#1d4ed8',     # 主要蓝色悬停
        'primary_light': '#3b82f6',     # 浅蓝色
        'primary_dark': '#1e40af',      # 深蓝色
        
        # 背景色系 - 现代灰白
        'bg_primary': '#f8fafc',        # 主背景 - 极浅灰
        'bg_secondary': '#ffffff',      # 次级背景 - 纯白
        'bg_tertiary': '#f1f5f9',       # 第三级背景
        'bg_accent': '#e2e8f0',         # 强调背景
        'bg_card': '#ffffff',           # 卡片背景
        'bg_hover': '#f8fafc',          # 悬停背景
        
        # 边框色系
        'border': '#e2e8f0',            # 默认边框
        'border_light': '#f1f5f9',      # 浅色边框
        'border_focus': '#3b82f6',      # 聚焦边框
        'border_hover': '#cbd5e1',      # 悬停边框
        
        # 文字色系 - 高对比度
        'text_primary': '#0f172a',      # 主要文字 - 深黑
        'text_secondary': '#475569',    # 次要文字 - 中灰
        'text_tertiary': '#64748b',     # 第三级文字
        'text_muted': '#94a3b8',        # 静音文字 - 浅灰
        'text_white': '#ffffff',        # 白色文字
        
        # 状态色系 - 语义化
        'success': '#10b981',           # 成功色 - 绿色
        'success_hover': '#059669',     # 成功色悬停
        'success_light': '#d1fae5',     # 浅成功色
        
        'warning': '#f59e0b',           # 警告色 - 橙色
        'warning_hover': '#d97706',     # 警告色悬停
        'warning_light': '#fef3c7',     # 浅警告色
        
        'danger': '#ef4444',            # 危险色 - 红色
        'danger_hover': '#dc2626',      # 危险色悬停
        'danger_light': '#fee2e2',      # 浅危险色
        
        'info': '#06b6d4',              # 信息色 - 青色
        'info_hover': '#0891b2',        # 信息色悬停
        'info_light': '#cffafe',        # 浅信息色
        
        # 特殊色系
        'accent': '#8b5cf6',            # 强调色 - 紫色
        'accent_hover': '#7c3aed',      # 强调色悬停
        'gradient_start': '#667eea',    # 渐变起始色
        'gradient_end': '#764ba2',      # 渐变结束色
        
        # 工具色系
        'tool': '#6b7280',              # 工具按钮色
        'tool_hover': '#4b5563',        # 工具按钮悬停
        'disabled': '#d1d5db',          # 禁用色
        'shadow': 'rgba(0, 0, 0, 0.1)', # 阴影色
    }
    
    # === 基础样式配置 - 现代化设计 ===
    style.configure('TFrame', 
                   background=colors['bg_primary'],
                   relief='flat',
                   borderwidth=0)
    
    # 头部框架样式
    style.configure('Header.TFrame',
                   background=colors['bg_secondary'],
                   relief='flat',
                   borderwidth=1)
    
    # 标签框架样式 - 现代卡片设计
    style.configure('TLabelframe', 
                   background=colors['bg_secondary'], 
                   borderwidth=2, 
                   relief='solid',
                   bordercolor=colors['border'])
    
    style.configure('TLabelframe.Label', 
                   background=colors['bg_secondary'],
                   foreground=colors['text_primary'], 
                   font=get_font('subtitle', 12))
    
    # === 现代卡片样式 ===
    style.configure('Card.TLabelframe',
                   background=colors['bg_card'],
                   borderwidth=1,
                   relief='solid',
                   bordercolor=colors['border_light'])
    
    style.configure('Card.TLabelframe.Label',
                   background=colors['bg_card'],
                   foreground=colors['text_primary'],
                   font=get_font('subtitle', 13))
    
    # === 按钮样式 - 全新设计 ===
    # 默认按钮
    style.configure('TButton', 
                   background=colors['bg_secondary'],
                   foreground=colors['text_primary'],
                   borderwidth=2,
                   focuscolor='none',
                   font=get_font('button'),
                   padding=(16, 10),
                   relief='solid',
                   bordercolor=colors['border'])
    
    style.map('TButton',
              background=[('active', colors['bg_hover']),
                         ('pressed', colors['bg_accent'])],
              bordercolor=[('focus', colors['border_focus']),
                          ('active', colors['border_hover'])])
    
    # 主要按钮样式 - 现代化设计
    style.configure('Primary.TButton',
                   background=colors['primary'],
                   foreground=colors['text_white'],
                   font=get_font('button', 12),
                   padding=(24, 14),
                   relief='flat',
                   borderwidth=0)
    
    style.map('Primary.TButton',
              background=[('active', colors['primary_hover']),
                         ('pressed', colors['primary_dark'])],
              relief=[('pressed', 'flat')])
    
    # 成功按钮样式  
    style.configure('Success.TButton',
                   background=colors['success'],
                   foreground=colors['text_white'],
                   font=get_font('button'),
                   padding=(16, 10),
                   relief='flat',
                   borderwidth=0)
    
    style.map('Success.TButton',
              background=[('active', colors['success_hover']),
                         ('pressed', colors['success_hover'])])
    
    # 危险按钮样式 - 现代化设计
    style.configure('Danger.TButton',
                   background=colors['danger'],
                   foreground=colors['text_white'],
                   font=get_font('button', 12),
                   padding=(24, 14),
                   relief='flat',
                   borderwidth=0)
    
    style.map('Danger.TButton',
              background=[('active', colors['danger_hover']),
                         ('pressed', colors['danger_hover'])],
              relief=[('pressed', 'flat')])
    
    # 工具按钮样式 - 精致设计
    style.configure('Tool.TButton',
                   background=colors['bg_secondary'],
                   foreground=colors['tool'],
                   borderwidth=1,
                   bordercolor=colors['border'],
                   font=get_font('default'),
                   padding=(12, 8),
                   relief='solid')
    
    style.map('Tool.TButton',
              background=[('active', colors['bg_hover']),
                         ('pressed', colors['bg_accent'])],
              foreground=[('active', colors['tool_hover'])],
              bordercolor=[('active', colors['border_hover'])])

    # 计数器按钮样式（+/-）- 统一色系，紧凑圆润
    style.configure('Counter.TButton',
                   background=colors['primary_light'],
                   foreground=colors['text_white'],
                   borderwidth=0,
                   font=get_font('button', 10),
                   padding=(10, 6),
                   relief='flat')
    style.map('Counter.TButton',
              background=[('active', colors['primary_hover']),
                         ('pressed', colors['primary_dark'])])
    
    # === 输入框样式 - 现代化设计 ===
    style.configure('TEntry',
                   fieldbackground=colors['bg_secondary'],
                   borderwidth=2,
                   insertcolor=colors['primary'],
                   font=get_font('default'),
                   padding=(12, 8),
                   relief='solid',
                   bordercolor=colors['border'])
    
    style.configure('Large.TEntry',
                   fieldbackground=colors['bg_secondary'],
                   borderwidth=2,
                   insertcolor=colors['primary'],
                   font=get_font('large'),
                   padding=(14, 10),
                   relief='solid',
                   bordercolor=colors['border'])
    
    # 下拉框样式
    style.configure('Modern.TCombobox',
                   fieldbackground=colors['bg_secondary'],
                   background=colors['bg_secondary'],
                   borderwidth=2,
                   relief='solid',
                   bordercolor=colors['border'],
                   padding=(8, 6),
                   foreground=colors['text_primary'],
                   arrowcolor=colors['text_secondary'],
                   font=get_font('default'))
    
    # 数字输入框样式 - 现代化
    style.configure('Modern.TSpinbox',
                   fieldbackground=colors['bg_secondary'],
                   background=colors['bg_secondary'],
                   borderwidth=2,
                   insertcolor=colors['primary'],
                   font=get_font('default'),
                   padding=(8, 6),
                   relief='solid',
                   bordercolor=colors['border'])
    style.map('Modern.TSpinbox',
              bordercolor=[('focus', colors['border_focus']),
                          ('active', colors['border_hover'])])

    # 单选与复选按钮样式 - 统一主题
    style.configure('Modern.TRadiobutton',
                   background=colors['bg_primary'],
                   foreground=colors['text_primary'],
                   font=get_font('default'),
                   focuscolor='none',
                   padding=(8, 4))
    style.configure('Modern.TCheckbutton',
                   background=colors['bg_primary'],
                   foreground=colors['text_primary'],
                   font=get_font('default'),
                   focuscolor='none',
                   padding=(8, 4))

    # 标签样式 - 统一字号与颜色
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

    # Notebook 标签页 - 圆润视觉（通过内边距与浅边框模拟）
    style.configure('TNotebook',
                   background=colors['bg_primary'],
                   borderwidth=0,
                   tabmargins=[2, 6, 2, 0])
    style.configure('TNotebook.Tab',
                   background=colors['bg_secondary'],
                   foreground=colors['text_secondary'],
                   padding=[20, 12],
                   font=get_font('menu', 11),
                   borderwidth=2,
                   relief='solid',
                   bordercolor=colors['border'])
    style.map('TNotebook.Tab',
              background=[('selected', colors['bg_primary']),
                         ('active', colors['bg_hover'])],
              foreground=[('selected', colors['primary']),
                         ('active', colors['text_primary'])],
              bordercolor=[('selected', colors['primary']),
                          ('active', colors['border_hover'])])

    # 进度条样式 - 修复颜色显示
    style.configure('Modern.Horizontal.TProgressbar',
                   background=colors['primary'],
                   troughcolor=colors['bg_tertiary'],
                   borderwidth=0,
                   lightcolor=colors['primary'],
                   darkcolor=colors['primary'])

    # 大号进度条样式（用于更醒目的展示）- 修复颜色显示
    style.configure('Large.Horizontal.TProgressbar',
                   background=colors['primary'],
                   troughcolor=colors['bg_tertiary'],
                   borderwidth=0,
                   lightcolor=colors['primary'],
                   darkcolor=colors['primary'])
    
    # 添加进度条状态映射
    style.map('Modern.Horizontal.TProgressbar',
              background=[('active', colors['primary_hover'])])
    style.map('Large.Horizontal.TProgressbar',
              background=[('active', colors['primary_hover'])])

    return style


def get_font(style_name='default', size=None):
    """获取优化的字体配置 - 全新设计"""
    font_configs = {
        'default': ('Microsoft YaHei UI', 11, 'normal'),      # 增大默认字体
        'title': ('Microsoft YaHei UI', 18, 'bold'),          # 超大标题字体
        'subtitle': ('Microsoft YaHei UI', 13, 'bold'),       # 大副标题字体
        'caption': ('Microsoft YaHei UI', 10, 'normal'),      # 说明文字
        'code': ('JetBrains Mono', 10, 'normal'),             # 专业代码字体
        'monospace': ('Consolas', 10, 'normal'),              # 等宽字体
        'large': ('Microsoft YaHei UI', 14, 'normal'),        # 大号字体
        'small': ('Microsoft YaHei UI', 9, 'normal'),         # 小号字体
        'button': ('Microsoft YaHei UI', 11, 'bold'),         # 按钮字体
        'menu': ('Microsoft YaHei UI', 10, 'normal'),         # 菜单字体
    }
    
    config = font_configs.get(style_name, font_configs['default'])
    actual_size = size if size is not None else config[1]
    
    # 尝试使用更好的字体，如果不存在则回退
    try:
        # 将weight参数值转换为tkinter字体权重的合法值
        weight = 'bold' if config[2].lower() == 'bold' else 'normal'
        return font.Font(family=config[0], size=actual_size, weight=weight)
    except:
        # 回退到系统默认字体
        weight = 'bold' if config[2].lower() == 'bold' else 'normal'
        return font.Font(family='Arial', size=actual_size, weight=weight)
