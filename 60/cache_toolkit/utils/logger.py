import logging
import logging.handlers
import sys
import os
from pathlib import Path
from typing import Optional

_logger = logging.getLogger("cache_toolkit")
_handlers: list = []
_is_setup = False


class SafeRotatingFileHandler(logging.handlers.RotatingFileHandler):
    def __init__(
        self,
        filename,
        mode="a",
        maxBytes=0,
        backupCount=0,
        encoding="utf-8",
        delay=False,
    ):
        super().__init__(
            filename=filename,
            mode=mode,
            maxBytes=maxBytes,
            backupCount=backupCount,
            encoding=encoding,
            delay=delay,
        )

    def emit(self, record):
        try:
            if self.shouldRollover(record):
                self.doRollover()
            super().emit(record)
        except (OSError, IOError) as e:
            print(f"Warning: Failed to write to log file: {e}", file=sys.stderr)
        except Exception:
            pass

    def doRollover(self):
        try:
            if self.stream:
                self.stream.close()
                self.stream = None

            if self.backupCount > 0:
                for i in range(self.backupCount - 1, 0, -1):
                    sfn = self.rotation_filename(f"{self.baseFilename}.{i}")
                    dfn = self.rotation_filename(f"{self.baseFilename}.{i + 1}")
                    try:
                        if os.path.exists(sfn):
                            if os.path.exists(dfn):
                                os.remove(dfn)
                            os.rename(sfn, dfn)
                    except Exception:
                        pass

                dfn = self.rotation_filename(f"{self.baseFilename}.1")
                try:
                    if os.path.exists(dfn):
                        os.remove(dfn)
                    self.rotate(self.baseFilename, dfn)
                except Exception:
                    pass

            if not self.delay:
                self.stream = self._open()
        except Exception as e:
            print(f"Warning: Log rotation failed: {e}", file=sys.stderr)
            try:
                self.stream = self._open()
            except Exception:
                pass


def setup_logger(
    level: str = "INFO",
    log_file: Optional[str] = None,
    log_file_max_mb: int = 100,
    log_file_backup_count: int = 5,
    console_output: bool = True,
):
    global _is_setup, _handlers

    _logger.setLevel(getattr(logging, level.upper(), logging.INFO))

    for h in _handlers:
        try:
            _logger.removeHandler(h)
        except Exception:
            pass
    _handlers.clear()

    fmt = logging.Formatter(
        "[%(asctime)s] %(levelname)-7s %(name)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    if console_output:
        try:
            sh = logging.StreamHandler(sys.stderr)
            sh.setFormatter(fmt)
            sh.setLevel(logging.INFO)
            _logger.addHandler(sh)
            _handlers.append(sh)
        except Exception:
            pass

    if log_file:
        try:
            log_path = Path(log_file)
            log_path.parent.mkdir(parents=True, exist_ok=True)

            fh = SafeRotatingFileHandler(
                filename=str(log_path),
                maxBytes=log_file_max_mb * 1024 * 1024,
                backupCount=log_file_backup_count,
                encoding="utf-8",
            )
            fh.setFormatter(fmt)
            fh.setLevel(logging.DEBUG)
            _logger.addHandler(fh)
            _handlers.append(fh)
        except Exception as e:
            print(f"Warning: Failed to setup file logging: {e}", file=sys.stderr)

    _logger.propagate = False
    _is_setup = True

    return _logger


def get_logger() -> logging.Logger:
    global _is_setup
    if not _is_setup:
        setup_logger()
    return _logger


def flush_logs():
    for h in _handlers:
        try:
            h.flush()
        except Exception:
            pass
