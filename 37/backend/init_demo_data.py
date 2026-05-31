import sys
sys.path.insert(0, '.')

from app.core.database import SessionLocal
from app.services.crud_service import CRUDService
from app.services.data_collection_service import DataCollector
from app.models.schemas import DeviceCreate
from datetime import datetime, timedelta


def init_demo_data():
    print("开始初始化演示数据...")

    db = SessionLocal()
    crud = CRUDService(db)
    collector = DataCollector(db)

    demo_devices = [
        {
            "device_code": "PUMP-001",
            "device_name": "1号循环水泵",
            "device_type": "pump",
            "location": "生产车间A-1",
            "manufacturer": "上海泵业",
            "model": "ISG100-200",
            "status": "running",
            "description": "主循环水泵，额定转速1480rpm"
        },
        {
            "device_code": "MOTOR-001",
            "device_name": "2号驱动电机",
            "device_type": "motor",
            "location": "生产车间A-2",
            "manufacturer": "西门子",
            "model": "1LE0001",
            "status": "running",
            "description": "75kW三相异步电动机"
        },
        {
            "device_code": "FAN-001",
            "device_name": "3号引风机",
            "device_type": "fan",
            "location": "生产车间B-1",
            "manufacturer": "沈阳风机厂",
            "model": "Y4-73",
            "status": "running",
            "description": "锅炉引风机"
        },
        {
            "device_code": "COMP-001",
            "device_name": "4号空压机",
            "device_type": "compressor",
            "location": "动力车间",
            "manufacturer": "阿特拉斯",
            "model": "GA110",
            "status": "maintenance",
            "description": "螺杆式空气压缩机"
        }
    ]

    for device_data in demo_devices:
        existing = crud.get_device_by_code(device_data["device_code"])
        if not existing:
            crud.create_device(DeviceCreate(**device_data))
            print(f"创建设备: {device_data['device_code']} - {device_data['device_name']}")
        else:
            print(f"设备已存在: {device_data['device_code']}")

    print("\n开始生成历史振动数据（最近7天）...")

    end_time = datetime.now()
    start_time = end_time - timedelta(days=7)

    for device in demo_devices:
        if device["status"] != "maintenance":
            print(f"正在为 {device['device_code']} 生成数据...")
            try:
                count = collector.generate_historical_data(
                    device_code=device["device_code"],
                    start_time=start_time,
                    end_time=end_time,
                    interval_seconds=300,
                    anomaly_probability=0.08
                )
                print(f"  已生成 {count} 条振动数据记录")
            except Exception as e:
                print(f"  生成失败: {e}")

    print("\n演示数据初始化完成！")
    print(f"设备数量: {len(demo_devices)}")
    print("可以通过 http://localhost:8000/docs 查看API文档")
    print("可以通过 http://localhost:5173 访问前端界面")

    db.close()


if __name__ == "__main__":
    init_demo_data()
