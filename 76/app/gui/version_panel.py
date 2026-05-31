from PyQt5.QtWidgets import (
    QComboBox,
    QGroupBox,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QLineEdit,
    QListWidget,
    QPushButton,
    QSplitter,
    QTableWidget,
    QTableWidgetItem,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from core.version import VersionManager


class VersionPanel(QWidget):
    def __init__(self, version_manager: VersionManager) -> None:
        super().__init__()
        self._manager = version_manager
        self._setup_ui()

    def _setup_ui(self) -> None:
        self.setWindowTitle("版本管理")
        self.setMinimumSize(500, 400)

        layout = QVBoxLayout(self)

        create_group = QGroupBox("创建版本")
        create_layout = QHBoxLayout()

        create_layout.addWidget(QLabel("程序ID:"))
        self._program_id_input = QLineEdit()
        self._program_id_input.setPlaceholderText("输入程序ID")
        create_layout.addWidget(self._program_id_input)

        create_layout.addWidget(QLabel("目录:"))
        self._dir_input = QLineEdit()
        self._dir_input.setPlaceholderText("程序目录路径")
        create_layout.addWidget(self._dir_input)

        create_layout.addWidget(QLabel("描述:"))
        self._desc_input = QLineEdit()
        self._desc_input.setPlaceholderText("版本描述")
        create_layout.addWidget(self._desc_input)

        self._create_btn = QPushButton("创建版本")
        self._create_btn.clicked.connect(self._on_create_version)
        create_layout.addWidget(self._create_btn)

        create_group.setLayout(create_layout)
        layout.addWidget(create_group)

        splitter = QSplitter(Qt.Vertical)

        self._version_table = QTableWidget()
        self._version_table.setColumnCount(5)
        self._version_table.setHorizontalHeaderLabels(
            ["版本号", "程序ID", "描述", "创建时间", "文件变更数"]
        )
        self._version_table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        self._version_table.setSelectionBehavior(QTableWidget.SelectRows)
        self._version_table.itemSelectionChanged.connect(self._on_version_selected)
        splitter.addWidget(self._version_table)

        self._change_list = QListWidget()
        self._change_list.setMaximumHeight(200)
        splitter.addWidget(self._change_list)

        layout.addWidget(splitter)

        action_layout = QHBoxLayout()
        self._refresh_btn = QPushButton("刷新")
        self._refresh_btn.clicked.connect(self._refresh_versions)
        action_layout.addWidget(self._refresh_btn)

        self._restore_btn = QPushButton("恢复版本")
        self._restore_btn.clicked.connect(self._on_restore)
        action_layout.addWidget(self._restore_btn)

        self._delete_btn = QPushButton("删除版本")
        self._delete_btn.clicked.connect(self._on_delete)
        action_layout.addWidget(self._delete_btn)

        self._compare_btn = QPushButton("版本比较")
        self._compare_btn.clicked.connect(self._on_compare)
        action_layout.addWidget(self._compare_btn)

        layout.addLayout(action_layout)

    def _on_create_version(self) -> None:
        program_id = self._program_id_input.text().strip()
        directory = self._dir_input.text().strip()
        description = self._desc_input.text().strip()

        if not program_id or not directory:
            return

        try:
            snapshot = self._manager.create_version(
                program_id=program_id,
                directory=directory,
                description=description,
            )
            self._refresh_versions()
        except Exception as e:
            pass

    def _refresh_versions(self) -> None:
        program_id = self._program_id_input.text().strip()
        if not program_id:
            return

        try:
            versions = self._manager.list_versions(program_id)
            self._version_table.setRowCount(len(versions))
            for row, snap in enumerate(versions):
                self._version_table.setItem(
                    row, 0, QTableWidgetItem(snap.version_info.version_number)
                )
                self._version_table.setItem(
                    row, 1, QTableWidgetItem(snap.version_info.program_id)
                )
                self._version_table.setItem(
                    row, 2, QTableWidgetItem(snap.version_info.description)
                )
                self._version_table.setItem(
                    row, 3,
                    QTableWidgetItem(snap.version_info.created_at.strftime("%Y-%m-%d %H:%M")),
                )
                self._version_table.setItem(
                    row, 4, QTableWidgetItem(str(len(snap.changes)))
                )
        except Exception:
            pass

    def _on_version_selected(self) -> None:
        self._change_list.clear()
        rows = self._version_table.selectionModel().selectedRows()
        if not rows:
            return

        row = rows[0].row()
        program_id = self._program_id_input.text().strip()
        try:
            versions = self._manager.list_versions(program_id)
            if row < len(versions):
                for change in versions[row].changes:
                    self._change_list.addItem(
                        f"[{change.change_type.value}] {change.file_path}"
                    )
        except Exception:
            pass

    def _on_restore(self) -> None:
        pass

    def _on_delete(self) -> None:
        pass

    def _on_compare(self) -> None:
        pass
