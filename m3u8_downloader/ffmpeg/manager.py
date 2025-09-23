"""
FFmpeg 管理器：自动发现、下载和配置 FFmpeg
"""
import os
import shutil
import zipfile
import requests
from typing import Optional, Callable
import threading
import tempfile


class FFmpegManager:
    def __init__(self) -> None:
        self._cached: Optional[str] = None
        self._downloading = False
        
    def find_ffmpeg(self) -> Optional[str]:
        """查找系统中的 FFmpeg"""
        if self._cached and os.path.isfile(self._cached):
            return self._cached

        # 1. 环境变量 PATH
        ff = shutil.which('ffmpeg')
        if ff:
            self._cached = ff
            return ff

        # 2. 项目本地目录
        local_ffmpeg = os.path.join(os.path.dirname(__file__), '..', '..', 'ffmpeg', 'ffmpeg.exe')
        local_ffmpeg = os.path.abspath(local_ffmpeg)
        if os.path.isfile(local_ffmpeg):
            self._cached = local_ffmpeg
            return local_ffmpeg

        # 3. 常见 Windows 路径
        candidates = [
            r"C:\ffmpeg\bin\ffmpeg.exe",
            r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
            r"C:\Program Files (x86)\ffmpeg\bin\ffmpeg.exe",
        ]
        for c in candidates:
            if os.path.isfile(c):
                self._cached = c
                return c

        return None
    
    def get_ffmpeg_download_url(self) -> str:
        """获取 FFmpeg Windows 版本下载链接（精简版）"""
        # 使用 gyan.dev 的精简版 FFmpeg（约 70MB）
        return "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
    
    def auto_install_and_configure(self, progress_callback: Optional[Callable[[str], None]] = None) -> bool:
        """一键自动安装和配置FFmpeg"""
        try:
            if progress_callback:
                progress_callback("🔍 检查FFmpeg状态...")
            
            # 如果已经安装，直接返回成功
            if self.is_available():
                if progress_callback:
                    progress_callback("✅ FFmpeg已可用，无需安装")
                return True
            
            if progress_callback:
                progress_callback("📥 开始自动下载和安装FFmpeg...")
            
            # 下载FFmpeg
            if self.download_ffmpeg(progress_callback):
                if progress_callback:
                    progress_callback("⚙️ 配置FFmpeg环境...")
                
                # 验证安装
                if self.is_available():
                    if progress_callback:
                        progress_callback("🎉 FFmpeg安装配置完成!")
                    return True
                else:
                    if progress_callback:
                        progress_callback("❌ FFmpeg安装后验证失败")
                    return False
            else:
                if progress_callback:
                    progress_callback("❌ FFmpeg下载失败")
                return False
                
        except Exception as e:
            if progress_callback:
                progress_callback(f"❌ 安装过程出错: {str(e)}")
            return False
        finally:
            self._downloading = False
    
    def download_ffmpeg(self, progress_callback: Optional[Callable[[str], None]] = None) -> bool:
        """下载并配置 FFmpeg 到项目目录"""
        if self._downloading:
            if progress_callback:
                progress_callback("FFmpeg 正在下载中，请稍候...")
            return False
            
        self._downloading = True
        
        try:
            if progress_callback:
                progress_callback("开始下载 FFmpeg...")
            
            # 创建项目本地 ffmpeg 目录
            project_root = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
            ffmpeg_dir = os.path.join(project_root, 'ffmpeg')
            os.makedirs(ffmpeg_dir, exist_ok=True)
            
            # 下载文件
            url = self.get_ffmpeg_download_url()
            
            if progress_callback:
                progress_callback("正在下载 FFmpeg 压缩包...")
            
            with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as tmp_file:
                response = requests.get(url, stream=True, timeout=30)
                response.raise_for_status()
                
                total_size = int(response.headers.get('content-length', 0))
                downloaded = 0
                
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        tmp_file.write(chunk)
                        downloaded += len(chunk)
                        
                        if progress_callback and total_size > 0:
                            percent = int(downloaded * 100 / total_size)
                            progress_callback(f"下载进度: {percent}% ({downloaded // (1024*1024)} MB / {total_size // (1024*1024)} MB)")
                
                zip_path = tmp_file.name
            
            if progress_callback:
                progress_callback("正在解压 FFmpeg...")
            
            # 解压缩
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                # 找到 ffmpeg.exe 并提取
                for member in zip_ref.infolist():
                    if member.filename.endswith('ffmpeg.exe'):
                        # 提取到项目 ffmpeg 目录
                        member.filename = 'ffmpeg.exe'
                        zip_ref.extract(member, ffmpeg_dir)
                        break
                else:
                    # 如果没找到单个文件，解压整个目录结构
                    zip_ref.extractall(ffmpeg_dir)
                    
                    # 查找解压后的 ffmpeg.exe
                    for root, dirs, files in os.walk(ffmpeg_dir):
                        if 'ffmpeg.exe' in files:
                            src = os.path.join(root, 'ffmpeg.exe')
                            dst = os.path.join(ffmpeg_dir, 'ffmpeg.exe')
                            if src != dst:
                                shutil.move(src, dst)
                            break
            
            # 清理临时文件
            try:
                os.unlink(zip_path)
            except:
                pass
            
            # 验证安装
            ffmpeg_exe = os.path.join(ffmpeg_dir, 'ffmpeg.exe')
            if os.path.isfile(ffmpeg_exe):
                self._cached = ffmpeg_exe
                if progress_callback:
                    progress_callback("✅ FFmpeg 下载安装成功!")
                return True
            else:
                if progress_callback:
                    progress_callback("❌ FFmpeg 安装验证失败")
                return False
                
        except Exception as e:
            if progress_callback:
                progress_callback(f"❌ 下载失败: {str(e)}")
            return False
        finally:
            self._downloading = False

    def download_ffmpeg_async(self, progress_callback: Optional[Callable[[str], None]] = None, 
                           complete_callback: Optional[Callable[[bool], None]] = None) -> None:
        """异步下载 FFmpeg"""
        def download_task():
            result = self.auto_install_and_configure(progress_callback)
            if complete_callback:
                complete_callback(result)
        
        threading.Thread(target=download_task, daemon=True).start()
    
    def is_available(self) -> bool:
        """检查 FFmpeg 是否可用"""
        return self.find_ffmpeg() is not None
    
    def get_version(self) -> Optional[str]:
        """获取 FFmpeg 版本信息"""
        ffmpeg_path = self.find_ffmpeg()
        if not ffmpeg_path:
            return None
        
        try:
            import subprocess
            result = subprocess.run([ffmpeg_path, '-version'], 
                                  capture_output=True, text=True, timeout=5)
            if result.returncode == 0:
                # 提取版本号
                lines = result.stdout.split('\n')
                for line in lines:
                    if line.startswith('ffmpeg version'):
                        return line.split(' ')[2]
            return None
        except Exception:
            return None