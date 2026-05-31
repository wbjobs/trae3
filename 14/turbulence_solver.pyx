# cython: boundscheck=False, wraparound=False, cdivision=True
import numpy as np
cimport numpy as np
from libc.math cimport sqrt, fabs

ctypedef np.float64_t DTYPE_t


def cy_compute_strain_rate(np.ndarray[DTYPE_t, ndim=3] u,
                           np.ndarray[DTYPE_t, ndim=3] v,
                           np.ndarray[DTYPE_t, ndim=3] w,
                           np.ndarray[DTYPE_t, ndim=1] dx,
                           np.ndarray[DTYPE_t, ndim=1] dy,
                           np.ndarray[DTYPE_t, ndim=1] dz):
    cdef int nx = u.shape[0]
    cdef int ny = u.shape[1]
    cdef int nz = u.shape[2]
    cdef np.ndarray[DTYPE_t, ndim=3] s11 = np.zeros((nx, ny, nz), dtype=np.float64)
    cdef np.ndarray[DTYPE_t, ndim=3] s22 = np.zeros((nx, ny, nz), dtype=np.float64)
    cdef np.ndarray[DTYPE_t, ndim=3] s33 = np.zeros((nx, ny, nz), dtype=np.float64)
    cdef np.ndarray[DTYPE_t, ndim=3] s12 = np.zeros((nx, ny, nz), dtype=np.float64)
    cdef np.ndarray[DTYPE_t, ndim=3] s13 = np.zeros((nx, ny, nz), dtype=np.float64)
    cdef np.ndarray[DTYPE_t, ndim=3] s23 = np.zeros((nx, ny, nz), dtype=np.float64)
    cdef int i, j, k
    cdef double dudx, dudy, dudz, dvdx, dvdy, dvdz, dwdx, dwdy, dwdz
    cdef double dxi, dyj, dzk

    for i in range(1, nx - 1):
        dxi = dx[i]
        for j in range(1, ny - 1):
            dyj = dy[j]
            for k in range(1, nz - 1):
                dzk = dz[k]
                dudx = (u[i+1, j, k] - u[i-1, j, k]) / (2.0 * dxi)
                dudy = (u[i, j+1, k] - u[i, j-1, k]) / (2.0 * dyj)
                dudz = (u[i, j, k+1] - u[i, j, k-1]) / (2.0 * dzk)
                dvdx = (v[i+1, j, k] - v[i-1, j, k]) / (2.0 * dxi)
                dvdy = (v[i, j+1, k] - v[i, j-1, k]) / (2.0 * dyj)
                dvdz = (v[i, j, k+1] - v[i, j, k-1]) / (2.0 * dzk)
                dwdx = (w[i+1, j, k] - w[i-1, j, k]) / (2.0 * dxi)
                dwdy = (w[i, j+1, k] - w[i, j-1, k]) / (2.0 * dyj)
                dwdz = (w[i, j, k+1] - w[i, j, k-1]) / (2.0 * dzk)
                s11[i, j, k] = dudx
                s22[i, j, k] = dvdy
                s33[i, j, k] = dwdz
                s12[i, j, k] = 0.5 * (dudy + dvdx)
                s13[i, j, k] = 0.5 * (dudz + dwdx)
                s23[i, j, k] = 0.5 * (dvdz + dwdy)
    return s11, s22, s33, s12, s13, s23


def cy_compute_sgs_viscosity(np.ndarray[DTYPE_t, ndim=3] s11,
                             np.ndarray[DTYPE_t, ndim=3] s22,
                             np.ndarray[DTYPE_t, ndim=3] s33,
                             np.ndarray[DTYPE_t, ndim=3] s12,
                             np.ndarray[DTYPE_t, ndim=3] s13,
                             np.ndarray[DTYPE_t, ndim=3] s23,
                             np.ndarray[DTYPE_t, ndim=3] delta,
                             double cs):
    cdef int nx = s11.shape[0]
    cdef int ny = s11.shape[1]
    cdef int nz = s11.shape[2]
    cdef np.ndarray[DTYPE_t, ndim=3] nu_sgs = np.zeros((nx, ny, nz), dtype=np.float64)
    cdef int i, j, k
    cdef double s_mag, cs_delta_sq

    cs_delta_sq = cs * cs
    for i in range(nx):
        for j in range(ny):
            for k in range(nz):
                s_mag = sqrt(2.0 * (s11[i,j,k]*s11[i,j,k] + s22[i,j,k]*s22[i,j,k]
                                    + s33[i,j,k]*s33[i,j,k] + 2.0*(s12[i,j,k]*s12[i,j,k]
                                    + s13[i,j,k]*s13[i,j,k] + s23[i,j,k]*s23[i,j,k])))
                nu_sgs[i, j, k] = cs_delta_sq * delta[i, j, k] * delta[i, j, k] * s_mag
    return nu_sgs


def cy_advection_step(np.ndarray[DTYPE_t, ndim=3] u,
                      np.ndarray[DTYPE_t, ndim=3] v,
                      np.ndarray[DTYPE_t, ndim=3] w,
                      np.ndarray[DTYPE_t, ndim=3] vel,
                      np.ndarray[DTYPE_t, ndim=1] dx,
                      np.ndarray[DTYPE_t, ndim=1] dy,
                      np.ndarray[DTYPE_t, ndim=1] dz,
                      double dt):
    cdef int nx = vel.shape[0]
    cdef int ny = vel.shape[1]
    cdef int nz = vel.shape[2]
    cdef np.ndarray[DTYPE_t, ndim=3] adv = np.zeros((nx, ny, nz), dtype=np.float64)
    cdef int i, j, k
    cdef double dvel_dx, dvel_dy, dvel_dz

    for i in range(1, nx - 1):
        for j in range(1, ny - 1):
            for k in range(1, nz - 1):
                dvel_dx = (vel[i+1, j, k] - vel[i-1, j, k]) / (2.0 * dx[i])
                dvel_dy = (vel[i, j+1, k] - vel[i, j-1, k]) / (2.0 * dy[j])
                dvel_dz = (vel[i, j, k+1] - vel[i, j, k-1]) / (2.0 * dz[k])
                adv[i, j, k] = u[i,j,k] * dvel_dx + v[i,j,k] * dvel_dy + w[i,j,k] * dvel_dz
    return adv


def cy_pressure_poisson_jacobi(np.ndarray[DTYPE_t, ndim=3] p,
                                np.ndarray[DTYPE_t, ndim=3] rhs,
                                np.ndarray[DTYPE_t, ndim=1] dx,
                                np.ndarray[DTYPE_t, ndim=1] dy,
                                np.ndarray[DTYPE_t, ndim=1] dz,
                                int max_iter, double tol, double omega):
    cdef int nx = p.shape[0]
    cdef int ny = p.shape[1]
    cdef int nz = p.shape[2]
    cdef np.ndarray[DTYPE_t, ndim=3] p_new = p.copy()
    cdef int it, i, j, k
    cdef double residual, p_val, coeff
    cdef double dx2, dy2, dz2

    for it in range(max_iter):
        residual = 0.0
        for i in range(1, nx - 1):
            dx2 = dx[i] * dx[i]
            for j in range(1, ny - 1):
                dy2 = dy[j] * dy[j]
                for k in range(1, nz - 1):
                    dz2 = dz[k] * dz[k]
                    coeff = 2.0 / dx2 + 2.0 / dy2 + 2.0 / dz2
                    p_val = (
                        (p_new[i+1,j,k] + p_new[i-1,j,k]) / dx2
                        + (p_new[i,j+1,k] + p_new[i,j-1,k]) / dy2
                        + (p_new[i,j,k+1] + p_new[i,j,k-1]) / dz2
                        - rhs[i,j,k]
                    ) / coeff
                    p_val = omega * p_val + (1.0 - omega) * p_new[i, j, k]
                    residual = residual + fabs(p_val - p_new[i, j, k])
                    p_new[i, j, k] = p_val
        if residual < tol:
            break
    return p_new
