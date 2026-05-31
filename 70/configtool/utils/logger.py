import logging
import sys
import os
import shutil
import time
from logging.handlers import RotatingFileHandler
from pathlib import Path
from colorlog import ColoredFormatter

_loggers = {}

class SafeRotatingFileHandler(RotatingFileHandler):
    def __init__(self, filename, **kwargs):
        self._log_dir = os.path.dirname(filename)
        try:
            os.makedirs(self._log_dir, exist_ok=True)
        except OSError:
            self._log_dir = "."
            filename = os.path.join(".", os.path.basename(filename))

        try:
            super().__init__(filename, **kwargs)
        except (OSError, UnicodeDecodeError, ValueError) as e:
            sys.stderr.write(f"[logger] 日志文件初始化异常: {e}, 尝试重建\n")
            self._try_recover_corrupted_log(filename, **kwargs)
            super().__init__(filename, **kwargs)

    def _try_recover_corrupted_log(self, filename, **kwargs):
        if os.path.exists(filename):
            backup_name = f"{filename}.corrupted_{int(time.time())}"
            try:
                shutil.move(filename, backup_name)
                sys.stderr.write(f"[logger] 损坏日志已备份: {backup_name}\n")
            except OSError as move_err:
                try:
                    os.remove(filename)
                    sys.stderr.write(f"[logger] 损坏日志已删除: {filename}\n")
                except OSError:
                    sys.stderr.write(f"[logger] 无法处理损坏日志: {move_err}\n")

    def doRollover(self):
        try:
            super().doRollover()
        except (OSError, UnicodeDecodeError, ValueError) as e:
            sys.stderr.write(f"[logger] 日志轮转异常: {e}, 尝试恢复\n")
            try:
                if self.stream:
                    try:
                        self.stream.close()
                    except Exception:
                        pass
                self._try_recover_corrupted_log(self.baseFilename)
                self.stream = self._open()
            except Exception as recover_err:
                sys.stderr.write(f"[logger] 日志轮转恢复失败: {recover_err}\n")
                self.stream = None

    def emit(self, record):
        try:
            if self.stream is None:
                self.stream = self._open()
            super().emit(record)
        except (OSError, UnicodeDecodeError, ValueError) as e:
            sys.stderr.write(f"[logger] 日志写入异常: {e}, 尝试重建流\n")
            try:
                if self.stream:
                    try:
                        self.stream.close()
                    except Exception:
                        pass
                self.stream = self._open()
                super().emit(record)
            except Exception:
                pass
        except Exception:
            pass

def get_logger(name: str = "configtool") -> logging.Logger:
    if name in _loggers:
        return _loggers[name]

    logger = logging.getLogger(name)
    logger.setLevel(logging.INFO)
    logger.propagate = False

    console_format = ColoredFormatter(
        "%(log_color)s[%(asctime)s] [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        log_colors={
            "DEBUG": "cyan",
            "INFO": "green",
            "WARNING": "yellow",
            "ERROR": "red",
            "CRITICAL": "red,bg_white",
        },
    )

    file_format = logging.Formatter(
        "[%(asctime)s] [%(levelname)s] [%(name)s:%(lineno)d] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(console_format)
    logger.addHandler(console_handler)

    try:
        log_dir = os.environ.get("CONFIGTOOL_LOG_DIR", "logs")
        log_file = os.path.join(log_dir, "configtool.log")

        file_handler = SafeRotatingFileHandler(
            log_file, maxBytes=10 * 1024 * 1024, backupCount=5, encoding="utf-8"
        )
        file_handler.setFormatter(file_format)
        logger.addHandler(file_handler)
    except Exception as e:
        sys.stderr.write(f"[logger] 文件日志处理器创建失败，仅使用控制台输出: {e}\n")

    _loggers[name] = logger
    return logger
