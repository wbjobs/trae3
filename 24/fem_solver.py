import numpy as np
import json
import os
from typing import List, Dict, Tuple, Optional, Callable
from scipy.sparse import lil_matrix, csr_matrix
from scipy.sparse.linalg import spsolve, cg, spilu
from dataclasses import dataclass

from config import DEFAULT_SOLVER_CONFIG, RESULT_OUTPUT_DIR
from database import db
from mesh_generator import Node, Element


@dataclass
class FEMResult:
    head: np.ndarray
    velocity_x: np.ndarray
    velocity_y: np.ndarray
    Darcy_flux_x: np.ndarray
    Darcy_flux_y: np.ndarray
    hydraulic_gradient: np.ndarray
    statistics: Dict


class GroundwaterFEMSolver:
    def __init__(self, nodes: List[Node], elements: List[Element]):
        self.nodes = nodes
        self.elements = elements
        self.num_nodes = len(nodes)
        self.num_elements = len(elements)

        self.K = None
        self.F = None
        self.h = None

        self.dirichlet_bc = {}
        self.neumann_bc = []
        self.cauchy_bc = []

        self.hydraulic_conductivity = 1e-5
        self.porosity = 0.3
        self.specific_storage = 1e-6
        self.solver_config = DEFAULT_SOLVER_CONFIG.copy()

    def set_hydraulic_parameters(self, hydraulic_conductivity: float = None,
                                 porosity: float = None, specific_storage: float = None):
        if hydraulic_conductivity is not None:
            self.hydraulic_conductivity = hydraulic_conductivity
        if porosity is not None:
            self.porosity = porosity
        if specific_storage is not None:
            self.specific_storage = specific_storage

    def set_solver_config(self, config: Dict):
        self.solver_config.update(config)

    def add_dirichlet_bc(self, node_indices: List[int], values: List[float]):
        for idx, val in zip(node_indices, values):
            self.dirichlet_bc[idx] = val

    def add_neumann_bc(self, node_indices: List[int], values: List[float]):
        for idx, val in zip(node_indices, values):
            self.neumann_bc.append((idx, val))

    def add_cauchy_bc(self, node_indices: List[int], alpha: List[float], beta: List[float]):
        for idx, a, b in zip(node_indices, alpha, beta):
            self.cauchy_bc.append((idx, a, b))

    def _shape_function_triangle(self, xi: float, eta: float) -> Tuple[np.ndarray, np.ndarray]:
        N = np.array([1 - xi - eta, xi, eta])
        dN_dxi = np.array([-1, 1, 0])
        dN_deta = np.array([-1, 0, 1])
        return N, np.vstack((dN_dxi, dN_deta))

    def _shape_function_quadrilateral(self, xi: float, eta: float) -> Tuple[np.ndarray, np.ndarray]:
        N = np.array([
            (1 - xi) * (1 - eta) / 4,
            (1 + xi) * (1 - eta) / 4,
            (1 + xi) * (1 + eta) / 4,
            (1 - xi) * (1 + eta) / 4
        ])
        dN_dxi = np.array([
            -(1 - eta) / 4,
            (1 - eta) / 4,
            (1 + eta) / 4,
            -(1 + eta) / 4
        ])
        dN_deta = np.array([
            -(1 - xi) / 4,
            -(1 + xi) / 4,
            (1 + xi) / 4,
            (1 - xi) / 4
        ])
        return N, np.vstack((dN_dxi, dN_deta))

    def _gauss_quadrature(self, element_type: str) -> Tuple[np.ndarray, np.ndarray]:
        if element_type == 'triangle':
            gauss_points = np.array([
                [1 / 3, 1 / 3],
                [1 / 6, 1 / 6],
                [2 / 3, 1 / 6],
                [1 / 6, 2 / 3]
            ])
            weights = np.array([-27 / 48, 25 / 48, 25 / 48, 25 / 48])
        else:
            gauss_points = np.array([
                [-1 / np.sqrt(3), -1 / np.sqrt(3)],
                [1 / np.sqrt(3), -1 / np.sqrt(3)],
                [1 / np.sqrt(3), 1 / np.sqrt(3)],
                [-1 / np.sqrt(3), 1 / np.sqrt(3)]
            ])
            weights = np.array([1, 1, 1, 1])
        return gauss_points, weights

    def _compute_jacobian(self, coords: np.ndarray, dN_dxi: np.ndarray) -> Tuple[np.ndarray, float]:
        J = dN_dxi @ coords
        detJ = np.linalg.det(J)
        return J, detJ

    def assemble_stiffness_matrix(self) -> csr_matrix:
        K = lil_matrix((self.num_nodes, self.num_nodes))
        K_bar = lil_matrix((self.num_nodes, self.num_nodes))

        for elem in self.elements:
            elem_nodes = elem.nodes
            coords = np.array([[self.nodes[i].x, self.nodes[i].y] for i in elem_nodes])

            if elem.element_type == 'triangle':
                gauss_points, weights = self._gauss_quadrature('triangle')
                shape_func = self._shape_function_triangle
                n_nodes = 3
            else:
                gauss_points, weights = self._gauss_quadrature('quadrilateral')
                shape_func = self._shape_function_quadrilateral
                n_nodes = 4

            k_elem = np.zeros((n_nodes, n_nodes))

            for gp, w in zip(gauss_points, weights):
                N, dN_dxi = shape_func(gp[0], gp[1])
                J, detJ = self._compute_jacobian(coords, dN_dxi)
                invJ = np.linalg.inv(J)
                dN_dx = invJ @ dN_dxi

                B = dN_dx.T
                D = self.hydraulic_conductivity * np.eye(2)

                k_elem += w * detJ * (B @ D @ B.T)

            for i in range(n_nodes):
                for j in range(n_nodes):
                    K[elem_nodes[i], elem_nodes[j]] += k_elem[i, j]
                    K_bar[elem_nodes[i], elem_nodes[j]] += k_elem[i, j]

        for idx, alpha, beta in self.cauchy_bc:
            K[idx, idx] += alpha
            K_bar[idx, idx] += alpha

        self.K = K.tocsr()
        self.K_bar = K_bar.tocsr()
        return self.K

    def assemble_force_vector(self) -> np.ndarray:
        F = np.zeros(self.num_nodes)

        for idx, val in self.neumann_bc:
            F[idx] += val

        for idx, alpha, beta in self.cauchy_bc:
            F[idx] += beta

        self.F = F
        return self.F

    def apply_dirichlet_bc(self):
        if self.K is None or self.F is None:
            raise ValueError("Stiffness matrix and force vector must be assembled first")

        K_mod = self.K.tolil()
        F_mod = self.F.copy()

        for idx, val in self.dirichlet_bc.items():
            for j in range(self.num_nodes):
                if j != idx:
                    F_mod[j] -= K_mod[j, idx] * val
                    K_mod[j, idx] = 0
                    K_mod[idx, j] = 0
            K_mod[idx, idx] = 1
            F_mod[idx] = val

        self.K = K_mod.tocsr()
        self.F = F_mod

    def solve(self) -> np.ndarray:
        if self.K is None:
            self.assemble_stiffness_matrix()
        if self.F is None:
            self.assemble_force_vector()

        self.apply_dirichlet_bc()

        solver_type = self.solver_config.get('solver_type', 'direct')
        max_iter = self.solver_config.get('max_iterations', 10000)
        tol = self.solver_config.get('tolerance', 1e-8)

        if solver_type == 'direct':
            self.h = spsolve(self.K, self.F)
        elif solver_type == 'cg':
            M = None
            if self.solver_config.get('preconditioner') == 'ilu':
                ilu_prec = spilu(self.K.tocsc())
                M = ilu_prec.solve
            self.h, info = cg(self.K, self.F, tol=tol, maxiter=max_iter, M=M)
        else:
            self.h = spsolve(self.K, self.F)

        return self.h

    def compute_postprocessing(self) -> FEMResult:
        if self.h is None:
            raise ValueError("Must solve the system first")

        Darcy_flux_x = np.zeros(self.num_nodes)
        Darcy_flux_y = np.zeros(self.num_nodes)
        grad_h_x = np.zeros(self.num_nodes)
        grad_h_y = np.zeros(self.num_nodes)
        node_count = np.zeros(self.num_nodes)

        for elem in self.elements:
            elem_nodes = elem.nodes
            coords = np.array([[self.nodes[i].x, self.nodes[i].y] for i in elem_nodes])
            h_elem = self.h[elem_nodes]

            if elem.element_type == 'triangle':
                gauss_points, weights = self._gauss_quadrature('triangle')
                shape_func = self._shape_function_triangle
                n_nodes = 3
            else:
                gauss_points, weights = self._gauss_quadrature('quadrilateral')
                shape_func = self._shape_function_quadrilateral
                n_nodes = 4

            for gp, w in zip(gauss_points, weights):
                N, dN_dxi = shape_func(gp[0], gp[1])
                J, detJ = self._compute_jacobian(coords, dN_dxi)
                if detJ <= 0:
                    continue
                invJ = np.linalg.inv(J)
                dN_dx = invJ @ dN_dxi

                grad_h = dN_dx @ h_elem
                qx = -self.hydraulic_conductivity * grad_h[0]
                qy = -self.hydraulic_conductivity * grad_h[1]

                for i, node_idx in enumerate(elem_nodes):
                    Darcy_flux_x[node_idx] += qx * N[i] * w * detJ
                    Darcy_flux_y[node_idx] += qy * N[i] * w * detJ
                    grad_h_x[node_idx] += grad_h[0] * N[i] * w * detJ
                    grad_h_y[node_idx] += grad_h[1] * N[i] * w * detJ
                    node_count[node_idx] += N[i] * w * detJ

        node_count = np.maximum(node_count, 1e-10)
        Darcy_flux_x /= node_count
        Darcy_flux_y /= node_count
        grad_h_x /= node_count
        grad_h_y /= node_count

        velocity_x = Darcy_flux_x / self.porosity
        velocity_y = Darcy_flux_y / self.porosity

        hydraulic_gradient = np.sqrt(grad_h_x ** 2 + grad_h_y ** 2)

        statistics = {
            'head_min': float(np.min(self.h)),
            'head_max': float(np.max(self.h)),
            'head_mean': float(np.mean(self.h)),
            'head_std': float(np.std(self.h)),
            'velocity_max': float(np.max(np.sqrt(velocity_x ** 2 + velocity_y ** 2))),
            'velocity_mean': float(np.mean(np.sqrt(velocity_x ** 2 + velocity_y ** 2))),
            'flux_max': float(np.max(np.sqrt(Darcy_flux_x ** 2 + Darcy_flux_y ** 2))),
            'flux_mean': float(np.mean(np.sqrt(Darcy_flux_x ** 2 + Darcy_flux_y ** 2))),
            'gradient_max': float(np.max(hydraulic_gradient)),
            'gradient_mean': float(np.mean(hydraulic_gradient)),
            'mass_balance_error': float(self._compute_mass_balance())
        }

        return FEMResult(
            head=self.h,
            velocity_x=velocity_x,
            velocity_y=velocity_y,
            Darcy_flux_x=Darcy_flux_x,
            Darcy_flux_y=Darcy_flux_y,
            hydraulic_gradient=hydraulic_gradient,
            statistics=statistics
        )

    def _compute_mass_balance(self) -> float:
        total_inflow = 0.0
        total_outflow = 0.0

        for idx, val in self.dirichlet_bc.items():
            if idx < len(self.nodes):
                pass

        for idx, val in self.neumann_bc:
            if val > 0:
                total_inflow += val
            else:
                total_outflow += abs(val)

        total_flux = total_inflow - total_outflow
        if abs(total_inflow + total_outflow) > 1e-10:
            return abs(total_flux) / (abs(total_inflow) + abs(total_outflow)) * 100
        return 0.0

    def save_result(self, task_id: int, grid_id: int, result: FEMResult, filename: str, db_conn=None) -> str:
        filepath = os.path.join(RESULT_OUTPUT_DIR, filename)

        result_data = {
            'task_id': task_id,
            'grid_id': grid_id,
            'head_values': result.head.tolist(),
            'velocity_x': result.velocity_x.tolist(),
            'velocity_y': result.velocity_y.tolist(),
            'Darcy_flux_x': result.Darcy_flux_x.tolist(),
            'Darcy_flux_y': result.Darcy_flux_y.tolist(),
            'hydraulic_gradient': result.hydraulic_gradient.tolist(),
            'statistics': result.statistics
        }

        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(result_data, f, indent=2)

        target_db = db_conn if db_conn is not None else db

        target_db.insert_result(
            task_id=task_id,
            grid_id=grid_id,
            head_values=result.head.tolist(),
            velocity_x=result.velocity_x.tolist(),
            velocity_y=result.velocity_y.tolist(),
            Darcy_flux_x=result.Darcy_flux_x.tolist(),
            Darcy_flux_y=result.Darcy_flux_y.tolist(),
            hydraulic_gradient=result.hydraulic_gradient.tolist(),
            statistics=result.statistics
        )

        target_db.update_task_status(task_id, 'completed', progress=100, result_path=filepath)

        return filepath


def solve_task(task_id: int, grid_id: int, nodes: List[Node], elements: List[Element],
               boundary_conditions: List[Dict], hydro_params: Dict,
               solver_config: Dict, db_conn=None) -> str:
    solver = GroundwaterFEMSolver(nodes, elements)

    solver.set_hydraulic_parameters(
        hydraulic_conductivity=hydro_params.get('hydraulic_conductivity', 1e-5),
        porosity=hydro_params.get('porosity', 0.3),
        specific_storage=hydro_params.get('specific_storage', 1e-6)
    )
    solver.set_solver_config(solver_config)

    target_db = db_conn if db_conn is not None else db

    for bc in boundary_conditions:
        bc_type = bc['boundary_type'].lower()
        node_indices = json.loads(bc['node_indices']) if isinstance(bc['node_indices'], str) else bc['node_indices']
        values = json.loads(bc['values']) if isinstance(bc['values'], str) else bc['values']

        if bc_type == 'dirichlet':
            solver.add_dirichlet_bc(node_indices, values)
        elif bc_type == 'neumann':
            solver.add_neumann_bc(node_indices, values)

    solver.assemble_stiffness_matrix()
    target_db.update_task_status(task_id, 'running', progress=30)

    solver.assemble_force_vector()
    target_db.update_task_status(task_id, 'running', progress=40)

    solver.solve()
    target_db.update_task_status(task_id, 'running', progress=70)

    result = solver.compute_postprocessing()
    target_db.update_task_status(task_id, 'running', progress=90)

    filename = f"result_task_{task_id}.json"
    filepath = solver.save_result(task_id, grid_id, result, filename, db_conn=target_db)

    return filepath
