import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { CFDParameters } from '../types';
import logger from '../utils/logger';
import config from '../config';

const execAsync = promisify(exec);

export interface ComputeResult {
  success: boolean;
  outputPath: string;
  variables: string[];
  timesteps: number[];
  error?: string;
  metadata?: Record<string, any>;
}

class ComputeKernel {
  private static instance: ComputeKernel;
  private solverPath: string;
  private scriptsPath: string;

  private constructor() {
    this.solverPath = config.cfd.solverPath;
    this.scriptsPath = config.cfd.scriptsPath;
  }

  static getInstance(): ComputeKernel {
    if (!ComputeKernel.instance) {
      ComputeKernel.instance = new ComputeKernel();
    }
    return ComputeKernel.instance;
  }

  async generateCaseDirectory(
    parameters: CFDParameters,
    casePath: string
  ): Promise<void> {
    await fs.mkdir(casePath, { recursive: true });

    const caseDict = this.generateCaseDict(parameters);
    await fs.writeFile(path.join(casePath, 'case.json'), JSON.stringify(caseDict, null, 2));

    const blockMeshDict = this.generateBlockMeshDict(parameters);
    await fs.mkdir(path.join(casePath, 'system'), { recursive: true });
    await fs.writeFile(path.join(casePath, 'system', 'blockMeshDict'), blockMeshDict);

    const controlDict = this.generateControlDict(parameters);
    await fs.writeFile(path.join(casePath, 'system', 'controlDict'), controlDict);

    const fvSchemes = this.generateFvSchemes(parameters);
    await fs.writeFile(path.join(casePath, 'system', 'fvSchemes'), fvSchemes);

    const fvSolution = this.generateFvSolution(parameters);
    await fs.writeFile(path.join(casePath, 'system', 'fvSolution'), fvSolution);

    await fs.mkdir(path.join(casePath, 'constant'), { recursive: true });
    const transportProperties = this.generateTransportProperties(parameters);
    await fs.writeFile(path.join(casePath, 'constant', 'transportProperties'), transportProperties);

    await fs.mkdir(path.join(casePath, '0'), { recursive: true });
    const initialConditions = this.generateInitialConditions(parameters);
    await fs.writeFile(path.join(casePath, '0', 'U'), initialConditions.U);
    await fs.writeFile(path.join(casePath, '0', 'p'), initialConditions.p);

    if (parameters.phases.length > 1) {
      for (let i = 1; i < parameters.phases.length; i++) {
        const phase = parameters.phases[i];
        const alphaFile = this.generateAlphaField(phase, parameters);
        await fs.writeFile(path.join(casePath, '0', `alpha.${phase.name}`), alphaFile);
      }
    }

    logger.info(`Generated case directory: ${casePath}`);
  }

  private generateCaseDict(parameters: CFDParameters): Record<string, any> {
    return {
      domain: parameters.domain,
      mesh: parameters.mesh,
      phases: parameters.phases,
      boundaryConditions: parameters.boundaryConditions,
      simulation: parameters.simulation,
    };
  }

  private generateBlockMeshDict(parameters: CFDParameters): string {
    const { domain, mesh } = parameters;
    const nx = mesh.xCells;
    const ny = mesh.yCells;
    const nz = mesh.zCells;

    return `FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
    object      blockMeshDict;
}

convertToMeters 1;

vertices
(
    (${domain.xMin} ${domain.yMin} ${domain.zMin})
    (${domain.xMax} ${domain.yMin} ${domain.zMin})
    (${domain.xMax} ${domain.yMax} ${domain.zMin})
    (${domain.xMin} ${domain.yMax} ${domain.zMin})
    (${domain.xMin} ${domain.yMin} ${domain.zMax})
    (${domain.xMax} ${domain.yMin} ${domain.zMax})
    (${domain.xMax} ${domain.yMax} ${domain.zMax})
    (${domain.xMin} ${domain.yMax} ${domain.zMax})
);

blocks
(
    hex (0 1 2 3 4 5 6 7) (${nx} ${ny} ${nz}) simpleGrading (1 1 1)
);

edges
(
);

boundary
(
    inlet
    {
        type patch;
        faces
        (
            (0 3 7 4)
        );
    }
    outlet
    {
        type patch;
        faces
        (
            (2 1 5 6)
        );
    }
    walls
    {
        type wall;
        faces
        (
            (0 1 2 3)
            (4 5 6 7)
            (0 4 5 1)
            (3 2 6 7)
        );
    }
);

mergePatchPairs
(
);
`;
  }

  private generateControlDict(parameters: CFDParameters): string {
    const { simulation } = parameters;
    const cfl = this.calculateMaxCFL(parameters);
    const adjustedTimeStep = Math.min(simulation.timeStep, cfl);

    return `FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
    location    "system";
    object      controlDict;
}

application     ${simulation.solver};

startFrom       startTime;

startTime       ${simulation.startTime};

stopAt          endTime;

endTime         ${simulation.endTime};

deltaT          ${adjustedTimeStep};

writeControl    timeStep;

writeInterval   ${simulation.writeInterval};

purgeWrite      0;

writeFormat     ascii;

writePrecision  12;

writeCompression off;

timeFormat      general;

timePrecision   12;

runTimeModifiable true;

adjustTimeStep  yes;

maxCo           0.5;

maxAlphaCo      0.2;

maxDeltaT       ${simulation.timeStep * 5};
`;
  }

  private calculateMaxCFL(parameters: CFDParameters): number {
    const { mesh, boundaryConditions } = parameters;
    const { xMin, xMax, yMin, yMax, zMin, zMax } = parameters.domain;
    
    const dx = (xMax - xMin) / mesh.xCells;
    const dy = (yMax - yMin) / mesh.yCells;
    const dz = (zMax - zMin) / mesh.zCells;
    
    const minCellSize = Math.min(dx, dy, dz);
    
    const inletVel = boundaryConditions.inlet?.velocity;
    const velocityMagnitude = inletVel 
      ? Math.sqrt(inletVel.x ** 2 + inletVel.y ** 2 + inletVel.z ** 2)
      : 1.0;
    
    if (velocityMagnitude <= 0) return parameters.simulation.timeStep;
    
    const cflLimit = 0.5;
    const maxTimeStep = (cflLimit * minCellSize) / velocityMagnitude;
    
    return Math.min(maxTimeStep, parameters.simulation.timeStep);
  }

  private generateFvSchemes(parameters: CFDParameters): string {
    const turbulenceModel = parameters.simulation.turbulenceModel;
    const isMultiphase = parameters.phases.length > 1;
    
    let divSchemes = `
    default         none;
    div(phi,U)      Gauss limitedLinearV 1;
    div(phi,k)      Gauss limitedLinear 1;
    div(phi,epsilon) Gauss limitedLinear 1;
    div(phi,omega)  Gauss limitedLinear 1;
    div(phi,R)      Gauss limitedLinear 1;
    div(R)          Gauss linear;
    div(phi,nuTilda) Gauss limitedLinear 1;
    div((nuEff*dev2(T(grad(U))))) Gauss linear corrected;
`;

    if (isMultiphase) {
      for (const phase of parameters.phases) {
        divSchemes += `    div(phi,alpha.${phase.name}) Gauss vanLeer;
`;
      }
    }

    return `FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
    location    "system";
    object      fvSchemes;
}

ddtSchemes
{
    default         backward;
}

gradSchemes
{
    default         Gauss linear corrected;
    grad(U)         Gauss linear corrected;
    grad(p)         Gauss linear corrected;
}

divSchemes
{${divSchemes}}

laplacianSchemes
{
    default         Gauss linear corrected;
}

interpolationSchemes
{
    default         linear;
    reconstruct(U)  pointLinear;
    reconstruct(p)  pointLinear;
}

snGradSchemes
{
    default         corrected;
}

wallDist
{
    method          meshWave;
}

fluxRequired
{
    default         no;
    p               ;
    pcorr           ;
}
`;
  }

  private generateFvSolution(parameters: CFDParameters): string {
    const isTransient = parameters.simulation.solver !== 'simpleFoam';
    const isMultiphase = parameters.phases.length > 1;
    const isLES = parameters.simulation.turbulenceModel === 'LES';

    let solverSection = `solvers
{
    p
    {
        solver          GAMG;
        smoother        GaussSeidel;
        tolerance       1e-10;
        relTol          0.001;
        maxIter         200;

        cacheAgglomeration true;

        agglomerator    faceAreaPair;
        nCellsInCoarsestLevel 10;
        mergeLevels     1;

        interpolateCells      yes;
        interpolateFaces      yes;
    }

    pFinal
    {
        $p;
        tolerance       1e-10;
        relTol          0;
    }

    pCorr
    {
        $p;
        tolerance       1e-05;
        relTol          0.1;
    }

    U
    {
        solver          PBiCGStab;
        preconditioner  DILU;
        tolerance       1e-10;
        relTol          0;
        minIter         1;
        maxIter         1000;
    }

    UFinal
    {
        $U;
        tolerance       1e-10;
        relTol          0;
    }

    k
    {
        solver          PBiCGStab;
        preconditioner  DILU;
        tolerance       1e-10;
        relTol          0.01;
    }

    epsilon
    {
        solver          PBiCGStab;
        preconditioner  DILU;
        tolerance       1e-10;
        relTol          0.01;
    }

    omega
    {
        solver          PBiCGStab;
        preconditioner  DILU;
        tolerance       1e-10;
        relTol          0.01;
    }

    nuTilda
    {
        solver          PBiCGStab;
        preconditioner  DILU;
        tolerance       1e-10;
        relTol          0;
    }

    R
    {
        solver          PBiCGStab;
        preconditioner  DILU;
        tolerance       1e-10;
        relTol          0;
    }`;

    if (isMultiphase) {
      solverSection += `

    "alpha.*"
    {
        solver          MULES;
        nAlphaSweep     2;
        nAlphaCorr      2;
        cAlpha          1;
        icAlpha         0;
    }

    alphaPhi.* 
    {
        solver          PBiCGStab;
        preconditioner  DILU;
        tolerance       1e-10;
        relTol          0;
    }`;
    }

    solverSection += `
}`;

    let algorithmSection = '';
    if (!isTransient) {
      algorithmSection = `SIMPLE
{
    nNonOrthogonalCorrectors 3;
    pRefCell        0;
    pRefValue       0;

    consistent      yes;

    residualControl
    {
        p               1e-06;
        U               1e-07;
        "(k|epsilon|omega)" 1e-07;
    }
}`;
    } else if (isMultiphase) {
      algorithmSection = `PIMPLE
{
    momentumPredictor   yes;
    transonic           no;
    nOuterCorrectors    ${isLES ? 3 : 2};
    nInnerCorrectors    3;
    nNonOrthogonalCorrectors 2;
    pRefCell            0;
    pRefValue           0;

    correctPhi          yes;

    nAlphaCorr          2;
    nAlphaSweep         2;

    maxCo               0.5;
    maxAlphaCo          0.2;

    turbOnFinalIterOnly no;

    residualControl
    {
        p                   1e-06;
        U                   1e-07;
        "(k|epsilon|omega)" 1e-07;
    }
}`;
    } else {
      algorithmSection = `PIMPLE
{
    momentumPredictor   yes;
    transonic           no;
    nOuterCorrectors    ${isLES ? 3 : 1};
    nInnerCorrectors    3;
    nNonOrthogonalCorrectors 2;
    pRefCell            0;
    pRefValue           0;

    correctPhi          yes;

    turbOnFinalIterOnly no;

    residualControl
    {
        p                   1e-06;
        U                   1e-07;
        "(k|epsilon|omega)" 1e-07;
    }
}`;
    }

    return `FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
    location    "system";
    object      fvSolution;
}

${solverSection}

${algorithmSection}

relaxationFactors
{
    fields
    {
        p               0.3;
        pFinal          1;
    }
    equations
    {
        U               0.7;
        UFinal          1;
        k               0.7;
        kFinal          1;
        epsilon         0.7;
        epsilonFinal    1;
        omega           0.7;
        omegaFinal      1;
        "alpha.*"       1;
    }
}

cache
{
    grad(U);
    grad(k);
    grad(epsilon);
    grad(omega);
}
`;
  }

  private generateTransportProperties(parameters: CFDParameters): string {
    let content = `FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
    location    "constant";
    object      transportProperties;
}

transportModel  Newtonian;
`;

    parameters.phases.forEach((phase) => {
      content += `
${phase.name}
{
    transportModel  Newtonian;
    nu              nu [0 2 -1 0 0 0 0] ${phase.viscosity};
    rho             rho [1 -3 0 0 0 0 0] ${phase.density};
}
`;
    });

    return content;
  }

  private generateInitialConditions(parameters: CFDParameters): { U: string; p: string } {
    const U = `FoamFile
{
    version     2.0;
    format      ascii;
    class       volVectorField;
    location    "0";
    object      U;
}

dimensions      [0 1 -1 0 0 0 0];

internalField   uniform (0 0 0);

boundaryField
{
    inlet
    {
        type            fixedValue;
        value           uniform (${parameters.boundaryConditions.inlet?.velocity.x || 1} ${parameters.boundaryConditions.inlet?.velocity.y || 0} ${parameters.boundaryConditions.inlet?.velocity.z || 0});
    }
    outlet
    {
        type            zeroGradient;
    }
    walls
    {
        type            noSlip;
    }
}
`;

    const p = `FoamFile
{
    version     2.0;
    format      ascii;
    class       volScalarField;
    location    "0";
    object      p;
}

dimensions      [0 2 -2 0 0 0 0];

internalField   uniform ${parameters.boundaryConditions.outlet?.pressure || 0};

boundaryField
{
    inlet
    {
        type            zeroGradient;
    }
    outlet
    {
        type            fixedValue;
        value           uniform ${parameters.boundaryConditions.outlet?.pressure || 0};
    }
    walls
    {
        type            zeroGradient;
    }
}
`;

    return { U, p };
  }

  private generateAlphaField(phase: any, parameters: CFDParameters): string {
    return `FoamFile
{
    version     2.0;
    format      ascii;
    class       volScalarField;
    location    "0";
    object      alpha.${phase.name};
}

dimensions      [0 0 0 0 0 0 0];

internalField   uniform ${phase.volumeFraction || 0};

boundaryField
{
    inlet
    {
        type            fixedValue;
        value           uniform ${phase.volumeFraction || 0};
    }
    outlet
    {
        type            zeroGradient;
    }
    walls
    {
        type            zeroGradient;
    }
}
`;
  }

  async runSimulation(
    casePath: string,
    solver: string,
    onProgress?: (progress: number, message: string) => void,
    checkpointInterval: number = 0,
    onCheckpoint?: (time: number, path: string) => void
  ): Promise<ComputeResult> {
    return new Promise((resolve) => {
      logger.info(`Starting simulation: ${solver} in ${casePath}`);

      const startTime = Date.now();
      let hasError = false;
      let errorMessage = '';
      let lastCheckpointTime = 0;

      const solverProcess = spawn(solver, [], {
        cwd: casePath,
        env: { ...process.env, PATH: `${this.solverPath}/bin:${process.env.PATH}` },
      });

      solverProcess.stdout.on('data', (data) => {
        const output = data.toString();
        logger.debug(`Solver output: ${output}`);

        const timeMatch = output.match(/Time = ([\d.]+)/);
        if (timeMatch && onProgress) {
          const currentTime = parseFloat(timeMatch[1]);
          const { endTime } = this.parseCaseEndTime(casePath);
          const progress = endTime > 0 ? (currentTime / endTime) * 100 : 0;
          onProgress(progress, output.slice(0, 100));

          if (checkpointInterval > 0 && onCheckpoint) {
            if (currentTime - lastCheckpointTime >= checkpointInterval) {
              lastCheckpointTime = currentTime;
              const checkpointPath = path.join(casePath, 'checkpoints', currentTime.toString());
              onCheckpoint(currentTime, checkpointPath);
            }
          }
        }
      });

      solverProcess.stderr.on('data', (data) => {
        const output = data.toString();
        if (output.toLowerCase().includes('error') || output.toLowerCase().includes('fatal')) {
          hasError = true;
          errorMessage += output;
        }
        logger.error(`Solver stderr: ${output}`);
      });

      solverProcess.on('close', async (code) => {
        const duration = (Date.now() - startTime) / 1000;

        if (code !== 0 || hasError) {
          resolve({
            success: false,
            outputPath: casePath,
            variables: [],
            timesteps: [],
            error: errorMessage || `Solver exited with code ${code}`,
          });
          return;
        }

        try {
          const result = await this.parseResults(casePath);
          result.metadata = { ...result.metadata, duration };
          logger.info(`Simulation completed in ${duration.toFixed(2)}s: ${casePath}`);
          resolve(result);
        } catch (err) {
          resolve({
            success: false,
            outputPath: casePath,
            variables: [],
            timesteps: [],
            error: (err as Error).message,
          });
        }
      });

      solverProcess.on('error', (err) => {
        logger.error(`Solver process error: ${err.message}`);
        resolve({
          success: false,
          outputPath: casePath,
          variables: [],
          timesteps: [],
          error: err.message,
        });
      });
    });
  }

  async resumeFromCheckpoint(
    casePath: string,
    solver: string,
    checkpointTime: number,
    onProgress?: (progress: number, message: string) => void
  ): Promise<ComputeResult> {
    const checkpointDir = path.join(casePath, checkpointTime.toString());
    
    try {
      await fs.access(checkpointDir);
    } catch {
      throw new Error(`Checkpoint directory not found: ${checkpointTime}`);
    }

    const controlDictPath = path.join(casePath, 'system', 'controlDict');
    let controlDict = await fs.readFile(controlDictPath, 'utf-8');

    controlDict = controlDict.replace(
      /startFrom\s+\w+;/,
      `startFrom       startTime;`
    );
    controlDict = controlDict.replace(
      /startTime\s+[^;]+;/,
      `startTime       ${checkpointTime};`
    );

    await fs.writeFile(controlDictPath, controlDict);

    logger.info(`Resuming simulation from checkpoint at t=${checkpointTime}`);
    return this.runSimulation(casePath, solver, onProgress);
  }

  private parseCaseEndTime(casePath: string): { endTime: number } {
    try {
      const controlDict = require('fs').readFileSync(
        path.join(casePath, 'system', 'controlDict'),
        'utf-8'
      );
      const match = controlDict.match(/endTime\s+([^;]+);/);
      return { endTime: match ? parseFloat(match[1]) : 1 };
    } catch {
      return { endTime: 1 };
    }
  }

  async saveCheckpoint(
    casePath: string,
    currentTime: number
  ): Promise<string> {
    const checkpointBase = path.join(casePath, 'checkpoints');
    await fs.mkdir(checkpointBase, { recursive: true });

    const checkpointPath = path.join(checkpointBase, currentTime.toString());
    const sourceTimePath = path.join(casePath, currentTime.toString());

    try {
      await fs.access(sourceTimePath);
      await this.copyDirectory(sourceTimePath, checkpointPath);

      const systemDir = path.join(casePath, 'system');
      const constantDir = path.join(casePath, 'constant');
      
      const targetSystem = path.join(checkpointPath, 'system');
      const targetConstant = path.join(checkpointPath, 'constant');
      
      try {
        await this.copyDirectory(systemDir, targetSystem);
      } catch {}
      try {
        await this.copyDirectory(constantDir, targetConstant);
      } catch {}

      const checkpointMeta = {
        time: currentTime,
        savedAt: new Date().toISOString(),
        casePath,
      };
      await fs.writeFile(
        path.join(checkpointPath, '.checkpoint'),
        JSON.stringify(checkpointMeta, null, 2)
      );

      logger.info(`Checkpoint saved at t=${currentTime}`);
      return checkpointPath;
    } catch (error) {
      logger.error(`Failed to save checkpoint: ${(error as Error).message}`);
      throw error;
    }
  }

  async getAvailableCheckpoints(casePath: string): Promise<Array<{
    time: number;
    path: string;
    savedAt?: string;
  }>> {
    const checkpoints: Array<{ time: number; path: string; savedAt?: string }> = [];
    const checkpointBase = path.join(casePath, 'checkpoints');

    try {
      await fs.access(checkpointBase);
      const entries = await fs.readdir(checkpointBase);

      for (const entry of entries) {
        const num = parseFloat(entry);
        if (!isNaN(num) && num > 0) {
          const checkpointPath = path.join(checkpointBase, entry);
          let savedAt: string | undefined;

          try {
            const meta = await fs.readFile(path.join(checkpointPath, '.checkpoint'), 'utf-8');
            const parsed = JSON.parse(meta);
            savedAt = parsed.savedAt;
          } catch {}

          checkpoints.push({ time: num, path: checkpointPath, savedAt });
        }
      }

      checkpoints.sort((a, b) => b.time - a.time);

      const timeDirs = await this.findTimeDirectories(casePath);
      for (const time of timeDirs) {
        const alreadyExists = checkpoints.some(c => c.time === time);
        if (!alreadyExists) {
          checkpoints.push({
            time,
            path: path.join(casePath, time.toString()),
          });
        }
      }
    } catch {}

    return checkpoints;
  }

  private async findTimeDirectories(casePath: string): Promise<number[]> {
    const times: number[] = [];
    try {
      const entries = await fs.readdir(casePath);
      for (const entry of entries) {
        if (entry === 'checkpoints' || entry === 'system' || entry === 'constant' || entry === '0') continue;
        const num = parseFloat(entry);
        if (!isNaN(num) && num > 0) {
          times.push(num);
        }
      }
    } catch {}
    return times.sort((a, b) => b - a);
  }

  async parseResults(casePath: string): Promise<ComputeResult> {
    const timesteps: number[] = [];
    const variables: string[] = ['U', 'p'];

    const items = await fs.readdir(casePath);
    for (const item of items) {
      const num = parseFloat(item);
      if (!isNaN(num) && num > 0) {
        timesteps.push(num);
      }
    }
    timesteps.sort((a, b) => a - b);

    const validation = await this.validateResults(casePath, timesteps, variables);

    return {
      success: true,
      outputPath: casePath,
      variables,
      timesteps,
      metadata: {
        timestepCount: timesteps.length,
        validation,
      },
    };
  }

  private async validateResults(
    casePath: string,
    timesteps: number[],
    variables: string[]
  ): Promise<Record<string, any>> {
    const validation: Record<string, any> = {
      timestepCount: timesteps.length,
      variableChecks: {},
      statistics: {},
      overallQuality: 'good',
    };

    if (timesteps.length === 0) {
      validation.overallQuality = 'failed';
      validation.error = 'No timesteps found';
      return validation;
    }

    const expectedTimesteps = this.getExpectedTimesteps(timesteps);
    validation.expectedTimesteps = expectedTimesteps.length;
    validation.missingTimesteps = expectedTimesteps.length - timesteps.length;

    if (validation.missingTimesteps > 0) {
      validation.overallQuality = 'warning';
      validation.warnings = [`Missing ${validation.missingTimesteps} timesteps`];
    }

    const latestTimestep = Math.max(...timesteps);
    const timestepPath = path.join(casePath, latestTimestep.toString());

    for (const variable of variables) {
      const filePath = path.join(timestepPath, variable);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const stats = this.analyzeFieldData(content, variable);
        validation.variableChecks[variable] = {
          exists: true,
          fileSize: content.length,
          statistics: stats,
        };

        if (stats.hasNaN || stats.hasInf) {
          validation.overallQuality = 'failed';
          validation.error = `Invalid values found in ${variable}`;
        }

        validation.statistics[variable] = stats;
      } catch (error) {
        validation.variableChecks[variable] = {
          exists: false,
          error: (error as Error).message,
        };
      }
    }

    validation.checksum = await this.calculateDirectoryChecksum(casePath);

    return validation;
  }

  private getExpectedTimesteps(timesteps: number[]): number[] {
    if (timesteps.length < 2) return timesteps;

    const sorted = [...timesteps].sort((a, b) => a - b);
    const dt = sorted[1] - sorted[0];
    const startTime = sorted[0];
    const endTime = sorted[sorted.length - 1];
    
    const expected: number[] = [];
    for (let t = startTime; t <= endTime; t += dt) {
      expected.push(Math.round(t * 1e12) / 1e12);
    }
    
    return expected;
  }

  private analyzeFieldData(content: string, variable: string): Record<string, any> {
    const stats: Record<string, any> = {
      hasNaN: false,
      hasInf: false,
      min: Infinity,
      max: -Infinity,
      mean: 0,
    };

    const valueMatch = content.match(/internalField\s+nonuniform\s+List<scalar>\s+(\d+)\s*\(([^)]+)\)/);
    if (valueMatch) {
      const values = valueMatch[2].trim().split(/\s+/).map(Number);
      const validValues = values.filter(v => {
        if (isNaN(v)) { stats.hasNaN = true; return false; }
        if (!isFinite(v)) { stats.hasInf = true; return false; }
        return true;
      });

      if (validValues.length > 0) {
        stats.min = Math.min(...validValues);
        stats.max = Math.max(...validValues);
        stats.mean = validValues.reduce((a, b) => a + b, 0) / validValues.length;
        stats.count = validValues.length;
      }
    }

    const vectorMatch = content.match(/internalField\s+nonuniform\s+List<vector>\s+(\d+)\s*\(([^)]+)\)/s);
    if (vectorMatch) {
      const values = vectorMatch[2].trim().match(/-?[\d.e+-]+/g)?.map(Number) || [];
      const magnitudes: number[] = [];
      
      for (let i = 0; i < values.length; i += 3) {
        const [x, y, z] = values.slice(i, i + 3);
        if (isNaN(x) || isNaN(y) || isNaN(z)) { stats.hasNaN = true; continue; }
        if (!isFinite(x) || !isFinite(y) || !isFinite(z)) { stats.hasInf = true; continue; }
        magnitudes.push(Math.sqrt(x * x + y * y + z * z));
      }

      if (magnitudes.length > 0) {
        stats.min = Math.min(...magnitudes);
        stats.max = Math.max(...magnitudes);
        stats.mean = magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length;
        stats.count = magnitudes.length;
      }
    }

    return stats;
  }

  private async calculateDirectoryChecksum(dirPath: string): Promise<string> {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256');

    const files = await this.getAllFiles(dirPath);
    for (const file of files.sort()) {
      const stat = await fs.stat(file);
      const relativePath = path.relative(dirPath, file);
      hash.update(`${relativePath}:${stat.size}:${stat.mtimeMs}`);
    }

    return hash.digest('hex');
  }

  private async getAllFiles(dirPath: string, files: string[] = []): Promise<string[]> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        await this.getAllFiles(fullPath, files);
      } else {
        files.push(fullPath);
      }
    }
    
    return files;
  }

  private async copyDirectory(source: string, destination: string): Promise<void> {
    await fs.mkdir(destination, { recursive: true });
    const entries = await fs.readdir(source, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(source, entry.name);
      const destPath = path.join(destination, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  async runMeshGeneration(casePath: string): Promise<boolean> {
    try {
      await execAsync('blockMesh', { cwd: casePath });
      return true;
    } catch (error) {
      logger.error(`Mesh generation failed: ${(error as Error).message}`);
      return false;
    }
  }

  async decomposeCase(casePath: string, numProcs: number): Promise<boolean> {
    try {
      const decomposeDict = `FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
    location    "system";
    object      decomposeParDict;
}

numberOfSubdomains ${numProcs};

method          scotch;
`;
      await fs.writeFile(path.join(casePath, 'system', 'decomposeParDict'), decomposeDict);
      await execAsync('decomposePar', { cwd: casePath });
      return true;
    } catch (error) {
      logger.error(`Case decomposition failed: ${(error as Error).message}`);
      return false;
    }
  }

  async reconstructCase(casePath: string): Promise<boolean> {
    try {
      await execAsync('reconstructPar', { cwd: casePath });
      return true;
    } catch (error) {
      logger.error(`Case reconstruction failed: ${(error as Error).message}`);
      return false;
    }
  }

  async cleanupCase(casePath: string): Promise<void> {
    try {
      await fs.rm(casePath, { recursive: true, force: true });
      logger.info(`Cleaned up case directory: ${casePath}`);
    } catch (error) {
      logger.error(`Failed to cleanup case: ${(error as Error).message}`);
    }
  }

  getEstimatedDuration(parameters: CFDParameters): number {
    const { mesh, simulation } = parameters;
    const cellCount = mesh.xCells * mesh.yCells * mesh.zCells;
    const timeSteps = Math.ceil((simulation.endTime - simulation.startTime) / simulation.timeStep);

    const baseTimePerCell = 0.001;
    const estimatedSeconds = cellCount * timeSteps * baseTimePerCell;

    return Math.ceil(estimatedSeconds);
  }
}

export default ComputeKernel.getInstance();
