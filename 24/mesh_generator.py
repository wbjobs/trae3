import numpy as np
import json
import os
from dataclasses import dataclass, asdict
from typing import List, Tuple, Optional
from config import GRID_OUTPUT_DIR
from database import db


@dataclass
class Node:
    id: int
    x: float
    y: float
    z: float = 0.0


@dataclass
class Element:
    id: int
    nodes: List[int]
    element_type: str
    stratum_id: int = 1


@dataclass
class Boundary:
    id: int
    node_indices: List[int]
    boundary_type: str


class MeshGenerator:
    def __init__(self):
        self.nodes: List[Node] = []
        self.elements: List[Element] = []
        self.boundaries: List[Boundary] = []

    def generate_rectangular_grid(self, width: float, height: float,
                                  nx: int, ny: int,
                                  origin_x: float = 0.0, origin_y: float = 0.0,
                                  element_type: str = 'quadrilateral') -> Tuple[List[Node], List[Element]]:
        self.nodes = []
        self.elements = []

        node_id = 0
        for j in range(ny + 1):
            for i in range(nx + 1):
                x = origin_x + i * width / nx
                y = origin_y + j * height / ny
                self.nodes.append(Node(node_id, x, y))
                node_id += 1

        elem_id = 0
        if element_type == 'quadrilateral':
            for j in range(ny):
                for i in range(nx):
                    n1 = j * (nx + 1) + i
                    n2 = j * (nx + 1) + i + 1
                    n3 = (j + 1) * (nx + 1) + i + 1
                    n4 = (j + 1) * (nx + 1) + i
                    self.elements.append(Element(elem_id, [n1, n2, n3, n4], 'quadrilateral'))
                    elem_id += 1
        elif element_type == 'triangle':
            for j in range(ny):
                for i in range(nx):
                    n1 = j * (nx + 1) + i
                    n2 = j * (nx + 1) + i + 1
                    n3 = (j + 1) * (nx + 1) + i + 1
                    n4 = (j + 1) * (nx + 1) + i
                    self.elements.append(Element(elem_id, [n1, n2, n4], 'triangle'))
                    elem_id += 1
                    self.elements.append(Element(elem_id, [n2, n3, n4], 'triangle'))
                    elem_id += 1

        return self.nodes, self.elements

    def generate_structured_grid(self, x_coords: List[float], y_coords: List[float],
                                 element_type: str = 'quadrilateral') -> Tuple[List[Node], List[Element]]:
        self.nodes = []
        self.elements = []

        node_id = 0
        for j, y in enumerate(y_coords):
            for i, x in enumerate(x_coords):
                self.nodes.append(Node(node_id, x, y))
                node_id += 1

        nx = len(x_coords) - 1
        ny = len(y_coords) - 1
        elem_id = 0

        if element_type == 'quadrilateral':
            for j in range(ny):
                for i in range(nx):
                    n1 = j * (nx + 1) + i
                    n2 = j * (nx + 1) + i + 1
                    n3 = (j + 1) * (nx + 1) + i + 1
                    n4 = (j + 1) * (nx + 1) + i
                    self.elements.append(Element(elem_id, [n1, n2, n3, n4], 'quadrilateral'))
                    elem_id += 1
        elif element_type == 'triangle':
            for j in range(ny):
                for i in range(nx):
                    n1 = j * (nx + 1) + i
                    n2 = j * (nx + 1) + i + 1
                    n3 = (j + 1) * (nx + 1) + i + 1
                    n4 = (j + 1) * (nx + 1) + i
                    self.elements.append(Element(elem_id, [n1, n2, n4], 'triangle'))
                    elem_id += 1
                    self.elements.append(Element(elem_id, [n2, n3, n4], 'triangle'))
                    elem_id += 1

        return self.nodes, self.elements

    def identify_boundaries(self, nx: int, ny: int) -> List[Boundary]:
        self.boundaries = []

        bottom_nodes = list(range(nx + 1))
        self.boundaries.append(Boundary(0, bottom_nodes, 'bottom'))

        top_nodes = list(range(ny * (nx + 1), (ny + 1) * (nx + 1)))
        self.boundaries.append(Boundary(1, top_nodes, 'top'))

        left_nodes = [j * (nx + 1) for j in range(ny + 1)]
        self.boundaries.append(Boundary(2, left_nodes, 'left'))

        right_nodes = [j * (nx + 1) + nx for j in range(ny + 1)]
        self.boundaries.append(Boundary(3, right_nodes, 'right'))

        return self.boundaries

    def refine_grid(self, refine_level: int = 1) -> Tuple[List[Node], List[Element]]:
        for _ in range(refine_level):
            new_nodes = []
            new_elements = []
            node_map = {}
            edge_map = {}

            for node in self.nodes:
                new_id = len(new_nodes)
                node_map[node.id] = new_id
                new_nodes.append(Node(new_id, node.x, node.y))

            for elem in self.elements:
                if elem.element_type == 'triangle':
                    new_elems = self._refine_triangle(elem, new_nodes, edge_map, node_map)
                    new_elements.extend(new_elems)
                elif elem.element_type == 'quadrilateral':
                    new_elems = self._refine_quadrilateral(elem, new_nodes, edge_map, node_map)
                    new_elements.extend(new_elems)

            self.nodes = new_nodes
            self.elements = new_elements

        return self.nodes, self.elements

    def _refine_triangle(self, elem: Element, new_nodes: List[Node],
                         edge_map: dict, node_map: dict) -> List[Element]:
        n = [node_map[nid] for nid in elem.nodes]
        edges = [(n[0], n[1]), (n[1], n[2]), (n[2], n[0])]

        mid_nodes = []
        for edge in edges:
            key = tuple(sorted(edge))
            if key not in edge_map:
                p1 = new_nodes[edge[0]]
                p2 = new_nodes[edge[1]]
                mid_id = len(new_nodes)
                new_nodes.append(Node(mid_id, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2))
                edge_map[key] = mid_id
            mid_nodes.append(edge_map[key])

        elem_id = len([e for e in new_elements if e.element_type == 'triangle'])
        new_elems = []
        new_elems.append(Element(elem_id, [n[0], mid_nodes[0], mid_nodes[2]], 'triangle'))
        new_elems.append(Element(elem_id + 1, [mid_nodes[0], n[1], mid_nodes[1]], 'triangle'))
        new_elems.append(Element(elem_id + 2, [mid_nodes[1], n[2], mid_nodes[2]], 'triangle'))
        new_elems.append(Element(elem_id + 3, [mid_nodes[0], mid_nodes[1], mid_nodes[2]], 'triangle'))

        return new_elems

    def _refine_quadrilateral(self, elem: Element, new_nodes: List[Node],
                              edge_map: dict, node_map: dict) -> List[Element]:
        n = [node_map[nid] for nid in elem.nodes]

        corners = [new_nodes[n[i]] for i in range(4)]
        mid_x = sum(c.x for c in corners) / 4
        mid_y = sum(c.y for c in corners) / 4
        center_id = len(new_nodes)
        new_nodes.append(Node(center_id, mid_x, mid_y))

        edges = [(n[0], n[1]), (n[1], n[2]), (n[2], n[3]), (n[3], n[0])]
        mid_nodes = []
        for edge in edges:
            key = tuple(sorted(edge))
            if key not in edge_map:
                p1 = new_nodes[edge[0]]
                p2 = new_nodes[edge[1]]
                mid_id = len(new_nodes)
                new_nodes.append(Node(mid_id, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2))
                edge_map[key] = mid_id
            mid_nodes.append(edge_map[key])

        elem_id = len([e for e in new_elements if e.element_type == 'quadrilateral'])
        new_elems = []
        new_elems.append(Element(elem_id, [n[0], mid_nodes[0], center_id, mid_nodes[3]], 'quadrilateral'))
        new_elems.append(Element(elem_id + 1, [mid_nodes[0], n[1], mid_nodes[1], center_id], 'quadrilateral'))
        new_elems.append(Element(elem_id + 2, [center_id, mid_nodes[1], n[2], mid_nodes[2]], 'quadrilateral'))
        new_elems.append(Element(elem_id + 3, [mid_nodes[3], center_id, mid_nodes[2], n[3]], 'quadrilateral'))

        return new_elems

    def save_mesh(self, filename: str, name: str = "Unnamed Grid", description: str = "") -> str:
        filepath = os.path.join(GRID_OUTPUT_DIR, filename)

        mesh_data = {
            'name': name,
            'description': description,
            'num_nodes': len(self.nodes),
            'num_elements': len(self.elements),
            'element_type': self.elements[0].element_type if self.elements else None,
            'nodes': [asdict(node) for node in self.nodes],
            'elements': [asdict(elem) for elem in self.elements],
            'boundaries': [asdict(b) for b in self.boundaries]
        }

        if self.nodes:
            x_coords = [n.x for n in self.nodes]
            y_coords = [n.y for n in self.nodes]
            mesh_data['min_x'] = min(x_coords)
            mesh_data['max_x'] = max(x_coords)
            mesh_data['min_y'] = min(y_coords)
            mesh_data['max_y'] = max(y_coords)

        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(mesh_data, f, indent=2)

        grid_id = db.insert_grid(
            name=name,
            description=description,
            element_type=mesh_data.get('element_type'),
            num_nodes=mesh_data['num_nodes'],
            num_elements=mesh_data['num_elements'],
            min_x=mesh_data.get('min_x', 0),
            max_x=mesh_data.get('max_x', 0),
            min_y=mesh_data.get('min_y', 0),
            max_y=mesh_data.get('max_y', 0),
            grid_data_path=filepath
        )

        return filepath, grid_id

    def load_mesh(self, filepath: str) -> Tuple[List[Node], List[Element], List[Boundary]]:
        with open(filepath, 'r', encoding='utf-8') as f:
            mesh_data = json.load(f)

        self.nodes = [Node(**n) for n in mesh_data['nodes']]
        self.elements = [Element(**e) for e in mesh_data['elements']]
        self.boundaries = [Boundary(**b) for b in mesh_data.get('boundaries', [])]

        return self.nodes, self.elements, self.boundaries

    def get_node_coordinates(self) -> np.ndarray:
        return np.array([[n.x, n.y] for n in self.nodes])

    def get_element_connectivity(self) -> np.ndarray:
        return np.array([e.nodes for e in self.elements])

    def get_nodes_near_point(self, x: float, y: float, radius: float) -> List[int]:
        coords = self.get_node_coordinates()
        distances = np.sqrt((coords[:, 0] - x) ** 2 + (coords[:, 1] - y) ** 2)
        return list(np.where(distances <= radius)[0])
