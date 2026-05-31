import requests
import sys

# 先获取记录列表
response = requests.get('http://localhost:8000/api/v1/records', timeout=10)
print(f'记录列表状态: {response.status_code}')
data = response.json()
print(f'记录数: {data["total"]}')
if data['total'] > 0:
    record_id = data['records'][0]['id']
    print(f'第一条记录ID: {record_id}')
    
    # 查询单条记录
    response2 = requests.get(f'http://localhost:8000/api/v1/records/{record_id}', timeout=10)
    print(f'单条记录状态: {response2.status_code}')
    print(f'响应: {response2.text[:500]}')
    if response2.status_code != 200:
        try:
            err = response2.json()
            if 'detail' in err:
                print(f'错误详情: {err["detail"]}')
        except:
            pass
    
    # 重新识别
    response3 = requests.post(f'http://localhost:8000/api/v1/ocr/recognize/{record_id}', timeout=60)
    print(f'重新识别状态: {response3.status_code}')
    print(f'响应: {response3.text[:500]}')
    if response3.status_code != 200:
        try:
            err = response3.json()
            if 'detail' in err:
                print(f'错误详情: {err["detail"]}')
        except:
            pass
