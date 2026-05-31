from dataclasses import dataclass, field, asdict
from typing import Optional
import json


@dataclass
class GridConfig:
    nx: int = 200
    ny: int = 100
    x_length: float = 1.0
    y_length: float = 0.05
    stretching_factor: float = 1.15


@dataclass
class FlowConfig:
    u_inf: float = 1.0
    rho: float = 1.225
    mu: float = 1.789e-5
    nu: float = field(init=False)

    def __post_init__(self):
        object.__setattr__(self, 'nu', self.mu / self.rho)


@dataclass
class SolverConfig:
    max_iterations: int = 50000
    convergence_tolerance: float = 1e-6
    relaxation_factor: float = 1.2
    scheme: str = "crank_nicolson"


@dataclass
class ParallelConfig:
    num_workers: int = 4
    chunk_size: int = 50


@dataclass
class SimulationConfig:
    task_name: str = "default_boundary_layer"
    grid: GridConfig = field(default_factory=GridConfig)
    flow: FlowConfig = field(default_factory=FlowConfig)
    solver: SolverConfig = field(default_factory=SolverConfig)
    parallel: ParallelConfig = field(default_factory=ParallelConfig)

    def to_dict(self) -> dict:
        return asdict(self)

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), indent=2, ensure_ascii=False)

    @classmethod
    def from_dict(cls, d: dict) -> "SimulationConfig":
        flow_d = d.get("flow", {})
        flow_d.pop("nu", None)
        return cls(
            task_name=d.get("task_name", "default_boundary_layer"),
            grid=GridConfig(**d.get("grid", {})),
            flow=FlowConfig(**flow_d),
            solver=SolverConfig(**d.get("solver", {})),
            parallel=ParallelConfig(**d.get("parallel", {})),
        )

    @classmethod
    def from_json(cls, json_str: str) -> "SimulationConfig":
        return cls.from_dict(json.loads(json_str))

    @classmethod
    def load(cls, path: str) -> "SimulationConfig":
        with open(path, "r", encoding="utf-8") as f:
            return cls.from_dict(json.load(f))

    def save(self, path: str):
        with open(path, "w", encoding="utf-8") as f:
            json.dump(self.to_dict(), f, indent=2, ensure_ascii=False)


PRESETS = {
    "laminar_flat_plate": SimulationConfig(
        task_name="laminar_flat_plate",
        grid=GridConfig(nx=200, ny=100, x_length=1.0, y_length=0.05, stretching_factor=1.15),
        flow=FlowConfig(u_inf=1.0, rho=1.225, mu=1.789e-5),
        solver=SolverConfig(max_iterations=50000, convergence_tolerance=1e-6, relaxation_factor=1.2, scheme="crank_nicolson"),
        parallel=ParallelConfig(num_workers=4, chunk_size=50),
    ),
    "turbulent_flat_plate": SimulationConfig(
        task_name="turbulent_flat_plate",
        grid=GridConfig(nx=300, ny=150, x_length=2.0, y_length=0.1, stretching_factor=1.2),
        flow=FlowConfig(u_inf=10.0, rho=1.225, mu=1.789e-5),
        solver=SolverConfig(max_iterations=80000, convergence_tolerance=1e-7, relaxation_factor=1.0, scheme="crank_nicolson"),
        parallel=ParallelConfig(num_workers=4, chunk_size=40),
    ),
    "high_reynolds": SimulationConfig(
        task_name="high_reynolds",
        grid=GridConfig(nx=400, ny=200, x_length=5.0, y_length=0.2, stretching_factor=1.25),
        flow=FlowConfig(u_inf=50.0, rho=1.225, mu=1.789e-5),
        solver=SolverConfig(max_iterations=100000, convergence_tolerance=1e-8, relaxation_factor=0.8, scheme="crank_nicolson"),
        parallel=ParallelConfig(num_workers=8, chunk_size=30),
    ),
}


def get_preset(name: str) -> SimulationConfig:
    if name not in PRESETS:
        raise ValueError(f"Unknown preset '{name}'. Available: {list(PRESETS.keys())}")
    return PRESETS[name]
