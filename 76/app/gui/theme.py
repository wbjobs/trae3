from typing import Any


class ThemeManager:
    _instance = None
    _current_theme = "default"

    def __new__(cls) -> "ThemeManager":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    @classmethod
    def get_stylesheet(cls, theme: str = "default") -> str:
        themes = {
            "default": cls._default_theme(),
            "dark": cls._dark_theme(),
            "light": cls._light_theme(),
        }
        return themes.get(theme, cls._default_theme())

    @classmethod
    def set_theme(cls, theme: str) -> None:
        cls._current_theme = theme

    @classmethod
    def current_theme(cls) -> str:
        return cls._current_theme

    @staticmethod
    def _default_theme() -> str:
        return """
        QMainWindow {
            background-color: #f5f5f7;
        }
        QWidget {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
            font-size: 13px;
            color: #1d1d1f;
        }
        QGroupBox {
            border: 1px solid #d2d2d7;
            border-radius: 8px;
            margin-top: 10px;
            padding-top: 10px;
            background-color: #ffffff;
            font-weight: 600;
        }
        QGroupBox::title {
            subcontrol-origin: margin;
            left: 12px;
            padding: 0 6px;
            color: #1d1d1f;
        }
        QPushButton {
            background-color: #0071e3;
            color: white;
            border: none;
            border-radius: 8px;
            padding: 8px 16px;
            font-weight: 500;
            min-width: 80px;
        }
        QPushButton:hover {
            background-color: #0077ed;
        }
        QPushButton:pressed {
            background-color: #0077ed;
        }
        QPushButton:disabled {
            background-color: #d2d2d7;
            color: #86868b;
        }
        QLineEdit, QTextEdit, QSpinBox, QComboBox {
            border: 1px solid #d2d2d7;
            border-radius: 8px;
            padding: 6px 10px;
            background-color: #ffffff;
            selection-background-color: #0071e3;
            selection-color: white;
        }
        QLineEdit:focus, QTextEdit:focus, QSpinBox:focus, QComboBox:focus {
            border: 2px solid #0071e3;
            padding: 5px 9px;
        }
        QTableWidget {
            border: 1px solid #d2d2d7;
            border-radius: 8px;
            background-color: #ffffff;
            gridline-color: #f5f5f7;
            selection-background-color: #e8f0fe;
            selection-color: #1d1d1f;
        }
        QTableWidget::item {
            padding: 8px;
            border-bottom: 1px solid #f5f5f7;
        }
        QTableWidget::item:selected {
            background-color: #e8f0fe;
        }
        QHeaderView::section {
            background-color: #f5f5f7;
            color: #1d1d1f;
            padding: 10px 8px;
            border: none;
            border-bottom: 1px solid #d2d2d7;
            font-weight: 600;
        }
        QTabWidget::pane {
            border: 1px solid #d2d2d7;
            border-radius: 8px;
            background-color: #ffffff;
        }
        QTabBar::tab {
            background-color: #f5f5f7;
            color: #86868b;
            padding: 10px 20px;
            border: none;
            border-top-left-radius: 8px;
            border-top-right-radius: 8px;
            margin-right: 2px;
        }
        QTabBar::tab:selected {
            background-color: #ffffff;
            color: #0071e3;
            font-weight: 600;
        }
        QTabBar::tab:hover:!selected {
            color: #1d1d1f;
        }
        QProgressBar {
            border: none;
            border-radius: 6px;
            background-color: #e5e5ea;
            text-align: center;
            height: 10px;
        }
        QProgressBar::chunk {
            border-radius: 6px;
            background-color: #0071e3;
        }
        QMenuBar {
            background-color: #f5f5f7;
            border-bottom: 1px solid #d2d2d7;
        }
        QMenuBar::item {
            padding: 8px 16px;
            border-radius: 6px;
        }
        QMenuBar::item:selected {
            background-color: #e5e5ea;
        }
        QMenu {
            background-color: #ffffff;
            border: 1px solid #d2d2d7;
            border-radius: 8px;
            padding: 4px;
        }
        QMenu::item {
            padding: 8px 24px 8px 16px;
            border-radius: 6px;
        }
        QMenu::item:selected {
            background-color: #0071e3;
            color: white;
        }
        QStatusBar {
            background-color: #f5f5f7;
            border-top: 1px solid #d2d2d7;
            color: #86868b;
        }
        QToolBar {
            background-color: #ffffff;
            border-bottom: 1px solid #d2d2d7;
            spacing: 4px;
            padding: 4px 8px;
        }
        QToolBar::separator {
            width: 1px;
            background-color: #d2d2d7;
            margin: 4px 8px;
        }
        QMdiArea {
            background-color: #f5f5f7;
        }
        QMdiSubWindow {
            border: 1px solid #d2d2d7;
            border-radius: 8px;
        }
        QMdiSubWindow:title {
            background-color: #f5f5f7;
            color: #1d1d1f;
            padding: 8px;
            border-top-left-radius: 8px;
            border-top-right-radius: 8px;
            font-weight: 600;
        }
        """

    @staticmethod
    def _dark_theme() -> str:
        return """
        QMainWindow { background-color: #1c1c1e; }
        QWidget {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
            font-size: 13px; color: #f5f5f7;
        }
        QGroupBox {
            border: 1px solid #3a3a3c; border-radius: 8px;
            margin-top: 10px; padding-top: 10px;
            background-color: #2c2c2e; font-weight: 600;
        }
        QGroupBox::title { color: #f5f5f7; subcontrol-origin: margin; left: 12px; padding: 0 6px; }
        QPushButton {
            background-color: #0a84ff; color: white; border: none;
            border-radius: 8px; padding: 8px 16px; font-weight: 500; min-width: 80px;
        }
        QPushButton:hover { background-color: #1491ff; }
        QPushButton:pressed { background-color: #1491ff; }
        QPushButton:disabled { background-color: #3a3a3c; color: #636366; }
        QLineEdit, QTextEdit, QSpinBox, QComboBox {
            border: 1px solid #3a3a3c; border-radius: 8px; padding: 6px 10px;
            background-color: #2c2c2e; color: #f5f5f7;
            selection-background-color: #0a84ff; selection-color: white;
        }
        QLineEdit:focus, QTextEdit:focus, QSpinBox:focus, QComboBox:focus {
            border: 2px solid #0a84ff; padding: 5px 9px;
        }
        QTableWidget {
            border: 1px solid #3a3a3c; border-radius: 8px;
            background-color: #2c2c2e; gridline-color: #3a3a3c;
            selection-background-color: #1c4a7a; selection-color: #f5f5f7;
        }
        QTableWidget::item { padding: 8px; border-bottom: 1px solid #3a3a3c; }
        QTableWidget::item:selected { background-color: #1c4a7a; }
        QHeaderView::section {
            background-color: #1c1c1e; color: #f5f5f7;
            padding: 10px 8px; border: none; border-bottom: 1px solid #3a3a3c; font-weight: 600;
        }
        QTabWidget::pane {
            border: 1px solid #3a3a3c; border-radius: 8px; background-color: #2c2c2e;
        }
        QTabBar::tab {
            background-color: #1c1c1e; color: #636366;
            padding: 10px 20px; border: none;
            border-top-left-radius: 8px; border-top-right-radius: 8px; margin-right: 2px;
        }
        QTabBar::tab:selected { background-color: #2c2c2e; color: #0a84ff; font-weight: 600; }
        QTabBar::tab:hover:!selected { color: #f5f5f7; }
        QProgressBar {
            border: none; border-radius: 6px; background-color: #3a3a3c;
            text-align: center; height: 10px; color: #f5f5f7;
        }
        QProgressBar::chunk { border-radius: 6px; background-color: #0a84ff; }
        QMenuBar { background-color: #1c1c1e; border-bottom: 1px solid #3a3a3c; color: #f5f5f7; }
        QMenuBar::item { padding: 8px 16px; border-radius: 6px; }
        QMenuBar::item:selected { background-color: #3a3a3c; }
        QMenu {
            background-color: #2c2c2e; border: 1px solid #3a3a3c;
            border-radius: 8px; padding: 4px;
        }
        QMenu::item { padding: 8px 24px 8px 16px; border-radius: 6px; }
        QMenu::item:selected { background-color: #0a84ff; color: white; }
        QStatusBar { background-color: #1c1c1e; border-top: 1px solid #3a3a3c; color: #636366; }
        QToolBar {
            background-color: #2c2c2e; border-bottom: 1px solid #3a3a3c;
            spacing: 4px; padding: 4px 8px;
        }
        QToolBar::separator { width: 1px; background-color: #3a3a3c; margin: 4px 8px; }
        QMdiArea { background-color: #1c1c1e; }
        QMdiSubWindow {
            border: 1px solid #3a3a3c; border-radius: 8px;
        }
        QMdiSubWindow:title {
            background-color: #1c1c1e; color: #f5f5f7;
            padding: 8px; border-top-left-radius: 8px; border-top-right-radius: 8px; font-weight: 600;
        }
        """

    @staticmethod
    def _light_theme() -> str:
        return ThemeManager._default_theme()
