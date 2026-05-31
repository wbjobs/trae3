# 地下水渗流场有限元数值计算系统

基于 Python + PyPy + SQLite 的地下水渗流场有限元数值计算系统，支持多核并行计算。

## 系统架构

### 模块组成

1. **地层网格划分模块** ([mesh_generator.py](file:///e:/标注项目/trae3/24/mesh_generator.py))
   - 支持矩形结构化网格生成
   - 支持三角形和四边形单元
   - 网格自适应加密
   - 边界自动识别

2. **水文参数导入模块** ([parameter_import.py](file:///e:/标注项目/trae3/24/parameter_import.py))
   - 支持 CSV/JSON 格式参数导入
   - 批量导入野外水文参数
   - 边界条件管理
   - 地层属性管理

3. **有限元方程求解模块** ([fem_solver.py](file:///e:/标注项目/trae3/24/fem_solver.py))
   - 基于 Galerkin 法的有限元求解
   - 稀疏矩阵存储与求解
   - 支持直接法和迭代法（CG+ILU预处理）
   - 后处理计算（流速、达西通量、水力梯度）

4. **计算任务调度模块** ([task_scheduler.py](file:///e:/标注项目/trae3/24/task_scheduler.py))
   - 多任务排队管理
   - 线程级和进程级并行计算
   - 任务优先级调度
   - 后台持续运算

5. **结果后处理导出模块** ([result_exporter.py](file:///e:/标注项目/trae3/24/result_exporter.py))
   - VTK 格式（ParaView 可视化）
   - CSV 格式（表格数据）
   - Tecplot 格式
   - MAT 格式（MATLAB 兼容）

6. **数据存储** ([database.py](file:///e:/标注项目/trae3/24/database.py))
   - SQLite 数据库存储
   - 网格、参数、任务、结果统一管理

## 安装依赖

```bash
pip install -r requirements.txt
```

依赖包：
- numpy >= 1.21.0
- scipy >= 1.7.0
- psutil >= 5.8.0

## 快速开始

### 1. 交互式模式

```bash
python main.py
```

进入交互菜单，可以：
- 创建示例网格
- 设置水文参数
- 创建计算任务
- 运行调度器
- 导出计算结果

### 2. 运行完整演示

```bash
python main.py --mode demo
```

自动执行完整流程：
1. 创建示例网格（100m×50m，20×10 四边形单元）
2. 设置水文参数和边界条件
3. 创建计算任务
4. 执行有限元计算
5. 导出 VTK 和 CSV 结果

### 3. 后台调度模式

```bash
# 线程级并行（默认）
python main.py --mode scheduler

# 进程级并行（多核CPU）
python main.py --mode scheduler --parallel
```

### 4. 查看系统状态

```bash
python main.py --mode status
```

## 使用示例

### Python API 调用

```python
from mesh_generator import MeshGenerator
from parameter_import import ParameterImporter
from task_scheduler import scheduler
from result_exporter import export_task_result

# 1. 创建网格
mg = MeshGenerator()
mg.generate_rectangular_grid(100.0, 50.0, 20, 10, element_type='quadrilateral')
mg.identify_boundaries(20, 10)
_, grid_id = mg.save_mesh('my_grid.json', 'My Grid')

# 2. 导入参数
pi = ParameterImporter()
param_file = 'data/parameters/my_params.json'
pi.generate_sample_parameters(grid_id, param_file)
pi.import_from_json(param_file, grid_id=grid_id)

# 3. 创建任务
task_id = scheduler.create_task(
    name='Flow Simulation',
    grid_id=grid_id,
    priority=1,
    solver_config={'solver_type': 'direct'}
)

# 4. 运行任务
scheduler.start()
scheduler.wait_for_task(task_id)
scheduler.stop()

# 5. 导出结果
export_task_result(task_id, 'vtk')
export_task_result(task_id, 'csv')
```

### 批量导入水文参数

```python
from parameter_import import ParameterImporter

pi = ParameterImporter()

# 批量导入目录下所有参数文件
results = pi.batch_import_parameters('data/field_parameters/', grid_id=1)

for filename, params in results.items():
    print(f"{filename}: {len(params)} parameters")
```

### 多任务并行计算

```python
from task_scheduler import ProcessTaskScheduler

# 创建多个任务
task_ids = [1, 2, 3, 4, 5]

# 进程级并行执行
ps = ProcessTaskScheduler(max_workers=4)
results = ps.run_tasks_parallel(task_ids)

for task_id, success in results.items():
    print(f"Task {task_id}: {'Success' if success else 'Failed'}")
```

## 数学原理

### 控制方程

地下水稳定渗流控制方程：

```
∂/∂x (K_x ∂h/∂x) + ∂/∂y (K_y ∂h/∂y) + Q = 0
```

其中：
- h 为水头
- K_x, K_y 为渗透系数张量
- Q 为源汇项

### 有限元离散

采用 Galerkin 加权余量法离散，得到线性方程组：

```
K * h = F
```

其中：
- K 为刚度矩阵（传导矩阵）
- h 为节点水头向量
- F 为载荷向量

### 边界条件

- **Dirichlet 边界**（第一类边界）：h = h₀
- **Neumann 边界**（第二类边界）：K ∂h/∂n = q
- **Cauchy 边界**（第三类边界）：K ∂h/∂n + α h = β

## 文件结构

```
.
├── config.py              # 系统配置
├── database.py            # 数据库模型
├── mesh_generator.py      # 网格生成模块
├── parameter_import.py    # 参数导入模块
├── fem_solver.py          # 有限元求解器
├── task_scheduler.py      # 任务调度模块
├── result_exporter.py     # 结果导出模块
├── main.py                # 主程序入口
├── utils.py               # 工具函数
├── requirements.txt       # 依赖包
├── README.md              # 说明文档
├── data/
│   └── parameters/        # 参数文件目录
├── output/
│   ├── grids/             # 网格文件输出
│   └── results/           # 计算结果输出
└── groundwater.db         # SQLite 数据库（自动生成）
```

## 性能优化

### PyPy 运行

本系统完全兼容 PyPy，使用 PyPy 运行可获得 2-5 倍的性能提升：

```bash
pypy3 main.py --mode demo
```

### 并行计算

- **线程级并行**：适合 IO 密集型任务，内存共享
- **进程级并行**：适合计算密集型任务，多核加速

### 稀疏矩阵

采用 scipy.sparse 存储稀疏矩阵，大幅减少内存占用：
- lil_matrix：用于矩阵构建
- csr_matrix：用于矩阵求解

## 数据格式

### 参数文件格式 (JSON)

```json
{
  "parameters": [
    {
      "parameter_name": "hydraulic_conductivity",
      "parameter_value": 1e-5,
      "unit": "m/s",
      "stratum_id": 1,
      "grid_id": 1
    }
  ],
  "boundary_conditions": [
    {
      "boundary_type": "dirichlet",
      "node_indices": [0, 1, 2, 3],
      "values": [10.0, 10.0, 10.0, 10.0],
      "description": "左边界"
    }
  ]
}
```

### 网格文件格式 (JSON)

```json
{
  "name": "Sample Grid",
  "num_nodes": 231,
  "num_elements": 200,
  "element_type": "quadrilateral",
  "nodes": [
    {"id": 0, "x": 0.0, "y": 0.0, "z": 0.0}
  ],
  "elements": [
    {"id": 0, "nodes": [0, 1, 12, 11], "element_type": "quadrilateral"}
  ]
}
```

## 可视化

导出的 VTK 文件可使用 ParaView 进行可视化：
1. 打开 ParaView
2. File -> Open -> 选择 .vtk 文件
3. Apply
4. 使用 Contour 过滤器绘制等水头线
5. 使用 Glyph 过滤器绘制流速矢量

## 故障排查

### 求解器不收敛

1. 检查边界条件是否正确
2. 增加最大迭代次数：`solver_config={'max_iterations': 50000}`
3. 降低收敛容差：`solver_config={'tolerance': 1e-6}`
4. 切换求解器类型：`solver_config={'solver_type': 'direct'}`

### 内存不足

1. 减小网格密度
2. 使用三角形单元（更少的节点）
3. 关闭调试日志

### 并行计算失败

1. 检查数据库文件权限
2. 确保所有输入文件可访问
3. 查看日志输出定位问题

## License

MIT License
