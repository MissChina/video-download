# -*- coding: utf-8 -*-
"""
改进的可滚动Frame组件
"""
import tkinter as tk
from tkinter import ttk


class ImprovedScrollableFrame(ttk.Frame):
    """改进的可滚动Frame容器，确保滚动功能正常工作"""
    
    def __init__(self, parent, height=None, *args, **kwargs):
        super().__init__(parent, *args, **kwargs)
        
        self.height = height
        
        # 创建Canvas和Scrollbar
        self.canvas = tk.Canvas(self, highlightthickness=0, bd=0)
        self.v_scrollbar = ttk.Scrollbar(self, orient="vertical", command=self.canvas.yview)
        
        # 创建可滚动的frame
        self.scrollable_frame = ttk.Frame(self.canvas)
        
        # 配置Canvas
        self.canvas.configure(yscrollcommand=self.v_scrollbar.set)
        
        # 布局Canvas和滚动条
        self.canvas.pack(side="left", fill="both", expand=True)
        self.v_scrollbar.pack(side="right", fill="y")
        
        # 创建Canvas窗口
        self.canvas_window = self.canvas.create_window(0, 0, window=self.scrollable_frame, anchor="nw")
        
        # 绑定事件
        self.scrollable_frame.bind("<Configure>", self._on_frame_configure)
        self.canvas.bind("<Configure>", self._on_canvas_configure)
        
        # 绑定鼠标滚轮到Canvas和scrollable_frame
        self._bind_mousewheel_to_widgets()
        
        # 设置固定高度
        if height:
            self.canvas.configure(height=height)
    
    def _bind_mousewheel_to_widgets(self):
        """递归绑定鼠标滚轮到所有子组件"""
        def bind_recursive(widget):
            widget.bind("<MouseWheel>", self._on_mousewheel)
            widget.bind("<Button-4>", self._on_mousewheel)  # Linux
            widget.bind("<Button-5>", self._on_mousewheel)  # Linux
            
            # 递归绑定子组件
            try:
                for child in widget.winfo_children():
                    bind_recursive(child)
            except:
                pass
        
        # 绑定到canvas和scrollable_frame
        bind_recursive(self.canvas)
        bind_recursive(self.scrollable_frame)
    
    def _on_frame_configure(self, event):
        """当内容frame大小改变时更新滚动区域"""
        self.canvas.configure(scrollregion=self.canvas.bbox("all"))
        
        # 如果内容小于canvas，禁用滚动条
        canvas_height = self.canvas.winfo_height()
        content_height = self.scrollable_frame.winfo_reqheight()
        
        if content_height <= canvas_height:
            self.v_scrollbar.pack_forget()
        else:
            self.v_scrollbar.pack(side="right", fill="y")
    
    def _on_canvas_configure(self, event):
        """当Canvas大小改变时调整内容frame的宽度"""
        self.canvas.itemconfig(self.canvas_window, width=event.width)
    
    def _on_mousewheel(self, event):
        """处理鼠标滚轮事件"""
        # 检查是否有内容需要滚动
        if self.v_scrollbar.winfo_viewable():
            # 处理不同平台的滚轮事件
            if event.num == 4 or event.delta > 0:
                self.canvas.yview_scroll(-1, "units")
            elif event.num == 5 or event.delta < 0:
                self.canvas.yview_scroll(1, "units")
            else:
                self.canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")
    
    def add_widget_mousewheel(self, widget):
        """为新添加的组件绑定鼠标滚轮"""
        def bind_recursive(w):
            w.bind("<MouseWheel>", self._on_mousewheel)
            w.bind("<Button-4>", self._on_mousewheel)
            w.bind("<Button-5>", self._on_mousewheel)
            try:
                for child in w.winfo_children():
                    bind_recursive(child)
            except:
                pass
        bind_recursive(widget)
    
    def scroll_to_top(self):
        """滚动到顶部"""
        self.canvas.yview_moveto(0)
    
    def scroll_to_bottom(self):
        """滚动到底部"""
        self.canvas.yview_moveto(1)