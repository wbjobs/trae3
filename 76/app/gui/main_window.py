from PyQt5.QtCore import Qt
from PyQt5.QtGui import QIcon
from PyQt5.QtWidgets import (
    QAction,
    QDesktopWidget,
    QMdiArea,
    QMenuBar,
    QMessageBox,
    QStatusBar,
    QToolBar,
    QMainWindow,
)

from app.gui.simulator_panel import SimulatorPanel
from app.gui.version_panel import VersionPanel
from app.gui.sync_panel import SyncPanel
from app.gui.cache_panel import CachePanel
from core.simulator import SimulationEngine, SimulationRunner
from core.version import VersionManager
from core.sync import CloudSyncService
from core.cache import LocalCacheService
from api.program_library import ProgramLibraryClient
from api.version_database import VersionDatabaseClient
from utils.config import ConfigManager
from utils.logger import setup_logger


class MainWindow(QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self._config = ConfigManager.get()
        self._logger = setup_logger(
            "app.main_window", self._config.logging.level, self._config.logging.file
        )

        self._init_services()
        self._init_ui()
        self._init_menu()
        self._init_toolbar()
        self._init_statusbar()
        self._connect_signals()

    def _init_services(self) -> None:
        self._sim_engine = SimulationEngine()
        self._sim_runner = SimulationRunner()
        self._version_manager = VersionManager()
        self._sync_service = CloudSyncService()
        self._cache_service = LocalCacheService()
        self._program_library = ProgramLibraryClient()
        self._version_db = VersionDatabaseClient()

    def _init_ui(self) -> None:
        self.setWindowTitle(f"{self._config.name} v{self._config.version}")
        self.setMinimumSize(1200, 800)
        self._center_window()

        self._mdi_area = QMdiArea()
        self._mdi_area.setHorizontalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        self._mdi_area.setVerticalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        self.setCentralWidget(self._mdi_area)

        self._sim_panel = SimulatorPanel(self._sim_engine, self._sim_runner)
        self._version_panel = VersionPanel(self._version_manager)
        self._sync_panel = SyncPanel(self._sync_service)
        self._cache_panel = CachePanel(self._cache_service)

        self._mdi_area.addSubWindow(self._sim_panel)
        self._mdi_area.addSubWindow(self._version_panel)
        self._mdi_area.addSubWindow(self._sync_panel)
        self._mdi_area.addSubWindow(self._cache_panel)

        self._sim_panel.show()
        self._version_panel.show()
        self._sync_panel.show()
        self._cache_panel.show()

        self._mdi_area.tileSubWindows()

    def _init_menu(self) -> None:
        menubar = self.menuBar()

        file_menu = menubar.addMenu("文件(&F)")
        file_menu.addAction(self._create_action("新建仿真任务", self._on_new_simulation))
        file_menu.addAction(self._create_action("打开工作空间", self._on_open_workspace))
        file_menu.addSeparator()
        file_menu.addAction(self._create_action("退出(&X)", self.close))

        sync_menu = menubar.addMenu("同步(&S)")
        sync_menu.addAction(self._create_action("启动同步", self._on_start_sync))
        sync_menu.addAction(self._create_action("停止同步", self._on_stop_sync))
        sync_menu.addSeparator()
        sync_menu.addAction(self._create_action("手动上传", self._on_manual_upload))
        sync_menu.addAction(self._create_action("手动下载", self._on_manual_download))

        version_menu = menubar.addMenu("版本(&V)")
        version_menu.addAction(self._create_action("创建版本", self._on_create_version))
        version_menu.addAction(self._create_action("版本历史", self._on_version_history))
        version_menu.addSeparator()
        version_menu.addAction(self._create_action("版本比较", self._on_compare_versions))

        view_menu = menubar.addMenu("视图(&W)")
        view_menu.addAction(self._create_action("仿真面板", self._sim_panel.show))
        view_menu.addAction(self._create_action("版本面板", self._version_panel.show))
        view_menu.addAction(self._create_action("同步面板", self._sync_panel.show))
        view_menu.addAction(self._create_action("缓存面板", self._cache_panel.show))
        view_menu.addSeparator()
        view_menu.addAction(self._create_action("平铺窗口", self._mdi_area.tileSubWindows))
        view_menu.addAction(self._create_action("级联窗口", self._mdi_area.cascadeSubWindows))

        help_menu = menubar.addMenu("帮助(&H)")
        help_menu.addAction(self._create_action("关于", self._on_about))

    def _init_toolbar(self) -> None:
        toolbar = QToolBar("主工具栏")
        toolbar.setMovable(False)
        self.addToolBar(toolbar)

        toolbar.addAction(self._create_action("▶ 运行", self._on_new_simulation))
        toolbar.addAction(self._create_action("⏹ 停止", self._on_stop_simulation))
        toolbar.addSeparator()
        toolbar.addAction(self._create_action("📤 上传", self._on_manual_upload))
        toolbar.addAction(self._create_action("📥 下载", self._on_manual_download))
        toolbar.addSeparator()
        toolbar.addAction(self._create_action("💾 保存版本", self._on_create_version))

    def _init_statusbar(self) -> None:
        self._statusbar = QStatusBar()
        self.setStatusBar(self._statusbar)
        self._statusbar.showMessage("就绪")

    def _connect_signals(self) -> None:
        self._sync_service.on_sync_complete(
            lambda item: self._statusbar.showMessage(
                f"同步完成: {item.program_id}", 5000
            )
        )

    def _create_action(self, text: str, callback) -> QAction:
        action = QAction(text, self)
        action.triggered.connect(callback)
        return action

    def _center_window(self) -> None:
        screen = QDesktopWidget().screenGeometry()
        size = self.geometry()
        x = (screen.width() - size.width()) // 2
        y = (screen.height() - size.height()) // 2
        self.move(x, y)

    def _on_new_simulation(self) -> None:
        self._statusbar.showMessage("新建仿真任务...")
        self._sim_panel.show()
        self._sim_panel.setFocus()

    def _on_open_workspace(self) -> None:
        self._statusbar.showMessage("打开工作空间...")

    def _on_start_sync(self) -> None:
        self._sync_service.start()
        self._statusbar.showMessage("云端同步已启动")

    def _on_stop_sync(self) -> None:
        self._sync_service.stop()
        self._statusbar.showMessage("云端同步已停止")

    def _on_manual_upload(self) -> None:
        self._statusbar.showMessage("手动上传...")
        self._sync_panel.show()

    def _on_manual_download(self) -> None:
        self._statusbar.showMessage("手动下载...")
        self._sync_panel.show()

    def _on_stop_simulation(self) -> None:
        self._statusbar.showMessage("停止仿真...")

    def _on_create_version(self) -> None:
        self._statusbar.showMessage("创建版本...")
        self._version_panel.show()

    def _on_version_history(self) -> None:
        self._statusbar.showMessage("查看版本历史...")
        self._version_panel.show()

    def _on_compare_versions(self) -> None:
        self._statusbar.showMessage("版本比较...")
        self._version_panel.show()

    def _on_about(self) -> None:
        QMessageBox.about(
            self,
            "关于",
            f"{self._config.name} v{self._config.version}\n\n"
            "跨平台桌面仿真程序管理平台\n"
            "包含程序仿真、版本管理、云端同步、本地缓存模块",
        )

    def closeEvent(self, event) -> None:
        self._sync_service.stop()
        self._sim_engine.shutdown(wait=False)
        self._logger.info("应用关闭")
        event.accept()
