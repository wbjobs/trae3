from PyQt5.QtWidgets import (
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPushButton,
    QTableWidget,
    QTableWidgetItem,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from core.cache import LocalCacheService


class CachePanel(QWidget):
    def __init__(self, cache_service: LocalCacheService) -> None:
        super().__init__()
        self._cache_service = cache_service
        self._setup_ui()
        self._refresh_stats()

    def _setup_ui(self) -> None:
        self.setWindowTitle("本地缓存")
        self.setMinimumSize(400, 300)

        layout = QVBoxLayout(self)

        stats_group = QGroupBox("缓存统计")
        stats_layout = QVBoxLayout()
        self._stats_label = QLabel("加载中...")
        self._stats_label.setWordWrap(True)
        stats_layout.addWidget(self._stats_label)
        stats_group.setLayout(stats_layout)
        layout.addWidget(stats_group)

        op_group = QGroupBox("缓存操作")
        op_layout = QHBoxLayout()

        op_layout.addWidget(QLabel("键:"))
        self._key_input = QLineEdit()
        self._key_input.setPlaceholderText("缓存键")
        op_layout.addWidget(self._key_input)

        op_layout.addWidget(QLabel("值:"))
        self._value_input = QLineEdit()
        self._value_input.setPlaceholderText("缓存值")
        op_layout.addWidget(self._value_input)

        op_layout.addWidget(QLabel("分类:"))
        self._category_input = QLineEdit()
        self._category_input.setPlaceholderText("分类(可选)")
        op_layout.addWidget(self._category_input)

        self._put_btn = QPushButton("写入")
        self._put_btn.clicked.connect(self._on_put)
        op_layout.addWidget(self._put_btn)

        self._get_btn = QPushButton("读取")
        self._get_btn.clicked.connect(self._on_get)
        op_layout.addWidget(self._get_btn)

        self._delete_btn = QPushButton("删除")
        self._delete_btn.clicked.connect(self._on_delete)
        op_layout.addWidget(self._delete_btn)

        op_group.setLayout(op_layout)
        layout.addWidget(op_group)

        self._result_output = QTextEdit()
        self._result_output.setReadOnly(True)
        self._result_output.setMaximumHeight(100)
        layout.addWidget(self._result_output)

        action_layout = QHBoxLayout()
        self._clear_btn = QPushButton("清空缓存")
        self._clear_btn.clicked.connect(self._on_clear)
        action_layout.addWidget(self._clear_btn)
        self._cleanup_btn = QPushButton("清理过期")
        self._cleanup_btn.clicked.connect(self._on_cleanup)
        action_layout.addWidget(self._cleanup_btn)
        self._refresh_btn = QPushButton("刷新统计")
        self._refresh_btn.clicked.connect(self._refresh_stats)
        action_layout.addWidget(self._refresh_btn)
        layout.addLayout(action_layout)

    def _on_put(self) -> None:
        key = self._key_input.text().strip()
        value = self._value_input.text().strip()
        category = self._category_input.text().strip()
        if key and value:
            self._cache_service.put(key, value, category=category)
            self._result_output.append(f"[写入] {key} = {value}")
            self._refresh_stats()

    def _on_get(self) -> None:
        key = self._key_input.text().strip()
        if key:
            try:
                value = self._cache_service.get(key)
                self._result_output.append(f"[读取] {key} = {value}")
            except Exception:
                self._result_output.append(f"[未找到] {key}")

    def _on_delete(self) -> None:
        key = self._key_input.text().strip()
        if key:
            deleted = self._cache_service.delete(key)
            self._result_output.append(f"[删除] {key}: {'成功' if deleted else '不存在'}")
            self._refresh_stats()

    def _on_clear(self) -> None:
        count = self._cache_service.clear()
        self._result_output.append(f"[清空] 已清空 {count} 条缓存")
        self._refresh_stats()

    def _on_cleanup(self) -> None:
        removed = self._cache_service.cleanup_expired()
        self._result_output.append(f"[清理] 已清理 {removed} 条过期缓存")
        self._refresh_stats()

    def _refresh_stats(self) -> None:
        stats = self._cache_service.get_stats()
        self._stats_label.setText(
            f"总条目: {stats['total_entries']} | "
            f"占用空间: {stats['total_size_mb']}MB / {stats['max_size_mb']}MB | "
            f"使用率: {stats['usage_percent']}% | "
            f"淘汰策略: {stats['eviction_policy']}"
        )
