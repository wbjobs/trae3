import sys
sys.path.insert(0, '.')

from common import (
    TaskError, NodeError, StorageError, KernelError,
    Task, TaskResult, ComputeNode, TemperatureSalinityData,
    generate_uuid, get_timestamp, serialize_data, deserialize_data, setup_logger
)
print('✓ common 包导入成功')

from config import get_settings, Settings
print('✓ config 包导入成功')

task = Task(task_id=generate_uuid(), name='test-task', task_type='compute')
print(f'✓ Task 创建成功: {task.task_id}')

serialized = serialize_data(task.to_dict())
print(f'✓ 序列化成功: {len(serialized)} bytes')

deserialized = deserialize_data(serialized)
print(f'✓ 反序列化成功: {deserialized["name"]}')

settings = get_settings()
print(f'✓ 配置加载成功: {settings.cluster.name}')

try:
    raise TaskError('测试任务异常', task_id=task.task_id)
except TaskError as e:
    print(f'✓ 异常捕获成功: {e}')

print('\n所有验证通过!')
