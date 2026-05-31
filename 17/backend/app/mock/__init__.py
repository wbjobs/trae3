import uuid
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
import random

from ..database import SessionLocal
from ..models import PVArray, Component, FaultRecord


def init_mock_data():
    db = SessionLocal()
    try:
        if db.query(PVArray).count() > 0:
            print("Mock data already exists, skipping initialization")
            return

        arrays = [
            {"id": "array_001", "name": "A区阵列", "location": "屋顶东区", "rows": 10, "cols": 20},
            {"id": "array_002", "name": "B区阵列", "location": "屋顶西区", "rows": 8, "cols": 25},
            {"id": "array_003", "name": "C区阵列", "location": "车棚顶", "rows": 6, "cols": 30}
        ]

        for arr in arrays:
            pv_array = PVArray(
                id=arr["id"],
                name=arr["name"],
                location=arr["location"],
                row_count=arr["rows"],
                col_count=arr["cols"]
            )
            db.add(pv_array)

            comp_idx = 0
            for row in range(arr["rows"]):
                for col in range(arr["cols"]):
                    comp_idx += 1
                    component = Component(
                        id=f"comp_{comp_idx:03d}",
                        array_id=arr["id"],
                        name=f"{arr['name']}-{row}-{col}",
                        row_position=row,
                        col_position=col,
                        rated_voltage=36.5,
                        rated_current=9.5,
                        max_temperature=85.0,
                        status="normal",
                        installed_at=datetime.utcnow() - timedelta(days=random.randint(30, 365))
                    )
                    db.add(component)

        fault_types = [
            "voltage_abnormal",
            "current_abnormal",
            "temperature_high",
            "offline",
            "short_circuit"
        ]
        severities = ["low", "medium", "high", "critical"]
        statuses = ["active", "resolved", "ignored"]

        now = datetime.utcnow()
        for i in range(30):
            component_num = random.randint(1, 200)
            days_ago = random.randint(0, 30)
            hours_ago = random.randint(0, 24)
            minutes_duration = random.randint(5, 180)

            start_time = now - timedelta(days=days_ago, hours=hours_ago)
            end_time = start_time + timedelta(minutes=minutes_duration)

            fault = FaultRecord(
                id=f"fault_{i:04d}",
                component_id=f"comp_{component_num:03d}",
                fault_type=random.choice(fault_types),
                severity=random.choice(severities),
                start_time=start_time,
                end_time=end_time if random.random() > 0.3 else None,
                status=random.choice(statuses),
                description=f"Mock fault #{i} for component {component_num}",
                threshold_value=random.uniform(20, 80),
                actual_value=random.uniform(10, 100)
            )
            db.add(fault)

        db.commit()
        print("Mock data initialized successfully")
    except Exception as e:
        db.rollback()
        print(f"Error initializing mock data: {e}")
    finally:
        db.close()
