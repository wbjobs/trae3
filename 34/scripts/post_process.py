#!/usr/bin/env python3

import sys
import os
import json
import argparse
import numpy as np
from pathlib import Path
from typing import Dict, Any, List, Tuple


class ResultAnalyzer:
    def __init__(self, result_path: str):
        self.result_path = Path(result_path)
        self.summary: Dict[str, Any] = {}

    def parse_openfoam_field(self, filepath: Path) -> Dict[str, Any]:
        result = {
            'dimensions': '',
            'internal_field': None,
            'boundary_data': {},
            'stats': {
                'min': 0.0,
                'max': 0.0,
                'avg': 0.0,
                'std': 0.0,
            }
        }

        try:
            with open(filepath, 'r') as f:
                content = f.read()

            dim_match = content.find('dimensions')
            if dim_match >= 0:
                dim_start = content.find('[', dim_match)
                dim_end = content.find(']', dim_start)
                if dim_start >= 0 and dim_end >= 0:
                    result['dimensions'] = content[dim_start:dim_end + 1]

            internal_start = content.find('internalField')
            if internal_start >= 0:
                nonuniform = content.find('nonuniform', internal_start)
                if nonuniform >= 0:
                    list_start = content.find('(', nonuniform)
                    if list_start >= 0:
                        values = self._parse_values(content, list_start)
                        if values:
                            result['internal_field'] = values
                            result['stats'] = {
                                'min': float(np.min(values)),
                                'max': float(np.max(values)),
                                'avg': float(np.mean(values)),
                                'std': float(np.std(values)),
                            }

            boundary_start = content.find('boundaryField')
            if boundary_start >= 0:
                result['boundary_data'] = self._parse_boundary_field(
                    content, boundary_start
                )

        except Exception as e:
            print(f"Error parsing {filepath}: {e}", file=sys.stderr)

        return result

    def _parse_values(self, content: str, start: int) -> List[float]:
        values = []
        depth = 0
        i = start
        value_start = -1

        while i < len(content):
            c = content[i]

            if c == '(':
                depth += 1
                if depth == 1:
                    value_start = i + 1
            elif c == ')':
                depth -= 1
                if depth == 0:
                    break
            elif depth == 1 and c.isspace():
                if value_start >= 0 and i > value_start:
                    token = content[value_start:i].strip()
                    if token and not token.startswith('('):
                        try:
                            values.append(float(token))
                        except ValueError:
                            pass
                    value_start = i + 1

            i += 1

        return values

    def _parse_boundary_field(self, content: str, start: int) -> Dict[str, Any]:
        boundaries = {}
        return boundaries

    def analyze_timestep(self, timestep_dir: Path) -> Dict[str, Any]:
        results = {}

        for field_file in ['U', 'p', 'k', 'epsilon']:
            filepath = timestep_dir / field_file
            if filepath.exists():
                results[field_file] = self.parse_openfoam_field(filepath)

        return results

    def generate_summary(self) -> Dict[str, Any]:
        timesteps = []
        all_stats = {}

        for item in self.result_path.iterdir():
            if item.is_dir():
                try:
                    t = float(item.name)
                    if t > 0:
                        timesteps.append(t)
                except ValueError:
                    continue

        timesteps.sort()

        if timesteps:
            latest_timestep = self.result_path / str(timesteps[-1])
            if latest_timestep.exists():
                all_stats = self.analyze_timestep(latest_timestep)

        self.summary = {
            'result_path': str(self.result_path),
            'total_timesteps': len(timesteps),
            'timesteps': timesteps,
            'final_timestep': timesteps[-1] if timesteps else 0,
            'field_stats': all_stats,
        }

        return self.summary

    def export_json(self, output_path: str):
        with open(output_path, 'w') as f:
            json.dump(self.summary, f, indent=2)

    def export_csv(self, output_path: str):
        import csv

        rows = []
        for field, stats in self.summary.get('field_stats', {}).items():
            rows.append({
                'field': field,
                'min': stats['stats']['min'],
                'max': stats['stats']['max'],
                'avg': stats['stats']['avg'],
                'std': stats['stats']['std'],
            })

        with open(output_path, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=['field', 'min', 'max', 'avg', 'std'])
            writer.writeheader()
            writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(description='CFD Result Post-processor')
    parser.add_argument('result_path', help='Path to the simulation results')
    parser.add_argument('--output-json', help='Output JSON file path')
    parser.add_argument('--output-csv', help='Output CSV file path')
    
    args = parser.parse_args()

    analyzer = ResultAnalyzer(args.result_path)
    summary = analyzer.generate_summary()

    print(json.dumps(summary, indent=2))

    if args.output_json:
        analyzer.export_json(args.output_json)
        print(f"JSON summary exported to {args.output_json}")

    if args.output_csv:
        analyzer.export_csv(args.output_csv)
        print(f"CSV summary exported to {args.output_csv}")

    return 0


if __name__ == '__main__':
    sys.exit(main())
