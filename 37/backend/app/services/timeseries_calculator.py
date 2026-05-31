import numpy as np
import pandas as pd
from scipy import signal
from scipy.fft import fft, fftfreq
from typing import List, Dict, Any, Tuple
from datetime import datetime
from app.models.vibration_data import VibrationData


class TimeSeriesCalculator:
    @staticmethod
    def calculate_rms(data: np.ndarray) -> float:
        return float(np.sqrt(np.mean(data ** 2)))

    @staticmethod
    def calculate_peak(data: np.ndarray) -> float:
        return float(np.max(np.abs(data)))

    @staticmethod
    def calculate_crest_factor(data: np.ndarray) -> float:
        rms = TimeSeriesCalculator.calculate_rms(data)
        if rms == 0:
            return 0.0
        peak = TimeSeriesCalculator.calculate_peak(data)
        return float(peak / rms)

    @staticmethod
    def calculate_kurtosis(data: np.ndarray) -> float:
        mean = np.mean(data)
        std = np.std(data)
        if std == 0:
            return 0.0
        return float(np.mean(((data - mean) / std) ** 4))

    @staticmethod
    def calculate_skewness(data: np.ndarray) -> float:
        mean = np.mean(data)
        std = np.std(data)
        if std == 0:
            return 0.0
        return float(np.mean(((data - mean) / std) ** 3))

    @staticmethod
    def calculate_std(data: np.ndarray) -> float:
        return float(np.std(data))

    @staticmethod
    def calculate_mean(data: np.ndarray) -> float:
        return float(np.mean(data))

    @staticmethod
    def calculate_fft(
        data: np.ndarray,
        sample_rate: int = 1000
    ) -> Tuple[np.ndarray, np.ndarray]:
        n = len(data)
        yf = fft(data)
        xf = fftfreq(n, 1 / sample_rate)
        positive_mask = xf >= 0
        frequencies = xf[positive_mask]
        magnitudes = 2.0 / n * np.abs(yf[positive_mask])
        return frequencies, magnitudes

    @staticmethod
    def find_dominant_frequency(
        frequencies: np.ndarray,
        magnitudes: np.ndarray,
        exclude_dc: bool = True
    ) -> Tuple[float, float]:
        if exclude_dc:
            mask = frequencies > 0
            frequencies = frequencies[mask]
            magnitudes = magnitudes[mask]
        if len(magnitudes) == 0:
            return 0.0, 0.0
        max_idx = np.argmax(magnitudes)
        return float(frequencies[max_idx]), float(magnitudes[max_idx])

    @staticmethod
    def find_harmonics(
        frequencies: np.ndarray,
        magnitudes: np.ndarray,
        base_freq: float,
        num_harmonics: int = 10,
        tolerance: float = 0.05
    ) -> List[Dict[str, float]]:
        harmonics = []
        for i in range(1, num_harmonics + 1):
            target_freq = base_freq * i
            freq_mask = np.abs(frequencies - target_freq) < target_freq * tolerance
            if np.any(freq_mask):
                harmonic_magnitudes = magnitudes[freq_mask]
                max_mag_idx = np.argmax(harmonic_magnitudes)
                actual_freq = frequencies[freq_mask][max_mag_idx]
                actual_mag = harmonic_magnitudes[max_mag_idx]
                harmonics.append({
                    "order": i,
                    "frequency": float(actual_freq),
                    "magnitude": float(actual_mag),
                    "target_frequency": float(target_freq)
                })
        return harmonics

    @staticmethod
    def calculate_band_energy(
        frequencies: np.ndarray,
        magnitudes: np.ndarray,
        freq_bands: List[Tuple[float, float]]
    ) -> List[Dict[str, float]]:
        band_energies = []
        for low, high in freq_bands:
            mask = (frequencies >= low) & (frequencies <= high)
            if np.any(mask):
                energy = float(np.sum(magnitudes[mask] ** 2))
            else:
                energy = 0.0
            band_energies.append({
                "low_freq": low,
                "high_freq": high,
                "energy": energy
            })
        return band_energies

    @staticmethod
    def analyze_vibration_data(
        vibration_data: List[VibrationData],
        sample_rate: int = 1000,
        include_fft: bool = True
    ) -> Dict[str, Any]:
        if not vibration_data:
            return {}

        df = pd.DataFrame([{
            "timestamp": d.timestamp,
            "x_axis": d.x_axis,
            "y_axis": d.y_axis,
            "z_axis": d.z_axis,
            "temperature": d.temperature,
            "speed": d.speed
        } for d in vibration_data])

        axes = ["x", "y", "z"]
        result = {
            "device_code": vibration_data[0].device_code,
            "start_time": df["timestamp"].min(),
            "end_time": df["timestamp"].max(),
            "sample_count": len(df)
        }

        for axis in axes:
            data = df[f"{axis}_axis"].values
            result[f"rms_{axis}"] = TimeSeriesCalculator.calculate_rms(data)
            result[f"peak_{axis}"] = TimeSeriesCalculator.calculate_peak(data)
            result[f"crest_factor_{axis}"] = TimeSeriesCalculator.calculate_crest_factor(data)
            result[f"kurtosis_{axis}"] = TimeSeriesCalculator.calculate_kurtosis(data)
            result[f"skewness_{axis}"] = TimeSeriesCalculator.calculate_skewness(data)
            result[f"std_{axis}"] = TimeSeriesCalculator.calculate_std(data)
            result[f"mean_{axis}"] = TimeSeriesCalculator.calculate_mean(data)

        if include_fft:
            fft_result = {}
            for axis in axes:
                data = df[f"{axis}_axis"].values
                frequencies, magnitudes = TimeSeriesCalculator.calculate_fft(data, sample_rate)
                dom_freq, dom_mag = TimeSeriesCalculator.find_dominant_frequency(frequencies, magnitudes)
                result[f"dominant_frequency_{axis}"] = dom_freq

                harmonics = TimeSeriesCalculator.find_harmonics(frequencies, magnitudes, dom_freq)

                fft_result[axis] = {
                    "frequencies": frequencies.tolist(),
                    "magnitudes": magnitudes.tolist(),
                    "dominant_frequency": dom_freq,
                    "dominant_magnitude": dom_mag,
                    "harmonics": harmonics
                }
            result["fft_data"] = fft_result

        result["temperature_mean"] = float(df["temperature"].mean())
        result["temperature_max"] = float(df["temperature"].max())
        result["speed_mean"] = float(df["speed"].mean())

        return result

    @staticmethod
    def calculate_statistical_features(
        data: np.ndarray
    ) -> Dict[str, float]:
        return {
            "mean": TimeSeriesCalculator.calculate_mean(data),
            "std": TimeSeriesCalculator.calculate_std(data),
            "rms": TimeSeriesCalculator.calculate_rms(data),
            "peak": TimeSeriesCalculator.calculate_peak(data),
            "crest_factor": TimeSeriesCalculator.calculate_crest_factor(data),
            "kurtosis": TimeSeriesCalculator.calculate_kurtosis(data),
            "skewness": TimeSeriesCalculator.calculate_skewness(data),
            "min": float(np.min(data)),
            "max": float(np.max(data)),
            "median": float(np.median(data))
        }
