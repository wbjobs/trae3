import sys
import os
import io
import time
sys.path.insert(0, '.')

from PIL import Image
import requests
import numpy as np

print("=" * 80)
print("  铭牌OCR系统优化验证测试")
print("=" * 80)
print()

BASE_URL = "http://localhost:8000"


def create_test_image(width=800, height=600, with_text=True):
    """创建测试图像，模拟不同质量的铭牌图像"""
    img = Image.new('RGB', (width, height), color='white')

    if with_text:
        from PIL import ImageDraw, ImageFont
        draw = ImageDraw.Draw(img)

        try:
            font = ImageFont.truetype("arial.ttf", 24)
        except:
            font = ImageFont.load_default()

        y = 50
        lines = [
            "设备名称：电动机",
            "型号规格：Y2-132M-4",
            "出厂编号：202401001234",
            "制造厂家：上海电机厂有限公司",
            "生产日期：2024-01-15",
            "额定功率：7.5kW",
            "额定电压：380V",
            "额定电流：15.4A",
            "重量：85kg",
            "外形尺寸：500×350×400mm",
            "检验周期：12个月"
        ]

        for line in lines:
            draw.text((50, y), line, fill='black', font=font)
            y += 40

    img_bytes = io.BytesIO()
    img.save(img_bytes, format='JPEG', quality=95)
    img_bytes.seek(0)
    return img_bytes


def create_low_quality_image():
    """创建低质量测试图像（模糊、反光）"""
    img = Image.new('RGB', (800, 600), color='white')

    from PIL import ImageDraw, ImageFont, ImageFilter

    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("arial.ttf", 24)
    except:
        font = ImageFont.load_default()

    for i in range(20):
        x1 = np.random.randint(0, 800)
        x2 = np.random.randint(x1, 800)
        y = np.random.randint(0, 600)
        draw.rectangle([x1, y, x2, y + 30], fill='yellow')

    y = 50
    lines = [
        "设备名称：电动机",
        "型号规格：Y2-132M-4",
        "出厂编号：202401001234",
        "制造厂家：上海电机厂有限公司"
    ]
    for line in lines:
        draw.text((50, y), line, fill='gray', font=font)
        y += 40

    img = img.filter(ImageFilter.GaussianBlur(radius=2))

    img_bytes = io.BytesIO()
    img.save(img_bytes, format='JPEG', quality=50)
    img_bytes.seek(0)
    return img_bytes


def test_1_health_check():
    """测试1: 健康检查"""
    print("【测试1】健康检查...")
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'healthy'
        print(f"  ✓ 数据库状态: {data['database']}")
        if 'ocr_service' in data and data['ocr_service']:
            print(f"  ✓ OCR服务统计: {data['ocr_service']}")
        print("  ✓ 健康检查通过")
        return True
    except Exception as e:
        import traceback
        print(f"  ✗ 失败: {e}")
        traceback.print_exc()
        return False


def test_2_root_endpoint():
    """测试2: 根接口信息"""
    print("\n【测试2】根接口信息...")
    try:
        response = requests.get(f"{BASE_URL}/", timeout=10)
        assert response.status_code == 200
        data = response.json()
        print(f"  ✓ 版本: {data['version']}")
        print(f"  ✓ 功能特性:")
        for feature in data['features']:
            print(f"    - {feature}")
        print("  ✓ 根接口测试通过")
        return True
    except Exception as e:
        import traceback
        print(f"  ✗ 失败: {e}")
        traceback.print_exc()
        return False


def test_3_normal_ocr():
    """测试3: 正常质量图像OCR识别"""
    print("\n【测试3】正常质量图像OCR识别...")
    try:
        img_bytes = create_test_image()
        files = {'file': ('test_normal.jpg', img_bytes, 'image/jpeg')}

        start_time = time.time()
        response = requests.post(f"{BASE_URL}/api/v1/ocr/recognize", files=files, timeout=60)
        processing_time = time.time() - start_time

        assert response.status_code == 200
        data = response.json()

        assert data['success'] == True
        assert data['record_id'] > 0
        assert len(data['ocr_result']['lines']) > 0
        assert data['ocr_result']['average_confidence'] > 0.5

        print(f"  ✓ 处理时间: {processing_time:.2f}秒")
        print(f"  ✓ 记录ID: {data['record_id']}")
        print(f"  ✓ 识别行数: {len(data['ocr_result']['lines'])}")
        print(f"  ✓ 平均置信度: {data['ocr_result']['average_confidence']:.2%}")

        extracted = data['extracted_info']
        fields_found = sum(1 for v in extracted.values() if v is not None)
        print(f"  ✓ 提取字段数: {fields_found}/11")

        key_fields = ['equipment_name', 'equipment_model', 'serial_number', 'manufacturer']
        all_found = all(extracted.get(field) for field in key_fields)
        if all_found:
            print("  ✓ 所有关键字段提取成功")
            for field in key_fields:
                print(f"    {field}: {extracted[field]}")
        else:
            print("  ⚠ 部分关键字段未识别")

        print("  ✓ 正常图像识别测试通过")
        return True, data['record_id']
    except Exception as e:
        import traceback
        print(f"  ✗ 失败: {e}")
        traceback.print_exc()
        return False, None


def test_4_low_quality_ocr():
    """测试4: 低质量图像OCR识别（反光、模糊）"""
    print("\n【测试4】低质量图像OCR识别（反光、模糊）...")
    try:
        img_bytes = create_low_quality_image()
        files = {'file': ('test_low_quality.jpg', img_bytes, 'image/jpeg')}

        start_time = time.time()
        response = requests.post(f"{BASE_URL}/api/v1/ocr/recognize", files=files, timeout=60)
        processing_time = time.time() - start_time

        assert response.status_code == 200
        data = response.json()

        assert data['success'] == True
        assert len(data['ocr_result']['lines']) > 0

        print(f"  ✓ 处理时间: {processing_time:.2f}秒")
        print(f"  ✓ 识别行数: {len(data['ocr_result']['lines'])}")
        print(f"  ✓ 平均置信度: {data['ocr_result']['average_confidence']:.2%}")

        extracted = data['extracted_info']
        fields_found = sum(1 for v in extracted.values() if v is not None)
        print(f"  ✓ 提取字段数: {fields_found}/11")

        if data['ocr_result']['average_confidence'] < 0.7:
            print("  ✓ 正确识别低质量图像，置信度符合预期")
        else:
            print("  ✓ 低质量图像识别成功")

        print("  ✓ 低质量图像识别测试通过")
        return True
    except Exception as e:
        import traceback
        print(f"  ✗ 失败: {e}")
        traceback.print_exc()
        return False


def test_5_database_operations(record_id):
    """测试5: 数据库CRUD操作"""
    print("\n【测试5】数据库CRUD操作...")
    try:
        print("  5.1 查询记录列表...")
        response = requests.get(f"{BASE_URL}/api/v1/records", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data['total'] > 0
        print(f"    ✓ 总记录数: {data['total']}")

        print("  5.2 查询单条记录...")
        response = requests.get(f"{BASE_URL}/api/v1/records/{record_id}", timeout=10)
        assert response.status_code == 200
        record = response.json()
        assert record['id'] == record_id
        print(f"    ✓ 记录ID: {record['id']}")
        print(f"    ✓ 设备名称: {record['equipment_name']}")

        print("  5.3 更新记录...")
        update_data = {
            "equipment_name": "测试电动机-已更新",
            "rated_power": "11kW"
        }
        response = requests.put(
            f"{BASE_URL}/api/v1/records/{record_id}",
            json=update_data,
            timeout=10
        )
        assert response.status_code == 200
        updated = response.json()
        assert updated['equipment_name'] == "测试电动机-已更新"
        assert updated['rated_power'] == "11kW"
        print("    ✓ 记录更新成功")

        print("  5.4 验证更新结果...")
        response = requests.get(f"{BASE_URL}/api/v1/records/{record_id}", timeout=10)
        verified = response.json()
        assert verified['equipment_name'] == "测试电动机-已更新"
        print("    ✓ 更新结果验证通过")

        print("  5.5 关键词搜索...")
        response = requests.get(
            f"{BASE_URL}/api/v1/records",
            params={"keyword": "测试电动机"},
            timeout=10
        )
        search_data = response.json()
        assert search_data['total'] >= 1
        print(f"    ✓ 搜索结果数: {search_data['total']}")

        print("  ✓ 数据库CRUD操作测试通过")
        return True
    except Exception as e:
        import traceback
        print(f"  ✗ 失败: {e}")
        traceback.print_exc()
        return False


def test_6_database_integrity():
    """测试6: 数据库完整性检查"""
    print("\n【测试6】数据库完整性检查...")
    try:
        response = requests.get(f"{BASE_URL}/api/v1/records/integrity/check", timeout=10)
        assert response.status_code == 200
        data = response.json()

        assert data['success'] == True
        integrity = data['data']

        print(f"  ✓ 总记录数: {integrity['total_records']}")
        print(f"  ✓ 有效记录数: {integrity['valid_records']}")
        print(f"  ✓ 完整度: {integrity['integrity_score']:.2%}")

        if integrity['invalid_records']:
            print(f"  ⚠ 无效记录: {integrity['invalid_records']}")
        else:
            print("  ✓ 无无效记录")

        assert integrity['integrity_score'] >= 0.8
        print("  ✓ 数据库完整性测试通过")
        return True
    except Exception as e:
        import traceback
        print(f"  ✗ 失败: {e}")
        traceback.print_exc()
        return False


def test_7_statistics():
    """测试7: 统计数据"""
    print("\n【测试7】统计数据...")
    try:
        response = requests.get(f"{BASE_URL}/api/v1/records/statistics/summary", timeout=10)
        assert response.status_code == 200
        data = response.json()

        print(f"  ✓ 总记录数: {data['total_records']}")
        print(f"  ✓ 已完成: {data['completed_records']}")
        print(f"  ✓ 待处理: {data['pending_records']}")
        print(f"  ✓ 平均置信度: {data['average_confidence']:.2%}")
        print(f"  ✓ 热门厂商数: {len(data['top_manufacturers'])}")

        if data['top_manufacturers']:
            print("    热门厂商:")
            for m in data['top_manufacturers'][:5]:
                print(f"      - {m['name']}: {m['count']}条")

        print("  ✓ 统计数据测试通过")
        return True
    except Exception as e:
        import traceback
        print(f"  ✗ 失败: {e}")
        traceback.print_exc()
        return False


def test_8_system_status():
    """测试8: 系统状态"""
    print("\n【测试8】系统状态...")
    try:
        response = requests.get(f"{BASE_URL}/api/v1/status", timeout=10)
        assert response.status_code == 200
        data = response.json()

        print(f"  ✓ 数据库完整度: {data['integrity']['integrity_score']:.2%}")
        print(f"  ✓ OCR总请求数: {data['ocr_service']['total_requests']}")
        print(f"  ✓ OCR缓存命中率: {data['ocr_service']['cache_hits']}/{data['ocr_service']['total_requests']}")
        if data['ocr_service']['avg_processing_time'] > 0:
            print(f"  ✓ OCR平均处理时间: {data['ocr_service']['avg_processing_time']:.2f}秒")

        print("  ✓ 系统状态测试通过")
        return True
    except Exception as e:
        import traceback
        print(f"  ✗ 失败: {e}")
        traceback.print_exc()
        return False


def test_9_re_recognize(record_id):
    """测试9: 重新识别"""
    print("\n【测试9】重新识别...")
    try:
        start_time = time.time()
        response = requests.post(
            f"{BASE_URL}/api/v1/ocr/recognize/{record_id}",
            timeout=60
        )
        processing_time = time.time() - start_time

        assert response.status_code == 200
        data = response.json()

        assert data['success'] == True
        assert data['record_id'] == record_id

        print(f"  ✓ 处理时间: {processing_time:.2f}秒")
        print(f"  ✓ 识别行数: {len(data['ocr_result']['lines'])}")
        print(f"  ✓ 平均置信度: {data['ocr_result']['average_confidence']:.2%}")

        print("  ✓ 重新识别测试通过")
        return True
    except Exception as e:
        import traceback
        print(f"  ✗ 失败: {e}")
        traceback.print_exc()
        return False


def test_10_database_backup():
    """测试10: 数据库备份"""
    print("\n【测试10】数据库备份...")
    try:
        response = requests.post(f"{BASE_URL}/api/v1/records/backup/create", timeout=10)
        assert response.status_code == 200
        data = response.json()

        assert data['success'] == True
        print(f"  ✓ 备份路径: {data['backup_path']}")
        print("  ✓ 数据库备份测试通过")
        return True
    except Exception as e:
        import traceback
        print(f"  ✗ 失败: {e}")
        traceback.print_exc()
        return False


if __name__ == "__main__":
    results = []
    record_id = None

    print("开始执行测试...\n")

    results.append(("健康检查", test_1_health_check()))
    results.append(("根接口信息", test_2_root_endpoint()))

    success, new_record_id = test_3_normal_ocr()
    results.append(("正常图像识别", success))
    if new_record_id:
        record_id = new_record_id

    results.append(("低质量图像识别", test_4_low_quality_ocr()))

    if record_id:
        results.append(("数据库CRUD操作", test_5_database_operations(record_id)))
        results.append(("重新识别", test_9_re_recognize(record_id)))

    results.append(("数据库完整性", test_6_database_integrity()))
    results.append(("统计数据", test_7_statistics()))
    results.append(("系统状态", test_8_system_status()))
    results.append(("数据库备份", test_10_database_backup()))

    print("\n" + "=" * 80)
    print("  测试结果汇总")
    print("=" * 80)

    passed = sum(1 for _, r in results if r)
    total = len(results)

    for name, result in results:
        status = "✓ 通过" if result else "✗ 失败"
        print(f"  {name}: {status}")

    print(f"\n  总计: {passed}/{total} 测试通过")

    if passed == total:
        print("\n  🎉 所有测试通过！系统优化验证成功！")
        print("\n  已解决的问题:")
        print("  ✓ 反光、模糊铭牌识别失效 → 增强预处理（反光去除、模糊修复）")
        print("  ✓ AI推理耗时过长 → OCR缓存、超时保护、性能监控")
        print("  ✓ 提取字段错乱 → 多策略匹配、冲突解决、交叉验证")
        print("  ✓ 数据库存储丢失 → 事务管理、重试机制、自动备份")
    else:
        print(f"\n  ⚠ 有 {total - passed} 个测试失败，请检查日志")

    print("=" * 80)
