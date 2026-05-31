import urllib.request
import urllib.error
import json

BASE = "http://localhost:8000/api"

def test_endpoint(path, method="GET", data=None):
    try:
        url = f"{BASE}{path}"
        if data:
            req = urllib.request.Request(
                url,
                data=json.dumps(data).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method=method
            )
        else:
            req = urllib.request.Request(url, method=method)
        with urllib.request.urlopen(req, timeout=10) as r:
            content_type = r.headers.get("Content-Type", "")
            if "application/json" in content_type:
                data = json.loads(r.read())
                print(f"✓ {method} {path}")
                if isinstance(data, dict) and "inspections" in data:
                    print(f"   总巡检: {data['inspections']['total']}, 总缺陷: {data['inspections']['total_defects']}")
                    print(f"   向量库缓存命中率: {data['vector_store']['cache_stats']['hit_rate']:.1f}%")
                    print(f"   平均推理耗时: {data['inference_engine']['avg_inference_time_ms']:.0f}ms")
                return data
            else:
                print(f"✓ {method} {path} (非 JSON 响应，长度: {len(r.read())} bytes)")
                return True
    except urllib.error.HTTPError as e:
        print(f"✗ {method} {path} -> {e.code} {e.reason}")
        return None
    except Exception as e:
        print(f"✗ {method} {path} -> {e}")
        return None

print("=" * 60)
print("测试新 API 端点")
print("=" * 60)

print("\n1. 系统统计 API:")
test_endpoint("/inspections/stats/overview")

print("\n2. 巡检列表 API:")
result = test_endpoint("/inspections?page=1&page_size=5")
if result and result.get("items"):
    insp_id = result["items"][0]["id"]
    print(f"\n3. 测试单报告生成 (ID: {insp_id}):")
    test_endpoint(f"/inspections/{insp_id}/report")

    print(f"\n4. 测试批量报告生成:")
    test_endpoint("/inspections/batch-report", "POST", {"inspection_ids": [insp_id]})

print("\n" + "=" * 60)
print("测试缺陷标注 API")
print("=" * 60)

print("\n5. 缺陷列表 API:")
result = test_endpoint("/defects?page=1&page_size=3")
if result and result.get("items"):
    defect_id = result["items"][0]["id"]
    print(f"\n6. 测试获取缺陷详情 (ID: {defect_id}):")
    test_endpoint(f"/defects/{defect_id}")

    print(f"\n7. 测试更新缺陷标注:")
    test_endpoint(f"/defects/{defect_id}/annotation", "PUT", {
        "severity": "medium",
        "confidence": 0.85,
        "description": "测试更新描述"
    })

print("\n" + "=" * 60)
print("所有 API 测试完成")
print("=" * 60)
