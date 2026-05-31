from PyQt5.QtCore import Qt, QTimer
from PyQt5.QtWidgets import (
    QComboBox,
    QGroupBox,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QLineEdit,
    QProgressBar,
    QPushButton,
    QSpinBox,
    QSplitter,
    QTableWidget,
    QTableWidgetItem,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from core.simulator import SimulationEngine, SimulationRunner
from core.simulator.models import TaskStatus


class SimulatorPanel(QWidget):
    def __init__(self, engine: SimulationEngine, runner: SimulationRunner) -> None:
        super().__init__()
        self._engine = engine
        self._runner = runner
        self._setup_ui()
        self._start_refresh_timer()

    def _setup_ui(self) -> None:
        self.setWindowTitle("仿真引擎")
        self.setMinimumSize(500, 400)

        layout = QVBoxLayout(self)

        config_group = QGroupBox("任务配置")
        config_layout = QHBoxLayout()

        config_layout.addWidget(QLabel("程序ID:"))
        self._program_id_input = QLineEdit()
        self._program_id_input.setPlaceholderText("输入程序ID")
        config_layout.addWidget(self._program_id_input)

        config_layout.addWidget(QLabel("版本:"))
        self._version_input = QLineEdit()
        self._version_input.setPlaceholderText("1.0.0")
        config_layout.addWidget(self._version_input)

        config_layout.addWidget(QLabel("超时(秒):"))
        self._timeout_spin = QSpinBox()
        self._timeout_spin.setRange(60, 86400)
        self._timeout_spin.setValue(3600)
        config_layout.addWidget(self._timeout_spin)

        self._submit_btn = QPushButton("提交任务")
        self._submit_btn.clicked.connect(self._on_submit)
        config_layout.addWidget(self._submit_btn)

        config_group.setLayout(config_layout)
        layout.addWidget(config_group)

        splitter = QSplitter(Qt.Vertical)

        self._task_table = QTableWidget()
        self._task_table.setColumnCount(6)
        self._task_table.setHorizontalHeaderLabels(
            ["任务ID", "程序ID", "版本", "状态", "创建时间", "操作"]
        )
        self._task_table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        self._task_table.setSelectionBehavior(QTableWidget.SelectRows)
        splitter.addWidget(self._task_table)

        self._log_output = QTextEdit()
        self._log_output.setReadOnly(True)
        self._log_output.setMaximumHeight(150)
        splitter.addWidget(self._log_output)

        layout.addWidget(splitter)

        progress_group = QGroupBox("执行进度")
        progress_layout = QHBoxLayout()
        self._progress_bar = QProgressBar()
        self._progress_bar.setValue(0)
        progress_layout.addWidget(self._progress_bar)
        progress_group.setLayout(progress_layout)
        layout.addWidget(progress_group)

    def _start_refresh_timer(self) -> None:
        self._timer = QTimer(self)
        self._timer.timeout.connect(self._refresh_task_list)
        self._timer.start(2000)

    def _on_submit(self) -> None:
        program_id = self._program_id_input.text().strip()
        version = self._version_input.text().strip()
        timeout = self._timeout_spin.value()

        if not program_id:
            self._log_output.append("[错误] 请输入程序ID")
            return

        try:
            task = self._engine.submit_task(
                program_id=program_id,
                program_version=version or "1.0.0",
                parameters={"steps": {"default_step": {"type": "simulation"}}},
                timeout=timeout,
            )
            self._log_output.append(f"[提交] 任务已创建: {task.task_id[:8]}...")
            self._program_id_input.clear()
            self._refresh_task_list()
        except Exception as e:
            self._log_output.append(f"[错误] 提交失败: {e}")

    def _refresh_task_list(self) -> None:
        tasks = self._engine.list_tasks()
        self._task_table.setRowCount(len(tasks))

        status_map = {
            TaskStatus.PENDING: "等待中",
            TaskStatus.RUNNING: "运行中",
            TaskStatus.PAUSED: "已暂停",
            TaskStatus.COMPLETED: "已完成",
            TaskStatus.FAILED: "失败",
            TaskStatus.CANCELLED: "已取消",
        }

        for row, task in enumerate(tasks):
            self._task_table.setItem(row, 0, QTableWidgetItem(task.task_id[:8]))
            self._task_table.setItem(row, 1, QTableWidgetItem(task.program_id))
            self._task_table.setItem(row, 2, QTableWidgetItem(task.program_version))
            status_item = QTableWidgetItem(status_map.get(task.status, task.status.value))
            if task.status == TaskStatus.RUNNING:
                status_item.setForeground(Qt.green)
            elif task.status == TaskStatus.FAILED:
                status_item.setForeground(Qt.red)
            self._task_table.setItem(row, 3, status_item)
            self._task_table.setItem(
                row, 4, QTableWidgetItem(task.created_at.strftime("%H:%M:%S"))
            )

            cancel_btn = QPushButton("取消")
            cancel_btn.clicked.connect(lambda checked, tid=task.task_id: self._on_cancel(tid))
            self._task_table.setCellWidget(row, 5, cancel_btn)

        running = sum(1 for t in tasks if t.status == TaskStatus.RUNNING)
        total = len(tasks)
        if total > 0:
            self._progress_bar.setValue(int(running / total * 100))

    def _on_cancel(self, task_id: str) -> None:
        try:
            self._engine.cancel_task(task_id)
            self._log_output.append(f"[取消] 任务 {task_id[:8]}... 已取消")
        except Exception as e:
            self._log_output.append(f"[错误] 取消失败: {e}")
