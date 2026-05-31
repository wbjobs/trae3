import sqlite3
import json
import time
import struct
import zlib
import numpy as np
from typing import Optional, List, Dict, Any


def _array_to_blob(arr: np.ndarray) -> bytes:
    flat = arr.astype(np.float32).flatten()
    header = struct.pack("<II", flat.shape[0], 0)
    compressed = zlib.compress(flat.tobytes(), level=6)
    return header + compressed


def _blob_to_array(blob: bytes, shape=None) -> np.ndarray:
    count, _ = struct.unpack("<II", blob[:8])
    decompressed = zlib.decompress(blob[8:])
    arr = np.frombuffer(decompressed, dtype=np.float32).copy()
    if shape is not None:
        arr = arr.reshape(shape)
    return arr


class SimulationDatabase:
    def __init__(self, db_path: str = "boundary_layer_sim.db"):
        self.db_path = db_path
        self.conn = None
        self._connect()
        self._create_tables()

    def _connect(self):
        self.conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA synchronous=NORMAL")
        self.conn.execute("PRAGMA cache_size=-8192")

    def _create_tables(self):
        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS tasks (
                task_id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_name TEXT NOT NULL,
                config_json TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                created_at REAL,
                started_at REAL,
                finished_at REAL,
                error_message TEXT,
                iterations INTEGER,
                final_residual REAL
            );

            CREATE TABLE IF NOT EXISTS results (
                result_id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL,
                x_coords BLOB NOT NULL,
                y_coords BLOB NOT NULL,
                u_field BLOB NOT NULL,
                v_field BLOB NOT NULL,
                wall_shear BLOB,
                skin_friction BLOB,
                displacement_thickness BLOB,
                momentum_thickness BLOB,
                residual_history BLOB,
                ny INTEGER,
                nx INTEGER,
                FOREIGN KEY (task_id) REFERENCES tasks(task_id)
            );

            CREATE TABLE IF NOT EXISTS checkpoints (
                checkpoint_id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL,
                step INTEGER NOT NULL,
                u_field BLOB NOT NULL,
                v_field BLOB NOT NULL,
                timestamp REAL,
                FOREIGN KEY (task_id) REFERENCES tasks(task_id)
            );

            CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
            CREATE INDEX IF NOT EXISTS idx_tasks_name ON tasks(task_name);
            CREATE INDEX IF NOT EXISTS idx_results_task ON results(task_id);
        """)
        self.conn.commit()

    def insert_task(self, task_name: str, config_json: str) -> int:
        cursor = self.conn.execute(
            "INSERT INTO tasks (task_name, config_json, status, created_at) VALUES (?, ?, ?, ?)",
            (task_name, config_json, "pending", time.time()),
        )
        self.conn.commit()
        return cursor.lastrowid

    def update_task_status(self, task_id: int, status: str,
                           error_message: Optional[str] = None,
                           iterations: Optional[int] = None,
                           final_residual: Optional[float] = None):
        now = time.time()
        if status == "running":
            self.conn.execute(
                "UPDATE tasks SET status=?, started_at=? WHERE task_id=?",
                (status, now, task_id),
            )
        elif status in ("completed", "failed"):
            self.conn.execute(
                "UPDATE tasks SET status=?, finished_at=?, error_message=?, iterations=?, final_residual=? WHERE task_id=?",
                (status, now, error_message, iterations, final_residual, task_id),
            )
        else:
            self.conn.execute(
                "UPDATE tasks SET status=? WHERE task_id=?",
                (status, task_id),
            )
        self.conn.commit()

    def insert_results(self, task_id: int, results: Dict[str, Any]):
        u = results["u"]
        ny, nx = u.shape
        self.conn.execute(
            """INSERT INTO results
               (task_id, x_coords, y_coords, u_field, v_field,
                wall_shear, skin_friction, displacement_thickness,
                momentum_thickness, residual_history, ny, nx)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                task_id,
                _array_to_blob(results["x"]),
                _array_to_blob(results["y"]),
                _array_to_blob(u),
                _array_to_blob(results["v"]),
                _array_to_blob(results["wall_shear"]),
                _array_to_blob(results["skin_friction"]),
                _array_to_blob(results["displacement_thickness"]),
                _array_to_blob(results["momentum_thickness"]),
                _array_to_blob(results["residual_history"]),
                ny, nx,
            ),
        )
        self.conn.commit()

    def save_checkpoint(self, task_id: int, step: int, u: np.ndarray, v: np.ndarray):
        self.conn.execute(
            "INSERT INTO checkpoints (task_id, step, u_field, v_field, timestamp) VALUES (?, ?, ?, ?, ?)",
            (task_id, step, _array_to_blob(u), _array_to_blob(v), time.time()),
        )
        self.conn.commit()

    def load_checkpoint(self, task_id: int) -> Optional[Dict[str, Any]]:
        cursor = self.conn.execute(
            "SELECT step, u_field, v_field FROM checkpoints WHERE task_id=? ORDER BY step DESC LIMIT 1",
            (task_id,),
        )
        row = cursor.fetchone()
        if row is None:
            return None
        return {
            "step": row[0],
            "u": _blob_to_array(row[1]),
            "v": _blob_to_array(row[2]),
        }

    def get_task(self, task_id: int) -> Optional[Dict[str, Any]]:
        cursor = self.conn.execute(
            "SELECT task_id, task_name, config_json, status, created_at, started_at, finished_at, error_message, iterations, final_residual FROM tasks WHERE task_id=?",
            (task_id,),
        )
        row = cursor.fetchone()
        if row is None:
            return None
        return {
            "task_id": row[0],
            "task_name": row[1],
            "config_json": row[2],
            "status": row[3],
            "created_at": row[4],
            "started_at": row[5],
            "finished_at": row[6],
            "error_message": row[7],
            "iterations": row[8],
            "final_residual": row[9],
        }

    def get_results(self, task_id: int) -> Optional[Dict[str, Any]]:
        cursor = self.conn.execute(
            """SELECT x_coords, y_coords, u_field, v_field,
                      wall_shear, skin_friction,
                      displacement_thickness, momentum_thickness,
                      residual_history, ny, nx
               FROM results WHERE task_id=?""",
            (task_id,),
        )
        row = cursor.fetchone()
        if row is None:
            return None
        ny, nx = row[9], row[10]
        return {
            "x": _blob_to_array(row[0]),
            "y": _blob_to_array(row[1]),
            "u": _blob_to_array(row[2], shape=(ny, nx)),
            "v": _blob_to_array(row[3], shape=(ny, nx)),
            "wall_shear": _blob_to_array(row[4]),
            "skin_friction": _blob_to_array(row[5]),
            "displacement_thickness": _blob_to_array(row[6]),
            "momentum_thickness": _blob_to_array(row[7]),
            "residual_history": _blob_to_array(row[8]),
        }

    def list_tasks(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        if status:
            cursor = self.conn.execute(
                "SELECT task_id, task_name, status, created_at, iterations, final_residual FROM tasks WHERE status=? ORDER BY task_id DESC",
                (status,),
            )
        else:
            cursor = self.conn.execute(
                "SELECT task_id, task_name, status, created_at, iterations, final_residual FROM tasks ORDER BY task_id DESC",
            )
        rows = cursor.fetchall()
        return [
            {
                "task_id": r[0],
                "task_name": r[1],
                "status": r[2],
                "created_at": r[3],
                "iterations": r[4],
                "final_residual": r[5],
            }
            for r in rows
        ]

    def delete_task(self, task_id: int):
        self.conn.execute("DELETE FROM results WHERE task_id=?", (task_id,))
        self.conn.execute("DELETE FROM checkpoints WHERE task_id=?", (task_id,))
        self.conn.execute("DELETE FROM tasks WHERE task_id=?", (task_id,))
        self.conn.commit()

    def close(self):
        if self.conn:
            self.conn.close()
            self.conn = None
