import json
import csv
import os
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass, asdict
from config import PARAMETER_DIR
from database import db


@dataclass
class HydroParameter:
    parameter_name: str
    parameter_value: float
    unit: str = ''
    stratum_id: int = 1
    grid_id: Optional[int] = None
    source_file: str = ''


@dataclass
class BoundaryCondition:
    boundary_type: str
    node_indices: List[int]
    values: List[float]
    description: str = ''


class ParameterImporter:
    def __init__(self):
        self.parameters: List[HydroParameter] = []
        self.boundary_conditions: List[BoundaryCondition] = []

    def import_from_csv(self, filepath: str, grid_id: Optional[int] = None) -> List[HydroParameter]:
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"File not found: {filepath}")

        self.parameters = []

        with open(filepath, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                param = HydroParameter(
                    parameter_name=row.get('parameter_name', row.get('name', '')),
                    parameter_value=float(row.get('parameter_value', row.get('value', 0))),
                    unit=row.get('unit', ''),
                    stratum_id=int(row.get('stratum_id', 1)),
                    grid_id=grid_id or (int(row['grid_id']) if 'grid_id' in row else None),
                    source_file=os.path.basename(filepath)
                )
                self.parameters.append(param)

                if param.grid_id:
                    db.insert_hydro_parameter(
                        grid_id=param.grid_id,
                        stratum_id=param.stratum_id,
                        parameter_name=param.parameter_name,
                        parameter_value=param.parameter_value,
                        unit=param.unit,
                        source_file=param.source_file
                    )

        return self.parameters

    def import_from_json(self, filepath: str, grid_id: Optional[int] = None) -> List[HydroParameter]:
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"File not found: {filepath}")

        self.parameters = []

        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)

        if 'parameters' in data:
            for item in data['parameters']:
                param = HydroParameter(
                    parameter_name=item.get('parameter_name', item.get('name', '')),
                    parameter_value=float(item.get('parameter_value', item.get('value', 0))),
                    unit=item.get('unit', ''),
                    stratum_id=int(item.get('stratum_id', 1)),
                    grid_id=grid_id or item.get('grid_id'),
                    source_file=os.path.basename(filepath)
                )
                self.parameters.append(param)

                if param.grid_id:
                    db.insert_hydro_parameter(
                        grid_id=param.grid_id,
                        stratum_id=param.stratum_id,
                        parameter_name=param.parameter_name,
                        parameter_value=param.parameter_value,
                        unit=param.unit,
                        source_file=param.source_file
                    )

        if 'boundary_conditions' in data and grid_id is not None:
            for item in data['boundary_conditions']:
                bc = BoundaryCondition(
                    boundary_type=item.get('boundary_type', 'dirichlet'),
                    node_indices=item.get('node_indices', []),
                    values=item.get('values', []),
                    description=item.get('description', '')
                )
                self.boundary_conditions.append(bc)

                db.insert_boundary_condition(
                    grid_id=grid_id,
                    boundary_type=bc.boundary_type,
                    node_indices=bc.node_indices,
                    boundary_values=bc.values,
                    description=bc.description
                )

        return self.parameters

    def import_boundary_conditions(self, filepath: str, grid_id: int) -> List[BoundaryCondition]:
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"File not found: {filepath}")

        self.boundary_conditions = []

        ext = os.path.splitext(filepath)[1].lower()

        if ext == '.json':
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)

            if 'boundary_conditions' in data:
                for item in data['boundary_conditions']:
                    bc = BoundaryCondition(
                        boundary_type=item.get('boundary_type', 'dirichlet'),
                        node_indices=item.get('node_indices', []),
                        values=item.get('values', []),
                        description=item.get('description', '')
                    )
                    self.boundary_conditions.append(bc)

                    db.insert_boundary_condition(
                        grid_id=grid_id,
                        boundary_type=bc.boundary_type,
                        node_indices=bc.node_indices,
                        boundary_values=bc.values,
                        description=bc.description
                    )

        elif ext == '.csv':
            with open(filepath, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    node_indices = json.loads(row.get('node_indices', '[]'))
                    values = json.loads(row.get('values', '[]'))

                    bc = BoundaryCondition(
                        boundary_type=row.get('boundary_type', 'dirichlet'),
                        node_indices=node_indices,
                        values=values,
                        description=row.get('description', '')
                    )
                    self.boundary_conditions.append(bc)

                    db.insert_boundary_condition(
                        grid_id=grid_id,
                        boundary_type=bc.boundary_type,
                        node_indices=bc.node_indices,
                        boundary_values=bc.values,
                        description=bc.description
                    )

        return self.boundary_conditions

    def batch_import_parameters(self, directory: str, grid_id: Optional[int] = None) -> Dict[str, List[HydroParameter]]:
        if not os.path.exists(directory):
            raise FileNotFoundError(f"Directory not found: {directory}")

        results = {}

        for filename in os.listdir(directory):
            filepath = os.path.join(directory, filename)
            if not os.path.isfile(filepath):
                continue

            ext = os.path.splitext(filename)[1].lower()

            try:
                if ext == '.csv':
                    params = self.import_from_csv(filepath, grid_id)
                    results[filename] = params
                elif ext == '.json':
                    params = self.import_from_json(filepath, grid_id)
                    results[filename] = params
            except Exception as e:
                results[filename] = [f"Error: {str(e)}"]

        return results

    def create_stratum(self, name: str, description: str = '', thickness: float = 0.0,
                       hydraulic_conductivity: float = 0.0, porosity: float = 0.0,
                       specific_storage: float = 0.0) -> int:
        return db.insert_stratum(
            name=name,
            description=description,
            thickness=thickness,
            hydraulic_conductivity=hydraulic_conductivity,
            porosity=porosity,
            specific_storage=specific_storage
        )

    def get_parameters_by_stratum(self, stratum_id: int, grid_id: Optional[int] = None) -> Dict[str, float]:
        params = db.get_hydro_parameters(stratum_id=stratum_id, grid_id=grid_id)
        return {p['parameter_name']: p['parameter_value'] for p in params}

    def get_hydraulic_conductivity(self, grid_id: Optional[int] = None, stratum_id: int = 1) -> float:
        params = db.get_hydro_parameters(grid_id=grid_id, stratum_id=stratum_id)
        for p in params:
            if p['parameter_name'].lower() in ['hydraulic_conductivity', 'k', '渗透系数', '导水系数']:
                return p['parameter_value']
        return 1e-5

    def get_porosity(self, grid_id: Optional[int] = None, stratum_id: int = 1) -> float:
        params = db.get_hydro_parameters(grid_id=grid_id, stratum_id=stratum_id)
        for p in params:
            if p['parameter_name'].lower() in ['porosity', 'n', '孔隙度']:
                return p['parameter_value']
        return 0.3

    def get_specific_storage(self, grid_id: Optional[int] = None, stratum_id: int = 1) -> float:
        params = db.get_hydro_parameters(grid_id=grid_id, stratum_id=stratum_id)
        for p in params:
            if p['parameter_name'].lower() in ['specific_storage', 'ss', '贮水率', '储水率']:
                return p['parameter_value']
        return 1e-6

    def export_parameters_to_json(self, filepath: str) -> None:
        data = {
            'parameters': [asdict(p) for p in self.parameters],
            'boundary_conditions': [asdict(b) for b in self.boundary_conditions]
        }
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    def generate_sample_parameters(self, grid_id: int, output_path: str) -> str:
        sample_data = {
            'parameters': [
                {
                    'parameter_name': 'hydraulic_conductivity',
                    'parameter_value': 1e-5,
                    'unit': 'm/s',
                    'stratum_id': 1,
                    'grid_id': grid_id
                },
                {
                    'parameter_name': 'porosity',
                    'parameter_value': 0.35,
                    'unit': '',
                    'stratum_id': 1,
                    'grid_id': grid_id
                },
                {
                    'parameter_name': 'specific_storage',
                    'parameter_value': 1e-6,
                    'unit': '1/m',
                    'stratum_id': 1,
                    'grid_id': grid_id
                }
            ],
            'boundary_conditions': [
                {
                    'boundary_type': 'dirichlet',
                    'node_indices': [0, 1, 2, 3, 4, 5],
                    'values': [10.0, 10.0, 10.0, 10.0, 10.0, 10.0],
                    'description': '左侧定水头边界'
                },
                {
                    'boundary_type': 'dirichlet',
                    'node_indices': [10, 11, 12, 13, 14, 15],
                    'values': [5.0, 5.0, 5.0, 5.0, 5.0, 5.0],
                    'description': '右侧定水头边界'
                }
            ]
        }

        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(sample_data, f, indent=2, ensure_ascii=False)

        return output_path
