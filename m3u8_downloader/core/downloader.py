"""
M3U8 下载器核心模块 - 解析、下载、解密并合并 HLS 视频
"""
import os
import re
import time
import queue
from concurrent.futures import ThreadPoolExecutor
from typing import Callable, Dict, List, Optional
from urllib.parse import urljoin

import requests

try:
    from .decryptor import Decryptor
    from .merger import Merger
    from .utils import ensure_dir_exists, sanitize_filename
except ImportError:
    from m3u8_downloader.core.decryptor import Decryptor
    from m3u8_downloader.core.merger import Merger
    from m3u8_downloader.core.utils import ensure_dir_exists, sanitize_filename


class M3U8Downloader:
    def __init__(self, ffmpeg_path: Optional[str] = None) -> None:
        self.ffmpeg_path = ffmpeg_path
        self.temp_dir: Optional[str] = None
        self.output_file: Optional[str] = None
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
            'Accept': '*/*',
            'Connection': 'keep-alive',
        })
        self.is_running = False
        self.is_canceled = False
        self.total_segments = 0
        self.downloaded_segments = 0
        self.log_queue: "queue.Queue[str]" = queue.Queue()
        self.max_retries = 3
        self.retry_delay = 1.0
        self.decryptor: Optional[Decryptor] = None
        self.merger = Merger(ffmpeg_path)

    # ---- 日志 ----
    def log(self, msg: str) -> None:
        self.log_queue.put(msg)

    def get_logs(self) -> List[str]:
        logs: List[str] = []
        while not self.log_queue.empty():
            try:
                logs.append(self.log_queue.get_nowait())
            except queue.Empty:
                break
        return logs

    # ---- 解析 ----
    def parse_m3u8(self, m3u8_url: str) -> Dict:
        """解析 M3U8 文件，支持主播放列表和媒体播放列表"""
        self.log(f"开始解析 M3U8: {m3u8_url}")
        
        try:
            headers = self.session.headers.copy()
            headers['Referer'] = m3u8_url  # 添加 Referer 防盗链
            
            response = self.session.get(m3u8_url, timeout=15, headers=headers)
            response.raise_for_status()
            response.encoding = 'utf-8'  # 确保正确编码
            content = response.text
            
            if not content.strip():
                raise ValueError("M3U8 文件为空")
                
        except Exception as e:
            raise ValueError(f"获取 M3U8 文件失败: {str(e)}")

        # 主 M3U8（多码率）处理
        if '#EXT-X-STREAM-INF' in content:
            self.log("检测到主播放列表，寻找最佳质量...")
            pattern = r'#EXT-X-STREAM-INF:.*?(?:RESOLUTION=(\d+)x(\d+))?.*?(?:BANDWIDTH=(\d+))?.*?\n([^\n]+)'
            streams = re.findall(pattern, content, re.DOTALL)
            
            if not streams:
                raise ValueError('未找到有效的流信息')
                
            # 按分辨率和带宽排序，优先选择分辨率高的
            def stream_quality(stream):
                width, height, bandwidth, _ = stream
                resolution_score = int(width or 0) * int(height or 0)
                bandwidth_score = int(bandwidth or 0)
                return (resolution_score, bandwidth_score)
            
            streams.sort(key=stream_quality, reverse=True)
            best_stream = streams[0]
            
            self.log(f"选择流: 分辨率={best_stream[0]}x{best_stream[1]}, 带宽={best_stream[2]}")
            
            # 构造子M3U8 URL
            sub_path = best_stream[3].strip()
            base_url = m3u8_url.rsplit('/', 1)[0] + '/'
            sub_url = sub_path if sub_path.startswith('http') else urljoin(base_url, sub_path)
            
            return self.parse_m3u8(sub_url)

        # 媒体播放列表处理
        base_url = m3u8_url.rsplit('/', 1)[0] + '/'
        key_info: Optional[Dict] = None

        # 提取加密信息
        key_pattern = r'#EXT-X-KEY:METHOD=([^,]+)(?:,URI="([^"]+)")?(?:,IV=([^,\s]+))?'
        key_matches = re.findall(key_pattern, content)
        
        for key_match in key_matches:
            method, key_uri, iv_hex = key_match
            if method.upper() == 'AES-128' and key_uri:
                self.log("检测到 AES-128 加密")
                try:
                    # 获取密钥
                    key_url = key_uri if key_uri.startswith('http') else urljoin(base_url, key_uri)
                    key_response = self.session.get(key_url, timeout=15)
                    key_response.raise_for_status()
                    key_bytes = key_response.content
                    
                    if len(key_bytes) != 16:
                        raise ValueError(f"无效的密钥长度: {len(key_bytes)} (期望 16 字节)")
                    
                    # 处理 IV
                    if iv_hex:
                        iv_hex = iv_hex[2:] if iv_hex.lower().startswith('0x') else iv_hex
                        if len(iv_hex) != 32:
                            raise ValueError(f"无效的 IV 长度: {len(iv_hex)} (期望 32 字符)")
                        iv_bytes = bytes.fromhex(iv_hex)
                    else:
                        # 默认使用零 IV
                        iv_bytes = b'\x00' * 16
                    
                    key_info = {'method': 'AES-128', 'key': key_bytes, 'iv': iv_bytes}
                    self.decryptor = Decryptor(key_bytes, iv_bytes)
                    self.log('成功获取解密密钥')
                    break
                    
                except Exception as e:
                    self.log(f"获取密钥失败: {e}")
                    continue

        # 提取媒体片段
        segment_pattern = r'#EXTINF:([\d.]+),?\s*([^\r\n]*)\s*\n([^\r\n#]+)'
        segment_matches = re.findall(segment_pattern, content)
        
        segments: List[str] = []
        total_duration = 0.0
        
        for duration_str, title, segment_path in segment_matches:
            segment_path = segment_path.strip()
            if not segment_path:
                continue
                
            # 累计总时长
            try:
                total_duration += float(duration_str)
            except ValueError:
                pass
            
            # 构造完整 URL
            segment_url = segment_path if segment_path.startswith('http') else urljoin(base_url, segment_path)
            segments.append(segment_url)

        if not segments:
            raise ValueError("未找到有效的媒体片段")

        self.total_segments = len(segments)
        self.log(f"找到 {self.total_segments} 个片段，总时长约 {total_duration:.1f} 秒")
        
        return {
            'url': m3u8_url, 
            'segments': segments, 
            'key_info': key_info, 
            'total_segments': self.total_segments,
            'duration': total_duration
        }

    # ---- 下载单片段 ----
    def _download_one(self, url: str, path: str, retry: int = 0) -> bool:
        """下载单个片段，支持重试和详细错误日志"""
        if self.is_canceled:
            return False
        try:
            self.log(f"下载片段: {os.path.basename(path)}")
            response = self.session.get(url, timeout=30, stream=True)
            response.raise_for_status()
            
            # 获取内容长度用于验证
            content_length = response.headers.get('content-length')
            data = response.content
            
            # 验证下载完整性
            if content_length and len(data) != int(content_length):
                raise ValueError(f"下载不完整: 期望 {content_length} 字节，实际 {len(data)} 字节")
            
            # 解密处理
            if self.decryptor:
                try:
                    data = self.decryptor.decrypt(data)
                except Exception as e:
                    self.log(f"解密失败: {e}")
                    # 如果解密失败，尝试使用原始数据
                    pass
            
            # 写入文件
            with open(path, 'wb') as f:
                f.write(data)
            
            # 验证文件写入
            if not os.path.exists(path) or os.path.getsize(path) == 0:
                raise ValueError("文件写入失败或为空")
                
            return True
            
        except Exception as e:
            error_msg = f"下载片段失败: {os.path.basename(path)}, 错误: {str(e)}"
            if retry < self.max_retries and not self.is_canceled:
                self.log(f"{error_msg} - 重试 ({retry+1}/{self.max_retries})")
                time.sleep(self.retry_delay * (retry + 1))  # 递增延迟
                return self._download_one(url, path, retry + 1)
            else:
                self.log(error_msg)
                return False

    # ---- 开始下载 ----
    def start(self, m3u8_url: str, output_file: str, temp_dir: Optional[str] = None, max_workers: int = 16, progress_callback: Optional[Callable[[int, str], None]] = None) -> bool:
        if self.is_running:
            self.log('已有任务在进行')
            return False
        self.is_running = True
        self.is_canceled = False
        self.downloaded_segments = 0
        self.output_file = output_file

        # 目录
        out_dir = os.path.dirname(os.path.abspath(output_file))
        ensure_dir_exists(out_dir)
        if temp_dir:
            self.temp_dir = temp_dir
            ensure_dir_exists(self.temp_dir)
        else:
            name = os.path.splitext(os.path.basename(output_file))[0]
            self.temp_dir = os.path.join(out_dir, f"temp_{sanitize_filename(name)}")
            ensure_dir_exists(self.temp_dir)

        if progress_callback:
            progress_callback(0, '解析 M3U8...')
        info = self.parse_m3u8(m3u8_url)
        segments = info['segments']
        if not segments:
            self.log('未找到片段')
            return False

        if progress_callback:
            progress_callback(5, f"开始下载 {self.total_segments} 个片段")
        seg_files: List[str] = []
        futures = []
        with ThreadPoolExecutor(max_workers=max_workers) as pool:
            for i, seg in enumerate(segments):
                if self.is_canceled:
                    break
                p = os.path.join(self.temp_dir, f"segment_{i:05d}.ts")
                seg_files.append(p)
                futures.append(pool.submit(self._download_one, seg, p))
            for ft in futures:
                if ft.result():
                    self.downloaded_segments += 1
                    if progress_callback and self.total_segments:
                        progress = 5 + int(85 * self.downloaded_segments / self.total_segments)
                        progress_callback(progress, f"下载 {self.downloaded_segments}/{self.total_segments}")

        if self.downloaded_segments != self.total_segments:
            self.log(f"部分失败: {self.downloaded_segments}/{self.total_segments}")
            if self.downloaded_segments < max(3, int(self.total_segments * 0.9)):
                self.is_running = False
                return False

        # 合并
        if progress_callback:
            progress_callback(95, '合并片段...')
        ok = self.merger.merge(seg_files, output_file)
        if not ok:
            self.log('合并失败')
            self.is_running = False
            return False

        if progress_callback:
            progress_callback(100, '完成')
        self.log('下载完成')
        self.is_running = False
        return True

    def cancel(self) -> None:
        self.is_canceled = True
        self.log('已请求取消')
