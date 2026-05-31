from PyQt5.QtCore import Qt, QThread, pyqtSignal
from PyQt5.QtGui import QIcon
from PyQt5.QtWidgets import (
    QAction,
    QComboBox,
    QDesktopWidget,
    QFileDialog,
    QMdiArea,
    QMessageBox,
    QStatusBar,
    QToolBar,
    QMainWindow,
)

from app.gui.main_window import MainWindow
from app.gui.simulator_panel import SimulatorPanel
from app.gui.version_panel import VersionPanel
from app.gui.sync_panel import SyncPanel
from app.gui.cache_panel import CachePanel
from app.gui.theme import ThemeManager
from core.simulator import SimulationEngine, SimulationRunner
from core.version import VersionManager
from core.sync import CloudSyncService
from core.cache import LocalCacheService
from core.batch_export import BatchExporter, ExportFormat, ExportOptions
from core.syntax_checker import SyntaxChecker
from api.program_library import ProgramLibraryClient
from api.version_database import VersionDatabaseClient
from api.optimizer import CloudAPIOptimizer
from utils.config import ConfigManager
from utils.logger import setup_logger


class ExportThread(QThread):
    progress = pyqtSignal(int, int, str)
    finished = pyqtSignal(bool, str)

    def __init__(
        self,
        exporter: BatchExporter,
        program_id: str,
        version_ids: list[str],
        options: ExportOptions,
    ) -> None:
        super().__init__()
        self._exporter = exporter
        self._program_id = program_id
        self._version_ids = version_ids
        self._options = options

    def run(self) -> None:
        try:
            result = self._exporter.export_versions(
                self._program_id,
                self._version_ids,
                self._options,
                background=False,
            )
            self.finished.emit(
                result.success if result else False,
                result.output_path if result else "",
            )
        except Exception as e:
            self.finished.emit(False, str(e))


class MainWindowEnhanced(MainWindow):
    def __init__(self) -> None:
        super().__init__()
        self._enhanced_init()

    def _enhanced_init(self) -> None:
        self._batch_exporter = BatchExporter()
        self._syntax_checker = SyntaxChecker()
        self._api_optimizer = CloudAPIOptimizer(self._config.cloud.program_library_url)
        self._api_optimizer.start()
        self._export_thread: ExportThread | None = None

        self._apply_theme("default")
        self._add_theme_menu()
        self._add_export_actions()
        self._add_syntax_check_actions()

    def _apply_theme(self, theme_name: str) -> None:
        stylesheet = ThemeManager.get_stylesheet(theme_name)
        self.setStyleSheet(stylesheet)
        ThemeManager.set_theme(theme_name)
        self._logger.info("应用主题: %s", theme_name)

    def _add_theme_menu(self) -> None:
        menubar = self.menuBar()
        view_menu = None
        for action in menubar.actions():
            if action.text() == "视图(&W)":
                view_menu = action.menu()
                break

        if view_menu:
            theme_menu = view_menu.addMenu("主题")
            for theme in ["default", "dark", "light"]:
                action = QAction(theme.capitalize(), self)
                action.triggered.connect(lambda checked, t=theme: self._apply_theme(t))
                theme_menu.addAction(action)

    def _add_export_actions(self) -> None:
        menubar = self.menuBar()
        file_menu = None
        for action in menubar.actions():
            if action.text() == "文件(&F)":
                file_menu = action.menu()
                break

        if file_menu:
            file_menu.addSeparator()
            export_menu = file_menu.addMenu("导出(&E)")

            export_json = QAction("导出为 JSON", self)
            export_json.triggered.connect(lambda: self._on_export(ExportFormat.JSON))
            export_menu.addAction(export_json)

            export_zip = QAction("导出为 ZIP", self)
            export_zip.triggered.connect(lambda: self._on_export(ExportFormat.ZIP))
            export_menu.addAction(export_zip)

            export_csv = QAction("导出为 CSV", self)
            export_csv.triggered.connect(lambda: self._on_export(ExportFormat.CSV))
            export_menu.addAction(export_csv)

    def _add_syntax_check_actions(self) -> None:
        menubar = self.menuBar()
        tools_menu = menubar.addMenu("工具(&T)")

        check_action = QAction("语法检测", self)
        check_action.triggered.connect(self._on_syntax_check)
        tools_menu.addAction(check_action)

        check_dir_action = QAction("批量语法检测", self)
        check_dir_action.triggered.connect(self._on_syntax_check_dir)
        tools_menu.addAction(check_dir_action)

    def _on_export(self, fmt: ExportFormat) -> None:
        program_id, ok = QInputDialog.getText(
            self, "导出版本", "请输入程序ID:"
        )
        if not ok or not program_id:
            return

        options = ExportOptions(format=fmt)
        output_dir = QFileDialog.getExistingDirectory(
            self, "选择输出目录", options.output_dir
        )
        if output_dir:
            options.output_dir = output_dir

        self._statusbar.showMessage(f"开始导出 {program_id}...")

        version_ids = self._get_version_ids_for_program(program_id)
        if not version_ids:
            QMessageBox.warning(self, "警告", f"未找到程序 {program_id} 的版本")
            return

        self._export_thread = ExportThread(
            self._batch_exporter, program_id, version_ids, options
        )
        self._export_thread.progress.connect(self._on_export_progress)
        self._export_thread.finished.connect(self._on_export_finished)
        self._export_thread.start()

    def _get_version_ids_for_program(self, program_id: str) -> list[str]:
        try:
            versions = self._version_manager.list_versions(program_id)
            return [v.version_info.version_id for v in versions]
        except Exception:
            return []

    def _on_export_progress(self, current: int, total: int, msg: str) -> None:
        self._statusbar.showMessage(f"导出中: {current}/{total} - {msg}")

    def _on_export_finished(self, success: bool, output_path: str) -> None:
        if success:
            self._statusbar.showMessage(f"导出完成: {output_path}", 5000)
            QMessageBox.information(self, "导出完成", f"文件已保存到:\n{output_path}")
        else:
            self._statusbar.showMessage(f"导出失败: {output_path}", 5000)
            QMessageBox.critical(self, "导出失败", output_path)

    def _on_syntax_check(self) -> None:
        file_path, _ = QFileDialog.getOpenFileName(
            self, "选择文件", "", "Python 文件 (*.py);;所有文件 (*)"
        )
        if not file_path:
            return

        result = self._syntax_checker.check_file(file_path)
        self._show_syntax_result(result)

    def _on_syntax_check_dir(self) -> None:
        dir_path = QFileDialog.getExistingDirectory(self, "选择目录")
        if not dir_path:
            return

        self._statusbar.showMessage("语法检测中...")
        results = self._syntax_checker.check_directory(dir_path)
        self._show_syntax_results(results)

    def _show_syntax_result(self, result) -> None:
        msg = f"文件: {result.file_path}\n"
        msg += f"有效: {'是' if result.is_valid else '否'}\n"
        msg += f"问题数: {len(result.issues)}\n\n"
        for issue in result.issues[:20]:
            msg += f"[{issue.severity.value}] L{issue.line}: {issue.message}\n"
        if len(result.issues) > 20:
            msg += f"... 还有 {len(result.issues) - 20} 个问题\n"
        QMessageBox.information(self, "语法检测结果", msg)

    def _show_syntax_results(self, results: list) -> None:
        total_issues = sum(len(r.issues) for r in results)
        msg = f"检测了 {len(results)} 个文件\n"
        msg += f"总问题数: {total_issues}\n\n"
        for r in results[:10]:
            msg += f"{os.path.basename(r.file_path)}: {len(r.issues)} 个问题\n"
        if len(results) > 10:
            msg += f"... 还有 {len(results) - 10} 个文件\n"
        QMessageBox.information(self, "批量语法检测结果", msg)

    def closeEvent(self, event) -> None:
        self._api_optimizer.stop()
        super().closeEvent(event)


from PyQt5.QtWidgets import QInputDialog
import os
