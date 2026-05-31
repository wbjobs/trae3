import os
import json
import time
import aiosqlite
from collections import defaultdict, deque
from datetime import datetime
from typing import List, Optional, Deque, Dict, Tuple

from backend.models.schemas import FaultAlert, SensorData, FilterParams
from backend.config import (
    FAULT_THRESHOLD_TEMP, FAULT_THRESHOLD_VIBRATION,
    FAULT_THRESHOLD_PRESSURE_HIGH, FAULT_THRESHOLD_PRESSURE_LOW,
    SQLITE_PATH,
)


DEBOUNCE_COUNT = 3
COOLDOWN_SECONDS = 10
HISTORY_WINDOW = 20

DEVICE_RPM_BASE: Dict[str, float] = {
    "pump-001": 1450.0,
    "motor-002": 2960.0,
    "compressor-003": 3500.0,
    "fan-004": 980.0,
}


class FaultDetector:
    def __init__(self):
        self._conn = None
        self._alert_callbacks = []
        self._consecutive_violations: Dict[str, Dict[str, int]] = defaultdict(
            lambda: defaultdict(int)
        )
        self._last_alert_time: Dict[str, Dict[str, float]] = defaultdict(
            lambda: defaultdict(float)
        )
        self._value_history: Dict[str, Deque[Tuple[float, float]]] = defaultdict(
            lambda: deque(maxlen=HISTORY_WINDOW)
        )

    async def initialize(self):
        db_dir = os.path.dirname(SQLITE_PATH)
        if db_dir:
            os.makedirs(db_dir, exist_ok=True)
        db_path = os.path.join(os.path.dirname(SQLITE_PATH), "faults.sqlite")
        self._conn = await aiosqlite.connect(db_path)
        await self._conn.execute("""
            CREATE TABLE IF NOT EXISTS fault_alerts (
                id TEXT PRIMARY KEY,
                device_id TEXT NOT NULL,
                fault_type TEXT NOT NULL,
                parameter TEXT NOT NULL,
                value REAL,
                threshold REAL,
                severity TEXT,
                message TEXT,
                timestamp TEXT NOT NULL,
                acknowledged INTEGER DEFAULT 0
            )
        """)
        await self._conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_fault_device_time
            ON fault_alerts(device_id, timestamp DESC)
        """)
        await self._conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_fault_type_time
            ON fault_alerts(fault_type, timestamp DESC)
        """)
        await self._conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_fault_severity
            ON fault_alerts(severity)
        """)
        await self._conn.commit()
        print("[Fault] Detector initialized with debounce=%d, cooldown=%ds" % (
            DEBOUNCE_COUNT, COOLDOWN_SECONDS
        ))

    def on_alert(self, callback):
        self._alert_callbacks.append(callback)

    def _check_debounce(self, device_id: str, fault_type: str, exceeded: bool) -> bool:
        key = f"{device_id}_{fault_type}"
        if not exceeded:
            self._consecutive_violations[device_id][fault_type] = 0
            return False
        self._consecutive_violations[device_id][fault_type] += 1
        count = self._consecutive_violations[device_id][fault_type]
        if count < DEBOUNCE_COUNT:
            return False
        now = time.time()
        last = self._last_alert_time[device_id][fault_type]
        if now - last < COOLDOWN_SECONDS:
            return False
        self._last_alert_time[device_id][fault_type] = now
        self._consecutive_violations[device_id][fault_type] = 0
        return True

    def _add_history(self, device_id: str, parameter: str, value: float, threshold: float) -> float:
        key = f"{device_id}_{parameter}"
        self._value_history[key].append((value, threshold))
        if len(self._value_history[key]) >= 3:
            return sum(v for v, _ in list(self._value_history[key])[-3:]) / 3
        return value

    async def detect(self, data: SensorData) -> List[FaultAlert]:
        alerts: List[FaultAlert] = []
        ts = data.timestamp or datetime.utcnow().isoformat()
        now = time.time()

        temp_avg = self._add_history(data.device_id, "temperature", data.temperature, FAULT_THRESHOLD_TEMP)
        temp_exceeded = temp_avg > FAULT_THRESHOLD_TEMP
        if self._check_debounce(data.device_id, "over_temperature", temp_exceeded):
            severity = "critical" if temp_avg > FAULT_THRESHOLD_TEMP * 1.1 else "warning"
            alerts.append(FaultAlert(
                device_id=data.device_id,
                fault_type="over_temperature",
                parameter="temperature",
                value=round(temp_avg, 2),
                threshold=FAULT_THRESHOLD_TEMP,
                severity=severity,
                message=f"温度超限: {round(temp_avg, 2)}°C > {FAULT_THRESHOLD_TEMP}°C",
                timestamp=ts,
            ))

        vib_avg = self._add_history(data.device_id, "vibration", data.vibration, FAULT_THRESHOLD_VIBRATION)
        vib_exceeded = vib_avg > FAULT_THRESHOLD_VIBRATION
        if self._check_debounce(data.device_id, "over_vibration", vib_exceeded):
            severity = "critical" if vib_avg > FAULT_THRESHOLD_VIBRATION * 1.15 else "warning"
            alerts.append(FaultAlert(
                device_id=data.device_id,
                fault_type="over_vibration",
                parameter="vibration",
                value=round(vib_avg, 2),
                threshold=FAULT_THRESHOLD_VIBRATION,
                severity=severity,
                message=f"振动超限: {round(vib_avg, 2)}mm/s > {FAULT_THRESHOLD_VIBRATION}mm/s",
                timestamp=ts,
            ))

        press_high_avg = self._add_history(data.device_id, "pressure_high", data.pressure, FAULT_THRESHOLD_PRESSURE_HIGH)
        press_high_exceeded = press_high_avg > FAULT_THRESHOLD_PRESSURE_HIGH
        if self._check_debounce(data.device_id, "over_pressure", press_high_exceeded):
            alerts.append(FaultAlert(
                device_id=data.device_id,
                fault_type="over_pressure",
                parameter="pressure",
                value=round(press_high_avg, 2),
                threshold=FAULT_THRESHOLD_PRESSURE_HIGH,
                severity="critical",
                message=f"压力超高: {round(press_high_avg, 2)}MPa > {FAULT_THRESHOLD_PRESSURE_HIGH}MPa",
                timestamp=ts,
            ))

        press_low_avg = self._add_history(data.device_id, "pressure_low", data.pressure, FAULT_THRESHOLD_PRESSURE_LOW)
        press_low_exceeded = 0 < press_low_avg < FAULT_THRESHOLD_PRESSURE_LOW
        if self._check_debounce(data.device_id, "low_pressure", press_low_exceeded):
            alerts.append(FaultAlert(
                device_id=data.device_id,
                fault_type="low_pressure",
                parameter="pressure",
                value=round(press_low_avg, 2),
                threshold=FAULT_THRESHOLD_PRESSURE_LOW,
                severity="warning",
                message=f"压力过低: {round(press_low_avg, 2)}MPa < {FAULT_THRESHOLD_PRESSURE_LOW}MPa",
                timestamp=ts,
            ))

        rpm_base = DEVICE_RPM_BASE.get(data.device_id, 1500.0)
        rpm_deviation = abs(data.rpm - rpm_base) / rpm_base
        rpm_exceeded = rpm_deviation > 0.3
        if self._check_debounce(data.device_id, "rpm_anomaly", rpm_exceeded):
            alerts.append(FaultAlert(
                device_id=data.device_id,
                fault_type="rpm_anomaly",
                parameter="rpm",
                value=round(data.rpm, 2),
                threshold=rpm_base * 1.3,
                severity="warning",
                message=f"转速异常: {round(data.rpm, 2)}RPM 偏离额定值 {round(rpm_deviation * 100, 1)}% (基准 {rpm_base}RPM)",
                timestamp=ts,
            ))

        for alert in alerts:
            alert.id = f"{alert.device_id}_{alert.fault_type}_{int(now * 1000)}"
            await self._save_alert(alert)
            for cb in self._alert_callbacks:
                await cb(alert)
            print(f"[Fault] {alert.device_id} {alert.fault_type}: {alert.message}")

        return alerts

    async def _save_alert(self, alert: FaultAlert):
        try:
            await self._conn.execute(
                "INSERT OR REPLACE INTO fault_alerts "
                "(id, device_id, fault_type, parameter, value, threshold, severity, message, timestamp, acknowledged) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (alert.id, alert.device_id, alert.fault_type, alert.parameter,
                 alert.value, alert.threshold, alert.severity, alert.message,
                 alert.timestamp, 1 if alert.acknowledged else 0)
            )
            await self._conn.commit()
        except Exception as e:
            print(f"[Fault] Save error: {e}")

    async def query_alerts(self, params: FilterParams, limit: int = 500) -> List[FaultAlert]:
        try:
            conditions = []
            sql_params: list = []
            if params.device_id:
                conditions.append("device_id = ?")
                sql_params.append(params.device_id)
            if params.fault_type:
                conditions.append("fault_type = ?")
                sql_params.append(params.fault_type)
            if params.severity:
                conditions.append("severity = ?")
                sql_params.append(params.severity)
            if params.start_time:
                conditions.append("timestamp >= ?")
                sql_params.append(params.start_time)
            if params.end_time:
                conditions.append("timestamp <= ?")
                sql_params.append(params.end_time)
            if params.acknowledged is not None:
                conditions.append("acknowledged = ?")
                sql_params.append(1 if params.acknowledged else 0)
            where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
            sql = f"SELECT * FROM fault_alerts {where} ORDER BY timestamp DESC LIMIT ?"
            sql_params.append(limit)

            async with self._conn.execute(sql, sql_params) as cursor:
                rows = await cursor.fetchall()
                columns = [desc[0] for desc in cursor.description]

            return [
                FaultAlert(
                    id=row[columns.index("id")],
                    device_id=row[columns.index("device_id")],
                    fault_type=row[columns.index("fault_type")],
                    parameter=row[columns.index("parameter")],
                    value=row[columns.index("value")],
                    threshold=row[columns.index("threshold")],
                    severity=row[columns.index("severity")],
                    message=row[columns.index("message")],
                    timestamp=row[columns.index("timestamp")],
                    acknowledged=bool(row[columns.index("acknowledged")]),
                )
                for row in rows
            ]
        except Exception as e:
            print(f"[Fault] Query error: {e}")
            return []

    async def acknowledge(self, alert_id: str) -> bool:
        try:
            cursor = await self._conn.execute(
                "UPDATE fault_alerts SET acknowledged = 1 WHERE id = ?",
                (alert_id,)
            )
            await self._conn.commit()
            return cursor.rowcount > 0
        except Exception as e:
            print(f"[Fault] Ack error: {e}")
            return False

    async def get_stats(self) -> dict:
        try:
            stats = {"total": 0, "critical": 0, "warning": 0, "info": 0, "unacknowledged": 0}
            async with self._conn.execute(
                "SELECT severity, COUNT(*) as cnt FROM fault_alerts GROUP BY severity"
            ) as cursor:
                rows = await cursor.fetchall()
                for row in rows:
                    severity, cnt = row
                    stats[severity] = cnt
                    stats["total"] += cnt
            async with self._conn.execute(
                "SELECT COUNT(*) FROM fault_alerts WHERE acknowledged = 0"
            ) as cursor:
                row = await cursor.fetchone()
                stats["unacknowledged"] = row[0] if row else 0
            return stats
        except Exception as e:
            print(f"[Fault] Stats error: {e}")
            return {"total": 0, "critical": 0, "warning": 0, "info": 0, "unacknowledged": 0}

    async def close(self):
        if self._conn:
            await self._conn.close()


fault_detector = FaultDetector()
