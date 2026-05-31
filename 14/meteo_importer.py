import os
import csv
import logging
import datetime
import numpy as np
import config
from db_manager import DatabaseManager

logger = logging.getLogger(__name__)

REQUIRED_CSV_FIELDS = [
    "station_id", "timestamp", "temperature", "pressure",
    "humidity", "wind_speed", "wind_direction",
]
OPTIONAL_CSV_FIELDS = ["roughness_length", "obukhov_length"]

VALIDATION_RULES = {
    "temperature": (-80.0, 60.0),
    "pressure": (800.0, 1100.0),
    "humidity": (0.0, 100.0),
    "wind_speed": (0.0, 100.0),
    "wind_direction": (0.0, 360.0),
    "roughness_length": (1e-6, 10.0),
    "obukhov_length": (-1e6, 1e6),
}


class MeteoImporter:
    def __init__(self, db=None):
        self.db = db or DatabaseManager()

    def import_csv(self, filepath, batch_name=None):
        if batch_name is None:
            batch_name = os.path.splitext(os.path.basename(filepath))[0]
        logger.info("Importing CSV: %s (batch=%s)", filepath, batch_name)

        records = []
        errors = []
        with open(filepath, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row_num, row in enumerate(reader, start=2):
                try:
                    record = self._parse_csv_row(row, batch_name)
                    validation_errs = self._validate_record(record)
                    if validation_errs:
                        errors.append((row_num, validation_errs))
                        continue
                    records.append(record)
                except Exception as e:
                    errors.append((row_num, [str(e)]))

        if errors:
            for row_num, errs in errors:
                logger.warning("Row %d: %s", row_num, "; ".join(errs))

        if not records:
            logger.warning("No valid records imported from %s", filepath)
            return []

        ids = self.db.insert_meteo_params(records)
        logger.info("Imported %d/%d records from %s (IDs: %s)",
                     len(records), len(records) + len(errors), filepath, ids)
        return ids

    def _parse_csv_row(self, row, batch_name):
        record = {"batch_name": batch_name}
        for field in REQUIRED_CSV_FIELDS:
            if field not in row or row[field] == "":
                raise ValueError(f"Missing required field: {field}")
            if field == "station_id":
                record[field] = str(row[field]).strip()
            elif field == "timestamp":
                record[field] = self._parse_timestamp(row[field])
            else:
                record[field] = float(row[field])

        for field in OPTIONAL_CSV_FIELDS:
            if field in row and row[field] != "":
                record[field] = float(row[field])
            else:
                if field == "roughness_length":
                    record[field] = 0.01
                else:
                    record[field] = None
        return record

    def _parse_timestamp(self, ts_str):
        ts_str = str(ts_str).strip()
        for fmt in (
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%dT%H:%M:%S",
            "%Y/%m/%d %H:%M:%S",
            "%Y%m%d%H%M%S",
        ):
            try:
                return datetime.datetime.strptime(ts_str, fmt)
            except ValueError:
                continue
        raise ValueError(f"Cannot parse timestamp: {ts_str}")

    def _validate_record(self, record):
        errors = []
        for field, (lo, hi) in VALIDATION_RULES.items():
            val = record.get(field)
            if val is None:
                continue
            if not (lo <= val <= hi):
                errors.append(f"{field}={val} out of range [{lo}, {hi}]")
        return errors

    def import_csv_batch(self, directory, pattern="*.csv"):
        import glob
        files = sorted(glob.glob(os.path.join(directory, pattern)))
        if not files:
            logger.warning("No CSV files found in %s", directory)
            return {}
        all_ids = {}
        for filepath in files:
            ids = self.import_csv(filepath)
            all_ids[os.path.basename(filepath)] = ids
        return all_ids

    def import_netcdf(self, filepath, batch_name=None):
        try:
            import netCDF4 as nc
        except ImportError:
            logger.error("netCDF4 not installed; cannot import NetCDF files")
            return []

        if batch_name is None:
            batch_name = os.path.splitext(os.path.basename(filepath))[0]
        logger.info("Importing NetCDF: %s (batch=%s)", filepath, batch_name)

        ds = nc.Dataset(filepath, "r")
        try:
            records = self._extract_netcdf_records(ds, batch_name)
        finally:
            ds.close()

        if not records:
            logger.warning("No valid records extracted from %s", filepath)
            return []

        ids = self.db.insert_meteo_params(records)
        logger.info("Imported %d records from NetCDF %s", len(ids), filepath)
        return ids

    def _extract_netcdf_records(self, ds, batch_name):
        records = []
        try:
            times = ds.variables["time"][:]
            lats = ds.variables.get("lat", ds.variables.get("latitude", None))
            lons = ds.variables.get("lon", ds.variables.get("longitude", None))

            temp_var = self._find_var(ds, ["temperature", "t2m", "air_temperature", "T"])
            pres_var = self._find_var(ds, ["pressure", "psfc", "surface_pressure", "P"])
            hum_var = self._find_var(ds, ["humidity", "rh", "relative_humidity", "RH"])
            ws_var = self._find_var(ds, ["wind_speed", "ws", "wspd", "UV"])
            wd_var = self._find_var(ds, ["wind_direction", "wdir", "wind_dir"])
            z0_var = self._find_var(ds, ["roughness_length", "z0", "sfc_roughness"])
            ol_var = self._find_var(ds, ["obukhov_length", "L", "mol"])

            n_stations = 1
            if lats is not None:
                n_stations = len(lats) if lats.ndim == 1 else 1

            base_time = datetime.datetime(1970, 1, 1)

            for t_idx in range(len(times)):
                for s_idx in range(n_stations):
                    record = {"batch_name": batch_name}
                    record["station_id"] = f"station_{s_idx:03d}"
                    record["timestamp"] = base_time + datetime.timedelta(
                        hours=float(times[t_idx])
                    )
                    record["temperature"] = self._safe_nc_val(temp_var, t_idx, s_idx)
                    record["pressure"] = self._safe_nc_val(pres_var, t_idx, s_idx)
                    record["humidity"] = self._safe_nc_val(hum_var, t_idx, s_idx)
                    record["wind_speed"] = self._safe_nc_val(ws_var, t_idx, s_idx)
                    record["wind_direction"] = self._safe_nc_val(wd_var, t_idx, s_idx)
                    record["roughness_length"] = self._safe_nc_val(z0_var, t_idx, s_idx, 0.01)
                    record["obukhov_length"] = self._safe_nc_val(ol_var, t_idx, s_idx)
                    if record["wind_speed"] is not None:
                        records.append(record)
        except Exception as e:
            logger.error("NetCDF extraction error: %s", e)
        return records

    def _find_var(self, ds, candidates):
        for name in candidates:
            if name in ds.variables:
                return ds.variables[name]
        return None

    def _safe_nc_val(self, var, t_idx, s_idx, default=None):
        if var is None:
            return default
        try:
            val = var[t_idx]
            if val.ndim > 0:
                val = val.flat[0]
            val = float(val)
            if hasattr(var, "_FillValue") and val == var._FillValue:
                return default
            return val
        except Exception:
            return default

    def load_params_for_simulation(self, params_id):
        params = self.db.get_meteo_params(params_id)
        if params is None:
            raise ValueError(f"No meteo params found for id={params_id}")
        logger.info("Loaded meteo params: station=%s, wind_speed=%.2f",
                     params["station_id"], params["wind_speed"])
        return params

    def generate_sample_csv(self, filepath, n_stations=5, n_hours=24):
        os.makedirs(os.path.dirname(filepath) or ".", exist_ok=True)
        with open(filepath, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(REQUIRED_CSV_FIELDS + OPTIONAL_CSV_FIELDS)
            base_time = datetime.datetime(2025, 1, 1, 0, 0, 0)
            for s in range(n_stations):
                for h in range(n_hours):
                    ts = base_time + datetime.timedelta(hours=h)
                    writer.writerow([
                        f"STN{s:03d}",
                        ts.strftime("%Y-%m-%d %H:%M:%S"),
                        round(20.0 + 5.0 * np.sin(2 * np.pi * h / 24) + np.random.randn() * 0.5, 2),
                        round(1013.25 + np.random.randn() * 2, 1),
                        round(50.0 + 20.0 * np.random.randn(), 1),
                        round(max(0.1, 5.0 + 2.0 * np.sin(2*np.pi*h/12) + np.random.randn()), 2),
                        round(np.random.uniform(0, 360), 1),
                        round(max(0.001, 0.01 + np.random.randn() * 0.005), 4),
                        round(np.random.uniform(-500, 500), 1),
                    ])
        logger.info("Sample CSV generated: %s (%d records)", filepath, n_stations * n_hours)
