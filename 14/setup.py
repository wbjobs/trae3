from setuptools import setup, Extension
from Cython.Build import cythonize
import numpy as np

extensions = [
    Extension(
        "grid_mesh_cy",
        sources=["grid_mesh.pyx"],
        include_dirs=[np.get_include()],
        define_macros=[("NPY_NO_DEPRECATED_API", "NPY_1_7_API_VERSION")],
    ),
    Extension(
        "turbulence_solver_cy",
        sources=["turbulence_solver.pyx"],
        include_dirs=[np.get_include()],
        define_macros=[("NPY_NO_DEPRECATED_API", "NPY_1_7_API_VERSION")],
    ),
]

setup(
    name="meteo_turbulence_sim",
    version="1.0.0",
    description="Meteorological Micro-Block Turbulence Numerical Simulation System",
    ext_modules=cythonize(
        extensions,
        compiler_directives={
            "boundscheck": False,
            "wraparound": False,
            "cdivision": True,
            "language_level": "3",
        },
    ),
    install_requires=[
        "numpy",
        "cython",
        "psycopg2-binary",
        "matplotlib",
    ],
)
