import os

DB_BACKEND = os.getenv("DB_BACKEND", "sqlite")

INFLUXDB_URL = os.getenv("INFLUXDB_URL", "http://localhost:8086")
INFLUXDB_TOKEN = os.getenv("INFLUXDB_TOKEN", "my-super-secret-token")
INFLUXDB_ORG = os.getenv("INFLUXDB_ORG", "industrial")
INFLUXDB_BUCKET = os.getenv("INFLUXDB_BUCKET", "metrics")

SQLITE_PATH = os.getenv("SQLITE_PATH", "data/tsdb.sqlite")

FAULT_THRESHOLD_TEMP = float(os.getenv("FAULT_THRESHOLD_TEMP", "85.0"))
FAULT_THRESHOLD_VIBRATION = float(os.getenv("FAULT_THRESHOLD_VIBRATION", "7.5"))
FAULT_THRESHOLD_PRESSURE_HIGH = float(os.getenv("FAULT_THRESHOLD_PRESSURE_HIGH", "6.0"))
FAULT_THRESHOLD_PRESSURE_LOW = float(os.getenv("FAULT_THRESHOLD_PRESSURE_LOW", "0.5"))

METRICS_WINDOW_SECONDS = int(os.getenv("METRICS_WINDOW_SECONDS", "300"))

CORS_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:3000",
]
