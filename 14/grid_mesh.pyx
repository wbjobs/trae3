# cython: boundscheck=False, wraparound=False, cdivision=True
import numpy as np
cimport numpy as np
from libc.math cimport sqrt, pow, exp, fabs

ctypedef np.float64_t DTYPE_t
ctypedef np.int32_t ITYPE_t


def generate_stretched_z_coords(double z_min, double z_max, int nz,
                                double roughness_length):
    cdef double z0 = roughness_length
    if z0 < 1e-4:
        z0 = 1e-4
    cdef int n_half = nz // 2
    cdef double dz_min = z0 * 2.0
    cdef double dz_max = (z_max - z_min) / nz * 3.0
    cdef np.ndarray[DTYPE_t, ndim=1] stretch = np.zeros(nz + 1, dtype=np.float64)
    cdef double ratio, dz
    cdef int k

    stretch[0] = z_min
    for k in range(1, nz + 1):
        if k <= n_half:
            ratio = <double>k / <double>n_half
            dz = dz_min + (dz_max - dz_min) * ratio
        else:
            ratio = <double>(k - n_half) / <double>(nz - n_half)
            dz = dz_max * (1.0 - 0.5 * ratio)
        stretch[k] = stretch[k - 1] + dz
    stretch = stretch - stretch[0] + z_min
    stretch[nz] = z_max
    return stretch


def compute_cell_volumes(np.ndarray[DTYPE_t, ndim=1] dx,
                         np.ndarray[DTYPE_t, ndim=1] dy,
                         np.ndarray[DTYPE_t, ndim=1] dz,
                         int nx, int ny, int nz):
    cdef np.ndarray[DTYPE_t, ndim=3] volumes = np.zeros((nx, ny, nz), dtype=np.float64)
    cdef int i, j, k
    for i in range(nx):
        for j in range(ny):
            for k in range(nz):
                volumes[i, j, k] = dx[i] * dy[j] * dz[k]
    return volumes


def compute_face_areas(np.ndarray[DTYPE_t, ndim=1] dx,
                       np.ndarray[DTYPE_t, ndim=1] dy,
                       np.ndarray[DTYPE_t, ndim=1] dz,
                       int nx, int ny, int nz):
    cdef np.ndarray[DTYPE_t, ndim=3] face_x = np.zeros((ny, nz), dtype=np.float64)
    cdef np.ndarray[DTYPE_t, ndim=3] face_y = np.zeros((nx, nz), dtype=np.float64)
    cdef np.ndarray[DTYPE_t, ndim=3] face_z = np.zeros((nx, ny), dtype=np.float64)
    cdef int i, j, k

    for j in range(ny):
        for k in range(nz):
            face_x[j, k] = dy[j] * dz[k]
    for i in range(nx):
        for k in range(nz):
            face_y[i, k] = dx[i] * dz[k]
    for i in range(nx):
        for j in range(ny):
            face_z[i, j] = dx[i] * dy[j]
    return face_x, face_y, face_z


def apply_log_wind_profile(np.ndarray[DTYPE_t, ndim=1] z_coords,
                           double u_star, double z0, double d=0.0):
    cdef int n = z_coords.shape[0]
    cdef np.ndarray[DTYPE_t, ndim=1] u_profile = np.zeros(n, dtype=np.float64)
    cdef double von_karman = 0.41
    cdef int k
    for k in range(n):
        if z_coords[k] > z0:
            u_profile[k] = (u_star / von_karman) * log((z_coords[k] - d) / z0)
        else:
            u_profile[k] = 0.0
    return u_profile
