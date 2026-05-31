import asyncio
import random
import numpy as np
from datetime import datetime, timedelta
from typing import List, Dict, Any, Callable
from sqlalchemy.orm import Session
from app.models.schemas import VibrationDataCreate
from app.services.crud_service import CRUDService


class DataCollector:
    def __init__(self, db: Session):
        self.db = db
        self.crud_service = CRUDService(db)
        self._collectors = {}
        self._is_running = False

    def generate_simulated_vibration(
        self,
        device_code: str,
        base_frequency: float = 50.0,
        amplitude: float = 1.0,
        noise_level: float = 0.1,
        sample_rate: int = 1000,
        duration: float = 1.0,
        has_anomaly: bool = False,
        anomaly_type: str = "impact"
    ) -> List[VibrationDataCreate]:
        num_samples = int(sample_rate * duration)
        t = np.linspace(0, duration, num_samples, endpoint=False)
        base_time = datetime.now()

        data_list = []

        for i in range(num_samples):
            x = amplitude * np.sin(2 * np.pi * base_frequency * t[i])
            y = amplitude * 0.8 * np.sin(2 * np.pi * base_frequency * 1.5 * t[i])
            z = amplitude * 0.6 * np.sin(2 * np.pi * base_frequency * 2.0 * t[i])

            x += noise_level * np.random.randn()
            y += noise_level * np.random.randn()
            z += noise_level * np.random.randn()

            if has_anomaly:
                if anomaly_type == "impact":
                    impact_window = int(0.05 * sample_rate)
                    if i % impact_window == 0:
                        impact_amp = amplitude * 3.0
                        x += impact_amp * np.exp(-10 * (i % impact_window) / sample_rate)
                        y += impact_amp * 0.8 * np.exp(-10 * (i % impact_window) / sample_rate)
                        z += impact_amp * 0.6 * np.exp(-10 * (i % impact_window) / sample_rate)
                elif anomaly_type == "unbalance":
                    x *= 1.5
                    y *= 1.5
                    z *= 1.2
                elif anomaly_type == "looseness":
                    x += 0.3 * amplitude * np.sin(2 * np.pi * base_frequency * 0.5 * t[i])
                    y += 0.3 * amplitude * np.sin(2 * np.pi * base_frequency * 0.5 * t[i])

            timestamp = base_time + timedelta(seconds=t[i])
            temperature = 25.0 + 5.0 * random.random() + (10.0 if has_anomaly else 0)
            speed = 1500 + random.randint(-50, 50)

            data_list.append(VibrationDataCreate(
                device_code=device_code,
                timestamp=timestamp,
                x_axis=float(x),
                y_axis=float(y),
                z_axis=float(z),
                temperature=temperature,
                speed=speed,
                sample_rate=sample_rate
            ))

        return data_list

    def generate_historical_data(
        self,
        device_code: str,
        start_time: datetime,
        end_time: datetime,
        interval_seconds: int = 60,
        anomaly_probability: float = 0.05
    ) -> int:
        total_inserted = 0
        current_time = start_time

        while current_time < end_time:
            has_anomaly = random.random() < anomaly_probability
            anomaly_types = ["impact", "unbalance", "looseness"]
            anomaly_type = random.choice(anomaly_types) if has_anomaly else "normal"

            data_list = self.generate_simulated_vibration(
                device_code=device_code,
                base_frequency=50.0 + random.randint(-10, 10),
                amplitude=0.5 + random.random(),
                noise_level=0.05 + 0.1 * random.random(),
                sample_rate=1000,
                duration=1.0,
                has_anomaly=has_anomaly,
                anomaly_type=anomaly_type
            )

            time_delta = current_time - data_list[0].timestamp
            for data in data_list:
                data.timestamp += time_delta

            inserted = self.crud_service.create_vibration_data_batch(data_list)
            total_inserted += inserted

            current_time += timedelta(seconds=interval_seconds)

        return total_inserted

    async def start_real_time_collection(
        self,
        device_code: str,
        interval_seconds: float = 1.0,
        on_data_received: Callable[[List[VibrationDataCreate]], None] = None
    ):
        self._is_running = True
        self._collectors[device_code] = True

        while self._is_running and self._collectors.get(device_code, False):
            data_list = self.generate_simulated_vibration(
                device_code=device_code,
                base_frequency=50.0,
                amplitude=0.8,
                noise_level=0.1,
                sample_rate=1000,
                duration=0.1,
                has_anomaly=random.random() < 0.02
            )

            self.crud_service.create_vibration_data_batch(data_list)

            if on_data_received:
                on_data_received(data_list)

            await asyncio.sleep(interval_seconds)

    def stop_collection(self, device_code: str = None):
        if device_code:
            self._collectors[device_code] = False
        else:
            self._is_running = False
            for key in self._collectors:
                self._collectors[key] = False


class DataForwarder:
    def __init__(self):
        self._subscribers: Dict[str, List[Callable]] = {}

    def subscribe(self, topic: str, callback: Callable[[Any], None]):
        if topic not in self._subscribers:
            self._subscribers[topic] = []
        self._subscribers[topic].append(callback)

    def unsubscribe(self, topic: str, callback: Callable[[Any], None]):
        if topic in self._subscribers:
            self._subscribers[topic].remove(callback)

    def publish(self, topic: str, data: Any):
        if topic in self._subscribers:
            for callback in self._subscribers[topic]:
                try:
                    callback(data)
                except Exception as e:
                    print(f"Error in subscriber callback: {e}")

    def forward_to_api(self, data: Dict[str, Any], api_endpoint: str):
        import requests
        try:
            response = requests.post(api_endpoint, json=data, timeout=5)
            return response.status_code == 200
        except Exception as e:
            print(f"Failed to forward data: {e}")
            return False


data_forwarder = DataForwarder()
