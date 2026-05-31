import sys

from PyQt5.QtWidgets import QApplication

from app.gui.main_window_enhanced import MainWindowEnhanced
from utils.config import ConfigManager
from utils.logger import setup_logger


def entry_point() -> None:
    config = ConfigManager.load()
    logger = setup_logger("sim_platform", config.logging.level, config.logging.file)

    logger.info("启动 %s v%s", config.name, config.version)

    app = QApplication(sys.argv)
    app.setApplicationName(config.name)
    app.setApplicationVersion(config.version)

    window = MainWindowEnhanced()
    window.show()

    logger.info("主窗口已显示")
    exit_code = app.exec_()

    logger.info("应用退出,代码: %d", exit_code)
    sys.exit(exit_code)


if __name__ == "__main__":
    entry_point()
