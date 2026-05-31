import math
import logging
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional, Tuple

logger = logging.getLogger(__name__)


class ConvergenceMonitor:
    def __init__(self, window_size: int = 10, threshold: float = 1e-6):
        self.window_size = window_size
        self.threshold = threshold
        self.history: List[float] = []

    def update(self, value: float) -> Tuple[bool, float]:
        self.history.append(value)
        if len(self.history) > self.window_size:
            self.history.pop(0)

        if len(self.history) < self.window_size:
            return False, float("inf")

        window = self.history[-self.window_size:]
        mean = sum(window) / len(window)
        variance = sum((x - mean) ** 2 for x in window) / len(window)
        std_dev = math.sqrt(variance)
        coefficient_of_variation = abs(std_dev / mean) if abs(mean) > 1e-12 else 0.0

        converged = coefficient_of_variation < self.threshold
        return converged, coefficient_of_variation

    def reset(self):
        self.history.clear()


class AdaptiveTimeStepper:
    def __init__(
        self,
        initial_dt: float,
        min_dt: float = 1.0,
        max_dt: float = 86400.0,
        increase_factor: float = 1.2,
        decrease_factor: float = 0.5,
        change_threshold: float = 0.1,
    ):
        self.current_dt = initial_dt
        self.min_dt = min_dt
        self.max_dt = max_dt
        self.increase_factor = increase_factor
        self.decrease_factor = decrease_factor
        self.change_threshold = change_threshold
        self.last_values: List[float] = []

    def adjust(self, current_value: float, previous_value: float) -> float:
        if abs(previous_value) < 1e-12:
            relative_change = 0.0
        else:
            relative_change = abs((current_value - previous_value) / previous_value)

        if relative_change > self.change_threshold * 2:
            self.current_dt = max(self.min_dt, self.current_dt * self.decrease_factor)
        elif relative_change > self.change_threshold:
            self.current_dt = max(self.min_dt, self.current_dt * 0.8)
        elif relative_change < self.change_threshold * 0.1:
            self.current_dt = min(self.max_dt, self.current_dt * self.increase_factor)

        return self.current_dt


class SedimentModelBase(ABC):
    def __init__(self, name: str, params: dict):
        self.name = name
        self.params = params
        self._convergence_monitor: Optional[ConvergenceMonitor] = None
        self._time_stepper: Optional[AdaptiveTimeStepper] = None
        self._enable_adaptive_dt = params.get("enable_adaptive_dt", False)
        self._enable_convergence_check = params.get("enable_convergence_check", False)
        self._max_substeps = params.get("max_substeps", 10)
        self._validate_params()

    @abstractmethod
    def _validate_params(self):
        pass

    @abstractmethod
    def compute_transport_rate(self, hydraulic: dict) -> float:
        pass

    @abstractmethod
    def compute_concentration(self, hydraulic: dict) -> float:
        pass

    def evolve(
        self,
        initial_state: dict,
        time_steps: int,
        enable_snapshot: bool = False,
        snapshot_interval: int = 10,
    ) -> Dict[str, Any]:
        base_dt = self._resolve(self.params, "time_step", 3600)
        dx = self._resolve(self.params, "reach_length", 1000.0)
        width = self._resolve(initial_state, "width", 100.0)
        max_bed_change_per_step = self._resolve(self.params, "max_bed_change_per_step", 0.5)

        results = []
        snapshots = []
        state = dict(initial_state)

        if self._enable_convergence_check:
            self._convergence_monitor = ConvergenceMonitor(
                window_size=self._resolve(self.params, "convergence_window", 10),
                threshold=self._resolve(self.params, "convergence_threshold", 1e-6),
            )

        if self._enable_adaptive_dt:
            self._time_stepper = AdaptiveTimeStepper(
                initial_dt=base_dt,
                min_dt=self._resolve(self.params, "min_dt", 1.0),
                max_dt=self._resolve(self.params, "max_dt", 86400.0),
            )

        simulation_time = 0.0
        current_dt = base_dt
        prev_concentration = initial_state.get("concentration", 10.0)
        step_counter = 0

        for step in range(time_steps):
            if self._enable_adaptive_dt and step > 0:
                current_conc = state.get("concentration", prev_concentration)
                current_dt = self._time_stepper.adjust(current_conc, prev_concentration)
                prev_concentration = current_conc

            substep_results = self._compute_substep(
                state, width, dx, current_dt, max_bed_change_per_step
            )

            if substep_results is None:
                logger.error(f"Step {step}: computation failed, aborting")
                break

            q_s, c, bed_change, new_depth, converged, cv = substep_results

            simulation_time += current_dt
            step_counter += 1

            state["depth"] = new_depth
            state["bed_elevation"] = state.get("bed_elevation", 0.0) + bed_change
            state["concentration"] = c
            state["transport_rate"] = q_s

            results.append({
                "step": step_counter,
                "time": simulation_time,
                "dt": current_dt,
                "depth": round(new_depth, 6),
                "concentration": round(c, 6),
                "transport_rate": round(q_s, 8),
                "bed_elevation": round(state["bed_elevation"], 6),
                "bed_change": round(bed_change, 8),
                "converged": converged,
                "cv": round(cv, 8),
            })

            if enable_snapshot and step % snapshot_interval == 0:
                snapshots.append({
                    "step": step_counter,
                    "time": simulation_time,
                    "state": dict(state),
                    "hydraulic": {
                        "velocity": state.get("velocity", 1.0),
                        "slope": state.get("slope", 0.001),
                        "depth": new_depth,
                    },
                })

            if self._enable_convergence_check and converged:
                logger.info(f"Convergence reached at step {step}, cv={cv}")
                if self._resolve(self.params, "stop_on_convergence", False):
                    break

        final_stats = self._compute_evolution_statistics(results)

        return {
            "time_series": results,
            "snapshots": snapshots,
            "statistics": final_stats,
            "converged": self._enable_convergence_check and converged if results else False,
            "total_time": simulation_time,
            "total_steps": step_counter,
        }

    def _compute_substep(
        self, state: dict, width: float, dx: float, dt: float, max_bed_change: float
    ) -> Optional[Tuple[float, float, float, float, bool, float]]:
        hydraulic = {
            "velocity": state.get("velocity", 1.0),
            "slope": state.get("slope", 0.001),
            "depth": state.get("depth", 2.0),
        }
        q_s = self.compute_transport_rate(hydraulic)
        c = self.compute_concentration(hydraulic)

        if not self._is_valid_value(q_s) or not self._is_valid_value(c):
            logger.error(f"Invalid computed values q_s={q_s} c={c}")
            return None

        inflow_sediment = state.get("inflow_sediment", q_s)
        deposition_rate = max(inflow_sediment - q_s, 0.0) * width * dx
        erosion_rate = max(q_s - inflow_sediment, 0.0) * width * dx

        bed_change = (deposition_rate - erosion_rate) / (width * dx * 1600.0) * dt

        if abs(bed_change) > max_bed_change:
            bed_change = math.copysign(max_bed_change, bed_change)

        new_depth = max(state.get("depth", 2.0) - bed_change, 0.01)

        converged = False
        cv = float("inf")
        if self._convergence_monitor:
            converged, cv = self._convergence_monitor.update(c)

        return q_s, c, bed_change, new_depth, converged, cv

    def _compute_evolution_statistics(self, time_series: list) -> dict:
        if not time_series:
            return {}

        concentrations = [ts.get("concentration", 0) for ts in time_series]
        transport_rates = [ts.get("transport_rate", 0) for ts in time_series]
        bed_changes = [ts.get("bed_change", 0) for ts in time_series]
        depths = [ts.get("depth", 0) for ts in time_series]

        def calc_percentile(data, p):
            sorted_data = sorted(data)
            k = (len(sorted_data) - 1) * p / 100
            f = int(k)
            c = min(f + 1, len(sorted_data) - 1)
            if f == c:
                return sorted_data[f]
            return sorted_data[f] + (sorted_data[c] - sorted_data[f]) * (k - f)

        return {
            "total_steps": len(time_series),
            "final_concentration": concentrations[-1],
            "max_concentration": max(concentrations),
            "min_concentration": min(concentrations),
            "avg_concentration": sum(concentrations) / len(concentrations),
            "p25_concentration": calc_percentile(concentrations, 25),
            "p50_concentration": calc_percentile(concentrations, 50),
            "p75_concentration": calc_percentile(concentrations, 75),
            "final_transport_rate": transport_rates[-1],
            "max_transport_rate": max(transport_rates),
            "min_transport_rate": min(transport_rates),
            "avg_transport_rate": sum(transport_rates) / len(transport_rates),
            "total_bed_change": sum(bed_changes),
            "max_bed_change": max(abs(bc) for bc in bed_changes),
            "net_bed_change": bed_changes[-1],
            "final_depth": depths[-1],
            "max_depth": max(depths),
            "min_depth": min(depths),
            "avg_depth": sum(depths) / len(depths),
            "convergence_achieved": any(ts.get("converged", False) for ts in time_series),
        }

    def multi_resolution_evolve(
        self,
        initial_state: dict,
        base_steps: int,
        refinement_levels: int = 3,
    ) -> Dict[str, Any]:
        results_by_level = {}
        for level in range(refinement_levels):
            step_multiplier = 2 ** (refinement_levels - 1 - level)
            actual_steps = base_steps * step_multiplier
            level_params = dict(self.params)
            level_params["time_step"] = self._resolve(self.params, "time_step", 3600) / step_multiplier

            temp_model = self.__class__(level_params)
            result = temp_model.evolve(initial_state, actual_steps)
            results_by_level[f"level_{level}"] = result

        coarse = results_by_level.get(f"level_0", {}).get("time_series", [])
        fine = results_by_level.get(f"level_{refinement_levels - 1}", {}).get("time_series", [])

        error_estimate = 0.0
        if coarse and fine:
            coarse_last = coarse[-1].get("concentration", 0)
            fine_last = fine[-1].get("concentration", 0)
            error_estimate = abs(coarse_last - fine_last) / abs(fine_last) if abs(fine_last) > 1e-12 else 0.0

        return {
            "level_results": results_by_level,
            "grid_convergence_index": error_estimate,
            "best_estimate": results_by_level.get(f"level_{refinement_levels - 1}", {}),
        }

    def _resolve(self, data: dict, key: str, default: float = 0.0) -> float:
        return data.get(key, self.params.get(key, default))

    @staticmethod
    def _is_valid_value(value: float) -> bool:
        import math as _m
        return _m.isfinite(value)


class YangSedimentModel(SedimentModelBase):
    def __init__(self, params: dict):
        super().__init__("yang_sediment", params)

    def _validate_params(self):
        required = ["grain_size", "specific_gravity", "water_temperature"]
        for k in required:
            if k not in self.params and k not in self.params:
                logger.warning(f"Yang model: parameter '{k}' not specified, using defaults")

    def compute_transport_rate(self, hydraulic: dict) -> float:
        v = hydraulic.get("velocity", 1.0)
        s = hydraulic.get("slope", 0.001)
        d = self._resolve(hydraulic, "depth", 2.0)
        d50 = self._resolve(self.params, "grain_size", 0.5e-3)
        sg = self._resolve(self.params, "specific_gravity", 2.65)
        nu = self._resolve(self.params, "kinematic_viscosity", 1e-6)

        u_star = math.sqrt(9.81 * d * s)
        if u_star < 1e-10:
            return 0.0

        w_f = self._fall_velocity(d50, sg, nu)
        if w_f < 1e-10:
            return 0.0

        vs = v * s
        if vs < 1e-10:
            return 0.0

        log_term = max(math.log10(vs / w_f), 0.01)
        concentration = 0.0
        if vs / w_f > 0.01:
            concentration = 40.0 * vs / w_f * log_term - 0.176
            concentration = max(concentration, 0.0)

        q_s = concentration * v * d / 1e6
        return max(q_s, 0.0)

    def compute_concentration(self, hydraulic: dict) -> float:
        q_s = self.compute_transport_rate(hydraulic)
        v = hydraulic.get("velocity", 1.0)
        d = self._resolve(hydraulic, "depth", 2.0)
        if v * d < 1e-10:
            return 0.0
        return q_s / (v * d) * 1e6

    @staticmethod
    def _fall_velocity(d50: float, sg: float, nu: float) -> float:
        g = 9.81
        d_star = ((sg - 1) * g / nu ** 2) ** (1 / 3) * d50
        if d_star < 0.1:
            return (sg - 1) * g * d50 ** 2 / (18 * nu)
        elif d_star < 1000:
            return (1e-2 * d_star ** 2 + 2.5e-2 * d_star) ** 0.5 * nu / d50
        else:
            return math.sqrt((sg - 1) * g * d50 * 1.05)


class EngelundHansenModel(SedimentModelBase):
    def __init__(self, params: dict):
        super().__init__("engelund_hansen", params)

    def _validate_params(self):
        pass

    def compute_transport_rate(self, hydraulic: dict) -> float:
        v = hydraulic.get("velocity", 1.0)
        s = hydraulic.get("slope", 0.001)
        d = hydraulic.get("depth", 2.0)
        d50 = self._resolve(self.params, "grain_size", 0.5e-3)
        sg = self._resolve(self.params, "specific_gravity", 2.65)

        if s < 1e-10 or d < 1e-10:
            return 0.0

        f = 0.1 if self._resolve(self.params, "friction_factor", 0.0) <= 0 else self._resolve(self.params, "friction_factor")
        theta = v ** 2 / ((sg - 1) * 9.81 * d50 * f ** 0.5)
        phi = 0.1 * theta ** 2.5 / f
        q_s = phi * math.sqrt((sg - 1) * 9.81 * d50 ** 3)
        return max(q_s, 0.0)

    def compute_concentration(self, hydraulic: dict) -> float:
        q_s = self.compute_transport_rate(hydraulic)
        v = hydraulic.get("velocity", 1.0)
        d = hydraulic.get("depth", 2.0)
        if v * d < 1e-10:
            return 0.0
        return q_s / (v * d) * 1e6


class RouseModel(SedimentModelBase):
    def __init__(self, params: dict):
        super().__init__("rouse", params)

    def _validate_params(self):
        pass

    def compute_transport_rate(self, hydraulic: dict) -> float:
        v = hydraulic.get("velocity", 1.0)
        d = hydraulic.get("depth", 2.0)
        c = self.compute_concentration(hydraulic)
        return max(c / 1e6 * v * d, 0.0)

    def compute_concentration(self, hydraulic: dict) -> float:
        d = hydraulic.get("depth", 2.0)
        s = hydraulic.get("slope", 0.001)
        d50 = self._resolve(self.params, "grain_size", 0.5e-3)
        sg = self._resolve(self.params, "specific_gravity", 2.65)
        nu = self._resolve(self.params, "kinematic_viscosity", 1e-6)
        kappa = 0.41

        u_star = math.sqrt(9.81 * d * s)
        w_f = YangSedimentModel._fall_velocity(d50, sg, nu)
        z = w_f / (kappa * u_star) if u_star > 1e-10 else 10.0

        if z < 0.01:
            return 5000.0
        elif z > 5.0:
            return 1.0
        else:
            return 1000.0 / z


MODEL_REGISTRY: Dict[str, type] = {
    "yang_sediment": YangSedimentModel,
    "engelund_hansen": EngelundHansenModel,
    "rouse": RouseModel,
}


def create_model(model_name: str, params: dict) -> SedimentModelBase:
    cls = MODEL_REGISTRY.get(model_name)
    if not cls:
        raise ValueError(
            f"Unknown model: {model_name}. Available: {list(MODEL_REGISTRY.keys())}"
        )
    return cls(params)


def list_models() -> List[str]:
    return list(MODEL_REGISTRY.keys())
