"""
工具函数
"""
import os
import re


def ensure_dir_exists(path: str) -> None:
    """确保目录存在"""
    if not path:
        return
    os.makedirs(path, exist_ok=True)


def sanitize_filename(name: str) -> str:
    """将不安全字符替换为下划线"""
    return re.sub(r'[\\/:*?"<>|]+', '_', name)


def human_size(num: int) -> str:
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if num < 1024:
            return f"{num:.2f}{unit}"
        num /= 1024
    return f"{num:.2f}PB"
