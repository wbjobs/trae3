import sqlite3
import json
import time
from datetime import datetime
from config import DATABASE_PATH

class Database:
    def __init__(self, db_path=None):
        self.db_path = db_path or DATABASE_PATH
        self._init_tables()

    def _connect(self):
        return sqlite3.connect(self.db_path)

    def _init_tables(self):
        conn = self._connect()
        cursor = conn.cursor()

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS strata (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                thickness REAL,
                hydraulic_conductivity REAL,
                porosity REAL,
                specific_storage REAL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS grids (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                element_type TEXT,
                num_nodes INTEGER,
                num_elements INTEGER,
                min_x REAL,
                max_x REAL,
                min_y REAL,
                max_y REAL,
                grid_data_path TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS hydro_parameters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                grid_id INTEGER,
                stratum_id INTEGER,
                parameter_name TEXT,
                parameter_value REAL,
                unit TEXT,
                source_file TEXT,
                imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (grid_id) REFERENCES grids(id),
                FOREIGN KEY (stratum_id) REFERENCES strata(id)
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS boundary_conditions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                grid_id INTEGER,
                boundary_type TEXT,
                node_indices TEXT,
                boundary_values TEXT,
                description TEXT,
                FOREIGN KEY (grid_id) REFERENCES grids(id)
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                grid_id INTEGER,
                status TEXT DEFAULT 'pending',
                priority INTEGER DEFAULT 0,
                solver_config TEXT,
                progress REAL DEFAULT 0,
                result_path TEXT,
                error_message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                started_at TIMESTAMP,
                completed_at TIMESTAMP,
                FOREIGN KEY (grid_id) REFERENCES grids(id)
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER,
                grid_id INTEGER,
                head_values TEXT,
                velocity_x TEXT,
                velocity_y TEXT,
                Darcy_flux_x TEXT,
                Darcy_flux_y TEXT,
                hydraulic_gradient TEXT,
                statistics TEXT,
                exported_formats TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (task_id) REFERENCES tasks(id),
                FOREIGN KEY (grid_id) REFERENCES grids(id)
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS chambers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                description TEXT,
                chamber_type TEXT DEFAULT 'standard',
                memory_limit_mb INTEGER DEFAULT 1024,
                cpu_limit REAL DEFAULT 0.5,
                max_concurrent_tasks INTEGER DEFAULT 2,
                current_memory_mb REAL DEFAULT 0,
                current_cpu_usage REAL DEFAULT 0,
                running_tasks INTEGER DEFAULT 0,
                total_tasks INTEGER DEFAULT 0,
                failed_tasks INTEGER DEFAULT 0,
                circuit_breaker_status TEXT DEFAULT 'closed',
                circuit_breaker_failure_count INTEGER DEFAULT 0,
                circuit_breaker_opened_at TIMESTAMP,
                is_active INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS sensors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sensor_code TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                chamber_id INTEGER,
                sensor_type TEXT,
                measurement_type TEXT,
                location_x REAL,
                location_y REAL,
                location_z REAL,
                unit TEXT,
                sampling_interval INTEGER DEFAULT 60,
                accuracy REAL,
                is_active INTEGER DEFAULT 1,
                last_data_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (chamber_id) REFERENCES chambers(id)
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS sensor_data_raw (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sensor_id INTEGER NOT NULL,
                chamber_id INTEGER,
                timestamp INTEGER NOT NULL,
                value REAL NOT NULL,
                quality INTEGER DEFAULT 1,
                is_duplicate INTEGER DEFAULT 0,
                received_at INTEGER NOT NULL,
                FOREIGN KEY (sensor_id) REFERENCES sensors(id),
                FOREIGN KEY (chamber_id) REFERENCES chambers(id)
            )
        ''')

        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_sensor_data_raw_ts 
            ON sensor_data_raw(sensor_id, timestamp DESC)
        ''')

        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_sensor_data_raw_chamber 
            ON sensor_data_raw(chamber_id, timestamp DESC)
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS sensor_data_aggregated (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sensor_id INTEGER NOT NULL,
                chamber_id INTEGER,
                interval TEXT NOT NULL,
                start_time INTEGER NOT NULL,
                end_time INTEGER NOT NULL,
                count INTEGER DEFAULT 0,
                min_value REAL,
                max_value REAL,
                avg_value REAL,
                sum_value REAL,
                std_value REAL,
                first_value REAL,
                last_value REAL,
                quality_avg REAL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (sensor_id) REFERENCES sensors(id),
                FOREIGN KEY (chamber_id) REFERENCES chambers(id),
                UNIQUE(sensor_id, interval, start_time)
            )
        ''')

        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_sensor_data_agg_ts 
            ON sensor_data_aggregated(sensor_id, interval, start_time DESC)
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS timeseries_partitions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                table_name TEXT NOT NULL,
                partition_date TEXT NOT NULL,
                start_time INTEGER NOT NULL,
                end_time INTEGER NOT NULL,
                row_count INTEGER DEFAULT 0,
                compressed INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(table_name, partition_date)
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS system_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                metric_name TEXT NOT NULL,
                metric_value REAL,
                chamber_id INTEGER,
                timestamp INTEGER NOT NULL,
                tags TEXT,
                FOREIGN KEY (chamber_id) REFERENCES chambers(id)
            )
        ''')

        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_system_metrics_ts 
            ON system_metrics(metric_name, timestamp DESC)
        ''')

        conn.commit()
        conn.close()

    def insert_stratum(self, name, description=None, thickness=None,
                       hydraulic_conductivity=None, porosity=None, specific_storage=None):
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO strata (name, description, thickness, hydraulic_conductivity,
                              porosity, specific_storage)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (name, description, thickness, hydraulic_conductivity, porosity, specific_storage))
        conn.commit()
        last_id = cursor.lastrowid
        conn.close()
        return last_id

    def insert_grid(self, name, description=None, element_type=None, num_nodes=0,
                    num_elements=0, min_x=0, max_x=0, min_y=0, max_y=0, grid_data_path=None):
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO grids (name, description, element_type, num_nodes, num_elements,
                             min_x, max_x, min_y, max_y, grid_data_path)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (name, description, element_type, num_nodes, num_elements,
              min_x, max_x, min_y, max_y, grid_data_path))
        conn.commit()
        last_id = cursor.lastrowid
        conn.close()
        return last_id

    def insert_hydro_parameter(self, grid_id, stratum_id, parameter_name, parameter_value,
                               unit=None, source_file=None):
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO hydro_parameters (grid_id, stratum_id, parameter_name,
                                        parameter_value, unit, source_file)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (grid_id, stratum_id, parameter_name, parameter_value, unit, source_file))
        conn.commit()
        last_id = cursor.lastrowid
        conn.close()
        return last_id

    def insert_boundary_condition(self, grid_id, boundary_type, node_indices, boundary_values, description=None):
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO boundary_conditions (grid_id, boundary_type, node_indices, boundary_values, description)
            VALUES (?, ?, ?, ?, ?)
        ''', (grid_id, boundary_type, json.dumps(node_indices), json.dumps(boundary_values), description))
        conn.commit()
        last_id = cursor.lastrowid
        conn.close()
        return last_id

    def insert_task(self, name, description=None, grid_id=None, priority=0, solver_config=None):
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO tasks (name, description, grid_id, priority, solver_config)
            VALUES (?, ?, ?, ?, ?)
        ''', (name, description, grid_id, priority, json.dumps(solver_config) if solver_config else None))
        conn.commit()
        last_id = cursor.lastrowid
        conn.close()
        return last_id

    def update_task_status(self, task_id, status, progress=None, result_path=None, error_message=None):
        conn = self._connect()
        cursor = conn.cursor()

        updates = []
        params = []

        updates.append('status = ?')
        params.append(status)

        if status == 'running':
            updates.append('started_at = ?')
            params.append(datetime.now())
        elif status in ['completed', 'failed']:
            updates.append('completed_at = ?')
            params.append(datetime.now())

        if progress is not None:
            updates.append('progress = ?')
            params.append(progress)

        if result_path:
            updates.append('result_path = ?')
            params.append(result_path)

        if error_message:
            updates.append('error_message = ?')
            params.append(error_message)

        params.append(task_id)
        query = f"UPDATE tasks SET {', '.join(updates)} WHERE id = ?"

        cursor.execute(query, params)
        conn.commit()
        conn.close()

    def get_pending_tasks(self):
        conn = self._connect()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('''
            SELECT * FROM tasks WHERE status = 'pending' ORDER BY priority DESC, created_at ASC
        ''')
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]

    def get_task(self, task_id):
        conn = self._connect()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM tasks WHERE id = ?', (task_id,))
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None

    def insert_result(self, task_id, grid_id, head_values, velocity_x=None, velocity_y=None,
                      Darcy_flux_x=None, Darcy_flux_y=None, hydraulic_gradient=None,
                      statistics=None, exported_formats=None):
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO results (task_id, grid_id, head_values, velocity_x, velocity_y,
                               Darcy_flux_x, Darcy_flux_y, hydraulic_gradient, statistics,
                               exported_formats)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (task_id, grid_id, json.dumps(head_values),
              json.dumps(velocity_x) if velocity_x else None,
              json.dumps(velocity_y) if velocity_y else None,
              json.dumps(Darcy_flux_x) if Darcy_flux_x else None,
              json.dumps(Darcy_flux_y) if Darcy_flux_y else None,
              json.dumps(hydraulic_gradient) if hydraulic_gradient else None,
              json.dumps(statistics) if statistics else None,
              json.dumps(exported_formats) if exported_formats else None))
        conn.commit()
        last_id = cursor.lastrowid
        conn.close()
        return last_id

    def get_grid(self, grid_id):
        conn = self._connect()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM grids WHERE id = ?', (grid_id,))
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None

    def get_boundary_conditions(self, grid_id):
        conn = self._connect()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM boundary_conditions WHERE grid_id = ?', (grid_id,))
        rows = cursor.fetchall()
        conn.close()
        result = []
        for row in rows:
            row_dict = dict(row)
            if 'boundary_values' in row_dict:
                row_dict['values'] = row_dict['boundary_values']
            result.append(row_dict)
        return result

    def get_hydro_parameters(self, grid_id=None, stratum_id=None):
        conn = self._connect()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        query = 'SELECT * FROM hydro_parameters WHERE 1=1'
        params = []

        if grid_id:
            query += ' AND grid_id = ?'
            params.append(grid_id)
        if stratum_id:
            query += ' AND stratum_id = ?'
            params.append(stratum_id)

        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]

    def get_all_grids(self):
        conn = self._connect()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM grids ORDER BY created_at DESC')
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]

    def get_all_tasks(self):
        conn = self._connect()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM tasks ORDER BY created_at DESC')
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]

    def insert_chamber(self, name, description=None, chamber_type='standard',
                       memory_limit_mb=1024, cpu_limit=0.5, max_concurrent_tasks=2):
        conn = self._connect()
        cursor = conn.cursor()
        try:
            cursor.execute('''
                INSERT INTO chambers (name, description, chamber_type, memory_limit_mb,
                                    cpu_limit, max_concurrent_tasks)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (name, description, chamber_type, memory_limit_mb, cpu_limit, max_concurrent_tasks))
            conn.commit()
            return cursor.lastrowid
        except sqlite3.IntegrityError:
            cursor.execute('SELECT id FROM chambers WHERE name = ?', (name,))
            row = cursor.fetchone()
            conn.close()
            return row[0] if row else None

    def get_chamber(self, chamber_id):
        conn = self._connect()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM chambers WHERE id = ?', (chamber_id,))
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None

    def get_chamber_by_name(self, name):
        conn = self._connect()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM chambers WHERE name = ?', (name,))
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None

    def get_all_chambers(self):
        conn = self._connect()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM chambers ORDER BY created_at DESC')
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]

    def update_chamber_status(self, chamber_id, **kwargs):
        conn = self._connect()
        cursor = conn.cursor()
        updates = []
        params = []
        for key, value in kwargs.items():
            updates.append(f'{key} = ?')
            params.append(value)
        updates.append('updated_at = ?')
        params.append(datetime.now())
        params.append(chamber_id)
        query = f"UPDATE chambers SET {', '.join(updates)} WHERE id = ?"
        cursor.execute(query, params)
        conn.commit()
        conn.close()

    def insert_sensor(self, sensor_code, name, chamber_id=None, sensor_type=None,
                      measurement_type=None, location_x=None, location_y=None,
                      location_z=None, unit=None, sampling_interval=60, accuracy=None):
        conn = self._connect()
        cursor = conn.cursor()
        try:
            cursor.execute('''
                INSERT INTO sensors (sensor_code, name, chamber_id, sensor_type, measurement_type,
                                    location_x, location_y, location_z, unit, sampling_interval, accuracy)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (sensor_code, name, chamber_id, sensor_type, measurement_type,
                  location_x, location_y, location_z, unit, sampling_interval, accuracy))
            conn.commit()
            return cursor.lastrowid
        except sqlite3.IntegrityError:
            cursor.execute('SELECT id FROM sensors WHERE sensor_code = ?', (sensor_code,))
            row = cursor.fetchone()
            conn.close()
            return row[0] if row else None

    def get_sensor(self, sensor_id):
        conn = self._connect()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM sensors WHERE id = ?', (sensor_id,))
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None

    def get_sensor_by_code(self, sensor_code):
        conn = self._connect()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM sensors WHERE sensor_code = ?', (sensor_code,))
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None

    def get_sensors_by_chamber(self, chamber_id):
        conn = self._connect()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM sensors WHERE chamber_id = ?', (chamber_id,))
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]

    def insert_sensor_data_batch(self, data_list):
        if not data_list:
            return 0
        conn = self._connect()
        cursor = conn.cursor()
        cursor.executemany('''
            INSERT INTO sensor_data_raw (sensor_id, chamber_id, timestamp, value, quality,
                                        is_duplicate, received_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', [(d['sensor_id'], d.get('chamber_id'), d['timestamp'], d['value'],
               d.get('quality', 1), d.get('is_duplicate', 0), d.get('received_at', int(time.time() * 1000)))
              for d in data_list])
        conn.commit()
        count = cursor.rowcount
        conn.close()
        return count

    def insert_sensor_aggregated_batch(self, data_list):
        if not data_list:
            return 0
        conn = self._connect()
        cursor = conn.cursor()
        cursor.executemany('''
            INSERT OR REPLACE INTO sensor_data_aggregated 
            (sensor_id, chamber_id, interval, start_time, end_time, count,
             min_value, max_value, avg_value, sum_value, std_value, first_value, last_value, quality_avg)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', [(d['sensor_id'], d.get('chamber_id'), d['interval'], d['start_time'], d['end_time'],
               d.get('count', 0), d.get('min_value'), d.get('max_value'), d.get('avg_value'),
               d.get('sum_value'), d.get('std_value'), d.get('first_value'), d.get('last_value'),
               d.get('quality_avg'))
              for d in data_list])
        conn.commit()
        count = cursor.rowcount
        conn.close()
        return count

    def get_sensor_data(self, sensor_id, start_time=None, end_time=None, limit=None):
        conn = self._connect()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        query = 'SELECT * FROM sensor_data_raw WHERE sensor_id = ?'
        params = [sensor_id]
        if start_time:
            query += ' AND timestamp >= ?'
            params.append(start_time)
        if end_time:
            query += ' AND timestamp <= ?'
            params.append(end_time)
        query += ' ORDER BY timestamp DESC'
        if limit:
            query += ' LIMIT ?'
            params.append(limit)
        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]

    def get_sensor_aggregated_data(self, sensor_id, interval, start_time=None, end_time=None):
        conn = self._connect()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        query = 'SELECT * FROM sensor_data_aggregated WHERE sensor_id = ? AND interval = ?'
        params = [sensor_id, interval]
        if start_time:
            query += ' AND start_time >= ?'
            params.append(start_time)
        if end_time:
            query += ' AND end_time <= ?'
            params.append(end_time)
        query += ' ORDER BY start_time DESC'
        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]

    def insert_system_metric(self, metric_name, metric_value, chamber_id=None, tags=None):
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO system_metrics (metric_name, metric_value, chamber_id, timestamp, tags)
            VALUES (?, ?, ?, ?, ?)
        ''', (metric_name, metric_value, chamber_id, int(time.time() * 1000),
              json.dumps(tags) if tags else None))
        conn.commit()
        last_id = cursor.lastrowid
        conn.close()
        return last_id

    def get_system_metrics(self, metric_name, start_time=None, end_time=None, limit=1000):
        conn = self._connect()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        query = 'SELECT * FROM system_metrics WHERE metric_name = ?'
        params = [metric_name]
        if start_time:
            query += ' AND timestamp >= ?'
            params.append(start_time)
        if end_time:
            query += ' AND timestamp <= ?'
            params.append(end_time)
        query += ' ORDER BY timestamp DESC LIMIT ?'
        params.append(limit)
        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]

    def execute_query_with_timeout(self, query, params=None, timeout=30):
        conn = self._connect()
        conn.row_factory = sqlite3.Row
        conn.execute(f'PRAGMA busy_timeout = {timeout * 1000}')
        cursor = conn.cursor()
        try:
            cursor.execute(query, params or [])
            rows = cursor.fetchall()
            conn.close()
            return [dict(row) for row in rows]
        except Exception as e:
            conn.close()
            raise e

db = Database()
