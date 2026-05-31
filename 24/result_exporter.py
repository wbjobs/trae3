import json
import csv
import os
import numpy as np
from typing import Dict, List, Optional
from dataclasses import dataclass

from config import RESULT_OUTPUT_DIR, EXPORT_FORMATS
from database import db
from mesh_generator import MeshGenerator


@dataclass
class ResultData:
    task_id: int
    grid_id: int
    head: np.ndarray
    velocity_x: np.ndarray
    velocity_y: np.ndarray
    Darcy_flux_x: np.ndarray
    Darcy_flux_y: np.ndarray
    hydraulic_gradient: np.ndarray
    statistics: Dict
    nodes: List
    elements: List


class ResultExporter:
    def __init__(self, task_id: int):
        self.task_id = task_id
        self.result_data = None
        self._load_result()

    def _load_result(self):
        task = db.get_task(self.task_id)
        if not task or not task['result_path'] or not os.path.exists(task['result_path']):
            raise ValueError(f"Result for task {self.task_id} not found")

        with open(task['result_path'], 'r', encoding='utf-8') as f:
            result_data = json.load(f)

        grid_id = result_data['grid_id']
        grid_info = db.get_grid(grid_id)

        mesh_gen = MeshGenerator()
        nodes, elements, _ = mesh_gen.load_mesh(grid_info['grid_data_path'])

        self.result_data = ResultData(
            task_id=result_data['task_id'],
            grid_id=result_data['grid_id'],
            head=np.array(result_data['head_values']),
            velocity_x=np.array(result_data['velocity_x']),
            velocity_y=np.array(result_data['velocity_y']),
            Darcy_flux_x=np.array(result_data['Darcy_flux_x']),
            Darcy_flux_y=np.array(result_data['Darcy_flux_y']),
            hydraulic_gradient=np.array(result_data['hydraulic_gradient']),
            statistics=result_data['statistics'],
            nodes=nodes,
            elements=elements
        )

    def export_vtk(self, output_path: str) -> str:
        rd = self.result_data
        num_nodes = len(rd.nodes)
        num_elements = len(rd.elements)

        with open(output_path, 'w', encoding='utf-8') as f:
            f.write('# vtk DataFile Version 3.0\n')
            f.write(f'Groundwater FEM Result - Task {rd.task_id}\n')
            f.write('ASCII\n')
            f.write('DATASET UNSTRUCTURED_GRID\n\n')

            f.write(f'POINTS {num_nodes} float\n')
            for node in rd.nodes:
                f.write(f'{node.x} {node.y} {node.z}\n')
            f.write('\n')

            total_cells = sum(len(e.nodes) + 1 for e in rd.elements)
            f.write(f'CELLS {num_elements} {total_cells}\n')
            for elem in rd.elements:
                f.write(f'{len(elem.nodes)} {" ".join(str(n) for n in elem.nodes)}\n')
            f.write('\n')

            f.write(f'CELL_TYPES {num_elements}\n')
            for elem in rd.elements:
                if elem.element_type == 'triangle':
                    f.write('5\n')
                elif elem.element_type == 'quadrilateral':
                    f.write('9\n')
                else:
                    f.write('7\n')
            f.write('\n')

            f.write(f'POINT_DATA {num_nodes}\n')

            f.write('SCALARS Head float 1\n')
            f.write('LOOKUP_TABLE default\n')
            for val in rd.head:
                f.write(f'{val}\n')
            f.write('\n')

            f.write('SCALARS Hydraulic_Gradient float 1\n')
            f.write('LOOKUP_TABLE default\n')
            for val in rd.hydraulic_gradient:
                f.write(f'{val}\n')
            f.write('\n')

            f.write('VECTORS Velocity float\n')
            for vx, vy in zip(rd.velocity_x, rd.velocity_y):
                f.write(f'{vx} {vy} 0.0\n')
            f.write('\n')

            f.write('VECTORS Darcy_Flux float\n')
            for fx, fy in zip(rd.Darcy_flux_x, rd.Darcy_flux_y):
                f.write(f'{fx} {fy} 0.0\n')
            f.write('\n')

        return output_path

    def export_csv(self, output_path: str) -> str:
        rd = self.result_data

        with open(output_path, 'w', encoding='utf-8', newline='') as f:
            writer = csv.writer(f)
            writer.writerow([
                'Node_ID', 'X', 'Y', 'Z', 'Head', 'Velocity_X', 'Velocity_Y',
                'Darcy_Flux_X', 'Darcy_Flux_Y', 'Hydraulic_Gradient'
            ])

            for i, node in enumerate(rd.nodes):
                writer.writerow([
                    i, node.x, node.y, node.z,
                    rd.head[i],
                    rd.velocity_x[i], rd.velocity_y[i],
                    rd.Darcy_flux_x[i], rd.Darcy_flux_y[i],
                    rd.hydraulic_gradient[i]
                ])

        stats_path = output_path.replace('.csv', '_statistics.csv')
        with open(stats_path, 'w', encoding='utf-8', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['Statistic', 'Value'])
            for key, value in rd.statistics.items():
                writer.writerow([key, value])

        return output_path

    def export_tecplot(self, output_path: str) -> str:
        rd = self.result_data
        num_nodes = len(rd.nodes)
        num_elements = len(rd.elements)

        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(f'TITLE = "Groundwater FEM Result - Task {rd.task_id}"\n')
            f.write('VARIABLES = "X", "Y", "Head", "Velocity_X", "Velocity_Y", "Darcy_Flux_X", "Darcy_Flux_Y", "Hydraulic_Gradient"\n')

            if rd.elements and rd.elements[0].element_type == 'triangle':
                elem_type = 'FETRIANGLE'
                nodes_per_elem = 3
            else:
                elem_type = 'FEQUADRILATERAL'
                nodes_per_elem = 4

            f.write(f'ZONE T="Zone 1", N={num_nodes}, E={num_elements}, DATAPACKING=POINT, ZONETYPE={elem_type}\n')

            for i, node in enumerate(rd.nodes):
                f.write(f'{node.x} {node.y} {rd.head[i]} {rd.velocity_x[i]} {rd.velocity_y[i]} '
                        f'{rd.Darcy_flux_x[i]} {rd.Darcy_flux_y[i]} {rd.hydraulic_gradient[i]}\n')

            for elem in rd.elements:
                f.write(f'{" ".join(str(n + 1) for n in elem.nodes)}\n')

        return output_path

    def export_mat(self, output_path: str) -> str:
        try:
            import scipy.io as sio
        except ImportError:
            raise ImportError("scipy is required for MAT file export")

        rd = self.result_data

        coords = np.array([[n.x, n.y, n.z] for n in rd.nodes])
        connectivity = np.array([e.nodes for e in rd.elements])

        data = {
            'task_id': rd.task_id,
            'grid_id': rd.grid_id,
            'coordinates': coords,
            'connectivity': connectivity,
            'head': rd.head,
            'velocity_x': rd.velocity_x,
            'velocity_y': rd.velocity_y,
            'Darcy_flux_x': rd.Darcy_flux_x,
            'Darcy_flux_y': rd.Darcy_flux_y,
            'hydraulic_gradient': rd.hydraulic_gradient,
            'statistics': rd.statistics
        }

        sio.savemat(output_path, data)
        return output_path

    def export(self, export_format: str, output_dir: str = None) -> str:
        export_format = export_format.lower()
        if export_format not in EXPORT_FORMATS:
            raise ValueError(f"Unsupported format: {export_format}. Supported formats: {EXPORT_FORMATS}")

        if output_dir is None:
            output_dir = RESULT_OUTPUT_DIR
        os.makedirs(output_dir, exist_ok=True)

        filename = f'task_{self.task_id}_result.{export_format}'
        output_path = os.path.join(output_dir, filename)

        if export_format == 'vtk':
            return self.export_vtk(output_path)
        elif export_format == 'csv':
            return self.export_csv(output_path)
        elif export_format == 'tecplot':
            return self.export_tecplot(output_path)
        elif export_format == 'mat':
            return self.export_mat(output_path)

        return output_path

    def export_all_formats(self, output_dir: str = None) -> List[str]:
        exported_files = []
        for fmt in EXPORT_FORMATS:
            try:
                path = self.export(fmt, output_dir)
                exported_files.append(path)
            except Exception as e:
                print(f"Warning: Failed to export {fmt}: {e}")
        return exported_files

    def get_statistics(self) -> Dict:
        return self.result_data.statistics if self.result_data else {}

    def get_head_contours(self, levels: int = 10) -> Dict:
        if self.result_data is None:
            return {}

        head = self.result_data.head
        min_h = np.min(head)
        max_h = np.max(head)
        contour_levels = np.linspace(min_h, max_h, levels)

        return {
            'min_head': float(min_h),
            'max_head': float(max_h),
            'levels': contour_levels.tolist()
        }


def export_task_result(task_id: int, export_format: str = 'vtk', output_dir: str = None) -> str:
    exporter = ResultExporter(task_id)
    return exporter.export(export_format, output_dir)


def export_task_all_formats(task_id: int, output_dir: str = None) -> List[str]:
    exporter = ResultExporter(task_id)
    return exporter.export_all_formats(output_dir)
