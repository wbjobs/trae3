import os

DB_HOST = os.getenv("METEO_DB_HOST", "localhost")
DB_PORT = int(os.getenv("METEO_DB_PORT", "5432"))
DB_NAME = os.getenv("METEO_DB_NAME", "meteo_turbulence")
DB_USER = os.getenv("METEO_DB_USER", "postgres")
DB_PASSWORD = os.getenv("METEO_DB_PASSWORD", "postgres")

DB_DSN = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

DB_POOL_MIN = 2
DB_POOL_MAX = 10

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
IMPORT_DIR = os.path.join(DATA_DIR, "imports")
RESULT_DIR = os.path.join(DATA_DIR, "results")
LOG_DIR = os.path.join(PROJECT_ROOT, "logs")

GRID_DEFAULT_NX = 64
GRID_DEFAULT_NY = 64
GRID_DEFAULT_NZ = 32
GRID_DOMAIN_X = (0.0, 500.0)
GRID_DOMAIN_Y = (0.0, 500.0)
GRID_DOMAIN_Z = (0.0, 100.0)

SOLVER_METHOD = "LES"
SOLVER_MAX_ITER = 10000
SOLVER_TOLERANCE = 1e-6
SOLVER_RELAXATION = 1.2
SOLVER_CFL = 0.5
SOLVER_DT = 0.01
SOLVER_T_END = 60.0

TURBULENCE_MODEL = "Smagorinsky"
SMAGORINSKY_CS = 0.17

PARALLEL_MAX_WORKERS = os.cpu_count() or 4
TASK_QUEUE_POLL_INTERVAL = 2.0

EXPORT_FORMATS = ["vtk", "netcdf", "csv"]
VIZ_FIGURE_DPI = 150
VIZ_COLORMAP = "jet"

for d in [DATA_DIR, IMPORT_DIR, RESULT_DIR, LOG_DIR]:
    os.makedirs(d, exist_ok=True)
