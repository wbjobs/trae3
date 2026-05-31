import type {
  CalculationParameters,
  CalculationResult,
  ResultMetadata,
  LoadCondition,
  BoundaryCondition,
  SoilProperties,
  ConvergenceState,
  MeshRefinementSuggestion,
  DuncanChangParameters
} from '../../shared/types';

interface GridNode {
  x: number;
  y: number;
  id: number;
}

interface CalculationState {
  displacementField: number[][];
  stressField: number[][];
  residual: number;
  strainEnergy: number;
  iteration: number;
}

interface TimeStepRecord {
  stepSize: number;
  error: number;
  iterations: number;
  converged: boolean;
}

class AdaptiveTimeStepper {
  private currentStep: number;
  private targetError: number;
  private maxStep: number;
  private minStep: number;
  private initialStep: number;
  private lastErrors: number[] = [];
  private adjustmentCount: number = 0;

  constructor(
    initialStep: number,
    targetError: number = 1e-6,
    maxStep?: number,
    minStep?: number
  ) {
    this.currentStep = initialStep;
    this.targetError = targetError;
    this.initialStep = initialStep;
    this.maxStep = maxStep || initialStep * 2;
    this.minStep = minStep || initialStep / 16;
  }

  estimateError(currentState: CalculationState, previousState: CalculationState): number {
    const { displacementField: currDisp, stressField: currStress } = currentState;
    const { displacementField: prevDisp, stressField: prevStress } = previousState;

    let dispChange = 0;
    let dispNorm = 0;
    for (let i = 0; i < currDisp.length; i++) {
      const dx = currDisp[i][0] - prevDisp[i][0];
      const dy = currDisp[i][1] - prevDisp[i][1];
      dispChange += dx * dx + dy * dy;
      dispNorm += currDisp[i][0] * currDisp[i][0] + currDisp[i][1] * currDisp[i][1];
    }
    const dispRelative = dispNorm > 0 ? Math.sqrt(dispChange) / Math.sqrt(dispNorm) : Math.sqrt(dispChange);

    let stressChange = 0;
    let stressNorm = 0;
    for (let i = 0; i < currStress.length; i++) {
      for (let j = 0; j < currStress[i].length; j++) {
        const ds = currStress[i][j] - prevStress[i][j];
        stressChange += ds * ds;
        stressNorm += currStress[i][j] * currStress[i][j];
      }
    }
    const stressRelative = stressNorm > 0 ? Math.sqrt(stressChange) / Math.sqrt(stressNorm) : Math.sqrt(stressChange);

    return Math.max(dispRelative, stressRelative);
  }

  estimateErrorRichardson(
    stateH: CalculationState,
    stateH2: CalculationState,
    order: number = 2
  ): number {
    const { displacementField: dispH, stressField: stressH } = stateH;
    const { displacementField: dispH2, stressField: stressH2 } = stateH2;

    let errorEstimate = 0;
    let norm = 0;

    for (let i = 0; i < dispH.length; i++) {
      const dx = dispH[i][0] - dispH2[i][0];
      const dy = dispH[i][1] - dispH2[i][1];
      errorEstimate += dx * dx + dy * dy;
      norm += dispH[i][0] * dispH[i][0] + dispH[i][1] * dispH[i][1];
    }

    const richardsonFactor = 1 / (Math.pow(2, order) - 1);
    const relativeError = norm > 0 
      ? Math.sqrt(errorEstimate) * richardsonFactor / Math.sqrt(norm)
      : Math.sqrt(errorEstimate) * richardsonFactor;

    return relativeError;
  }

  adjustStepSize(currentError: number): number {
    this.lastErrors.push(currentError);
    if (this.lastErrors.length > 5) {
      this.lastErrors.shift();
    }

    const errorRatio = currentError / this.targetError;

    let newStep = this.currentStep;

    if (errorRatio > 1.5) {
      newStep = Math.max(this.currentStep * 0.5, this.minStep);
      this.adjustmentCount++;
    } else if (errorRatio < 1 / 3) {
      newStep = Math.min(this.currentStep * 2, this.maxStep);
      this.adjustmentCount++;
    }

    if (this.lastErrors.length >= 3) {
      const recentErrors = this.lastErrors.slice(-3);
      const increasing = recentErrors.every((e, i) => i === 0 || e > recentErrors[i - 1]);
      if (increasing) {
        newStep = Math.max(newStep * 0.75, this.minStep);
      }
    }

    const smoothingFactor = 0.8;
    newStep = smoothingFactor * newStep + (1 - smoothingFactor) * this.currentStep;

    this.currentStep = Math.max(Math.min(newStep, this.maxStep), this.minStep);

    return this.currentStep;
  }

  getCurrentStep(): number {
    return this.currentStep;
  }

  getAdjustmentCount(): number {
    return this.adjustmentCount;
  }

  reset(): void {
    this.currentStep = this.initialStep;
    this.lastErrors = [];
    this.adjustmentCount = 0;
  }
}

class DuncanChangModel {
  private params: DuncanChangParameters;
  private soilProperties: SoilProperties;
  private loadingHistory: { sigma1: number; sigma3: number }[] = [];
  private isUnloading: boolean = false;
  private previousStressRatio: number = 0;

  constructor(soilProperties: SoilProperties, customParams?: DuncanChangParameters) {
    this.soilProperties = soilProperties;
    this.params = {
      Ei: customParams?.Ei || soilProperties.youngModulus,
      Rf: customParams?.Rf || 0.85,
      K: customParams?.K || 500,
      n: customParams?.n || 0.5,
      Kur: customParams?.Kur || 1000,
      c: customParams?.c || soilProperties.cohesion,
      phi: customParams?.phi || soilProperties.frictionAngle,
      pa: customParams?.pa || 100
    };
  }

  computeFailureStress(sigma3: number): number {
    const phiRad = (this.params.phi! * Math.PI) / 180;
    const sinPhi = Math.sin(phiRad);
    const c = this.params.c!;
    const pa = this.params.pa!;

    const sigma1f = (2 * c * Math.cos(phiRad) + 2 * sigma3 * sinPhi) / (1 - sinPhi);
    return sigma1f - sigma3;
  }

  computeTangentModulus(sigma1: number, sigma3: number): number {
    const sigmaDiff = sigma1 - sigma3;
    const sigmaf = this.computeFailureStress(sigma3);
    const Rf = this.params.Rf!;
    const Ei = this.params.Ei!;

    const stressLevel = Math.min(sigmaDiff / sigmaf, 0.99);
    const Et = Ei * Math.pow(1 - Rf * stressLevel, 2);

    return Math.max(Et, Ei * 0.01);
  }

  computePoissonRatio(sigma1: number, sigma3: number): number {
    const sigmaDiff = Math.abs(sigma1 - sigma3);
    const sigmaf = this.computeFailureStress(sigma3);
    const baseNu = this.soilProperties.poissonRatio;

    const stressLevel = Math.min(sigmaDiff / sigmaf, 0.95);
    const nu = baseNu * (1 + 0.3 * stressLevel);

    return Math.min(nu, 0.49);
  }

  computeTangentBulkModulus(sigma3: number): number {
    const K = this.params.K!;
    const pa = this.params.pa!;
    const n = this.params.n!;

    const sigma3Norm = Math.max(sigma3 / pa, 0.01);
    return K * pa * Math.pow(sigma3Norm, n);
  }

  updateStressHistory(sigma1: number, sigma3: number): void {
    const currentStressRatio = sigma1 / Math.max(sigma3, 0.1);

    if (this.loadingHistory.length > 0) {
      const last = this.loadingHistory[this.loadingHistory.length - 1];
      const lastStressRatio = last.sigma1 / Math.max(last.sigma3, 0.1);
      this.isUnloading = currentStressRatio < lastStressRatio * 0.99;
    }

    this.previousStressRatio = currentStressRatio;
    this.loadingHistory.push({ sigma1, sigma3 });

    if (this.loadingHistory.length > 100) {
      this.loadingHistory.shift();
    }
  }

  getSecantModulus(sigma1: number, sigma3: number): number {
    if (this.isUnloading) {
      return this.params.Kur! * this.params.pa!;
    }
    return this.computeTangentModulus(sigma1, sigma3);
  }

  isCurrentlyUnloading(): boolean {
    return this.isUnloading;
  }

  reset(): void {
    this.loadingHistory = [];
    this.isUnloading = false;
    this.previousStressRatio = 0;
  }
}

export class CalculationKernel {
  private parameters: CalculationParameters;
  private grid: GridNode[][] = [];
  private stiffnessMatrix: number[][] = [];
  private displacementField: number[][] = [];
  private stressField: number[][] = [];
  private settlementField: number[][] = [];
  private boundaryConditions: BoundaryCondition[] = [];
  private loadConditions: LoadCondition[] = [];
  private soilProperties: SoilProperties;
  private gridSize: number;
  private timeSteps: number;
  private results: CalculationResult | null = null;
  private convergenceIterations: number[] = [];
  private timeStepHistory: number[] = [];
  private errorHistory: number[] = [];
  private residualHistory: number[] = [];
  private adaptiveStepCount: number = 0;
  private timeStepper: AdaptiveTimeStepper | null = null;
  private duncanChangModel: DuncanChangModel | null = null;
  private strainEnergy: number = 0;
  private previousStrainEnergy: number = 0;
  private residualIncreaseCount: number = 0;
  private lastResidual: number = Infinity;

  constructor(parameters: CalculationParameters) {
    this.parameters = parameters;
    this.soilProperties = parameters.soilProperties;
    this.loadConditions = parameters.loadConditions;
    this.boundaryConditions = parameters.boundaryConditions;
    this.gridSize = parameters.gridSize;
    this.timeSteps = parameters.timeSteps;

    const options = parameters.advancedOptions || {};
    if (options.enableAdaptiveTimeStepping !== false) {
      const initialStep = options.initialTimeStep || 1;
      const targetError = options.targetError || 1e-6;
      const maxStep = options.maxTimeStep || initialStep * 2;
      const minStep = options.minTimeStep || initialStep / 16;
      this.timeStepper = new AdaptiveTimeStepper(initialStep, targetError, maxStep, minStep);
    }

    if (options.enableDuncanChangModel) {
      this.duncanChangModel = new DuncanChangModel(this.soilProperties, options.duncanChangParams);
    }
  }

  initializeGrid(): void {
    this.grid = [];
    const step = 1 / (this.gridSize - 1);

    for (let i = 0; i < this.gridSize; i++) {
      const row: GridNode[] = [];
      for (let j = 0; j < this.gridSize; j++) {
        row.push({
          x: j * step,
          y: i * step,
          id: i * this.gridSize + j
        });
      }
      this.grid.push(row);
    }

    const nodeCount = this.gridSize * this.gridSize;
    this.displacementField = Array(nodeCount).fill(null).map(() => [0, 0]);
    this.stressField = Array(this.gridSize).fill(null).map(() => Array(this.gridSize).fill(0));
    this.settlementField = Array(this.gridSize).fill(null).map(() => Array(this.gridSize).fill(0));
  }

  applyBoundaryConditions(): void {
    for (const bc of this.boundaryConditions) {
      if (bc.type === 'fixed') {
        for (let i = 0; i < this.gridSize; i++) {
          if (bc.xMin) {
            const idx = i * this.gridSize;
            this.displacementField[idx] = [0, 0];
          }
          if (bc.xMax) {
            const idx = i * this.gridSize + (this.gridSize - 1);
            this.displacementField[idx] = [0, 0];
          }
          if (bc.yMin) {
            const idx = i;
            this.displacementField[idx] = [0, 0];
          }
          if (bc.yMax) {
            const idx = (this.gridSize - 1) * this.gridSize + i;
            this.displacementField[idx] = [0, 0];
          }
        }
      } else if (bc.type === 'roller') {
        for (let i = 0; i < this.gridSize; i++) {
          if (bc.yMin || bc.yMax) {
            const row = bc.yMin ? 0 : this.gridSize - 1;
            const idx = row * this.gridSize + i;
            this.displacementField[idx][1] = 0;
          }
          if (bc.xMin || bc.xMax) {
            const col = bc.xMin ? 0 : this.gridSize - 1;
            const idx = i * this.gridSize + col;
            this.displacementField[idx][0] = 0;
          }
        }
      }
    }
  }

  applyLoads(): void {
    const step = 1 / (this.gridSize - 1);

    for (let i = 0; i < this.gridSize; i++) {
      for (let j = 0; j < this.gridSize; j++) {
        const node = this.grid[i][j];
        let totalLoad = 0;

        for (const load of this.loadConditions) {
          const distance = Math.sqrt(
            Math.pow(node.x - load.x, 2) + Math.pow(node.y - load.y, 2)
          );
          const influenceRadius = Math.sqrt(load.area) / 2;

          if (distance <= influenceRadius) {
            const influence = 1 - (distance / influenceRadius);
            totalLoad += load.magnitude * influence * influence;
          }
        }

        this.settlementField[i][j] = totalLoad;
      }
    }
  }

  computeStiffnessMatrix(): void {
    const nodeCount = this.gridSize * this.gridSize;
    const E = this.soilProperties.youngModulus;
    const nu = this.soilProperties.poissonRatio;
    const G = E / (2 * (1 + nu));
    const K = E / (3 * (1 - 2 * nu));

    this.stiffnessMatrix = Array(nodeCount).fill(null).map(() => Array(nodeCount).fill(0));
    const h = 1 / (this.gridSize - 1);

    for (let i = 0; i < this.gridSize - 1; i++) {
      for (let j = 0; j < this.gridSize - 1; j++) {
        const n1 = i * this.gridSize + j;
        const n2 = i * this.gridSize + j + 1;
        const n3 = (i + 1) * this.gridSize + j;
        const n4 = (i + 1) * this.gridSize + j + 1;

        const k = (G + K / 3) / (h * h);

        this.stiffnessMatrix[n1][n1] += 4 * k;
        this.stiffnessMatrix[n1][n2] -= k;
        this.stiffnessMatrix[n1][n3] -= k;

        this.stiffnessMatrix[n2][n1] -= k;
        this.stiffnessMatrix[n2][n2] += 4 * k;
        this.stiffnessMatrix[n2][n4] -= k;

        this.stiffnessMatrix[n3][n1] -= k;
        this.stiffnessMatrix[n3][n3] += 4 * k;
        this.stiffnessMatrix[n3][n4] -= k;

        this.stiffnessMatrix[n4][n2] -= k;
        this.stiffnessMatrix[n4][n3] -= k;
        this.stiffnessMatrix[n4][n4] += 4 * k;
      }
    }
  }

  computeStiffnessMatrixNonlinear(sigma1Avg: number, sigma3Avg: number): void {
    const nodeCount = this.gridSize * this.gridSize;
    let E: number;
    let nu: number;

    if (this.duncanChangModel) {
      E = this.duncanChangModel.computeTangentModulus(sigma1Avg, sigma3Avg);
      nu = this.duncanChangModel.computePoissonRatio(sigma1Avg, sigma3Avg);
    } else {
      E = this.soilProperties.youngModulus;
      nu = this.soilProperties.poissonRatio;
    }

    const G = E / (2 * (1 + nu));
    const K = E / (3 * (1 - 2 * nu));

    this.stiffnessMatrix = Array(nodeCount).fill(null).map(() => Array(nodeCount).fill(0));
    const h = 1 / (this.gridSize - 1);

    for (let i = 0; i < this.gridSize - 1; i++) {
      for (let j = 0; j < this.gridSize - 1; j++) {
        const n1 = i * this.gridSize + j;
        const n2 = i * this.gridSize + j + 1;
        const n3 = (i + 1) * this.gridSize + j;
        const n4 = (i + 1) * this.gridSize + j + 1;

        const k = (G + K / 3) / (h * h);

        this.stiffnessMatrix[n1][n1] += 4 * k;
        this.stiffnessMatrix[n1][n2] -= k;
        this.stiffnessMatrix[n1][n3] -= k;

        this.stiffnessMatrix[n2][n1] -= k;
        this.stiffnessMatrix[n2][n2] += 4 * k;
        this.stiffnessMatrix[n2][n4] -= k;

        this.stiffnessMatrix[n3][n1] -= k;
        this.stiffnessMatrix[n3][n3] += 4 * k;
        this.stiffnessMatrix[n3][n4] -= k;

        this.stiffnessMatrix[n4][n2] -= k;
        this.stiffnessMatrix[n4][n3] -= k;
        this.stiffnessMatrix[n4][n4] += 4 * k;
      }
    }
  }

  computeResidual(): number {
    let residual = 0;
    const step = 1 / (this.gridSize - 1);
    const E = this.soilProperties.youngModulus;

    for (let i = 1; i < this.gridSize - 1; i++) {
      for (let j = 1; j < this.gridSize - 1; j++) {
        const idx = i * this.gridSize + j;
        const idxUp = (i - 1) * this.gridSize + j;
        const idxDown = (i + 1) * this.gridSize + j;
        const idxLeft = i * this.gridSize + j - 1;
        const idxRight = i * this.gridSize + j + 1;

        const equilibrium = (
          this.displacementField[idxUp][1] +
          this.displacementField[idxDown][1] +
          this.displacementField[idxLeft][1] +
          this.displacementField[idxRight][1] -
          4 * this.displacementField[idx][1] +
          this.settlementField[i][j] / E * 100
        );

        residual += equilibrium * equilibrium;
      }
    }

    return Math.sqrt(residual);
  }

  computeStrainEnergy(): number {
    let energy = 0;
    const step = 1 / (this.gridSize - 1);
    const E = this.soilProperties.youngModulus;
    const nu = this.soilProperties.poissonRatio;

    for (let i = 0; i < this.gridSize; i++) {
      for (let j = 0; j < this.gridSize; j++) {
        const idx = i * this.gridSize + j;

        let du_dx = 0;
        let dv_dy = 0;

        if (j > 0 && j < this.gridSize - 1) {
          const idxLeft = i * this.gridSize + j - 1;
          const idxRight = i * this.gridSize + j + 1;
          du_dx = (this.displacementField[idxRight][0] - this.displacementField[idxLeft][0]) / (2 * step);
          dv_dy = (this.displacementField[idxRight][1] - this.displacementField[idxLeft][1]) / (2 * step);
        }

        const strainEnergyDensity = 0.5 * (E / ((1 + nu) * (1 - 2 * nu))) *
          ((1 - nu) * du_dx * du_dx + 2 * nu * du_dx * dv_dy + (1 - nu) * dv_dy * dv_dy);

        energy += strainEnergyDensity * step * step;
      }
    }

    return energy;
  }

  aitkenAcceleration(iteration: number, currentValue: number, prevValue: number, prevPrevValue: number): number {
    if (iteration < 2) return currentValue;

    const delta1 = currentValue - prevValue;
    const delta2 = prevValue - prevPrevValue;

    if (Math.abs(delta1 - delta2) < 1e-15) return currentValue;

    const accelerationFactor = delta1 / (delta2 - delta1);
    return currentValue + accelerationFactor * delta1;
  }

  lineSearch(
    currentDisp: number[][],
    direction: number[][],
    initialStep: number = 1.0
  ): number {
    const options = this.parameters.advancedOptions || {};
    if (options.enableLineSearch === false) return initialStep;

    let alpha = initialStep;
    let bestAlpha = alpha;
    let minEnergy = Infinity;

    const originalDisp = JSON.parse(JSON.stringify(currentDisp));

    for (let trial = 0; trial < 5; trial++) {
      for (let i = 0; i < currentDisp.length; i++) {
        currentDisp[i][0] = originalDisp[i][0] + alpha * direction[i][0];
        currentDisp[i][1] = originalDisp[i][1] + alpha * direction[i][1];
      }

      const energy = this.computeStrainEnergy();

      if (energy < minEnergy) {
        minEnergy = energy;
        bestAlpha = alpha;
      }

      alpha *= 0.5;
    }

    for (let i = 0; i < currentDisp.length; i++) {
      currentDisp[i][0] = originalDisp[i][0] + bestAlpha * direction[i][0];
      currentDisp[i][1] = originalDisp[i][1] + bestAlpha * direction[i][1];
    }

    return bestAlpha;
  }

  checkConvergence(iteration: number, prevDispField: number[][]): ConvergenceState {
    const options = this.parameters.advancedOptions || {};
    const residualTol = options.residualTolerance || 1e-5;
    const dispTol = options.displacementTolerance || 1e-4;
    const energyTol = options.energyTolerance || 1e-6;
    const requiredCriteria = options.requiredConvergenceCriteria || ['residual', 'displacement', 'energy'];

    const residual = this.computeResidual();
    const residualConverged = residual < residualTol;

    let dispChange = 0;
    let dispNorm = 0;
    for (let i = 0; i < this.displacementField.length; i++) {
      const dx = this.displacementField[i][0] - prevDispField[i][0];
      const dy = this.displacementField[i][1] - prevDispField[i][1];
      dispChange += dx * dx + dy * dy;
      dispNorm += this.displacementField[i][0] * this.displacementField[i][0] +
        this.displacementField[i][1] * this.displacementField[i][1];
    }
    const relativeDispChange = dispNorm > 0 ? Math.sqrt(dispChange) / Math.sqrt(dispNorm) : Math.sqrt(dispChange);
    const displacementConverged = relativeDispChange < dispTol;

    const currentEnergy = this.computeStrainEnergy();
    const energyChange = this.previousStrainEnergy > 0
      ? Math.abs(currentEnergy - this.previousStrainEnergy) / this.previousStrainEnergy
      : Math.abs(currentEnergy - this.previousStrainEnergy);
    const energyConverged = energyChange < energyTol;

    let isConverged = true;
    if (requiredCriteria.includes('residual')) isConverged = isConverged && residualConverged;
    if (requiredCriteria.includes('displacement')) isConverged = isConverged && displacementConverged;
    if (requiredCriteria.includes('energy')) isConverged = isConverged && energyConverged;

    this.strainEnergy = currentEnergy;

    return {
      residualConverged,
      displacementConverged,
      energyConverged,
      residual,
      displacementChange: relativeDispChange,
      energyChange,
      isConverged,
      iteration
    };
  }

  checkDivergence(currentResidual: number, maxDisp: number): boolean {
    const maxAllowableDisp = 10.0;

    if (currentResidual > this.lastResidual) {
      this.residualIncreaseCount++;
    } else {
      this.residualIncreaseCount = 0;
    }

    this.lastResidual = currentResidual;

    if (this.residualIncreaseCount >= 3) {
      return true;
    }

    if (maxDisp > maxAllowableDisp) {
      return true;
    }

    return false;
  }

  saveCurrentState(): CalculationState {
    return {
      displacementField: JSON.parse(JSON.stringify(this.displacementField)),
      stressField: JSON.parse(JSON.stringify(this.stressField)),
      residual: this.computeResidual(),
      strainEnergy: this.computeStrainEnergy(),
      iteration: this.convergenceIterations.length
    };
  }

  restoreState(state: CalculationState): void {
    this.displacementField = JSON.parse(JSON.stringify(state.displacementField));
    this.stressField = JSON.parse(JSON.stringify(state.stressField));
    this.strainEnergy = state.strainEnergy;
  }

  solveDisplacementsNonlinear(): ConvergenceState {
    const options = this.parameters.advancedOptions || {};
    const maxIterations = options.maxIterations || 50;
    const E = this.soilProperties.youngModulus;
    const step = 1 / (this.gridSize - 1);

    let prevDispField = JSON.parse(JSON.stringify(this.displacementField));
    let prevPrevDispField = JSON.parse(JSON.stringify(this.displacementField));
    let iteration = 0;
    let convergenceState: ConvergenceState;
    let savedState: CalculationState | null = null;

    const initialDispField = JSON.parse(JSON.stringify(this.displacementField));
    for (let i = 0; i < this.gridSize; i++) {
      for (let j = 0; j < this.gridSize; j++) {
        const idx = i * this.gridSize + j;

        if (this.displacementField[idx][1] === 0 &&
          this.displacementField[idx][0] === 0 &&
          (i === 0 || j === 0 || i === this.gridSize - 1 || j === this.gridSize - 1)) {
          continue;
        }

        const load = this.settlementField[i][j];
        const depthFactor = 1 - (i * step) * 0.8;
        const displacement = (load * depthFactor * step * step) / E * 1000;

        initialDispField[idx][0] = displacement * 0.1 * (0.5 - Math.random());
        initialDispField[idx][1] = displacement;
      }
    }
    this.displacementField = initialDispField;

    this.previousStrainEnergy = this.computeStrainEnergy();

    do {
      iteration++;
      prevPrevDispField = JSON.parse(JSON.stringify(prevDispField));
      prevDispField = JSON.parse(JSON.stringify(this.displacementField));

      const tempField = JSON.parse(JSON.stringify(this.displacementField));

      for (let i = 1; i < this.gridSize - 1; i++) {
        for (let j = 1; j < this.gridSize - 1; j++) {
          const idx = i * this.gridSize + j;
          const idxUp = (i - 1) * this.gridSize + j;
          const idxDown = (i + 1) * this.gridSize + j;
          const idxLeft = i * this.gridSize + j - 1;
          const idxRight = i * this.gridSize + j + 1;

          if (this.displacementField[idx][1] !== 0 || i !== 0) {
            tempField[idx][1] = (
              this.displacementField[idxUp][1] +
              this.displacementField[idxDown][1] +
              this.displacementField[idxLeft][1] +
              this.displacementField[idxRight][1] +
              this.settlementField[i][j] / E * 100
            ) / 4;
          }
        }
      }

      const direction: number[][] = [];
      for (let i = 0; i < this.displacementField.length; i++) {
        direction.push([
          tempField[i][0] - this.displacementField[i][0],
          tempField[i][1] - this.displacementField[i][1]
        ]);
      }

      this.lineSearch(this.displacementField, direction);

      if (options.enableAitkenAcceleration !== false && iteration >= 3) {
        for (let i = 0; i < this.displacementField.length; i++) {
          this.displacementField[i][1] = this.aitkenAcceleration(
            iteration,
            this.displacementField[i][1],
            prevDispField[i][1],
            prevPrevDispField[i][1]
          );
        }
      }

      this.applyBoundaryConditions();

      convergenceState = this.checkConvergence(iteration, prevDispField);

      let maxDisp = 0;
      for (const disp of this.displacementField) {
        maxDisp = Math.max(maxDisp, Math.abs(disp[0]), Math.abs(disp[1]));
      }

      if (this.checkDivergence(convergenceState.residual, maxDisp)) {
        if (savedState) {
          this.restoreState(savedState);
          return {
            ...convergenceState,
            isConverged: false
          };
        }
        return {
          ...convergenceState,
          isConverged: false
        };
      }

      if (iteration === 1 || convergenceState.residual < this.lastResidual) {
        savedState = this.saveCurrentState();
      }

      this.previousStrainEnergy = this.strainEnergy;

    } while (!convergenceState.isConverged && iteration < maxIterations);

    return convergenceState;
  }

  solveDisplacements(): void {
    const options = this.parameters.advancedOptions || {};

    if (options.enableMultiLevelConvergence !== false) {
      this.solveDisplacementsNonlinear();
      return;
    }

    const E = this.soilProperties.youngModulus;
    const step = 1 / (this.gridSize - 1);

    for (let i = 0; i < this.gridSize; i++) {
      for (let j = 0; j < this.gridSize; j++) {
        const idx = i * this.gridSize + j;

        if (this.displacementField[idx][1] === 0 &&
          this.displacementField[idx][0] === 0 &&
          (i === 0 || j === 0 || i === this.gridSize - 1 || j === this.gridSize - 1)) {
          continue;
        }

        const load = this.settlementField[i][j];
        const depthFactor = 1 - (i * step) * 0.8;
        const displacement = (load * depthFactor * step * step) / E * 1000;

        this.displacementField[idx][0] = displacement * 0.1 * (0.5 - Math.random());
        this.displacementField[idx][1] = displacement;
      }
    }

    for (let iter = 0; iter < 10; iter++) {
      const tempField = JSON.parse(JSON.stringify(this.displacementField));

      for (let i = 1; i < this.gridSize - 1; i++) {
        for (let j = 1; j < this.gridSize - 1; j++) {
          const idx = i * this.gridSize + j;
          const idxUp = (i - 1) * this.gridSize + j;
          const idxDown = (i + 1) * this.gridSize + j;
          const idxLeft = i * this.gridSize + j - 1;
          const idxRight = i * this.gridSize + j + 1;

          if (this.displacementField[idx][1] !== 0 || i !== 0) {
            tempField[idx][1] = (
              this.displacementField[idxUp][1] +
              this.displacementField[idxDown][1] +
              this.displacementField[idxLeft][1] +
              this.displacementField[idxRight][1] +
              this.settlementField[i][j] / E * 100
            ) / 4;
          }
        }
      }

      this.displacementField = tempField;
    }
  }

  computeStresses(): void {
    const step = 1 / (this.gridSize - 1);

    for (let i = 0; i < this.gridSize; i++) {
      for (let j = 0; j < this.gridSize; j++) {
        const idx = i * this.gridSize + j;

        let du_dx = 0;
        let dv_dy = 0;

        if (j > 0 && j < this.gridSize - 1) {
          const idxLeft = i * this.gridSize + j - 1;
          const idxRight = i * this.gridSize + j + 1;
          du_dx = (this.displacementField[idxRight][0] - this.displacementField[idxLeft][0]) / (2 * step);
          dv_dy = (this.displacementField[idxRight][1] - this.displacementField[idxLeft][1]) / (2 * step);
        } else if (j === 0) {
          const idxRight = i * this.gridSize + j + 1;
          du_dx = (this.displacementField[idxRight][0] - this.displacementField[idx][0]) / step;
          dv_dy = (this.displacementField[idxRight][1] - this.displacementField[idx][1]) / step;
        } else {
          const idxLeft = i * this.gridSize + j - 1;
          du_dx = (this.displacementField[idx][0] - this.displacementField[idxLeft][0]) / step;
          dv_dy = (this.displacementField[idx][1] - this.displacementField[idxLeft][1]) / step;
        }

        let E: number;
        let nu: number;

        if (this.duncanChangModel) {
          const sigma3 = this.soilProperties.density * 9.81 * (1 - i * step);
          const sigma1 = sigma3 + Math.abs(du_dx + dv_dy) * this.soilProperties.youngModulus;
          E = this.duncanChangModel.computeTangentModulus(sigma1, sigma3);
          nu = this.duncanChangModel.computePoissonRatio(sigma1, sigma3);
          this.duncanChangModel.updateStressHistory(sigma1, sigma3);
        } else {
          E = this.soilProperties.youngModulus;
          nu = this.soilProperties.poissonRatio;
        }

        const stressX = (E / ((1 + nu) * (1 - 2 * nu))) * ((1 - nu) * du_dx + nu * dv_dy);
        const stressY = (E / ((1 + nu) * (1 - 2 * nu))) * (nu * du_dx + (1 - nu) * dv_dy);

        this.stressField[i][j] = Math.sqrt(stressX * stressX + stressY * stressY) * 1000;
      }
    }
  }

  computeSettlement(): void {
    for (let i = 0; i < this.gridSize; i++) {
      for (let j = 0; j < this.gridSize; j++) {
        const idx = i * this.gridSize + j;
        this.settlementField[i][j] = Math.abs(this.displacementField[idx][1]);
      }
    }
  }

  adaptMesh(): MeshRefinementSuggestion {
    const options = this.parameters.advancedOptions || {};
    const threshold = options.stressGradientThreshold || 0.1;
    const regions: { i: number; j: number; level: number }[] = [];
    let maxGradient = 0;

    for (let i = 1; i < this.gridSize - 1; i++) {
      for (let j = 1; j < this.gridSize - 1; j++) {
        const stressCenter = this.stressField[i][j];
        const stressUp = this.stressField[i - 1][j];
        const stressDown = this.stressField[i + 1][j];
        const stressLeft = this.stressField[i][j - 1];
        const stressRight = this.stressField[i][j + 1];

        const dStress_dx = Math.abs(stressRight - stressLeft) / 2;
        const dStress_dy = Math.abs(stressDown - stressUp) / 2;
        const gradient = Math.sqrt(dStress_dx * dStress_dx + dStress_dy * dStress_dy);

        maxGradient = Math.max(maxGradient, gradient);

        if (gradient > threshold) {
          const level = gradient > threshold * 3 ? 2 : 1;
          regions.push({ i, j, level });
        }
      }
    }

    const qualityScore = Math.max(0, 100 - (maxGradient / threshold) * 20);

    return {
      regions,
      qualityScore,
      maxStressGradient: maxGradient
    };
  }

  computeStabilityScore(): number {
    let score = 100;

    if (this.errorHistory.length > 0) {
      const avgError = this.errorHistory.reduce((a, b) => a + b, 0) / this.errorHistory.length;
      score -= Math.min(30, avgError * 1e6 * 0.1);
    }

    if (this.residualHistory.length > 0) {
      const maxResidual = Math.max(...this.residualHistory);
      score -= Math.min(30, maxResidual * 100);
    }

    if (this.adaptiveStepCount > this.timeSteps * 0.5) {
      score -= Math.min(20, (this.adaptiveStepCount / this.timeSteps - 0.5) * 100);
    }

    return Math.max(0, Math.min(100, score));
  }

  async runCalculation(onProgress?: (progress: number) => Promise<void> | void): Promise<CalculationResult> {
    const startTime = Date.now();
    const options = this.parameters.advancedOptions || {};

    let finalConvergenceState: ConvergenceState | null = null;
    let lastConvergedState: CalculationState | null = null;
    let meshSuggestion: MeshRefinementSuggestion | null = null;

    this.initializeGrid();
    if (onProgress) await onProgress(10);

    this.applyBoundaryConditions();
    if (onProgress) await onProgress(20);

    this.applyLoads();
    if (onProgress) await onProgress(30);

    this.computeStiffnessMatrix();
    if (onProgress) await onProgress(40);

    this.convergenceIterations = [];
    this.timeStepHistory = [];
    this.errorHistory = [];
    this.residualHistory = [];
    this.adaptiveStepCount = 0;

    if (this.timeStepper) {
      this.timeStepper.reset();
    }

    let completedSteps = 0;
    let currentProgress = 40;

    while (completedSteps < this.timeSteps) {
      const stepSize = this.timeStepper ? this.timeStepper.getCurrentStep() : 1;
      const actualSteps = Math.min(Math.ceil(stepSize), this.timeSteps - completedSteps);

      const prevState = this.saveCurrentState();

      for (let s = 0; s < actualSteps; s++) {
        const convergenceResult = this.solveDisplacementsNonlinear();
        this.convergenceIterations.push(convergenceResult.iteration);
        finalConvergenceState = convergenceResult;
        this.residualHistory.push(convergenceResult.residual);

        if (!convergenceResult.isConverged) {
          if (lastConvergedState && this.timeStepper) {
            this.restoreState(lastConvergedState);
            const newStep = this.timeStepper.adjustStepSize(1.0);
            this.adaptiveStepCount = this.timeStepper.getAdjustmentCount();
            continue;
          }
        } else {
          lastConvergedState = this.saveCurrentState();
        }
      }

      const currentState = this.saveCurrentState();

      if (this.timeStepper && prevState) {
        const error = this.timeStepper.estimateError(currentState, prevState);
        this.errorHistory.push(error);
        const newStep = this.timeStepper.adjustStepSize(error);
        this.timeStepHistory.push(newStep);
        this.adaptiveStepCount = this.timeStepper.getAdjustmentCount();
      }

      completedSteps += actualSteps;

      const progress = 40 + Math.floor((completedSteps / this.timeSteps) * 40);
      if (progress > currentProgress) {
        currentProgress = progress;
        if (onProgress) await onProgress(progress);
      }

      await new Promise(resolve => setTimeout(resolve, 5));
    }

    this.computeStresses();
    if (onProgress) await onProgress(85);

    if (options.enableMeshAdaptivity) {
      meshSuggestion = this.adaptMesh();
    }

    this.computeSettlement();
    if (onProgress) await onProgress(95);

    const computeTime = Date.now() - startTime;

    let maxSettlement = 0;
    let maxStress = 0;

    for (let i = 0; i < this.gridSize; i++) {
      for (let j = 0; j < this.gridSize; j++) {
        maxSettlement = Math.max(maxSettlement, this.settlementField[i][j]);
        maxStress = Math.max(maxStress, this.stressField[i][j]);
      }
    }

    const metadata: ResultMetadata = {
      computeTime,
      maxSettlement,
      maxStress,
      convergence: finalConvergenceState?.isConverged ?? true,
      convergenceIterations: this.convergenceIterations,
      adaptiveSteps: this.adaptiveStepCount,
      finalError: this.errorHistory.length > 0 ? this.errorHistory[this.errorHistory.length - 1] : 0,
      computationStability: this.computeStabilityScore(),
      meshQuality: meshSuggestion?.qualityScore,
      timeStepHistory: this.timeStepHistory,
      errorHistory: this.errorHistory,
      residualHistory: this.residualHistory,
      finalConvergenceState: finalConvergenceState || undefined
    };

    const displacementGrid: number[][] = [];
    for (let i = 0; i < this.gridSize; i++) {
      const row: number[] = [];
      for (let j = 0; j < this.gridSize; j++) {
        const idx = i * this.gridSize + j;
        const xDisp = this.displacementField[idx][0];
        const yDisp = this.displacementField[idx][1];
        const totalDisp = Math.sqrt(xDisp * xDisp + yDisp * yDisp);
        row.push(totalDisp);
      }
      displacementGrid.push(row);
    }

    this.results = {
      id: `result_${Date.now()}`,
      taskId: '',
      shardId: '',
      nodeId: '',
      settlementData: this.settlementField,
      stressData: this.stressField,
      displacementData: displacementGrid,
      metadata,
      createdAt: new Date()
    };

    if (onProgress) await onProgress(100);

    return this.results;
  }

  getResults(): CalculationResult | null {
    return this.results;
  }
}
