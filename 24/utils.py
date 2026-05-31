import numpy as np
from typing import List, Tuple
import json


def calculate_element_area(coords: np.ndarray) -> float:
    if len(coords) == 3:
        return 0.5 * abs(
            (coords[1, 0] - coords[0, 0]) * (coords[2, 1] - coords[0, 1]) -
            (coords[2, 0] - coords[0, 0]) * (coords[1, 1] - coords[0, 1])
        )
    elif len(coords) == 4:
        area1 = 0.5 * abs(
            (coords[1, 0] - coords[0, 0]) * (coords[2, 1] - coords[0, 1]) -
            (coords[2, 0] - coords[0, 0]) * (coords[1, 1] - coords[0, 1])
        )
        area2 = 0.5 * abs(
            (coords[2, 0] - coords[0, 0]) * (coords[3, 1] - coords[0, 1]) -
            (coords[3, 0] - coords[0, 0]) * (coords[2, 1] - coords[0, 1])
        )
        return area1 + area2
    return 0.0


def calculate_gradient(values: np.ndarray, coords: np.ndarray) -> np.ndarray:
    n = len(values)
    A = np.zeros((n, 2))
    b = np.zeros(n)

    for i in range(n):
        xi, yi = coords[i]
        A[i] = [xi, yi]
        b[i] = values[i]

    grad, _, _, _ = np.linalg.lstsq(A, b, rcond=None)
    return grad


def interpolate_to_point(point: Tuple[float, float], nodes_coords: np.ndarray,
                         values: np.ndarray, method: str = 'linear') -> float:
    distances = np.sqrt(
        (nodes_coords[:, 0] - point[0]) ** 2 +
        (nodes_coords[:, 1] - point[1]) ** 2
    )

    if method == 'nearest':
        return values[np.argmin(distances)]
    elif method == 'linear':
        idx = np.argsort(distances)[:4]
        weights = 1.0 / (distances[idx] + 1e-10)
        weights /= weights.sum()
        return np.sum(weights * values[idx])

    return values[np.argmin(distances)]


def create_regular_coordinates(min_val: float, max_val: float, num: int) -> List[float]:
    return np.linspace(min_val, max_val, num).tolist()


def save_json(data: dict, filepath: str, indent: int = 2) -> None:
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=indent, ensure_ascii=False)


def load_json(filepath: str) -> dict:
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)


def format_time(seconds: float) -> str:
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60

    if hours > 0:
        return f"{hours}h {minutes}m {secs:.2f}s"
    elif minutes > 0:
        return f"{minutes}m {secs:.2f}s"
    return f"{secs:.2f}s"


def print_progress_bar(iteration: int, total: int, prefix: str = '',
                       suffix: str = '', length: int = 50, fill: str = '█') -> None:
    percent = "{0:.1f}".format(100 * (iteration / float(total)))
    filled_length = int(length * iteration // total)
    bar = fill * filled_length + '-' * (length - filled_length)
    print(f'\r{prefix} |{bar}| {percent}% {suffix}', end='\r')
    if iteration == total:
        print()


def is_pypy() -> bool:
    try:
        import __pypy__
        return True
    except ImportError:
        return False


def get_memory_usage() -> float:
    import os
    import psutil
    process = psutil.Process(os.getpid())
    return process.memory_info().rss / 1024 / 1024
