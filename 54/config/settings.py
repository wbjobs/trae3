import os
from typing import Optional
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class DatabaseConfig:
    host: str = "localhost"
    port: int = 5432
    user: str = "postgres"
    password: str = "postgres"
    database: str = "weather_db"
    pool_size: int = 10
    max_overflow: int = 20

    @property
    def connection_url(self) -> str:
        return f"postgresql+psycopg2://{self.user}:{self.password}@{self.host}:{self.port}/{self.database}"


@dataclass
class ClusterConfig:
    api_url: str = "http://cluster-master:8080"
    api_key: str = "cluster-api-key"
    max_nodes: int = 10
    poll_interval: int = 5
    task_timeout: int = 3600


@dataclass
class InterpolationConfig:
    method: str = "kriging"
    grid_resolution: float = 0.01
    search_radius: float = 0.5
    min_points: int = 3
    max_points: int = 50
    variables: list = field(default_factory=lambda: ["temperature", "humidity", "pressure", "wind_speed", "precipitation"])


@dataclass
class SchedulerConfig:
    max_concurrent_tasks: int = 5
    retry_attempts: int = 3
    retry_delay: int = 30
    task_queue_ttl: int = 86400


@dataclass
class Settings:
    project_name: str = "DistributedWeatherInterpolation"
    log_level: str = "INFO"
    data_dir: Path = field(default_factory=lambda: Path("./data"))
    output_dir: Path = field(default_factory=lambda: Path("./output"))
    node_id: str = field(default_factory=lambda: os.getenv("NODE_ID", "node-001"))

    database: DatabaseConfig = field(default_factory=DatabaseConfig)
    cluster: ClusterConfig = field(default_factory=ClusterConfig)
    interpolation: InterpolationConfig = field(default_factory=InterpolationConfig)
    scheduler: SchedulerConfig = field(default_factory=SchedulerConfig)

    @classmethod
    def from_env(cls, env_file: Optional[str] = None) -> "Settings":
        if env_file and os.path.exists(env_file):
            from dotenv import load_dotenv
            load_dotenv(env_file)

        return cls(
            database=DatabaseConfig(
                host=os.getenv("DB_HOST", "localhost"),
                port=int(os.getenv("DB_PORT", "5432")),
                user=os.getenv("DB_USER", "postgres"),
                password=os.getenv("DB_PASSWORD", "postgres"),
                database=os.getenv("DB_NAME", "weather_db"),
            ),
            cluster=ClusterConfig(
                api_url=os.getenv("CLUSTER_API_URL", "http://cluster-master:8080"),
                api_key=os.getenv("CLUSTER_API_KEY", "cluster-api-key"),
                max_nodes=int(os.getenv("CLUSTER_MAX_NODES", "10")),
            ),
            interpolation=InterpolationConfig(
                method=os.getenv("INTERP_METHOD", "kriging"),
                grid_resolution=float(os.getenv("INTERP_RESOLUTION", "0.01")),
            ),
            scheduler=SchedulerConfig(
                max_concurrent_tasks=int(os.getenv("SCHEDULER_MAX_TASKS", "5")),
                retry_attempts=int(os.getenv("SCHEDULER_RETRY", "3")),
            ),
        )


_settings: Optional[Settings] = None


def load_settings(env_file: Optional[str] = None) -> Settings:
    global _settings
    _settings = Settings.from_env(env_file)
    return _settings


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
