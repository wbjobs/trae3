import requests
import time

base_url = 'http://127.0.0.1:8000'

# 1. 测试告警升级功能
print('=== 测试分级告警系统 ===')

# 获取当前告警
r = requests.get(f'{base_url}/api/alerts?resolved=false&limit=10')
print(f'当前告警数量: {len(r.json())}')

# 2. 获取历史数据摘要
print('\n=== 测试历史数据接口 ===')
r = requests.get(f'{base_url}/api/history/summary')
print(f'历史摘要: {r.json()}')

# 3. 获取状态历史
r = requests.get(f'{base_url}/api/status/history?limit=10')
print(f'状态历史记录: {len(r.json())} 条')

# 4. 获取指标数据范围
r = requests.get(f'{base_url}/api/metrics/range?node_id=node-001&hours=1')
print(f'节点指标数据: {len(r.json())} 条')

# 5. 获取统计摘要
print('\n=== 测试统计摘要 ===')
r = requests.get(f'{base_url}/api/stats/summary')
data = r.json()
print(f'在线节点: {data["online_nodes"]}/{data["total_nodes"]}')
print(f'优先级分布: P1={data["priority_distribution"].get("1",0)}, P2={data["priority_distribution"].get("2",0)}, P3={data["priority_distribution"].get("3",0)}')
print(f'告警统计: P1={data["alert_severity_stats"].get("1",0)}, P2={data["alert_severity_stats"].get("2",0)}, P3={data["alert_severity_stats"].get("3",0)}')

print('\n=== 测试完成 ===')
