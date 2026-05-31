#!/usr/bin/env python3

import sys
import os
import json
import argparse
import subprocess
import shutil
from pathlib import Path
from typing import Dict, Any, List


class CFDSimulator:
    def __init__(self, case_path: str):
        self.case_path = Path(case_path)
        self.case_json = self._load_case_json()

    def _load_case_json(self) -> Dict[str, Any]:
        case_file = self.case_path / 'case.json'
        if case_file.exists():
            with open(case_file, 'r') as f:
                return json.load(f)
        return {}

    def generate_mesh(self) -> bool:
        try:
            result = subprocess.run(
                ['blockMesh'],
                cwd=self.case_path,
                capture_output=True,
                text=True,
                timeout=3600
            )
            if result.returncode != 0:
                print(f"Mesh generation failed: {result.stderr}", file=sys.stderr)
                return False
            print("Mesh generated successfully")
            return True
        except Exception as e:
            print(f"Mesh generation error: {e}", file=sys.stderr)
            return False

    def decompose_case(self, num_procs: int) -> bool:
        try:
            decompose_dict = f"""FoamFile
{{
    version     2.0;
    format      ascii;
    class       dictionary;
    location    "system";
    object      decomposeParDict;
}}

numberOfSubdomains {num_procs};

method          scotch;
"""
            system_dir = self.case_path / 'system'
            system_dir.mkdir(exist_ok=True)
            
            with open(system_dir / 'decomposeParDict', 'w') as f:
                f.write(decompose_dict)

            result = subprocess.run(
                ['decomposePar'],
                cwd=self.case_path,
                capture_output=True,
                text=True,
                timeout=600
            )
            if result.returncode != 0:
                print(f"Case decomposition failed: {result.stderr}", file=sys.stderr)
                return False
            print(f"Case decomposed into {num_procs} subdomains")
            return True
        except Exception as e:
            print(f"Case decomposition error: {e}", file=sys.stderr)
            return False

    def run_solver(self, solver: str, parallel: bool = False, num_procs: int = 1) -> bool:
        try:
            cmd = []
            if parallel and num_procs > 1:
                cmd = ['mpirun', '-np', str(num_procs), solver, '-parallel']
            else:
                cmd = [solver]

            print(f"Running solver: {' '.join(cmd)}")
            
            process = subprocess.Popen(
                cmd,
                cwd=self.case_path,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True
            )

            for line in process.stdout:
                print(line, end='')
                sys.stdout.flush()

            process.wait()
            
            if process.returncode != 0:
                print(f"Solver failed with return code {process.returncode}", file=sys.stderr)
                return False
            
            print("Simulation completed successfully")
            return True
        except Exception as e:
            print(f"Solver error: {e}", file=sys.stderr)
            return False

    def reconstruct_case(self) -> bool:
        try:
            result = subprocess.run(
                ['reconstructPar'],
                cwd=self.case_path,
                capture_output=True,
                text=True,
                timeout=600
            )
            if result.returncode != 0:
                print(f"Case reconstruction failed: {result.stderr}", file=sys.stderr)
                return False
            print("Case reconstructed successfully")
            return True
        except Exception as e:
            print(f"Case reconstruction error: {e}", file=sys.stderr)
            return False

    def get_timesteps(self) -> List[float]:
        timesteps = []
        for item in self.case_path.iterdir():
            if item.is_dir():
                try:
                    t = float(item.name)
                    if t > 0:
                        timesteps.append(t)
                except ValueError:
                    continue
        return sorted(timesteps)

    def get_variables(self) -> List[str]:
        variables = ['U', 'p']
        timesteps = self.get_timesteps()
        if timesteps:
            latest_dir = self.case_path / str(timesteps[-1])
            if latest_dir.exists():
                for f in latest_dir.iterdir():
                    if f.is_file() and f.name not in variables:
                        variables.append(f.name)
        return variables

    def cleanup(self):
        processor_dirs = list(self.case_path.glob('processor*'))
        for d in processor_dirs:
            shutil.rmtree(d, ignore_errors=True)


def main():
    parser = argparse.ArgumentParser(description='CFD Simulation Runner')
    parser.add_argument('case_path', help='Path to the OpenFOAM case directory')
    parser.add_argument('--solver', default='interFoam', help='Solver to use')
    parser.add_argument('--parallel', action='store_true', help='Run in parallel')
    parser.add_argument('--num-procs', type=int, default=4, help='Number of processes')
    parser.add_argument('--no-mesh', action='store_true', help='Skip mesh generation')
    parser.add_argument('--no-reconstruct', action='store_true', help='Skip reconstruction')
    
    args = parser.parse_args()

    simulator = CFDSimulator(args.case_path)

    if not args.no_mesh:
        if not simulator.generate_mesh():
            sys.exit(1)

    if args.parallel and args.num_procs > 1:
        if not simulator.decompose_case(args.num_procs):
            sys.exit(1)

    if not simulator.run_solver(args.solver, args.parallel, args.num_procs):
        sys.exit(1)

    if args.parallel and not args.no_reconstruct:
        if not simulator.reconstruct_case():
            sys.exit(1)

    timesteps = simulator.get_timesteps()
    variables = simulator.get_variables()
    
    result_info = {
        'success': True,
        'case_path': args.case_path,
        'timesteps': timesteps,
        'variables': variables,
        'num_timesteps': len(timesteps),
    }
    
    print(json.dumps(result_info, indent=2))

    return 0


if __name__ == '__main__':
    sys.exit(main())
