import os
import shutil

db_path = os.path.join('data', 'monitor.db')

if os.path.exists(db_path):
    backup_path = os.path.join('data', f'monitor_backup_{int(__import__("time").time())}.db')
    shutil.copy2(db_path, backup_path)
    print(f'已备份数据库到: {backup_path}')
    os.remove(db_path)
    print('已删除旧数据库')
else:
    print('数据库不存在，无需删除')

print('数据库已准备好重新初始化')
