import logging
import logging.handlers
import sys
import os
from typing import Optional


class SafeRotatingFileHandler(logging.handlers.RotatingFileHandler):
    def __init__(self, filename, mode='a', maxBytes=0, backupCount=0, encoding=None, delay=False):
        self._safe_filename = filename
        self._backup_dir = os.path.join(os.path.dirname(filename), 'corrupted_logs')
        super().__init__(filename, mode, maxBytes, backupCount, encoding, delay)

    def _open(self):
        try:
            if os.path.exists(self._safe_filename):
                try:
                    with open(self._safe_filename, 'rb') as f:
                        f.read()
                except Exception as e:
                    self._handle_corrupted_file(e)
        except Exception:
            pass
        return super()._open()

    def _handle_corrupted_file(self, error):
        if not os.path.exists(self._backup_dir):
            os.makedirs(self._backup_dir, exist_ok=True)
        
        import time
        backup_name = f"corrupted_{int(time.time())}_{os.path.basename(self._safe_filename)}"
        backup_path = os.path.join(self._backup_dir, backup_name)
        
        try:
            os.rename(self._safe_filename, backup_path)
            print(f"Corrupted log file backed up to: {backup_path}")
        except Exception as e:
            try:
                os.remove(self._safe_filename)
                print(f"Failed to backup corrupted log file, removed it: {e}")
            except Exception:
                pass

    def emit(self, record):
        try:
            super().emit(record)
        except (IOError, OSError, UnicodeDecodeError) as e:
            try:
                self._handle_corrupted_file(e)
                self.stream = self._open()
                super().emit(record)
            except Exception:
                pass
        except Exception:
            pass


def get_logger(name: str, level: str = "INFO", 
               log_file: Optional[str] = None,
               max_file_size: int = 10 * 1024 * 1024,
               backup_count: int = 5) -> logging.Logger:
    logger = logging.getLogger(name)
    
    if not logger.handlers:
        logger.setLevel(level.upper())
        logger.propagate = False
        
        console_handler = logging.StreamHandler(sys.stdout)
        console_formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        console_handler.setFormatter(console_formatter)
        logger.addHandler(console_handler)
        
        if log_file:
            try:
                log_dir = os.path.dirname(log_file)
                if log_dir:
                    os.makedirs(log_dir, exist_ok=True)
                
                file_handler = SafeRotatingFileHandler(
                    log_file,
                    maxBytes=max_file_size,
                    backupCount=backup_count,
                    encoding='utf-8'
                )
                file_formatter = logging.Formatter(
                    '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
                    datefmt='%Y-%m-%d %H:%M:%S'
                )
                file_handler.setFormatter(file_formatter)
                logger.addHandler(file_handler)
            except Exception as e:
                print(f"Failed to setup file logger: {e}")
    
    logger.setLevel(level.upper())
    return logger


def cleanup_corrupted_logs(log_dir: str, max_age_days: int = 30) -> None:
    import time
    corrupted_dir = os.path.join(log_dir, 'corrupted_logs')
    if not os.path.exists(corrupted_dir):
        return
    
    cutoff = time.time() - (max_age_days * 24 * 3600)
    
    try:
        for filename in os.listdir(corrupted_dir):
            filepath = os.path.join(corrupted_dir, filename)
            if os.path.isfile(filepath):
                if os.path.getmtime(filepath) < cutoff:
                    try:
                        os.remove(filepath)
                        print(f"Removed old corrupted log: {filename}")
                    except Exception as e:
                        print(f"Failed to remove corrupted log {filename}: {e}")
    except Exception as e:
        print(f"Failed to cleanup corrupted logs: {e}")
