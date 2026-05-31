import abc
import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, List, Optional
from collections import defaultdict
from datetime import datetime

logger = logging.getLogger(__name__)


class CommandStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class CommandContext:
    command_name: str
    start_time: datetime = field(default_factory=datetime.now)
    end_time: Optional[datetime] = None
    status: CommandStatus = CommandStatus.PENDING
    result: Any = None
    error: Optional[Exception] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    progress: float = 0.0
    message: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "command_name": self.command_name,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "status": self.status.value,
            "result": str(self.result) if self.result else None,
            "error": str(self.error) if self.error else None,
            "metadata": self.metadata,
            "progress": self.progress,
            "message": self.message
        }


class Command(abc.ABC):
    name: str = ""
    description: str = ""
    category: str = "general"
    
    def __init__(self):
        self.context = CommandContext(command_name=self.name)
    
    @abc.abstractmethod
    def execute(self, **kwargs) -> Any:
        pass
    
    def before_execute(self, **kwargs):
        self.context.status = CommandStatus.RUNNING
        self.context.start_time = datetime.now()
        logger.info(f"开始执行命令: {self.name}")
    
    def after_execute(self, result: Any):
        self.context.status = CommandStatus.COMPLETED
        self.context.result = result
        self.context.end_time = datetime.now()
        duration = self.context.end_time - self.context.start_time
        logger.info(f"命令执行完成: {self.name}, 耗时: {duration.total_seconds():.2f}s")
    
    def on_error(self, error: Exception):
        self.context.status = CommandStatus.FAILED
        self.context.error = error
        self.context.end_time = datetime.now()
        logger.error(f"命令执行失败: {self.name}, 错误: {str(error)}")
    
    def update_progress(self, progress: float, message: str = ""):
        self.context.progress = progress
        self.context.message = message
    
    def run(self, **kwargs) -> CommandContext:
        try:
            self.before_execute(**kwargs)
            result = self.execute(**kwargs)
            self.after_execute(result)
        except Exception as e:
            self.on_error(e)
            raise
        return self.context


class CommandRegistry:
    def __init__(self):
        self._commands: Dict[str, Callable] = {}
        self._categories: Dict[str, List[str]] = defaultdict(list)
    
    def register(self, command_cls):
        if command_cls.name in self._commands:
            raise ValueError(f"命令已注册: {command_cls.name}")
        
        self._commands[command_cls.name] = command_cls
        self._categories[command_cls.category].append(command_cls.name)
        return command_cls
    
    def get(self, name: str):
        return self._commands.get(name)
    
    def list_commands(self) -> List[str]:
        return sorted(list(self._commands.keys()))
    
    def list_by_category(self) -> Dict[str, List[str]]:
        return dict(self._categories)
    
    def execute(self, name: str, **kwargs) -> CommandContext:
        cmd_cls = self._commands.get(name)
        if cmd_cls:
            cmd = cmd_cls()
            return cmd.run(**kwargs)
        raise ValueError(f"未知命令: {name}")


def command(name: str, description: str = "", category: str = "general"):
    def decorator(cls):
        cls.name = name
        cls.description = description
        cls.category = category
        return cls
    return decorator


global_registry = CommandRegistry()


def register_command(cls):
    return global_registry.register(cls)
