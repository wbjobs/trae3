import os
import logging
import threading
import psycopg2
from psycopg2 import pool
from contextlib import contextmanager
import config

logger = logging.getLogger(__name__)


class DatabaseManager:
    _instance = None
    _pool = None
    _init_pid = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def initialize(self):
        current_pid = os.getpid()
        if self._pool is not None and self._init_pid == current_pid:
            return
        if self._pool is not None and self._init_pid != current_pid:
            logger.warning(
                "Detected fork (parent_pid=%d, child_pid=%d), resetting pool",
                self._init_pid, current_pid,
            )
            try:
                self._pool.closeall()
            except Exception:
                pass
            self._pool = None

        try:
            self._pool = pool.ThreadedConnectionPool(
                config.DB_POOL_MIN,
                config.DB_POOL_MAX,
                dsn=config.DB_DSN,
            )
            self._init_pid = current_pid
            logger.info("Database connection pool initialized (pid=%d)", current_pid)
            self._create_tables()
        except psycopg2.Error as e:
            logger.error("Failed to initialize database pool: %s", e)
            self._pool = None
            raise

    def _create_tables(self):
        create_meteo_params = """
        CREATE TABLE IF NOT EXISTS meteo_params (
            id SERIAL PRIMARY KEY,
            batch_name VARCHAR(255) NOT NULL,
            station_id VARCHAR(64),
            timestamp TIMESTAMPTZ,
            temperature REAL,
            pressure REAL,
            humidity REAL,
            wind_speed REAL,
            wind_direction REAL,
            roughness_length REAL DEFAULT 0.01,
            obukhov_length REAL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
        create_sim_tasks = """
        CREATE TABLE IF NOT EXISTS sim_tasks (
            id SERIAL PRIMARY KEY,
            task_name VARCHAR(255) NOT NULL,
            status VARCHAR(32) DEFAULT 'pending',
            params_id INTEGER REFERENCES meteo_params(id),
            grid_nx INTEGER,
            grid_ny INTEGER,
            grid_nz INTEGER,
            solver_method VARCHAR(32),
            turbulence_model VARCHAR(32),
            max_iterations INTEGER,
            tolerance DOUBLE PRECISION,
            dt DOUBLE PRECISION,
            t_end DOUBLE PRECISION,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            started_at TIMESTAMPTZ,
            finished_at TIMESTAMPTZ,
            result_path TEXT,
            error_message TEXT
        );
        """
        create_sim_results = """
        CREATE TABLE IF NOT EXISTS sim_results (
            id SERIAL PRIMARY KEY,
            task_id INTEGER REFERENCES sim_tasks(id),
            step INTEGER,
            time_point DOUBLE PRECISION,
            avg_wind_speed REAL,
            avg_tke REAL,
            max_velocity REAL,
            min_velocity REAL,
            result_data BYTEA,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(create_meteo_params)
                cur.execute(create_sim_tasks)
                cur.execute(create_sim_results)
                conn.commit()
        logger.info("Database tables verified / created")

    @contextmanager
    def get_connection(self):
        if self._pool is None or self._init_pid != os.getpid():
            self.initialize()
        conn = None
        max_retries = 3
        for attempt in range(max_retries):
            try:
                conn = self._pool.getconn()
                break
            except psycopg2.InterfaceError as e:
                logger.warning("Connection get failed (attempt %d): %s", attempt + 1, e)
                if attempt < max_retries - 1:
                    self._reinitialize_pool()
                else:
                    raise
            except psycopg2.PoolError as e:
                logger.warning("Pool exhausted (attempt %d): %s", attempt + 1, e)
                if attempt < max_retries - 1:
                    import time
                    time.sleep(0.5)
                else:
                    raise
        try:
            yield conn
        finally:
            if conn is not None:
                try:
                    self._pool.putconn(conn)
                except Exception:
                    pass

    def _reinitialize_pool(self):
        with self._lock:
            if self._pool is not None:
                try:
                    self._pool.closeall()
                except Exception:
                    pass
            try:
                self._pool = pool.ThreadedConnectionPool(
                    config.DB_POOL_MIN,
                    config.DB_POOL_MAX,
                    dsn=config.DB_DSN,
                )
                self._init_pid = os.getpid()
                logger.info("Database pool reinitialized (pid=%d)", os.getpid())
            except psycopg2.Error as e:
                logger.error("Failed to reinitialize pool: %s", e)
                self._pool = None

    def insert_meteo_params(self, records):
        sql = """
        INSERT INTO meteo_params
            (batch_name, station_id, timestamp, temperature, pressure,
             humidity, wind_speed, wind_direction, roughness_length, obukhov_length)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id;
        """
        ids = []
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                for r in records:
                    cur.execute(sql, (
                        r.get("batch_name"), r.get("station_id"),
                        r.get("timestamp"), r.get("temperature"),
                        r.get("pressure"), r.get("humidity"),
                        r.get("wind_speed"), r.get("wind_direction"),
                        r.get("roughness_length", 0.01),
                        r.get("obukhov_length"),
                    ))
                    ids.append(cur.fetchone()[0])
                conn.commit()
        return ids

    def create_task(self, task_name, params_id, grid_config, solver_config):
        sql = """
        INSERT INTO sim_tasks
            (task_name, params_id, grid_nx, grid_ny, grid_nz,
             solver_method, turbulence_model, max_iterations,
             tolerance, dt, t_end)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id;
        """
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, (
                    task_name, params_id,
                    grid_config.get("nx", config.GRID_DEFAULT_NX),
                    grid_config.get("ny", config.GRID_DEFAULT_NY),
                    grid_config.get("nz", config.GRID_DEFAULT_NZ),
                    solver_config.get("method", config.SOLVER_METHOD),
                    solver_config.get("turbulence_model", config.TURBULENCE_MODEL),
                    solver_config.get("max_iterations", config.SOLVER_MAX_ITER),
                    solver_config.get("tolerance", config.SOLVER_TOLERANCE),
                    solver_config.get("dt", config.SOLVER_DT),
                    solver_config.get("t_end", config.SOLVER_T_END),
                ))
                task_id = cur.fetchone()[0]
                conn.commit()
        return task_id

    def update_task_status(self, task_id, status, error_message=None, result_path=None):
        parts = ["status = %s"]
        vals = [status]
        if status == "running":
            parts.append("started_at = NOW()")
        if status in ("completed", "failed"):
            parts.append("finished_at = NOW()")
        if error_message is not None:
            parts.append("error_message = %s")
            vals.append(error_message)
        if result_path is not None:
            parts.append("result_path = %s")
            vals.append(result_path)
        vals.append(task_id)
        sql = f"UPDATE sim_tasks SET {', '.join(parts)} WHERE id = %s;"
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(sql, vals)
                    conn.commit()
        except Exception as e:
            logger.error("Failed to update task %d status: %s", task_id, e)

    def fetch_pending_tasks(self):
        sql = """
        SELECT id, task_name, params_id, grid_nx, grid_ny, grid_nz,
               solver_method, turbulence_model, max_iterations,
               tolerance, dt, t_end
        FROM sim_tasks
        WHERE status = 'pending'
        ORDER BY created_at ASC;
        """
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(sql)
                columns = [desc[0] for desc in cur.description]
                rows = cur.fetchall()
        return [dict(zip(columns, row)) for row in rows]

    def insert_result(self, task_id, step, time_point, summary, result_data=None):
        sql = """
        INSERT INTO sim_results
            (task_id, step, time_point, avg_wind_speed, avg_tke,
             max_velocity, min_velocity, result_data)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s);
        """
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, (
                    task_id, step, time_point,
                    summary.get("avg_wind_speed"),
                    summary.get("avg_tke"),
                    summary.get("max_velocity"),
                    summary.get("min_velocity"),
                    result_data,
                ))
                conn.commit()

    def get_task_results(self, task_id):
        sql = """
        SELECT step, time_point, avg_wind_speed, avg_tke,
               max_velocity, min_velocity
        FROM sim_results
        WHERE task_id = %s
        ORDER BY step ASC;
        """
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, (task_id,))
                columns = [desc[0] for desc in cur.description]
                rows = cur.fetchall()
        return [dict(zip(columns, row)) for row in rows]

    def get_meteo_params(self, params_id):
        sql = """
        SELECT id, batch_name, station_id, timestamp, temperature,
               pressure, humidity, wind_speed, wind_direction,
               roughness_length, obukhov_length
        FROM meteo_params WHERE id = %s;
        """
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, (params_id,))
                columns = [desc[0] for desc in cur.description]
                row = cur.fetchone()
        if row is None:
            return None
        return dict(zip(columns, row))

    def close(self):
        if self._pool is not None:
            try:
                self._pool.closeall()
            except Exception:
                pass
            self._pool = None
            self._init_pid = None
            logger.info("Database connection pool closed")
