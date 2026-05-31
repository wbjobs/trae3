import numpy as np
import logging
import config

logger = logging.getLogger(__name__)


class GridMesh:
    def __init__(self, nx=None, ny=None, nz=None,
                 domain_x=None, domain_y=None, domain_z=None,
                 stretching_z=True, roughness_length=0.01):
        self.nx = nx or config.GRID_DEFAULT_NX
        self.ny = ny or config.GRID_DEFAULT_NY
        self.nz = nz or config.GRID_DEFAULT_NZ
        self.domain_x = domain_x or config.GRID_DOMAIN_X
        self.domain_y = domain_y or config.GRID_DOMAIN_Y
        self.domain_z = domain_z or config.GRID_DOMAIN_Z
        self.stretching_z = stretching_z
        self.roughness_length = roughness_length

        self.x = None
        self.y = None
        self.z = None
        self.dx = None
        self.dy = None
        self.dz = None

        self.cell_centers = None
        self.cell_volumes = None
        self.face_areas = None
        self.neighbor_indices = None

    def generate(self):
        logger.info(
            "Generating grid: %dx%dx%d over [%.1f,%.1f]x[%.1f,%.1f]x[%.1f,%.1f]",
            self.nx, self.ny, self.nz,
            self.domain_x[0], self.domain_x[1],
            self.domain_y[0], self.domain_y[1],
            self.domain_z[0], self.domain_z[1],
        )
        self.x = np.linspace(self.domain_x[0], self.domain_x[1], self.nx + 1)
        self.y = np.linspace(self.domain_y[0], self.domain_y[1], self.ny + 1)
        self.z = self._generate_z_coords()
        self.dx = np.diff(self.x)
        self.dy = np.diff(self.y)
        self.dz = np.diff(self.z)
        self._compute_cell_geometry()
        self._compute_neighbor_indices()
        logger.info("Grid generation complete: %d cells total", self.nx * self.ny * self.nz)
        return self

    def _generate_z_coords(self):
        if self.stretching_z:
            z_min, z_max = self.domain_z
            z0 = max(self.roughness_length, 1e-4)
            beta = 1.2
            normalized = np.linspace(0, 1, self.nz + 1)
            stretched = np.tanh(beta * normalized) / np.tanh(beta)
            coords = z_min + stretched * (z_max - z_min)
            coords[0] = z_min
            coords[-1] = z_max
            return coords
        return np.linspace(self.domain_z[0], self.domain_z[1], self.nz + 1)

    def _compute_cell_geometry(self):
        cx = 0.5 * (self.x[:-1] + self.x[1:])
        cy = 0.5 * (self.y[:-1] + self.y[1:])
        cz = 0.5 * (self.z[:-1] + self.z[1:])
        self.cell_centers = np.array(np.meshgrid(cx, cy, cz, indexing="ij"))

        dx3d = self.dx[:, None, None]
        dy3d = self.dy[None, :, None]
        dz3d = self.dz[None, None, :]
        self.cell_volumes = dx3d * dy3d * dz3d

        face_x = self.dy[None, :, None] * self.dz[None, None, :]
        face_y = self.dx[:, None, None] * self.dz[None, None, :]
        face_z = self.dx[:, None, None] * self.dy[None, :, None]
        self.face_areas = {"x": face_x, "y": face_y, "z": face_z}

    def _compute_neighbor_indices(self):
        shape = (self.nx, self.ny, self.nz)
        total = self.nx * self.ny * self.nz
        idx = np.arange(total).reshape(shape)
        self.neighbor_indices = {
            "i_minus": np.where(idx > 0, idx - 1, idx),
            "i_plus": np.where(idx < total - 1, idx + 1, idx),
            "j_minus": np.roll(idx, 1, axis=1),
            "j_plus": np.roll(idx, -1, axis=1),
            "k_minus": np.roll(idx, 1, axis=2),
            "k_plus": np.roll(idx, -1, axis=2),
        }
        self.neighbor_indices["i_minus"][0, :, :] = 0
        self.neighbor_indices["i_plus"][-1, :, :] = total - 1

    def get_boundary_mask(self):
        mask = np.zeros((self.nx, self.ny, self.nz), dtype=np.int32)
        mask[0, :, :] = 1
        mask[-1, :, :] = 2
        mask[:, 0, :] |= 4
        mask[:, -1, :] |= 8
        mask[:, :, 0] |= 16
        mask[:, :, -1] |= 32
        return mask

    def get_surface_layer_indices(self, n_layers=3):
        return np.s_[:, :, :n_layers]

    def to_dict(self):
        return {
            "nx": self.nx, "ny": self.ny, "nz": self.nz,
            "domain_x": self.domain_x, "domain_y": self.domain_y,
            "domain_z": self.domain_z,
            "x": self.x, "y": self.y, "z": self.z,
            "dx": self.dx, "dy": self.dy, "dz": self.dz,
            "cell_volumes": self.cell_volumes,
        }
