"""
合并模块：将 TS 片段合并为 MP4
"""
import os
import subprocess
from typing import List, Optional


class Merger:
    def __init__(self, ffmpeg_path: Optional[str] = None) -> None:
        self.ffmpeg_path = ffmpeg_path or 'ffmpeg'

    def merge(self, segment_files: List[str], output_file: str) -> bool:
        """合并视频片段"""
        if not segment_files:
            return False

        # 过滤掉不存在或空的文件
        valid_segments = []
        for seg in segment_files:
            if os.path.exists(seg) and os.path.getsize(seg) > 0:
                valid_segments.append(seg)
        
        if not valid_segments:
            return False

        # 优先使用 ffmpeg 合并
        if self._has_ffmpeg():
            try:
                return self._merge_with_ffmpeg(valid_segments, output_file)
            except Exception as e:
                print(f"FFmpeg 合并失败: {e}")
                # 回退到简单合并
                pass

        # 简单二进制拼接（回退方案）
        return self._merge_simple(valid_segments, output_file)

    def _merge_with_ffmpeg(self, segment_files: List[str], output_file: str) -> bool:
        """使用 FFmpeg 合并（推荐）"""
        list_file = output_file + '.txt'
        
        try:
            # 创建文件列表
            with open(list_file, 'w', encoding='utf-8') as f:
                for seg in segment_files:
                    # 转义路径中的特殊字符
                    escaped_path = os.path.abspath(seg).replace('\\', '\\\\').replace("'", "\\'")
                    f.write(f"file '{escaped_path}'\n")
            
            # 执行 FFmpeg 合并
            cmd = [
                self.ffmpeg_path,
                '-f', 'concat',
                '-safe', '0',
                '-i', list_file,
                '-c', 'copy',
                '-bsf:a', 'aac_adtstoasc',  # 修复可能的音频问题
                '-y',  # 覆盖输出文件
                output_file,
            ]
            
            result = subprocess.run(
                cmd, 
                check=True, 
                stdout=subprocess.PIPE, 
                stderr=subprocess.PIPE,
                timeout=300  # 5分钟超时
            )
            
            # 检查输出文件
            if os.path.exists(output_file) and os.path.getsize(output_file) > 0:
                return True
            else:
                raise Exception("输出文件未生成或为空")
                
        finally:
            # 清理临时文件
            try:
                if os.path.exists(list_file):
                    os.remove(list_file)
            except Exception:
                pass

        return False

    def _merge_simple(self, segment_files: List[str], output_file: str) -> bool:
        """简单二进制拼接（回退方案）"""
        try:
            with open(output_file, 'wb') as out:
                for seg in segment_files:
                    try:
                        with open(seg, 'rb') as s:
                            # 分块读取，避免内存问题
                            while True:
                                chunk = s.read(8192)
                                if not chunk:
                                    break
                                out.write(chunk)
                    except Exception as e:
                        print(f"读取片段 {seg} 失败: {e}")
                        continue
            
            # 验证输出文件
            if os.path.exists(output_file) and os.path.getsize(output_file) > 0:
                return True
                
        except Exception as e:
            print(f"简单合并失败: {e}")
        
        return False

    def _has_ffmpeg(self) -> bool:
        """检查 FFmpeg 是否可用"""
        try:
            result = subprocess.run(
                [self.ffmpeg_path, '-version'], 
                stdout=subprocess.PIPE, 
                stderr=subprocess.PIPE, 
                check=True,
                timeout=5
            )
            return True
        except Exception:
            return False
    
    def get_merge_method(self) -> str:
        """获取当前合并方式"""
        if self._has_ffmpeg():
            return "FFmpeg (推荐)"
        else:
            return "简单合并 (兼容性可能有限)"
