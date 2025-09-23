"""
解密模块：支持 HLS AES-128 CBC
"""
from typing import Optional

try:
    from Crypto.Cipher import AES  # type: ignore
except Exception:  # 允许用户后续安装依赖
    AES = None  # type: ignore


class Decryptor:
    """AES-128-CBC 解密器。若未加密或缺少依赖，将透传原数据。

    - 默认使用初始化时传入的 iv
    - 若在 decrypt 时传入 iv_override，则优先使用
    """

    def __init__(self, key: Optional[bytes], iv: Optional[bytes] = None):
        self.key = key
        self.iv = iv

    def decrypt(self, data: bytes, iv_override: Optional[bytes] = None) -> bytes:
        if not self.key or AES is None:
            # 未加密或缺少库，直接返回
            return data
        iv = iv_override if iv_override is not None else self.iv
        if not iv:
            return data
        cipher = AES.new(self.key, AES.MODE_CBC, iv)
        return cipher.decrypt(data)
