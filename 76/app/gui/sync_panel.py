from PyQt5.QtCore import Qt
from PyQt5.QtWidgets import (
    QGroupBox,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QLineEdit,
    QPushButton,
    QTableWidget,
    QTableWidgetItem,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from core.sync import CloudSyncService


class SyncPanel(QWidget):
    def __init__(self, sync_service: CloudSyncService) -> None:
        super().__init__()
        self._sync_service = sync_service
        self._setup_ui()

    def _setup_ui(self) -> None:
        self.setWindowTitle("云端同步")
        self.setMinimumSize(500, 400)

        layout = QVBoxLayout(self)

        auth_group = QGroupBox("认证")
        auth_layout = QHBoxLayout()
        auth_layout.addWidget(QLabel("Token:"))
        self._token_input = QLineEdit()
        self._token_input.setPlaceholderText("输入认证Token")
        self._token_input.setEchoMode(QLineEdit.Password)
        auth_layout.addWidget(self._token_input)
        self._auth_btn = QPushButton("认证")
        self._auth_btn.clicked.connect(self._on_auth)
        auth_layout.addWidget(self._auth_btn)
        auth_group.setLayout(auth_layout)
        layout.addWidget(auth_group)

        control_group = QGroupBox("同步控制")
        control_layout = QHBoxLayout()
        self._start_btn = QPushButton("启动同步")
        self._start_btn.clicked.connect(self._on_start)
        control_layout.addWidget(self._start_btn)
        self._stop_btn = QPushButton("停止同步")
        self._stop_btn.clicked.connect(self._on_stop)
        self._stop_btn.setEnabled(False)
        control_layout.addWidget(self._stop_btn)
        self._status_label = QLabel("状态: 未启动")
        control_layout.addWidget(self._status_label)
        control_group.setLayout(control_layout)
        layout.addWidget(control_group)

        upload_group = QGroupBox("手动操作")
        upload_layout = QHBoxLayout()
        upload_layout.addWidget(QLabel("程序ID:"))
        self._program_id_input = QLineEdit()
        self._program_id_input.setPlaceholderText("输入程序ID")
        upload_layout.addWidget(self._program_id_input)
        upload_layout.addWidget(QLabel("版本ID:"))
        self._version_id_input = QLineEdit()
        self._version_id_input.setPlaceholderText("输入版本ID")
        upload_layout.addWidget(self._version_id_input)
        self._upload_btn = QPushButton("上传")
        self._upload_btn.clicked.connect(self._on_upload)
        upload_layout.addWidget(self._upload_btn)
        self._download_btn = QPushButton("下载")
        self._download_btn.clicked.connect(self._on_download)
        upload_layout.addWidget(self._download_btn)
        upload_group.setLayout(upload_layout)
        layout.addWidget(upload_group)

        self._queue_table = QTableWidget()
        self._queue_table.setColumnCount(4)
        self._queue_table.setHorizontalHeaderLabels(["操作", "程序ID", "版本", "重试次数"])
        self._queue_table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        layout.addWidget(self._queue_table)

        self._log_output = QTextEdit()
        self._log_output.setReadOnly(True)
        self._log_output.setMaximumHeight(120)
        layout.addWidget(self._log_output)

    def _on_auth(self) -> None:
        token = self._token_input.text().strip()
        if token:
            self._sync_service.authenticate(token)
            self._log_output.append("[认证] 认证成功")

    def _on_start(self) -> None:
        self._sync_service.start()
        self._start_btn.setEnabled(False)
        self._stop_btn.setEnabled(True)
        self._status_label.setText("状态: 运行中")
        self._log_output.append("[同步] 服务已启动")

    def _on_stop(self) -> None:
        self._sync_service.stop()
        self._start_btn.setEnabled(True)
        self._stop_btn.setEnabled(False)
        self._status_label.setText("状态: 已停止")
        self._log_output.append("[同步] 服务已停止")

    def _on_upload(self) -> None:
        program_id = self._program_id_input.text().strip()
        version_id = self._version_id_input.text().strip()
        if program_id and version_id:
            self._sync_service.enqueue_upload(program_id, version_id)
            self._log_output.append(f"[上传] 入队: {program_id} v{version_id}")

    def _on_download(self) -> None:
        program_id = self._program_id_input.text().strip()
        version_id = self._version_id_input.text().strip() or None
        if program_id:
            self._sync_service.enqueue_download(program_id, version_id)
            self._log_output.append(f"[下载] 入队: {program_id}")
