import { EPSILON, balanceProblem, roundClean, validateProblem } from './balance';
import { solveLeastCost } from './leastCost';
import { solveModiOptimal } from './modi';
import {
  BalancedProblem,
  BalancedRhsPairSensitivity,
  BalancedRhsPathStep,
  BalancedTransferSensitivity,
  BasicCostSensitivity,
  CostSensitivityAnalysis,
  DualEquationRow,
  DualShadowPriceAnalysis,
  ManagerialActiveRouteItem,
  ManagerialDecisionAnalysis,
  ManagerialDiagnosis,
  ManagerialEconomicConcept,
  ManagerialRecommendation,
  ManagerialScenarioComparisonAnalysis,
  ManagerialUnusedRouteItem,
  NonBasicCostSensitivity,
  OptimalResult,
  RhsSensitivityAnalysis,
  ScenarioComparisonResult,
  ScenarioInputChange,
  ScenarioRouteDiff,
  SensitivityScaffold,
  ShadowPriceWorkedExample,
  SlackDemandRow,
  SlackSaturationAnalysis,
  SlackSupplyRow,
  SolveResponse,
  TransportationProblem,
  UnbalancedDummyAllocation,
  UnbalancedRhsEvaluation,
} from './types';
import { solveVogel } from './vogel';

function fmt(n: number): string {
  return Number.isInteger(n)
    ? n.toLocaleString('es-MX')
    : n.toLocaleString('es-MX', { maximumFractionDigits: 4 });
}

function verifyConnectedSpanningTree(basicMask: boolean[][]): {
  basicCount: number;
  expectedCount: number;
  isValidTree: boolean;
} {
  const m = basicMask.length;
  const n = basicMask[0]?.length ?? 0;
  const expectedCount = m + n - 1;

  let basicCount = 0;
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (basicMask[i][j]) basicCount++;
    }
  }

  if (m === 0 || n === 0 || basicCount !== expectedCount) {
    return { basicCount, expectedCount, isValidTree: false };
  }

  const totalNodes = m + n;
  const visited = new Array(totalNodes).fill(false);
  const queue: number[] = [0];
  visited[0] = true;
  let visitedCount = 1;

  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr < m) {
      for (let j = 0; j < n; j++) {
        if (basicMask[curr][j] && !visited[m + j]) {
          visited[m + j] = true;
          visitedCount++;
          queue.push(m + j);
        }
      }
    } else {
      const j = curr - m;
      for (let i = 0; i < m; i++) {
        if (basicMask[i][j] && !visited[i]) {
          visited[i] = true;
          visitedCount++;
          queue.push(i);
        }
      }
    }
  }

  return {
    basicCount,
    expectedCount,
    isValidTree: visitedCount === totalNodes,
  };
}

function partitionTreeWithoutEdge(
  basicMask: boolean[][],
  removeRow: number,
  removeCol: number
): { inOriginSide: boolean[]; inDestOriginSide: boolean[] } {
  const m = basicMask.length;
  const n = basicMask[0].length;
  const inOriginSide = new Array(m).fill(false);
  const inDestOriginSide = new Array(n).fill(false);

  const queue: number[] = [removeRow];
  inOriginSide[removeRow] = true;

  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr < m) {
      for (let j = 0; j < n; j++) {
        if (curr === removeRow && j === removeCol) continue;
        if (basicMask[curr][j] && !inDestOriginSide[j]) {
          inDestOriginSide[j] = true;
          queue.push(m + j);
        }
      }
    } else {
      const j = curr - m;
      for (let i = 0; i < m; i++) {
        if (i === removeRow && j === removeCol) continue;
        if (basicMask[i][j] && !inOriginSide[i]) {
          inOriginSide[i] = true;
          queue.push(i);
        }
      }
    }
  }

  return { inOriginSide, inDestOriginSide };
}

function computeNonBasicCycleTheta(
  basicMask: boolean[][],
  allocations: number[][],
  enterRow: number,
  enterCol: number
): number {
  const m = basicMask.length;
  const n = basicMask[0].length;
  const totalNodes = m + n;
  const visited = new Array(totalNodes).fill(false);
  const parent = new Array(totalNodes).fill(-1);

  const startNode = enterRow;
  const targetNode = m + enterCol;
  const queue: number[] = [startNode];
  visited[startNode] = true;

  let found = false;
  while (queue.length > 0 && !found) {
    const curr = queue.shift()!;
    if (curr < m) {
      for (let j = 0; j < n; j++) {
        if (basicMask[curr][j]) {
          const nextNode = m + j;
          if (!visited[nextNode]) {
            visited[nextNode] = true;
            parent[nextNode] = curr;
            if (nextNode === targetNode) {
              found = true;
              break;
            }
            queue.push(nextNode);
          }
        }
      }
    } else {
      const j = curr - m;
      for (let i = 0; i < m; i++) {
        if (basicMask[i][j]) {
          const nextNode = i;
          if (!visited[nextNode]) {
            visited[nextNode] = true;
            parent[nextNode] = curr;
            queue.push(nextNode);
          }
        }
      }
    }
  }

  if (!found) return 0;

  const pathNodes: number[] = [];
  let cur = targetNode;
  while (cur !== -1) {
    pathNodes.push(cur);
    cur = parent[cur];
  }
  pathNodes.reverse();

  let minTheta = Infinity;
  for (let k = 0; k < pathNodes.length - 1; k++) {
    if (k % 2 === 0) {
      const a = pathNodes[k];
      const b = pathNodes[k + 1];
      const r = a < m ? a : b;
      const c = a < m ? b - m : a - m;
      minTheta = Math.min(minTheta, allocations[r][c]);
    }
  }

  return Number.isFinite(minTheta) ? roundClean(minTheta) : 0;
}

export function buildCostSensitivityAnalysis(
  balanced: BalancedProblem,
  optimal: OptimalResult
): CostSensitivityAnalysis {
  const m = balanced.origins.length;
  const n = balanced.destinations.length;

  const treeCheck = verifyConnectedSpanningTree(optimal.basicMask);
  let hasDegeneracy = false;
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (optimal.basicMask[i][j] && optimal.allocations[i][j] <= EPSILON) {
        hasDegeneracy = true;
      }
    }
  }

  const nonBasicRoutes: NonBasicCostSensitivity[] = [];
  const basicRoutes: BasicCostSensitivity[] = [];

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      const isDummy = i === balanced.dummyRowIndex || j === balanced.dummyColIndex;
      const originName = balanced.origins[i];
      const destinationName = balanced.destinations[j];
      const currentCost = balanced.costs[i][j];

      if (!optimal.basicMask[i][j]) {
        const impliedDualSum = roundClean(optimal.finalU[i] + optimal.finalV[j]);
        const reducedCost = roundClean(
          optimal.finalReducedCosts[i][j] ?? currentCost - impliedDualSum
        );
        const alreadyAlternativeOptimum = Math.abs(reducedCost) <= EPSILON;
        const requiredReduction = alreadyAlternativeOptimum ? 0 : Math.max(0, reducedCost);
        const minCostToKeepBasis = impliedDualSum;
        const minNonNegativeCostToKeepBasis = roundClean(Math.max(0, minCostToKeepBasis));
        const canBecomeCompetitiveWithNonNegativeCost = minCostToKeepBasis >= -EPSILON;
        const cycleTheta = treeCheck.isValidTree
          ? computeNonBasicCycleTheta(optimal.basicMask, optimal.allocations, i, j)
          : 0;
        const changesAllocationAtTie = cycleTheta > EPSILON;

        let basisVsAllocationNote = '';
        if (alreadyAlternativeOptimum) {
          basisVsAllocationNote = changesAllocationAtTie
            ? `Óptimo alternativo vigente (Δ_ij = 0): la base actual es óptima, pero puede activarse esta ruta con θ = ${fmt(cycleTheta)} u modificando la asignación física sin cambiar el costo total. Si c_ij baja por debajo de $${fmt(minCostToKeepBasis)}, la base actual deja de ser óptima.`
            : `Óptimo alternativo degenerado (Δ_ij = 0, θ = 0 u): cambiaría la base matemática sin modificar las cantidades físicas enviadas.`;
        } else if (!canBecomeCompetitiveWithNonNegativeCost) {
          basisVsAllocationNote = `Como u_i + v_j = $${fmt(minCostToKeepBasis)} < 0, incluso reduciendo la tarifa hasta $0 MXN/u se mantiene Δ_ij > 0; bajo costos no negativos (c_ij >= 0) la base y la asignación actual se conservan siempre.`;
        } else {
          basisVsAllocationNote = `La base y asignación actuales se conservan si c_ij > $${fmt(minCostToKeepBasis)}. En el límite inclusivo c_ij = $${fmt(minCostToKeepBasis)} (reducción de $${fmt(requiredReduction)} MXN/u), la base sigue siendo óptima pero aparece un óptimo alternativo${
            changesAllocationAtTie
              ? ` con posible cambio en la asignación (θ = ${fmt(cycleTheta)} u)`
              : ' degenerado (θ = 0 u, sin cambio físico)'
          }. Si c_ij < $${fmt(minCostToKeepBasis)}, la base deja de ser óptima.`;
        }

        nonBasicRoutes.push({
          row: i,
          col: j,
          originName,
          destinationName,
          isDummy,
          currentCost,
          impliedDualSum,
          reducedCost,
          requiredReduction,
          minCostToKeepBasis,
          minNonNegativeCostToKeepBasis,
          canBecomeCompetitiveWithNonNegativeCost,
          alreadyAlternativeOptimum,
          cycleTheta,
          changesAllocationAtTie,
          basisVsAllocationNote,
        });
      } else {
        const allocation = optimal.allocations[i][j];
        const isDegenerateBasic = allocation <= EPSILON;

        if (!treeCheck.isValidTree) {
          basicRoutes.push({
            row: i,
            col: j,
            originName,
            destinationName,
            isDummy,
            allocation,
            isDegenerateBasic,
            currentCost,
            reliable: false,
            unreliableReason:
              'La base actual no forma un árbol generador conexo de m+n-1 celdas; no es posible calcular un intervalo confiable mediante corte de árbol.',
            deltaMin: null,
            deltaMax: null,
            minCostMath: null,
            minCostNonNegative: 0,
            maxCost: null,
            limitingLowerCells: [],
            limitingUpperCells: [],
            hasTightLowerBound: false,
            hasTightUpperBound: false,
            interpretation:
              'No se determinó un intervalo confiable porque la estructura básica no es un árbol completo.',
          });
          continue;
        }

        const { inOriginSide, inDestOriginSide } = partitionTreeWithoutEdge(
          optimal.basicMask,
          i,
          j
        );

        let deltaMinRaw = -Infinity;
        let deltaMaxRaw = Infinity;
        const lowerCandidates: { label: string; bound: number }[] = [];
        const upperCandidates: { label: string; bound: number }[] = [];

        for (let r = 0; r < m; r++) {
          for (let c = 0; c < n; c++) {
            if (optimal.basicMask[r][c]) continue;
            const rc = roundClean(
              optimal.finalReducedCosts[r][c] ??
                balanced.costs[r][c] - (optimal.finalU[r] + optimal.finalV[c])
            );
            const label = `${balanced.origins[r]} → ${balanced.destinations[c]}`;

            // Si O_r ∈ S_1 y D_c ∈ S_2 => Δ'_rc(δ) = rc - δ >= 0 => δ <= rc
            if (inOriginSide[r] && !inDestOriginSide[c]) {
              if (rc < deltaMaxRaw) deltaMaxRaw = rc;
              upperCandidates.push({ label, bound: rc });
            }
            // Si O_r ∈ S_2 y D_c ∈ S_1 => Δ'_rc(δ) = rc + δ >= 0 => δ >= -rc
            else if (!inOriginSide[r] && inDestOriginSide[c]) {
              const lower = roundClean(-rc);
              if (lower > deltaMinRaw) deltaMinRaw = lower;
              lowerCandidates.push({ label, bound: lower });
            }
          }
        }

        const deltaMin = Number.isFinite(deltaMinRaw) ? roundClean(deltaMinRaw) : null;
        const deltaMax = Number.isFinite(deltaMaxRaw) ? roundClean(deltaMaxRaw) : null;

        const limitingLowerCells =
          deltaMin === null
            ? []
            : lowerCandidates
                .filter((x) => Math.abs(x.bound - deltaMin) <= EPSILON)
                .map((x) => x.label);

        const limitingUpperCells =
          deltaMax === null
            ? []
            : upperCandidates
                .filter((x) => Math.abs(x.bound - deltaMax) <= EPSILON)
                .map((x) => x.label);

        const minCostMath = deltaMin === null ? null : roundClean(currentCost + deltaMin);
        const minCostNonNegative =
          minCostMath === null ? 0 : roundClean(Math.max(0, minCostMath));
        const maxCost = deltaMax === null ? null : roundClean(currentCost + deltaMax);

        const hasTightLowerBound = deltaMin !== null && Math.abs(deltaMin) <= EPSILON;
        const hasTightUpperBound = deltaMax !== null && Math.abs(deltaMax) <= EPSILON;

        const lowerStr = minCostMath === null ? '-∞' : `$${fmt(minCostMath)}`;
        const upperStr = maxCost === null ? '+∞' : `$${fmt(maxCost)}`;
        const nonNegStr = `[${minCostMath === null || minCostMath < 0 ? '$0' : `$${fmt(minCostNonNegative)}`}, ${upperStr}]`;

        let interpretation = `La base óptima actual se mantiene en el intervalo matemático inclusivo [${lowerStr}, ${upperStr}] (bajo costos no negativos: ${nonNegStr}).`;

        if (hasTightLowerBound || hasTightUpperBound) {
          interpretation +=
            ' Al existir un óptimo alternativo vigente (Δ = 0 en una ruta competidora), un extremo del intervalo coincide exactamente con el costo actual; en ese límite la base sigue siendo óptima, pero superarlo obliga a pivotar.';
        } else {
          interpretation +=
            ' En los extremos finitos la base sigue siendo óptima (se genera empate / óptimo alternativo); fuera del intervalo la base deja de ser óptima.';
        }

        if (isDegenerateBasic) {
          interpretation +=
            ' Nota: al ser una celda básica degenerada (0 u), fuera del rango la base actual pierde optimalidad, aunque un pivote con θ = 0 u puede conservar la misma asignación física.';
        } else if (hasDegeneracy) {
          interpretation +=
            ' Nota por degeneración global: el rango garantiza la optimalidad de esta base; otra base degenerada equivalente podría conservar la misma asignación física fuera del intervalo.';
        }

        basicRoutes.push({
          row: i,
          col: j,
          originName,
          destinationName,
          isDummy,
          allocation,
          isDegenerateBasic,
          currentCost,
          reliable: true,
          unreliableReason: null,
          deltaMin,
          deltaMax,
          minCostMath,
          minCostNonNegative,
          maxCost,
          limitingLowerCells,
          limitingUpperCells,
          hasTightLowerBound,
          hasTightUpperBound,
          interpretation,
        });
      }
    }
  }

  const limitationsNote: string[] = [
    'Análisis ceteris paribus: cada intervalo evalúa la variación individual de un único costo unitario c_ij manteniendo fijos todos los demás costos, ofertas y demandas.',
    'Límites inclusivos vs. no optimalidad: en los extremos finitos del intervalo (Δ\'_ij = 0), la base actual continúa siendo óptima pero aparece un empate con al menos una ruta competidora; estrictamente fuera del intervalo, la base actual deja de ser óptima y requiere pivotes MODI.',
  ];

  if (hasDegeneracy) {
    limitationsNote.push(
      'Degeneración presente (celdas básicas con 0 u): los intervalos son exactos para conservar la optimalidad de la base actual; sin embargo, al existir múltiples bases posibles para la misma asignación física o pivotes con θ = 0, la asignación física podría permanecer óptima bajo una base distinta fuera del rango.'
    );
  }

  if (optimal.hasAlternativeOptima) {
    limitationsNote.push(
      'Óptimos alternativos activos (Δ_ij = 0): cuando una ruta no básica ya tiene costo reducido cero, la ruta básica opuesta en su ciclo presenta tolerancia nula hacia ese extremo (empate inmediato).'
    );
  }

  if (balanced.balanceStatus !== 'balanced') {
    limitationsNote.push(
      'Celdas ficticias de balanceo: sus costos unitarios ($0 MXN/u) son parámetros matemáticos auxiliares para igualar oferta y demanda; sus intervalos se muestran en la base balanceada pero no representan tarifas reales de transporte.'
    );
  }

  return {
    implemented: true,
    optimalBasisSize: treeCheck.basicCount,
    expectedBasisSize: treeCheck.expectedCount,
    basisIsValidTree: treeCheck.isValidTree,
    hasDegeneracy,
    hasAlternativeOptima: optimal.hasAlternativeOptima,
    nonBasicRoutes,
    basicRoutes,
    limitationsNote,
  };
}

function findTreePathBetweenNodes(
  balanced: BalancedProblem,
  optimal: OptimalResult,
  startNode: number,
  targetNode: number
): BalancedRhsPathStep[] | null {
  const m = balanced.origins.length;
  const n = balanced.destinations.length;
  const totalNodes = m + n;
  const visited = new Array(totalNodes).fill(false);
  const parent = new Array(totalNodes).fill(-1);

  const queue: number[] = [startNode];
  visited[startNode] = true;

  let found = false;
  while (queue.length > 0 && !found) {
    const curr = queue.shift()!;
    if (curr < m) {
      for (let j = 0; j < n; j++) {
        if (optimal.basicMask[curr][j]) {
          const nextNode = m + j;
          if (!visited[nextNode]) {
            visited[nextNode] = true;
            parent[nextNode] = curr;
            if (nextNode === targetNode) {
              found = true;
              break;
            }
            queue.push(nextNode);
          }
        }
      }
    } else {
      const j = curr - m;
      for (let i = 0; i < m; i++) {
        if (optimal.basicMask[i][j]) {
          const nextNode = i;
          if (!visited[nextNode]) {
            visited[nextNode] = true;
            parent[nextNode] = curr;
            if (nextNode === targetNode) {
              found = true;
              break;
            }
            queue.push(nextNode);
          }
        }
      }
    }
  }

  if (!found) return null;

  const pathNodes: number[] = [];
  let cur = targetNode;
  while (cur !== -1) {
    pathNodes.push(cur);
    cur = parent[cur];
  }
  pathNodes.reverse();

  const steps: BalancedRhsPathStep[] = [];
  for (let k = 0; k < pathNodes.length - 1; k++) {
    const a = pathNodes[k];
    const b = pathNodes[k + 1];
    const row = a < m ? a : b;
    const col = a < m ? b - m : a - m;
    const sign: '+' | '-' = k % 2 === 0 ? '+' : '-';
    const isDummy = row === balanced.dummyRowIndex || col === balanced.dummyColIndex;

    steps.push({
      row,
      col,
      originName: balanced.origins[row],
      destinationName: balanced.destinations[col],
      sign,
      currentAllocation: optimal.allocations[row][col],
      unitCost: balanced.costs[row][col],
      isDummy,
    });
  }

  return steps;
}

function findBalancedPathInTree(
  balanced: BalancedProblem,
  optimal: OptimalResult,
  originIndex: number,
  destinationIndex: number
): BalancedRhsPathStep[] | null {
  return findTreePathBetweenNodes(
    balanced,
    optimal,
    originIndex,
    balanced.origins.length + destinationIndex
  );
}

export function buildRhsSensitivityAnalysis(
  balanced: BalancedProblem,
  optimal: OptimalResult
): RhsSensitivityAnalysis {
  const m = balanced.origins.length;
  const n = balanced.destinations.length;

  const treeCheck = verifyConnectedSpanningTree(optimal.basicMask);
  let hasDegeneracy = false;
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (optimal.basicMask[i][j] && optimal.allocations[i][j] <= EPSILON) {
        hasDegeneracy = true;
      }
    }
  }

  const balancedPairs: BalancedRhsPairSensitivity[] = [];

  for (let i = 0; i < m; i++) {
    if (i === balanced.dummyRowIndex) continue;
    for (let j = 0; j < n; j++) {
      if (j === balanced.dummyColIndex) continue;

      const originName = balanced.origins[i];
      const destinationName = balanced.destinations[j];
      const currentSupply = balanced.supply[i];
      const currentDemand = balanced.demand[j];
      const isBasicPair = optimal.basicMask[i][j];

      if (!treeCheck.isValidTree) {
        balancedPairs.push({
          originIndex: i,
          destinationIndex: j,
          originName,
          destinationName,
          currentSupply,
          currentDemand,
          isBasicPair,
          reliable: false,
          unreliableReason:
            'La base actual no forma un árbol generador conexo de m+n-1 celdas; no es posible calcular la trayectoria de redistribución en el árbol.',
          pathSteps: [],
          usesDummyInPath: false,
          deltaMin: null,
          deltaMax: null,
          minSupply: null,
          maxSupply: null,
          minDemand: null,
          maxDemand: null,
          marginalCostPerUnit: null,
          optimalCostAtMin: null,
          optimalCostAtMax: null,
          limitingLowerCells: [],
          limitingUpperCells: [],
          hasTightLowerBound: false,
          hasTightUpperBound: false,
          interpretation:
            'No se determinó un intervalo confiable porque la estructura básica no es un árbol completo.',
        });
        continue;
      }

      const pathSteps = findBalancedPathInTree(balanced, optimal, i, j);
      if (!pathSteps || pathSteps.length === 0) {
        balancedPairs.push({
          originIndex: i,
          destinationIndex: j,
          originName,
          destinationName,
          currentSupply,
          currentDemand,
          isBasicPair,
          reliable: false,
          unreliableReason:
            'No se encontró una trayectoria única en la base entre este origen y este destino.',
          pathSteps: [],
          usesDummyInPath: false,
          deltaMin: null,
          deltaMax: null,
          minSupply: null,
          maxSupply: null,
          minDemand: null,
          maxDemand: null,
          marginalCostPerUnit: null,
          optimalCostAtMin: null,
          optimalCostAtMax: null,
          limitingLowerCells: [],
          limitingUpperCells: [],
          hasTightLowerBound: false,
          hasTightUpperBound: false,
          interpretation:
            'No fue posible construir el ajuste básico conjunto sobre el árbol actual.',
        });
        continue;
      }

      const plusSteps = pathSteps.filter((s) => s.sign === '+');
      const minusSteps = pathSteps.filter((s) => s.sign === '-');

      let minPlus = Infinity;
      for (const s of plusSteps) {
        if (s.currentAllocation < minPlus) minPlus = s.currentAllocation;
      }
      const deltaMin = Number.isFinite(minPlus) ? roundClean(-minPlus) : null;

      let deltaMax: number | null = null;
      if (minusSteps.length > 0) {
        let minMinus = Infinity;
        for (const s of minusSteps) {
          if (s.currentAllocation < minMinus) minMinus = s.currentAllocation;
        }
        deltaMax = Number.isFinite(minMinus) ? roundClean(minMinus) : null;
      }

      const limitingLowerCells =
        deltaMin === null
          ? []
          : plusSteps
              .filter((s) => Math.abs(s.currentAllocation + deltaMin) <= EPSILON)
              .map((s) => `${s.originName} → ${s.destinationName}`);

      const limitingUpperCells =
        deltaMax === null
          ? []
          : minusSteps
              .filter((s) => Math.abs(s.currentAllocation - deltaMax) <= EPSILON)
              .map((s) => `${s.originName} → ${s.destinationName}`);

      const minSupply = deltaMin === null ? null : roundClean(currentSupply + deltaMin);
      const maxSupply = deltaMax === null ? null : roundClean(currentSupply + deltaMax);
      const minDemand = deltaMin === null ? null : roundClean(currentDemand + deltaMin);
      const maxDemand = deltaMax === null ? null : roundClean(currentDemand + deltaMax);

      const marginalCostPerUnit = roundClean(
        pathSteps.reduce((acc, step) => {
          return acc + (step.sign === '+' ? step.unitCost : -step.unitCost);
        }, 0)
      );

      const optimalCostAtMin =
        deltaMin === null ? null : roundClean(optimal.totalCost + deltaMin * marginalCostPerUnit);
      const optimalCostAtMax =
        deltaMax === null ? null : roundClean(optimal.totalCost + deltaMax * marginalCostPerUnit);

      const hasTightLowerBound = deltaMin !== null && Math.abs(deltaMin) <= EPSILON;
      const hasTightUpperBound = deltaMax !== null && Math.abs(deltaMax) <= EPSILON;
      const usesDummyInPath = pathSteps.some((s) => s.isDummy);

      const deltaRangeStr = `[${deltaMin === null ? '-∞' : fmt(deltaMin)}, ${
        deltaMax === null ? '+∞' : `+${fmt(deltaMax)}`
      }${deltaMax === null ? ')' : ']'}`;

      let interpretation = isBasicPair
        ? `Al ser ruta básica directa, todo ajuste conjunto δ ∈ ${deltaRangeStr} u sobre ${originName} y ${destinationName} se absorbe directamente en x_(${originName}→${destinationName}) con impacto marginal de $${fmt(marginalCostPerUnit)} MXN/u.`
        : `Al variar conjuntamente ${originName} y ${destinationName} en δ ∈ ${deltaRangeStr} u, la base actual se reajusta sin perder factibilidad ni optimalidad (${pathSteps.length} celdas en el árbol), variando el costo total en $${fmt(marginalCostPerUnit)} MXN por cada unidad adicional.`;

      if (hasTightLowerBound || hasTightUpperBound) {
        interpretation +=
          ' Debido a que una celda básica en la trayectoria tiene 0 u (degeneración), un extremo de δ coincide con 0 u para esta base exacta.';
      }
      if (usesDummyInPath) {
        interpretation +=
          ' La cadena pasa por un nodo ficticio (costo $0/u), por lo que parte del ajuste compensa holgura/déficit matemático del balanceo inicial.';
      }

      balancedPairs.push({
        originIndex: i,
        destinationIndex: j,
        originName,
        destinationName,
        currentSupply,
        currentDemand,
        isBasicPair,
        reliable: true,
        unreliableReason: null,
        pathSteps,
        usesDummyInPath,
        deltaMin,
        deltaMax,
        minSupply,
        maxSupply,
        minDemand,
        maxDemand,
        marginalCostPerUnit,
        optimalCostAtMin,
        optimalCostAtMax,
        limitingLowerCells,
        limitingUpperCells,
        hasTightLowerBound,
        hasTightUpperBound,
        interpretation,
      });
    }
  }

  const limitationsNote: string[] = [
    'Requisito de balance oferta-demanda: en un problema de transporte equilibrado (Σa_i = Σb_j), no existen intervalos individuales válidos para una sola oferta a_i o una sola demanda b_j manteniendo el resto constante, porque rompería la igualdad total.',
    'Validez conjunta de [δ_mín, δ_máx]: los rangos calculados corresponden a variaciones simultáneas iguales (a\'_i = a_i + δ y b\'_j = b_j + δ) manteniendo constantes todas las demás ofertas, demandas y costos unitarios.',
    'Factibilidad y costo marginal: mientras δ permanezca dentro de [δ_mín, δ_máx], todas las asignaciones básicas siguen siendo ≥ 0, la base MODI conserva la optimalidad (Δ_rc ≥ 0) y el costo cambia linealmente a razón de (u_i + v_j) por unidad.',
    'Fuera de los límites: si δ rebasa el intervalo, al menos una asignación de la base actual se vuelve negativa (infactible) y es necesario reoptimizar con el motor MODI para obtener una nueva base óptima.',
  ];

  if (hasDegeneracy) {
    limitationsNote.push(
      'Degeneración detectada (celdas básicas con 0 u): un intervalo con δ = 0 indica que la base actual pierde factibilidad si esa celda baja de 0 u, aunque otra base degenerada alternativa podría mantener el modelo factible más allá de δ = 0.'
    );
  }

  if (balanced.balanceStatus !== 'balanced') {
    limitationsNote.push(
      `Escenario inicialmente desbalanceado (${balanced.dummyAmount} u en nodo ficticio): al variar conjuntamente un par real (a_i + δ, b_j + δ), el desbalance inicial del sistema se mantiene constante mientras todas las celdas básicas (incluidas las ficticias) permanezcan ≥ 0.`
    );
  }

  return {
    implemented: true,
    basisIsValidTree: treeCheck.isValidTree,
    hasDegeneracy,
    initialBalanceStatus: balanced.balanceStatus,
    balancedPairs,
    limitationsNote,
  };
}

export function evaluateUnbalancedRhsScenario(
  baseProblem: TransportationProblem,
  baseSolve: SolveResponse,
  targetKind: 'supply' | 'demand',
  targetIndex: number,
  newValue: number
): UnbalancedRhsEvaluation {
  const originalOptimalCost = baseSolve.optimal?.totalCost ?? 0;
  const originalSupplyTotal = roundClean(baseProblem.supply.reduce((a, b) => a + b, 0));
  const originalDemandTotal = roundClean(baseProblem.demand.reduce((a, b) => a + b, 0));

  const targetList = targetKind === 'supply' ? baseProblem.origins : baseProblem.destinations;
  const valueList = targetKind === 'supply' ? baseProblem.supply : baseProblem.demand;
  const dummyNote =
    'El costo unitario de $0 MXN/u asignado al nodo ficticio (Origen Ficticio o Destino Ficticio) es una hipótesis matemática de balanceo para poder aplicar el método de transporte; no representa necesariamente el costo real de almacenamiento, excedente no enviado o penalización por desabasto en Zeli Distribuciones.';

  if (targetIndex < 0 || targetIndex >= targetList.length) {
    return {
      valid: false,
      error: 'El almacén o sucursal seleccionado no es válido.',
      targetKind,
      targetIndex,
      targetName: 'No válido',
      previousValue: 0,
      newValue,
      deltaValue: 0,
      originalSupplyTotal,
      originalDemandTotal,
      newSupplyTotal: originalSupplyTotal,
      newDemandTotal: originalDemandTotal,
      balanceStatus: null,
      dummyAmount: 0,
      originalOptimalCost,
      newOptimalCost: null,
      costDifference: null,
      costDifferencePct: null,
      realAssignedUnits: 0,
      dummyDestinationUnits: 0,
      dummyOriginUnits: 0,
      dummyAllocations: [],
      realAllocationsSummary: [],
      dummyCostAssumptionNote: dummyNote,
      interpretation: 'Selecciona un nodo válido para evaluar el escenario.',
    };
  }

  const targetName =
    targetList[targetIndex]?.trim() ||
    `${targetKind === 'supply' ? 'Almacén' : 'Sucursal'} ${targetIndex + 1}`;
  const previousValue = valueList[targetIndex] ?? 0;

  if (typeof newValue !== 'number' || !Number.isFinite(newValue) || newValue < 0) {
    return {
      valid: false,
      error: 'El nuevo valor debe ser un número mayor o igual a 0.',
      targetKind,
      targetIndex,
      targetName,
      previousValue,
      newValue,
      deltaValue: 0,
      originalSupplyTotal,
      originalDemandTotal,
      newSupplyTotal: originalSupplyTotal,
      newDemandTotal: originalDemandTotal,
      balanceStatus: null,
      dummyAmount: 0,
      originalOptimalCost,
      newOptimalCost: null,
      costDifference: null,
      costDifferencePct: null,
      realAssignedUnits: 0,
      dummyDestinationUnits: 0,
      dummyOriginUnits: 0,
      dummyAllocations: [],
      realAllocationsSummary: [],
      dummyCostAssumptionNote: dummyNote,
      interpretation: 'Ingresa una cantidad válida mayor o igual a 0 unidades.',
    };
  }

  const modifiedProblem: TransportationProblem = {
    origins: [...baseProblem.origins],
    destinations: [...baseProblem.destinations],
    supply: baseProblem.supply.map((val, idx) =>
      targetKind === 'supply' && idx === targetIndex ? roundClean(newValue) : val
    ),
    demand: baseProblem.demand.map((val, idx) =>
      targetKind === 'demand' && idx === targetIndex ? roundClean(newValue) : val
    ),
    costs: baseProblem.costs.map((row) => [...row]),
  };

  const validation = validateProblem(modifiedProblem);
  if (!validation.valid) {
    return {
      valid: false,
      error: validation.errors[0]?.message ?? 'El escenario modificado no es válido.',
      targetKind,
      targetIndex,
      targetName,
      previousValue,
      newValue: roundClean(newValue),
      deltaValue: roundClean(newValue - previousValue),
      originalSupplyTotal,
      originalDemandTotal,
      newSupplyTotal: roundClean(modifiedProblem.supply.reduce((a, b) => a + b, 0)),
      newDemandTotal: roundClean(modifiedProblem.demand.reduce((a, b) => a + b, 0)),
      balanceStatus: null,
      dummyAmount: 0,
      originalOptimalCost,
      newOptimalCost: null,
      costDifference: null,
      costDifferencePct: null,
      realAssignedUnits: 0,
      dummyDestinationUnits: 0,
      dummyOriginUnits: 0,
      dummyAllocations: [],
      realAllocationsSummary: [],
      dummyCostAssumptionNote: dummyNote,
      interpretation: validation.errors[0]?.message ?? 'Escenario inválido.',
    };
  }

  const balanced = balanceProblem(modifiedProblem);
  const leastCost = solveLeastCost(balanced);
  const vogel = solveVogel(balanced);
  const bestInitial = vogel.totalCost <= leastCost.totalCost ? vogel : leastCost;
  const optimal = solveModiOptimal(balanced, bestInitial);

  let realAssignedUnits = 0;
  let dummyDestinationUnits = 0;
  let dummyOriginUnits = 0;
  const dummyAllocations: UnbalancedDummyAllocation[] = [];
  const realAllocationsSummary: UnbalancedRhsEvaluation['realAllocationsSummary'] = [];

  for (let i = 0; i < balanced.origins.length; i++) {
    for (let j = 0; j < balanced.destinations.length; j++) {
      const qty = optimal.allocations[i][j];
      if (qty <= EPSILON) continue;

      const isDummyRow = i === balanced.dummyRowIndex;
      const isDummyCol = j === balanced.dummyColIndex;

      if (isDummyCol) {
        dummyDestinationUnits = roundClean(dummyDestinationUnits + qty);
        dummyAllocations.push({
          originName: balanced.origins[i],
          destinationName: balanced.destinations[j],
          quantity: qty,
        });
      } else if (isDummyRow) {
        dummyOriginUnits = roundClean(dummyOriginUnits + qty);
        dummyAllocations.push({
          originName: balanced.origins[i],
          destinationName: balanced.destinations[j],
          quantity: qty,
        });
      } else {
        realAssignedUnits = roundClean(realAssignedUnits + qty);
        realAllocationsSummary.push({
          originName: balanced.origins[i],
          destinationName: balanced.destinations[j],
          quantity: qty,
          unitCost: balanced.costs[i][j],
          subtotalCost: roundClean(qty * balanced.costs[i][j]),
        });
      }
    }
  }

  const newOptimalCost = optimal.totalCost;
  const costDifference = roundClean(newOptimalCost - originalOptimalCost);
  const costDifferencePct =
    originalOptimalCost > EPSILON
      ? roundClean((costDifference / originalOptimalCost) * 100)
      : 0;
  const deltaValue = roundClean(newValue - previousValue);

  let balanceSummary = 'El cambio mantiene equilibrada la oferta total y la demanda total.';
  if (balanced.balanceStatus === 'dummy_destination') {
    balanceSummary = `La oferta total (${fmt(balanced.originalSupplyTotal)} u) supera a la demanda total (${fmt(balanced.originalDemandTotal)} u); se agregó Destino Ficticio por ${fmt(balanced.dummyAmount)} u para absorber el excedente no enviado.`;
  } else if (balanced.balanceStatus === 'dummy_origin') {
    balanceSummary = `La demanda total (${fmt(balanced.originalDemandTotal)} u) supera a la oferta total (${fmt(balanced.originalSupplyTotal)} u); se agregó Origen Ficticio por ${fmt(balanced.dummyAmount)} u que refleja demanda no satisfecha.`;
  }

  const costChangePhrase =
    Math.abs(costDifference) <= EPSILON
      ? `el costo óptimo se mantiene en $${fmt(newOptimalCost)} MXN`
      : costDifference > 0
      ? `el costo óptimo aumenta en $${fmt(costDifference)} MXN (+${costDifferencePct.toFixed(2)}%) hasta $${fmt(newOptimalCost)} MXN`
      : `el costo óptimo disminuye en $${fmt(Math.abs(costDifference))} MXN (${costDifferencePct.toFixed(2)}%) hasta $${fmt(newOptimalCost)} MXN`;

  const interpretation = `Al ajustar ${targetKind === 'supply' ? 'la oferta de' : 'la demanda de'} ${targetName} de ${fmt(previousValue)} u a ${fmt(roundClean(newValue))} u (${deltaValue >= 0 ? `+${fmt(deltaValue)}` : fmt(deltaValue)} u), ${costChangePhrase}. ${balanceSummary} En la nueva solución se transportan ${fmt(realAssignedUnits)} u reales${
    dummyDestinationUnits > 0
      ? ` y ${fmt(dummyDestinationUnits)} u permanecen asignadas al Destino Ficticio`
      : dummyOriginUnits > 0
      ? ` y ${fmt(dummyOriginUnits)} u corresponden a demanda cubierta por el Origen Ficticio`
      : ''
  }.`;

  return {
    valid: true,
    error: null,
    targetKind,
    targetIndex,
    targetName,
    previousValue,
    newValue: roundClean(newValue),
    deltaValue,
    originalSupplyTotal,
    originalDemandTotal,
    newSupplyTotal: balanced.originalSupplyTotal,
    newDemandTotal: balanced.originalDemandTotal,
    balanceStatus: balanced.balanceStatus,
    dummyAmount: balanced.dummyAmount,
    originalOptimalCost,
    newOptimalCost,
    costDifference,
    costDifferencePct,
    realAssignedUnits,
    dummyDestinationUnits,
    dummyOriginUnits,
    dummyAllocations,
    realAllocationsSummary,
    dummyCostAssumptionNote: dummyNote,
    interpretation,
  };
}

function extractRealProblemAndMaps(balanced: BalancedProblem): {
  realProblem: TransportationProblem;
  balancedToRealOrigin: Map<number, number>;
  balancedToRealDest: Map<number, number>;
} {
  const realOrigins: string[] = [];
  const realSupply: number[] = [];
  const balancedToRealOrigin = new Map<number, number>();
  for (let i = 0; i < balanced.origins.length; i++) {
    if (i === balanced.dummyRowIndex) continue;
    balancedToRealOrigin.set(i, realOrigins.length);
    realOrigins.push(balanced.origins[i]);
    realSupply.push(balanced.supply[i]);
  }

  const realDestinations: string[] = [];
  const realDemand: number[] = [];
  const balancedToRealDest = new Map<number, number>();
  for (let j = 0; j < balanced.destinations.length; j++) {
    if (j === balanced.dummyColIndex) continue;
    balancedToRealDest.set(j, realDestinations.length);
    realDestinations.push(balanced.destinations[j]);
    realDemand.push(balanced.demand[j]);
  }

  const realCosts: number[][] = [];
  for (let i = 0; i < balanced.origins.length; i++) {
    if (i === balanced.dummyRowIndex) continue;
    const row: number[] = [];
    for (let j = 0; j < balanced.destinations.length; j++) {
      if (j === balanced.dummyColIndex) continue;
      row.push(balanced.costs[i][j]);
    }
    realCosts.push(row);
  }

  return {
    realProblem: {
      origins: realOrigins,
      destinations: realDestinations,
      supply: realSupply,
      demand: realDemand,
      costs: realCosts,
    },
    balancedToRealOrigin,
    balancedToRealDest,
  };
}

function solveModiCostForProblem(problem: TransportationProblem): number {
  const balanced = balanceProblem(problem);
  const leastCost = solveLeastCost(balanced);
  const vogel = solveVogel(balanced);
  const bestInitial = vogel.totalCost <= leastCost.totalCost ? vogel : leastCost;
  const optimal = solveModiOptimal(balanced, bestInitial);
  return optimal.totalCost;
}

function classifySign(val: number): 'positive' | 'zero' | 'negative' {
  if (Math.abs(val) <= EPSILON) return 'zero';
  return val > 0 ? 'positive' : 'negative';
}

function chooseCleanFeasibleDelta(
  deltaMin: number | null,
  deltaMax: number | null,
  preferPositive = true
): number {
  if (preferPositive && (deltaMax === null || deltaMax > EPSILON)) {
    const cap = deltaMax === null ? 10 : deltaMax;
    if (cap >= 10) return 10;
    if (cap >= 2) return Math.floor(cap / 2);
    if (cap >= 1) return 1;
    return roundClean(cap / 2);
  }
  if (deltaMin !== null && deltaMin < -EPSILON) {
    const absCap = Math.abs(deltaMin);
    if (absCap >= 10) return -10;
    if (absCap >= 2) return -Math.floor(absCap / 2);
    if (absCap >= 1) return -1;
    return -roundClean(absCap / 2);
  }
  return 0;
}

export function buildDualShadowPriceAnalysis(
  balanced: BalancedProblem,
  optimal: OptimalResult,
  rhsSensitivity: RhsSensitivityAnalysis
): DualShadowPriceAnalysis {
  const m = balanced.origins.length;
  const n = balanced.destinations.length;
  const treeCheck = verifyConnectedSpanningTree(optimal.basicMask);

  const basicEquations: DualEquationRow[] = [];
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (!optimal.basicMask[i][j]) continue;
      const uVal = optimal.finalU[i] ?? 0;
      const vVal = optimal.finalV[j] ?? 0;
      const cVal = balanced.costs[i][j];
      const isDummy = i === balanced.dummyRowIndex || j === balanced.dummyColIndex;
      basicEquations.push({
        row: i,
        col: j,
        originName: balanced.origins[i],
        destinationName: balanced.destinations[j],
        unitCost: cVal,
        uValue: uVal,
        vValue: vVal,
        formulaText: `u_${i + 1} (${fmt(uVal)}) + v_${j + 1} (${fmt(vVal)}) = c_${i + 1}${j + 1} (${fmt(cVal)})`,
        isDummy,
      });
    }
  }

  let dualFeasibilityVerified = treeCheck.isValidTree;
  for (let i = 0; i < m && dualFeasibilityVerified; i++) {
    for (let j = 0; j < n; j++) {
      const diff = roundClean(balanced.costs[i][j] - (optimal.finalU[i] + optimal.finalV[j]));
      if (optimal.basicMask[i][j] && Math.abs(diff) > 1e-6) {
        dualFeasibilityVerified = false;
        break;
      }
      if (!optimal.basicMask[i][j] && diff < -1e-6) {
        dualFeasibilityVerified = false;
        break;
      }
    }
  }

  const realOriginIndices: number[] = [];
  for (let i = 0; i < m; i++) {
    if (i !== balanced.dummyRowIndex) realOriginIndices.push(i);
  }
  const realDestIndices: number[] = [];
  for (let j = 0; j < n; j++) {
    if (j !== balanced.dummyColIndex) realDestIndices.push(j);
  }

  const supplyTransfers: BalancedTransferSensitivity[] = [];
  const demandTransfers: BalancedTransferSensitivity[] = [];

  if (treeCheck.isValidTree) {
    // Transferencias balanceadas entre pares de almacenes reales: a'_to = a_to + δ, a'_from = a_from - δ
    for (let a = 0; a < realOriginIndices.length; a++) {
      for (let b = a + 1; b < realOriginIndices.length; b++) {
        const fromIdx = realOriginIndices[a];
        const toIdx = realOriginIndices[b];
        const pathSteps = findTreePathBetweenNodes(balanced, optimal, toIdx, fromIdx);
        if (!pathSteps || pathSteps.length === 0) continue;

        const plusSteps = pathSteps.filter((s) => s.sign === '+');
        const minusSteps = pathSteps.filter((s) => s.sign === '-');
        const minPlus = Math.min(...plusSteps.map((s) => s.currentAllocation));
        const minMinus = Math.min(...minusSteps.map((s) => s.currentAllocation));
        const deltaMin = roundClean(-minPlus);
        const deltaMax = roundClean(minMinus);

        const fromPotential = optimal.finalU[fromIdx] ?? 0;
        const toPotential = optimal.finalU[toIdx] ?? 0;
        const marginalCostPerUnit = roundClean(toPotential - fromPotential);
        const signCategory = classifySign(marginalCostPerUnit);
        const hasTightBound = Math.abs(deltaMin) <= EPSILON || Math.abs(deltaMax) <= EPSILON;
        const usesDummyInPath = pathSteps.some((s) => s.isDummy);

        const fromName = balanced.origins[fromIdx];
        const toName = balanced.origins[toIdx];

        let interpretation = '';
        if (signCategory === 'zero') {
          interpretation = `u_${toIdx + 1} − u_${fromIdx + 1} = $0 MXN/u: transferir unidades entre ${fromName} y ${toName} dentro de δ ∈ [${fmt(deltaMin)}, +${fmt(deltaMax)}] u mantiene sin cambio el costo total.`;
        } else if (signCategory === 'negative') {
          interpretation = `u_${toIdx + 1} − u_${fromIdx + 1} = -$${fmt(Math.abs(marginalCostPerUnit))} MXN/u: trasladar 1 u de oferta de ${fromName} hacia ${toName} reduce el costo óptimo en $${fmt(Math.abs(marginalCostPerUnit))} MXN/u mientras δ ∈ [${fmt(deltaMin)}, +${fmt(deltaMax)}] u.`;
        } else {
          interpretation = `u_${toIdx + 1} − u_${fromIdx + 1} = +$${fmt(marginalCostPerUnit)} MXN/u: trasladar 1 u de ${fromName} hacia ${toName} incrementa el costo en $${fmt(marginalCostPerUnit)} MXN/u (en sentido inverso, de ${toName} hacia ${fromName}, ahorra $${fmt(marginalCostPerUnit)} MXN/u) dentro de δ ∈ [${fmt(deltaMin)}, +${fmt(deltaMax)}] u.`;
        }

        supplyTransfers.push({
          kind: 'supply_transfer',
          fromIndex: fromIdx,
          toIndex: toIdx,
          fromName,
          toName,
          fromPotential,
          toPotential,
          marginalCostPerUnit,
          signCategory,
          deltaMin,
          deltaMax,
          hasTightBound,
          pathSteps,
          usesDummyInPath,
          interpretation,
        });
      }
    }

    // Transferencias balanceadas entre pares de sucursales reales: b'_to = b_to + δ, b'_from = b_from - δ
    for (let a = 0; a < realDestIndices.length; a++) {
      for (let b = a + 1; b < realDestIndices.length; b++) {
        const fromIdx = realDestIndices[a];
        const toIdx = realDestIndices[b];
        const pathSteps = findTreePathBetweenNodes(balanced, optimal, m + toIdx, m + fromIdx);
        if (!pathSteps || pathSteps.length === 0) continue;

        const plusSteps = pathSteps.filter((s) => s.sign === '+');
        const minusSteps = pathSteps.filter((s) => s.sign === '-');
        const minPlus = Math.min(...plusSteps.map((s) => s.currentAllocation));
        const minMinus = Math.min(...minusSteps.map((s) => s.currentAllocation));
        const deltaMin = roundClean(-minPlus);
        const deltaMax = roundClean(minMinus);

        const fromPotential = optimal.finalV[fromIdx] ?? 0;
        const toPotential = optimal.finalV[toIdx] ?? 0;
        const marginalCostPerUnit = roundClean(toPotential - fromPotential);
        const signCategory = classifySign(marginalCostPerUnit);
        const hasTightBound = Math.abs(deltaMin) <= EPSILON || Math.abs(deltaMax) <= EPSILON;
        const usesDummyInPath = pathSteps.some((s) => s.isDummy);

        const fromName = balanced.destinations[fromIdx];
        const toName = balanced.destinations[toIdx];

        let interpretation = '';
        if (signCategory === 'zero') {
          interpretation = `v_${toIdx + 1} − v_${fromIdx + 1} = $0 MXN/u: desplazar demanda entre ${fromName} y ${toName} dentro de δ ∈ [${fmt(deltaMin)}, +${fmt(deltaMax)}] u no altera el costo óptimo.`;
        } else if (signCategory === 'negative') {
          interpretation = `v_${toIdx + 1} − v_${fromIdx + 1} = -$${fmt(Math.abs(marginalCostPerUnit))} MXN/u: reasignar 1 u de demanda de ${fromName} hacia ${toName} reduce el costo óptimo en $${fmt(Math.abs(marginalCostPerUnit))} MXN/u mientras δ ∈ [${fmt(deltaMin)}, +${fmt(deltaMax)}] u.`;
        } else {
          interpretation = `v_${toIdx + 1} − v_${fromIdx + 1} = +$${fmt(marginalCostPerUnit)} MXN/u: incrementar demanda en ${toName} reduciendo en ${fromName} sube el costo en $${fmt(marginalCostPerUnit)} MXN/u (mover en sentido inverso ahorra $${fmt(marginalCostPerUnit)} MXN/u) dentro de δ ∈ [${fmt(deltaMin)}, +${fmt(deltaMax)}] u.`;
        }

        demandTransfers.push({
          kind: 'demand_transfer',
          fromIndex: fromIdx,
          toIndex: toIdx,
          fromName,
          toName,
          fromPotential,
          toPotential,
          marginalCostPerUnit,
          signCategory,
          deltaMin,
          deltaMax,
          hasTightBound,
          pathSteps,
          usesDummyInPath,
          interpretation,
        });
      }
    }
  }

  // Ejemplos numéricos dinámicos comprobados mediante reoptimización real con MODI
  const workedExamples: ShadowPriceWorkedExample[] = [];
  const { realProblem, balancedToRealOrigin, balancedToRealDest } =
    extractRealProblemAndMaps(balanced);

  if (treeCheck.isValidTree && dualFeasibilityVerified) {
    // Ejemplo 1: Variación conjunta balanceada (a_i + δ, b_j + δ)
    const reliablePairs = rhsSensitivity.balancedPairs.filter((p) => p.reliable);
    const preferredJointPair =
      reliablePairs.find((p) => !p.isBasicPair && p.deltaMax !== null && p.deltaMax > EPSILON) ??
      reliablePairs.find((p) => p.deltaMax === null || p.deltaMax > EPSILON) ??
      reliablePairs.find((p) => p.deltaMin !== null && p.deltaMin < -EPSILON) ??
      reliablePairs[0];

    if (preferredJointPair && preferredJointPair.marginalCostPerUnit !== null) {
      const delta = chooseCleanFeasibleDelta(
        preferredJointPair.deltaMin,
        preferredJointPair.deltaMax,
        true
      );
      const uVal = optimal.finalU[preferredJointPair.originIndex] ?? 0;
      const vVal = optimal.finalV[preferredJointPair.destinationIndex] ?? 0;
      const expectedNewCost = roundClean(
        optimal.totalCost + preferredJointPair.marginalCostPerUnit * delta
      );

      const realOIdx = balancedToRealOrigin.get(preferredJointPair.originIndex);
      const realDIdx = balancedToRealDest.get(preferredJointPair.destinationIndex);
      let verifiedModiCost = optimal.totalCost;
      let verifiedWithModi = false;

      if (realOIdx !== undefined && realDIdx !== undefined) {
        const modProblem: TransportationProblem = {
          ...realProblem,
          supply: realProblem.supply.map((val, idx) =>
            idx === realOIdx ? roundClean(val + delta) : val
          ),
          demand: realProblem.demand.map((val, idx) =>
            idx === realDIdx ? roundClean(val + delta) : val
          ),
          costs: realProblem.costs.map((r) => [...r]),
        };
        verifiedModiCost = solveModiCostForProblem(modProblem);
        verifiedWithModi = Math.abs(verifiedModiCost - expectedNewCost) <= 1e-6;
      }

      const dMinStr =
        preferredJointPair.deltaMin === null ? '-∞' : fmt(preferredJointPair.deltaMin);
      const dMaxStr =
        preferredJointPair.deltaMax === null ? '+∞' : `+${fmt(preferredJointPair.deltaMax)}`;

      workedExamples.push({
        id: 'joint_pair_example',
        kind: 'joint_pair',
        title: `Variación conjunta balanceada: ${preferredJointPair.originName} y ${preferredJointPair.destinationName}`,
        involvedOrigin: preferredJointPair.originName,
        involvedDestination: preferredJointPair.destinationName,
        deltaUnits: delta,
        potentialsUsed: `u_${preferredJointPair.originIndex + 1} = ${fmt(uVal)}, v_${preferredJointPair.destinationIndex + 1} = ${fmt(vVal)} (u_i + v_j = $${fmt(preferredJointPair.marginalCostPerUnit)}/u)`,
        formulaApplied: `Z' = Z* + (u_${preferredJointPair.originIndex + 1} + v_${preferredJointPair.destinationIndex + 1})·δ = $${fmt(optimal.totalCost)} + (${fmt(uVal)} + ${fmt(vVal)})·(${delta >= 0 ? `+${fmt(delta)}` : fmt(delta)}) = $${fmt(expectedNewCost)} MXN`,
        originalOptimalCost: optimal.totalCost,
        expectedNewCost,
        verifiedModiCost,
        verifiedWithModi,
        conditions: [
          `El incremento δ = ${delta >= 0 ? `+${fmt(delta)}` : fmt(delta)} u pertenece al intervalo factible [${dMinStr}, ${dMaxStr}${preferredJointPair.deltaMax === null ? ')' : ']'} u de la Etapa 2.`,
          `La oferta de ${preferredJointPair.originName} y la demanda de ${preferredJointPair.destinationName} cambian simultáneamente en igual magnitud para conservar el equilibrio.`,
          'Permanecen constantes los costos unitarios c_ij y las capacidades de los demás almacenes y sucursales.',
        ],
        interpretation:
          preferredJointPair.marginalCostPerUnit === 0
            ? `Como u_i + v_j = $0/u, variar conjuntamente ambos nodos en ${fmt(delta)} u mantiene el costo óptimo en $${fmt(expectedNewCost)} MXN.`
            : preferredJointPair.marginalCostPerUnit > 0
            ? `Cada unidad adicional suministrada conjuntamente por ${preferredJointPair.originName} a ${preferredJointPair.destinationName} cuesta $${fmt(preferredJointPair.marginalCostPerUnit)} MXN netos en la red óptima (comprobado por MODI: $${fmt(verifiedModiCost)} MXN).`
            : `Por efecto de compensación en la trayectoria básica, incrementar ambos en ${fmt(delta)} u reduce el costo total a razón de $${fmt(Math.abs(preferredJointPair.marginalCostPerUnit))} MXN/u (comprobado por MODI: $${fmt(verifiedModiCost)} MXN).`,
      });
    }

    // Ejemplo 2: Transferencia de oferta entre almacenes (u_i - u_r)
    const feasibleSupplyTransfer =
      supplyTransfers.find((t) => Math.abs(t.marginalCostPerUnit) > EPSILON && (t.deltaMax > EPSILON || t.deltaMin < -EPSILON)) ??
      supplyTransfers.find((t) => t.deltaMax > EPSILON || t.deltaMin < -EPSILON);

    if (feasibleSupplyTransfer) {
      // Elegimos el sentido de δ que mantenga delta > 0 si es posible (o negativo si solo δ_min < 0)
      const preferCostSaving =
        feasibleSupplyTransfer.marginalCostPerUnit > 0 &&
        feasibleSupplyTransfer.deltaMin < -EPSILON;
      const rawDelta = preferCostSaving
        ? chooseCleanFeasibleDelta(feasibleSupplyTransfer.deltaMin, feasibleSupplyTransfer.deltaMax, false)
        : chooseCleanFeasibleDelta(feasibleSupplyTransfer.deltaMin, feasibleSupplyTransfer.deltaMax, true);

      const receivingIdx = rawDelta >= 0 ? feasibleSupplyTransfer.toIndex : feasibleSupplyTransfer.fromIndex;
      const givingIdx = rawDelta >= 0 ? feasibleSupplyTransfer.fromIndex : feasibleSupplyTransfer.toIndex;
      const absDelta = Math.abs(rawDelta);

      const uRecv = optimal.finalU[receivingIdx] ?? 0;
      const uGive = optimal.finalU[givingIdx] ?? 0;
      const unitSavingOrCost = roundClean(uRecv - uGive);
      const expectedNewCost = roundClean(optimal.totalCost + unitSavingOrCost * absDelta);

      const realRecv = balancedToRealOrigin.get(receivingIdx);
      const realGive = balancedToRealOrigin.get(givingIdx);
      let verifiedModiCost = optimal.totalCost;
      let verifiedWithModi = false;

      if (realRecv !== undefined && realGive !== undefined) {
        const modProblem: TransportationProblem = {
          ...realProblem,
          supply: realProblem.supply.map((val, idx) =>
            idx === realRecv
              ? roundClean(val + absDelta)
              : idx === realGive
              ? roundClean(val - absDelta)
              : val
          ),
          costs: realProblem.costs.map((r) => [...r]),
        };
        verifiedModiCost = solveModiCostForProblem(modProblem);
        verifiedWithModi = Math.abs(verifiedModiCost - expectedNewCost) <= 1e-6;
      }

      const bridgeDests = Array.from(
        new Set(feasibleSupplyTransfer.pathSteps.map((s) => s.destinationName))
      ).join(', ');
      const recvName = balanced.origins[receivingIdx];
      const giveName = balanced.origins[givingIdx];

      workedExamples.push({
        id: 'supply_transfer_example',
        kind: 'supply_transfer',
        title: `Transferencia de oferta entre almacenes: de ${giveName} a ${recvName}`,
        involvedOrigin: `${recvName} (+${fmt(absDelta)} u) y ${giveName} (-${fmt(absDelta)} u)`,
        involvedDestination: `${bridgeDests} (demanda constante; ruta puente en el árbol)`,
        deltaUnits: absDelta,
        potentialsUsed: `u_${receivingIdx + 1} (${recvName}) = ${fmt(uRecv)}, u_${givingIdx + 1} (${giveName}) = ${fmt(uGive)} ⇒ u_${receivingIdx + 1} − u_${givingIdx + 1} = ${unitSavingOrCost >= 0 ? `+$${fmt(unitSavingOrCost)}` : `-$${fmt(Math.abs(unitSavingOrCost))}`}/u`,
        formulaApplied: `Z' = Z* + (u_${receivingIdx + 1} − u_${givingIdx + 1})·δ = $${fmt(optimal.totalCost)} + (${fmt(uRecv)} − ${fmt(uGive)})·${fmt(absDelta)} = $${fmt(expectedNewCost)} MXN`,
        originalOptimalCost: optimal.totalCost,
        expectedNewCost,
        verifiedModiCost,
        verifiedWithModi,
        conditions: [
          `El traslado de ${fmt(absDelta)} u de ${giveName} a ${recvName} mantiene intacta la oferta total (Σa_i sin cambio).`,
          `El desplazamiento δ está dentro del rango admisible de la base [${fmt(feasibleSupplyTransfer.deltaMin)}, +${fmt(feasibleSupplyTransfer.deltaMax)}] u.`,
          'Las demandas de todas las sucursales y los costos unitarios permanecen fijos.',
        ],
        interpretation:
          unitSavingOrCost < 0
            ? `${recvName} tiene una ventaja posicional de $${fmt(Math.abs(unitSavingOrCost))} MXN/u frente a ${giveName}; transferir ${fmt(absDelta)} u reduce el costo total a $${fmt(verifiedModiCost)} MXN.`
            : unitSavingOrCost === 0
            ? `Ambos almacenes presentan el mismo potencial dual (diferencia $0/u); reasignar ${fmt(absDelta)} u mantiene idéntico el costo óptimo ($${fmt(verifiedModiCost)} MXN).`
            : `Trasladar ${fmt(absDelta)} u hacia ${recvName} encarecería el sistema en $${fmt(unitSavingOrCost)} MXN/u (total $${fmt(verifiedModiCost)} MXN).`,
      });
    }

    // Ejemplo 3: Transferencia de demanda entre sucursales (v_j - v_l)
    const feasibleDemandTransfer =
      demandTransfers.find((t) => Math.abs(t.marginalCostPerUnit) > EPSILON && (t.deltaMax > EPSILON || t.deltaMin < -EPSILON)) ??
      demandTransfers.find((t) => t.deltaMax > EPSILON || t.deltaMin < -EPSILON);

    if (feasibleDemandTransfer) {
      const preferCostSaving =
        feasibleDemandTransfer.marginalCostPerUnit > 0 &&
        feasibleDemandTransfer.deltaMin < -EPSILON;
      const rawDelta = preferCostSaving
        ? chooseCleanFeasibleDelta(feasibleDemandTransfer.deltaMin, feasibleDemandTransfer.deltaMax, false)
        : chooseCleanFeasibleDelta(feasibleDemandTransfer.deltaMin, feasibleDemandTransfer.deltaMax, true);

      const receivingIdx = rawDelta >= 0 ? feasibleDemandTransfer.toIndex : feasibleDemandTransfer.fromIndex;
      const givingIdx = rawDelta >= 0 ? feasibleDemandTransfer.fromIndex : feasibleDemandTransfer.toIndex;
      const absDelta = Math.abs(rawDelta);

      const vRecv = optimal.finalV[receivingIdx] ?? 0;
      const vGive = optimal.finalV[givingIdx] ?? 0;
      const unitSavingOrCost = roundClean(vRecv - vGive);
      const expectedNewCost = roundClean(optimal.totalCost + unitSavingOrCost * absDelta);

      const realRecv = balancedToRealDest.get(receivingIdx);
      const realGive = balancedToRealDest.get(givingIdx);
      let verifiedModiCost = optimal.totalCost;
      let verifiedWithModi = false;

      if (realRecv !== undefined && realGive !== undefined) {
        const modProblem: TransportationProblem = {
          ...realProblem,
          demand: realProblem.demand.map((val, idx) =>
            idx === realRecv
              ? roundClean(val + absDelta)
              : idx === realGive
              ? roundClean(val - absDelta)
              : val
          ),
          costs: realProblem.costs.map((r) => [...r]),
        };
        verifiedModiCost = solveModiCostForProblem(modProblem);
        verifiedWithModi = Math.abs(verifiedModiCost - expectedNewCost) <= 1e-6;
      }

      const bridgeOrigins = Array.from(
        new Set(feasibleDemandTransfer.pathSteps.map((s) => s.originName))
      ).join(', ');
      const recvName = balanced.destinations[receivingIdx];
      const giveName = balanced.destinations[givingIdx];

      workedExamples.push({
        id: 'demand_transfer_example',
        kind: 'demand_transfer',
        title: `Transferencia de demanda entre sucursales: de ${giveName} a ${recvName}`,
        involvedOrigin: `${bridgeOrigins} (oferta constante; ruta puente en el árbol)`,
        involvedDestination: `${recvName} (+${fmt(absDelta)} u) y ${giveName} (-${fmt(absDelta)} u)`,
        deltaUnits: absDelta,
        potentialsUsed: `v_${receivingIdx + 1} (${recvName}) = ${fmt(vRecv)}, v_${givingIdx + 1} (${giveName}) = ${fmt(vGive)} ⇒ v_${receivingIdx + 1} − v_${givingIdx + 1} = ${unitSavingOrCost >= 0 ? `+$${fmt(unitSavingOrCost)}` : `-$${fmt(Math.abs(unitSavingOrCost))}`}/u`,
        formulaApplied: `Z' = Z* + (v_${receivingIdx + 1} − v_${givingIdx + 1})·δ = $${fmt(optimal.totalCost)} + (${fmt(vRecv)} − ${fmt(vGive)})·${fmt(absDelta)} = $${fmt(expectedNewCost)} MXN`,
        originalOptimalCost: optimal.totalCost,
        expectedNewCost,
        verifiedModiCost,
        verifiedWithModi,
        conditions: [
          `El desplazamiento de ${fmt(absDelta)} u de demanda de ${giveName} a ${recvName} conserva constante la demanda total (Σb_j).`,
          `El ajuste está contenido en el rango factible [${fmt(feasibleDemandTransfer.deltaMin)}, +${fmt(feasibleDemandTransfer.deltaMax)}] u de la base actual.`,
          'Las ofertas de los almacenes y la matriz de costos unitarios se mantienen constantes.',
        ],
        interpretation:
          unitSavingOrCost < 0
            ? `Atender ${recvName} en lugar de ${giveName} resulta $${fmt(Math.abs(unitSavingOrCost))} MXN/u más económico en la estructura óptima; trasladar ${fmt(absDelta)} u baja el costo total a $${fmt(verifiedModiCost)} MXN.`
            : unitSavingOrCost === 0
            ? `Ambas sucursales tienen igual costo marginal implícito (v_${receivingIdx + 1} − v_${givingIdx + 1} = $0/u); el costo óptimo permanece en $${fmt(verifiedModiCost)} MXN.`
            : `Desplazar ${fmt(absDelta)} u de demanda hacia ${recvName} incrementa el costo total a $${fmt(verifiedModiCost)} MXN ($${fmt(unitSavingOrCost)} MXN/u adicionales).`,
      });
    }
  }

  const limitationsNote: string[] = [
    'Normalización arbitraria (u_1 = 0): al existir una ecuación redundante por el equilibrio Σa_i = Σb_j, los valores individuales u_i y v_j dependen de elegir u_1 = 0 y nunca deben interpretarse de forma aislada.',
    'Invariancia ante renormalización: si se fija u_1 = k, todo u_i cambia en +k y todo v_j en -k, pero las combinaciones económicamente válidas (u_i + v_j, u_i − u_r, v_j − v_l y Δ_ij) permanecen idénticas.',
    'Prohibición de extrapolación: las tasas marginales solo son válidas dentro de los intervalos de factibilidad [δ_mín, δ_máx] de la Etapa 2; fuera de ellos la base actual pierde factibilidad y cambia la pendiente de costo.',
    'Escenarios desbalanceados: si solo aumenta una oferta o una demanda aislada, el sistema se desbalancea y requiere reoptimización con nodo ficticio (Etapa 2.2), no multiplicadores duales directos.',
  ];

  if (rhsSensitivity.hasDegeneracy) {
    limitationsNote.push(
      'Degeneración activa (celdas básicas con 0 u): cuando δ_mín = 0 o δ_máx = 0 en alguna trayectoria, la tasa marginal sigue siendo correcta en los pares con tolerancia positiva, pero un desplazamiento hacia el extremo nulo obliga a cambiar de base degenerada.'
    );
  }

  if (optimal.hasAlternativeOptima) {
    limitationsNote.push(
      'Óptimos alternativos (Δ_ij = 0): los potenciales duales (u_i, v_j) y sus tasas marginales siguen siendo válidos y únicos para esta base mientras δ permanezca dentro del intervalo factible.'
    );
  }

  return {
    implemented: true,
    basisIsValidTree: treeCheck.isValidTree,
    normalizationNote:
      'Para resolver el sistema de m+n−1 ecuaciones básicas (u_i + v_j = c_ij) con m+n incógnitas, el motor MODI fija la referencia u_1 = 0 y calcula secuencialmente el resto de potenciales.',
    normalizationInvarianceNote:
      'Si se utilizara otra normalización u_1 = k, se obtendría u\'_i = u_i + k y v\'_j = v_j − k; todas las decisiones económicas (u_i + v_j, u_i − u_r, v_j − v_l y Δ_ij = c_ij − u_i − v_j) son exactamente invariantes.',
    isolatedChangeWarning:
      'Advertencia clave: un potencial individual u_i o v_j NO mide el efecto de aumentar únicamente la oferta de un almacén o únicamente la demanda de una sucursal, porque eso rompería la igualdad Σa_i = Σb_j.',
    basicEquations,
    dualFeasibilityVerified,
    supplyTransfers,
    demandTransfers,
    workedExamples,
    limitationsNote,
  };
}

export function cloneTransportationProblem(
  problem: TransportationProblem
): TransportationProblem {
  return {
    origins: [...problem.origins],
    destinations: [...problem.destinations],
    supply: [...problem.supply],
    demand: [...problem.demand],
    costs: problem.costs.map((row) => [...row]),
  };
}

function hasMatrixDegeneracy(optimal: OptimalResult): boolean {
  for (let i = 0; i < optimal.basicMask.length; i++) {
    for (let j = 0; j < optimal.basicMask[i].length; j++) {
      if (optimal.basicMask[i][j] && optimal.allocations[i][j] <= EPSILON) {
        return true;
      }
    }
  }
  return false;
}

function computeRealShippedUnits(balanced: BalancedProblem, optimal: OptimalResult): number {
  let total = 0;
  for (let i = 0; i < balanced.origins.length; i++) {
    if (i === balanced.dummyRowIndex) continue;
    for (let j = 0; j < balanced.destinations.length; j++) {
      if (j === balanced.dummyColIndex) continue;
      total += optimal.allocations[i][j];
    }
  }
  return roundClean(total);
}

export function compareTransportationScenarios(
  original: TransportationProblem,
  alternative: TransportationProblem,
  precomputedOriginal?: SolveResponse
): ScenarioComparisonResult {
  const origSupplyTotal = roundClean(original.supply.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0));
  const origDemandTotal = roundClean(original.demand.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0));
  const altSupplyTotal = roundClean(alternative.supply.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0));
  const altDemandTotal = roundClean(alternative.demand.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0));

  const origValidation = validateProblem(original);
  const altValidation = validateProblem(alternative);
  const errors: string[] = [];

  if (!origValidation.valid) {
    errors.push(...origValidation.errors.map((e) => `Escenario original: ${e.message}`));
  }
  if (!altValidation.valid) {
    errors.push(...altValidation.errors.map((e) => `Escenario alternativo: ${e.message}`));
  }
  if (
    original.origins.length !== alternative.origins.length ||
    original.destinations.length !== alternative.destinations.length
  ) {
    errors.push(
      'Las dimensiones del escenario alternativo deben coincidir con las del escenario original.'
    );
  }

  const origBalanced = origValidation.valid
    ? precomputedOriginal?.balanced ?? balanceProblem(original)
    : null;
  const origOptimal = origValidation.valid
    ? precomputedOriginal?.optimal ??
      (() => {
        const b = origBalanced!;
        const lc = solveLeastCost(b);
        const vg = solveVogel(b);
        return solveModiOptimal(b, vg.totalCost <= lc.totalCost ? vg : lc);
      })()
    : null;

  const originalOptimalCost = origOptimal?.totalCost ?? 0;

  if (errors.length > 0 || !origBalanced || !origOptimal) {
    return {
      valid: false,
      errors,
      hasInputChanges: false,
      inputChanges: [],
      originalOptimalCost,
      alternativeOptimalCost: null,
      alternativeLeastCost: null,
      alternativeVogelCost: null,
      costDifference: null,
      costDifferencePct: null,
      costFormulaText:
        'Diferencia % = ((Z*_alternativo − Z*_original) / Z*_original) × 100',
      originalSupplyTotal: origSupplyTotal,
      alternativeSupplyTotal: altSupplyTotal,
      supplyTotalDelta: roundClean(altSupplyTotal - origSupplyTotal),
      originalDemandTotal: origDemandTotal,
      alternativeDemandTotal: altDemandTotal,
      demandTotalDelta: roundClean(altDemandTotal - origDemandTotal),
      originalBalanceStatus: origBalanced?.balanceStatus ?? null,
      alternativeBalanceStatus: null,
      originalDummyAmount: origBalanced?.dummyAmount ?? 0,
      alternativeDummyAmount: 0,
      originalRealShippedUnits:
        origBalanced && origOptimal ? computeRealShippedUnits(origBalanced, origOptimal) : 0,
      alternativeRealShippedUnits: 0,
      originalHasDegeneracy: origOptimal ? hasMatrixDegeneracy(origOptimal) : false,
      alternativeHasDegeneracy: false,
      originalHasAlternativeOptima: origOptimal?.hasAlternativeOptima ?? false,
      alternativeHasAlternativeOptima: false,
      routeDiffs: [],
      dummyRouteDiffs: [],
      addedRoutesCount: 0,
      removedRoutesCount: 0,
      changedQuantityRoutesCount: 0,
      unchangedRoutesCount: 0,
      structuralAlerts: [],
      dynamicExplanation: {
        costSummary: 'Corrige los datos inválidos del escenario alternativo para calcular la comparación.',
        routeSummary: 'Sin comparación de rutas disponible hasta validar el escenario alternativo.',
        driverSummary: 'Revisa que todos los costos, ofertas y demandas sean números finitos mayores o iguales a cero.',
        dummyLimitationNote: null,
        validityPrincipleNote:
          'Cada solución óptima depende directamente de sus parámetros de entrada (c_ij, a_i, b_j).',
      },
    };
  }

  const altBalanced = balanceProblem(alternative);
  const altLeastCost = solveLeastCost(altBalanced);
  const altVogel = solveVogel(altBalanced);
  const altBestInitial =
    altVogel.totalCost <= altLeastCost.totalCost ? altVogel : altLeastCost;
  const altOptimal = solveModiOptimal(altBalanced, altBestInitial);

  // 1) Detectar exactamente qué parámetros de entrada cambiaron
  const inputChanges: ScenarioInputChange[] = [];
  for (let i = 0; i < original.origins.length; i++) {
    const oName = original.origins[i]?.trim() || `Almacén ${i + 1}`;
    if (Math.abs(alternative.supply[i] - original.supply[i]) > EPSILON) {
      inputChanges.push({
        kind: 'supply',
        label: `Oferta ${oName}`,
        originalValue: original.supply[i],
        alternativeValue: alternative.supply[i],
        delta: roundClean(alternative.supply[i] - original.supply[i]),
      });
    }
  }
  for (let j = 0; j < original.destinations.length; j++) {
    const dName = original.destinations[j]?.trim() || `Sucursal ${j + 1}`;
    if (Math.abs(alternative.demand[j] - original.demand[j]) > EPSILON) {
      inputChanges.push({
        kind: 'demand',
        label: `Demanda ${dName}`,
        originalValue: original.demand[j],
        alternativeValue: alternative.demand[j],
        delta: roundClean(alternative.demand[j] - original.demand[j]),
      });
    }
  }
  for (let i = 0; i < original.origins.length; i++) {
    const oName = original.origins[i]?.trim() || `Almacén ${i + 1}`;
    for (let j = 0; j < original.destinations.length; j++) {
      const dName = original.destinations[j]?.trim() || `Sucursal ${j + 1}`;
      if (Math.abs(alternative.costs[i][j] - original.costs[i][j]) > EPSILON) {
        inputChanges.push({
          kind: 'cost',
          label: `Tarifa ${oName} → ${dName}`,
          originalValue: original.costs[i][j],
          alternativeValue: alternative.costs[i][j],
          delta: roundClean(alternative.costs[i][j] - original.costs[i][j]),
        });
      }
    }
  }

  // 2) Comparación de costos con fórmula y denominador explícitos
  const alternativeOptimalCost = altOptimal.totalCost;
  const costDifference = roundClean(alternativeOptimalCost - originalOptimalCost);
  const costDifferencePct =
    originalOptimalCost > EPSILON
      ? roundClean((costDifference / originalOptimalCost) * 100)
      : 0;
  const costFormulaText =
    originalOptimalCost > EPSILON
      ? `(${fmt(alternativeOptimalCost)} − ${fmt(originalOptimalCost)}) / ${fmt(originalOptimalCost)} × 100 = ${costDifferencePct >= 0 ? '+' : ''}${costDifferencePct.toFixed(2)}% (denominador: costo óptimo original $${fmt(originalOptimalCost)} MXN)`
      : 'Costo óptimo original = $0 MXN (porcentaje no definido sobre denominador cero).';

  // 3) Comparación detallada de rutas reales
  const routeDiffs: ScenarioRouteDiff[] = [];
  let addedRoutesCount = 0;
  let removedRoutesCount = 0;
  let changedQuantityRoutesCount = 0;
  let unchangedRoutesCount = 0;

  for (let i = 0; i < original.origins.length; i++) {
    for (let j = 0; j < original.destinations.length; j++) {
      const origQty = roundClean(origOptimal.allocations[i][j]);
      const altQty = roundClean(altOptimal.allocations[i][j]);
      if (origQty <= EPSILON && altQty <= EPSILON) continue;

      const originName = origBalanced.origins[i];
      const destinationName = origBalanced.destinations[j];
      const origCost = original.costs[i][j];
      const altCost = alternative.costs[i][j];
      const origSub = roundClean(origQty * origCost);
      const altSub = roundClean(altQty * altCost);

      let status: ScenarioRouteDiff['status'] = 'unchanged';
      if (origQty <= EPSILON && altQty > EPSILON) {
        status = 'added';
        addedRoutesCount++;
      } else if (origQty > EPSILON && altQty <= EPSILON) {
        status = 'removed';
        removedRoutesCount++;
      } else if (altQty - origQty > EPSILON) {
        status = 'increased';
        changedQuantityRoutesCount++;
      } else if (origQty - altQty > EPSILON) {
        status = 'decreased';
        changedQuantityRoutesCount++;
      } else {
        status = 'unchanged';
        unchangedRoutesCount++;
      }

      routeDiffs.push({
        originName,
        destinationName,
        isDummy: false,
        status,
        originalQuantity: origQty,
        alternativeQuantity: altQty,
        quantityDelta: roundClean(altQty - origQty),
        originalUnitCost: origCost,
        alternativeUnitCost: altCost,
        originalSubtotal: origSub,
        alternativeSubtotal: altSub,
        subtotalDelta: roundClean(altSub - origSub),
      });
    }
  }

  // 4) Comparación separada de flujos ficticios (nunca mezclados con envíos reales)
  const dummyMap = new Map<string, { originName: string; destinationName: string; origQty: number; altQty: number }>();

  for (let i = 0; i < origBalanced.origins.length; i++) {
    for (let j = 0; j < origBalanced.destinations.length; j++) {
      const isDummy = i === origBalanced.dummyRowIndex || j === origBalanced.dummyColIndex;
      if (!isDummy) continue;
      const qty = roundClean(origOptimal.allocations[i][j]);
      if (qty <= EPSILON) continue;
      const key = `${origBalanced.origins[i]}__${origBalanced.destinations[j]}`;
      const existing = dummyMap.get(key) ?? {
        originName: origBalanced.origins[i],
        destinationName: origBalanced.destinations[j],
        origQty: 0,
        altQty: 0,
      };
      existing.origQty = qty;
      dummyMap.set(key, existing);
    }
  }

  for (let i = 0; i < altBalanced.origins.length; i++) {
    for (let j = 0; j < altBalanced.destinations.length; j++) {
      const isDummy = i === altBalanced.dummyRowIndex || j === altBalanced.dummyColIndex;
      if (!isDummy) continue;
      const qty = roundClean(altOptimal.allocations[i][j]);
      if (qty <= EPSILON) continue;
      const key = `${altBalanced.origins[i]}__${altBalanced.destinations[j]}`;
      const existing = dummyMap.get(key) ?? {
        originName: altBalanced.origins[i],
        destinationName: altBalanced.destinations[j],
        origQty: 0,
        altQty: 0,
      };
      existing.altQty = qty;
      dummyMap.set(key, existing);
    }
  }

  const dummyRouteDiffs: ScenarioRouteDiff[] = Array.from(dummyMap.values()).map((entry) => {
    let status: ScenarioRouteDiff['status'] = 'unchanged';
    if (entry.origQty <= EPSILON && entry.altQty > EPSILON) status = 'added';
    else if (entry.origQty > EPSILON && entry.altQty <= EPSILON) status = 'removed';
    else if (entry.altQty - entry.origQty > EPSILON) status = 'increased';
    else if (entry.origQty - entry.altQty > EPSILON) status = 'decreased';

    return {
      originName: entry.originName,
      destinationName: entry.destinationName,
      isDummy: true,
      status,
      originalQuantity: entry.origQty,
      alternativeQuantity: entry.altQty,
      quantityDelta: roundClean(entry.altQty - entry.origQty),
      originalUnitCost: 0,
      alternativeUnitCost: 0,
      originalSubtotal: 0,
      alternativeSubtotal: 0,
      subtotalDelta: 0,
    };
  });

  const originalRealShippedUnits = computeRealShippedUnits(origBalanced, origOptimal);
  const alternativeRealShippedUnits = computeRealShippedUnits(altBalanced, altOptimal);
  const originalHasDegeneracy = hasMatrixDegeneracy(origOptimal);
  const alternativeHasDegeneracy = hasMatrixDegeneracy(altOptimal);

  // 5) Alertas sobre cambios estructurales del modelo
  const structuralAlerts: string[] = [];
  if (origBalanced.balanceStatus !== altBalanced.balanceStatus) {
    structuralAlerts.push(
      `Cambio de régimen de balanceo: el escenario original operaba como "${
        origBalanced.balanceStatus === 'balanced'
          ? 'Balanceado'
          : origBalanced.balanceStatus === 'dummy_destination'
          ? 'Exceso de oferta (Destino Ficticio)'
          : 'Exceso de demanda (Origen Ficticio)'
      }" y el alternativo pasó a "${
        altBalanced.balanceStatus === 'balanced'
          ? 'Balanceado'
          : altBalanced.balanceStatus === 'dummy_destination'
          ? 'Exceso de oferta (Destino Ficticio)'
          : 'Exceso de demanda (Origen Ficticio)'
      }".`
    );
  } else if (altBalanced.balanceStatus !== 'balanced') {
    structuralAlerts.push(
      `Presencia de nodo ficticio en el escenario alternativo (${
        altBalanced.balanceStatus === 'dummy_destination' ? 'Destino Ficticio' : 'Origen Ficticio'
      } por ${fmt(altBalanced.dummyAmount)} u con tarifa matemática $0 MXN/u).`
    );
  }

  if (Math.abs(alternativeRealShippedUnits - originalRealShippedUnits) > EPSILON) {
    structuralAlerts.push(
      `Cambio en el volumen físico realmente transportado: de ${fmt(originalRealShippedUnits)} u a ${fmt(alternativeRealShippedUnits)} u (${
        alternativeRealShippedUnits - originalRealShippedUnits >= 0 ? '+' : ''
      }${fmt(roundClean(alternativeRealShippedUnits - originalRealShippedUnits))} u).`
    );
  }

  if (addedRoutesCount > 0 || removedRoutesCount > 0) {
    structuralAlerts.push(
      `Reconfiguración de rutas activas: ${addedRoutesCount} ruta(s) agregada(s) y ${removedRoutesCount} ruta(s) eliminada(s) respecto al plan original.`
    );
  } else if (inputChanges.length > 0 && changedQuantityRoutesCount === 0) {
    structuralAlerts.push(
      'Estabilidad física del plan: pese a los ajustes de parámetros, las mismas rutas activas y cantidades físicas conservan la optimalidad.'
    );
  }

  if (origOptimal.hasAlternativeOptima || altOptimal.hasAlternativeOptima) {
    structuralAlerts.push(
      'Óptimos alternativos presentes (Δ_ij = 0): existe al menos una ruta no básica con costo reducido nulo; una variación de rutas activas con igual costo total puede responder a un empate óptimo alternativo.'
    );
  }

  if (originalHasDegeneracy || alternativeHasDegeneracy) {
    structuralAlerts.push(
      'Degeneración básica detectada (celdas básicas con 0 u): el modelo conserva m+n−1 celdas básicas aunque alguna tenga envío físico nulo.'
    );
  }

  // 6) Explicación dinámica respaldada únicamente por los resultados calculados
  const costSummary =
    inputChanges.length === 0
      ? `El escenario alternativo conserva exactamente los mismos parámetros que el original, por lo que ambos alcanzan un costo óptimo de $${fmt(originalOptimalCost)} MXN (diferencia de $0 MXN / 0.00%).`
      : Math.abs(costDifference) <= EPSILON
      ? `El escenario alternativo mantiene el costo óptimo total sin cambio en $${fmt(alternativeOptimalCost)} MXN respecto a los $${fmt(originalOptimalCost)} MXN originales (0.00% sobre el óptimo original).`
      : costDifference > 0
      ? `El escenario alternativo incrementa el costo óptimo total en +$${fmt(costDifference)} MXN (+${costDifferencePct.toFixed(2)}% respecto al costo óptimo original de $${fmt(originalOptimalCost)} MXN), pasando a $${fmt(alternativeOptimalCost)} MXN.`
      : `El escenario alternativo disminuye el costo óptimo total en -$${fmt(Math.abs(costDifference))} MXN (${costDifferencePct.toFixed(2)}% respecto al costo óptimo original de $${fmt(originalOptimalCost)} MXN), bajando a $${fmt(alternativeOptimalCost)} MXN.`;

  const addedLabels = routeDiffs
    .filter((r) => r.status === 'added')
    .map((r) => `${r.originName} → ${r.destinationName} (${fmt(r.alternativeQuantity)} u)`);
  const removedLabels = routeDiffs
    .filter((r) => r.status === 'removed')
    .map((r) => `${r.originName} → ${r.destinationName} (antes ${fmt(r.originalQuantity)} u)`);
  const qtyChangedLabels = routeDiffs
    .filter((r) => r.status === 'increased' || r.status === 'decreased')
    .map(
      (r) =>
        `${r.originName} → ${r.destinationName}: ${fmt(r.originalQuantity)} → ${fmt(r.alternativeQuantity)} u (${r.quantityDelta >= 0 ? '+' : ''}${fmt(r.quantityDelta)} u)`
    );

  const routeParts: string[] = [];
  if (addedLabels.length > 0) routeParts.push(`Rutas agregadas: ${addedLabels.join('; ')}.`);
  if (removedLabels.length > 0) routeParts.push(`Rutas eliminadas: ${removedLabels.join('; ')}.`);
  if (qtyChangedLabels.length > 0) {
    routeParts.push(`Cantidades modificadas: ${qtyChangedLabels.join('; ')}.`);
  }
  const routeSummary =
    routeParts.length > 0
      ? routeParts.join(' ')
      : 'No hubo cambios en las rutas activas ni en las cantidades físicas asignadas entre escenarios.';

  const driverSummary =
    inputChanges.length === 0
      ? 'No se han modificado costos unitarios, ofertas ni demandas en el editor alternativo.'
      : `La comparación se originó por ${inputChanges.length} cambio(s) de entrada: ${inputChanges
          .map(
            (ch) =>
              `${ch.label} (${ch.kind === 'cost' ? `$${fmt(ch.originalValue)} → $${fmt(ch.alternativeValue)}` : `${fmt(ch.originalValue)} → ${fmt(ch.alternativeValue)} u`})`
          )
          .join(', ')}.`;

  const zeroOrigWarn = getZeroRealFlowWarning(
    origBalanced.originalSupplyTotal,
    origBalanced.originalDemandTotal
  );
  const zeroAltWarn = getZeroRealFlowWarning(
    altBalanced.originalSupplyTotal,
    altBalanced.originalDemandTotal
  );
  if (zeroOrigWarn) {
    structuralAlerts.push(`Escenario original: ${zeroOrigWarn.message}`);
  }
  if (zeroAltWarn) {
    structuralAlerts.push(`Escenario alternativo: ${zeroAltWarn.message}`);
  }

  let dummyLimitationNote: string | null = null;
  if (origBalanced.balanceStatus !== 'balanced' || altBalanced.balanceStatus !== 'balanced') {
    const baseDummyNote = `Limitación por nodos ficticios: en alguno de los escenarios interviene un nodo ficticio con costo unitario matemático de $0 MXN/u (original: ${fmt(origBalanced.dummyAmount)} u; alternativo: ${fmt(altBalanced.dummyAmount)} u). Cuando existen unidades ficticias, una caída en el costo total puede deberse a que parte de la demanda quedó sin surtir (Origen Ficticio) o a que excedente permaneció en almacén (Destino Ficticio) sin contabilizar costos reales de almacenamiento o penalización por faltante.`;
    const extraZeroNotes = [
      zeroOrigWarn ? `Escenario original: ${zeroOrigWarn.message}` : null,
      zeroAltWarn ? `Escenario alternativo: ${zeroAltWarn.message}` : null,
    ].filter((x): x is string => x !== null);
    dummyLimitationNote =
      extraZeroNotes.length > 0 ? `${baseDummyNote} ${extraZeroNotes.join(' ')}` : baseDummyNote;
  }

  const validityPrincipleNote =
    'Validez de la solución anterior: un cambio en el costo óptimo al modificar tarifas, capacidades o demandas NO implica que la solución original fuera incorrecta; la solución original es matemáticamente óptima (Δ_ij ≥ 0) para sus propios parámetros, mientras que el escenario alternativo define un nuevo problema de optimización con su propio óptimo certificado por MODI.';

  return {
    valid: true,
    errors: [],
    hasInputChanges: inputChanges.length > 0,
    inputChanges,
    originalOptimalCost,
    alternativeOptimalCost,
    alternativeLeastCost: altLeastCost.totalCost,
    alternativeVogelCost: altVogel.totalCost,
    costDifference,
    costDifferencePct,
    costFormulaText,
    originalSupplyTotal: origSupplyTotal,
    alternativeSupplyTotal: altSupplyTotal,
    supplyTotalDelta: roundClean(altSupplyTotal - origSupplyTotal),
    originalDemandTotal: origDemandTotal,
    alternativeDemandTotal: altDemandTotal,
    demandTotalDelta: roundClean(altDemandTotal - origDemandTotal),
    originalBalanceStatus: origBalanced.balanceStatus,
    alternativeBalanceStatus: altBalanced.balanceStatus,
    originalDummyAmount: origBalanced.dummyAmount,
    alternativeDummyAmount: altBalanced.dummyAmount,
    originalRealShippedUnits,
    alternativeRealShippedUnits,
    originalHasDegeneracy,
    alternativeHasDegeneracy,
    originalHasAlternativeOptima: origOptimal.hasAlternativeOptima,
    alternativeHasAlternativeOptima: altOptimal.hasAlternativeOptima,
    routeDiffs,
    dummyRouteDiffs,
    addedRoutesCount,
    removedRoutesCount,
    changedQuantityRoutesCount,
    unchangedRoutesCount,
    structuralAlerts,
    dynamicExplanation: {
      costSummary,
      routeSummary,
      driverSummary,
      dummyLimitationNote,
      validityPrincipleNote,
    },
  };
}

export interface ZeroRealFlowWarning {
  kind: 'zero_real_supply' | 'zero_real_demand';
  message: string;
}

export function getZeroRealFlowWarning(
  originalSupplyTotal: number,
  originalDemandTotal: number
): ZeroRealFlowWarning | null {
  if (originalSupplyTotal <= EPSILON && originalDemandTotal > EPSILON) {
    return {
      kind: 'zero_real_supply',
      message: `Advertencia operativa (oferta real total = 0 u): la demanda total (${fmt(originalDemandTotal)} u) se cubriría únicamente mediante un Origen Ficticio ($0 MXN/u); esto NO representa una distribución física real desde los almacenes.`,
    };
  }
  if (originalDemandTotal <= EPSILON && originalSupplyTotal > EPSILON) {
    return {
      kind: 'zero_real_demand',
      message: `Advertencia operativa (demanda real total = 0 u): la oferta disponible (${fmt(originalSupplyTotal)} u) se asignaría únicamente hacia un Destino Ficticio ($0 MXN/u); esto NO representa una distribución física real hacia las sucursales.`,
    };
  }
  return null;
}

export function buildManagerialScenarioSummary(
  comparison?: ScenarioComparisonResult | null,
  options?: { comparisonOutOfSync?: boolean }
): ManagerialScenarioComparisonAnalysis {
  if (options?.comparisonOutOfSync) {
    return {
      hasChanges: false,
      valid: false,
      errorMessage:
        'El escenario alternativo está desfasado respecto a la configuración principal actual.',
      lowestMathematicalCostLabel:
        'Comparación pendiente de sincronización con la configuración actual',
      costDeltaSummary:
        'Se omitió la comparación de costos porque la matriz principal cambió después de editar el escenario alternativo.',
      routesDeltaSummary:
        'Ninguna recomendación compara resultados de problemas distintos; sincroniza el escenario alternativo para reevaluar sobre la base vigente.',
      selectionCriteria: [
        'Presiona "Sincronizar con configuración actual" en el Comparador de Escenarios (Etapa 4) o en esta sección antes de comparar resultados.',
        'Mientras no sincronices, las decisiones gerenciales se apoyan exclusivamente en el problema principal vigente.',
      ],
      comparabilityWarning:
        'Aviso de sincronización requerido: la configuración principal fue modificada tras editar el escenario alternativo. Sincroniza el escenario alternativo para evitar mezclar resultados de modelos distintos.',
      isTrueEfficiencyComparison: false,
    };
  }

  if (!comparison) {
    return {
      hasChanges: false,
      valid: true,
      errorMessage: null,
      lowestMathematicalCostLabel: 'Sin comparación activa (solo escenario original)',
      costDeltaSummary:
        'Aún no se ha comparado el escenario original contra un escenario alternativo.',
      routesDeltaSummary:
        'Edita tarifas, ofertas o demandas en la Etapa 4 para generar el diagnóstico comparativo.',
      selectionCriteria: [
        'Ajusta un parámetro en el Comparador de Escenarios (Etapa 4) para evaluar si conviene cambiar el plan vigente.',
      ],
      comparabilityWarning: null,
      isTrueEfficiencyComparison: true,
    };
  }

  if (!comparison.valid) {
    return {
      hasChanges: comparison.hasInputChanges,
      valid: false,
      errorMessage:
        comparison.errors[0] ??
        'El escenario alternativo contiene datos inválidos o dimensiones incompatibles.',
      lowestMathematicalCostLabel: 'Comparación no disponible por datos inválidos',
      costDeltaSummary:
        'No es posible comparar costos óptimos mientras el escenario alternativo presente valores negativos, vacíos o no numéricos.',
      routesDeltaSummary:
        'Corrige las celdas marcadas en rojo en el editor alternativo para ejecutar el motor MODI.',
      selectionCriteria: [
        'Validar que todas las tarifas, ofertas y demandas sean números finitos mayores o iguales a cero antes de tomar decisiones.',
      ],
      comparabilityWarning:
        'Escenario inválido: se bloquean las conclusiones comparativas para evitar recomendaciones sin respaldo matemático.',
      isTrueEfficiencyComparison: false,
    };
  }

  if (!comparison.hasInputChanges || comparison.alternativeOptimalCost === null || comparison.costDifference === null) {
    return {
      hasChanges: false,
      valid: true,
      errorMessage: null,
      lowestMathematicalCostLabel: `Empate idéntico: ambos escenarios registran $${fmt(comparison.originalOptimalCost)} MXN`,
      costDeltaSummary: `El escenario alternativo conserva exactamente los mismos parámetros que el original ($${fmt(comparison.originalOptimalCost)} MXN, diferencia $0 MXN / 0.00%).`,
      routesDeltaSummary:
        'No existen diferencias en rutas ni en cantidades enviadas mientras no se modifiquen entradas en el comparador.',
      selectionCriteria: [
        'Modifica al menos una tarifa c_ij, oferta a_i o demanda b_j en la Etapa 4 para analizar qué escenario conviene ejecutar.',
      ],
      comparabilityWarning: null,
      isTrueEfficiencyComparison: true,
    };
  }

  const origCost = comparison.originalOptimalCost;
  const altCost = comparison.alternativeOptimalCost;
  const diff = comparison.costDifference;
  const diffPct = comparison.costDifferencePct ?? 0;

  let lowestMathematicalCostLabel = '';
  if (Math.abs(diff) <= EPSILON) {
    lowestMathematicalCostLabel = `Empate matemático: ambos obtienen $${fmt(origCost)} MXN`;
  } else if (diff < 0) {
    lowestMathematicalCostLabel = `Menor costo matemático en el Escenario Alternativo ($${fmt(altCost)} vs. $${fmt(origCost)} MXN)`;
  } else {
    lowestMathematicalCostLabel = `Menor costo matemático en el Escenario Original ($${fmt(origCost)} vs. $${fmt(altCost)} MXN)`;
  }

  const costDeltaSummary =
    Math.abs(diff) <= EPSILON
      ? `El costo óptimo total permanece sin cambio en $${fmt(altCost)} MXN (0.00% respecto a $${fmt(origCost)} MXN).`
      : diff < 0
      ? `El escenario alternativo reduce el costo matemático en -$${fmt(Math.abs(diff))} MXN (${diffPct.toFixed(2)}% respecto al óptimo original de $${fmt(origCost)} MXN).`
      : `El escenario alternativo incrementa el costo matemático en +$${fmt(diff)} MXN (+${diffPct.toFixed(2)}% respecto al óptimo original de $${fmt(origCost)} MXN).`;

  const changedDetails: string[] = [];
  if (comparison.addedRoutesCount > 0) {
    const addedNames = comparison.routeDiffs
      .filter((r) => r.status === 'added')
      .map((r) => `${r.originName} → ${r.destinationName} (${fmt(r.alternativeQuantity)} u)`);
    changedDetails.push(`agregadas: ${addedNames.join(', ')}`);
  }
  if (comparison.removedRoutesCount > 0) {
    const removedNames = comparison.routeDiffs
      .filter((r) => r.status === 'removed')
      .map((r) => `${r.originName} → ${r.destinationName}`);
    changedDetails.push(`eliminadas: ${removedNames.join(', ')}`);
  }
  if (comparison.changedQuantityRoutesCount > 0) {
    const qtyNames = comparison.routeDiffs
      .filter((r) => r.status === 'increased' || r.status === 'decreased')
      .map(
        (r) =>
          `${r.originName} → ${r.destinationName} (${fmt(r.originalQuantity)} → ${fmt(r.alternativeQuantity)} u)`
      );
    changedDetails.push(`ajustadas en volumen: ${qtyNames.join(', ')}`);
  }

  const routesDeltaSummary =
    changedDetails.length > 0
      ? `Se modificó la operación logística (${changedDetails.join('; ')}).`
      : `Las rutas activas y cantidades físicas permanecen idénticas (${comparison.unchangedRoutesCount} ruta(s) sin cambio); únicamente varía el costo o parámetro de entrada.`;

  const realUnitsChanged =
    Math.abs(comparison.alternativeRealShippedUnits - comparison.originalRealShippedUnits) >
    EPSILON;
  const hasDummyOrig =
    comparison.originalBalanceStatus !== 'balanced' || comparison.originalDummyAmount > EPSILON;
  const hasDummyAlt =
    comparison.alternativeBalanceStatus !== 'balanced' ||
    comparison.alternativeDummyAmount > EPSILON;
  const hasDeficit =
    comparison.originalBalanceStatus === 'dummy_origin' ||
    comparison.alternativeBalanceStatus === 'dummy_origin';
  const hasSurplus =
    comparison.originalBalanceStatus === 'dummy_destination' ||
    comparison.alternativeBalanceStatus === 'dummy_destination';
  const isTrueEfficiencyComparison = !realUnitsChanged && !hasDummyOrig && !hasDummyAlt;

  let comparabilityWarning: string | null = null;
  if (!isTrueEfficiencyComparison) {
    const reasons: string[] = [];
    if (realUnitsChanged) {
      reasons.push(
        `cambia la cantidad de unidades reales atendidas (de ${fmt(comparison.originalRealShippedUnits)} u a ${fmt(comparison.alternativeRealShippedUnits)} u)`
      );
    }
    if (hasDeficit) {
      reasons.push(
        'interviene un Origen Ficticio por déficit de oferta (demanda insatisfecha asignada con costo matemático $0 MXN/u)'
      );
    }
    if (hasSurplus) {
      reasons.push(
        'interviene un Destino Ficticio por capacidad excedente (inventario sin despachar asignado con costo matemático $0 MXN/u)'
      );
    }

    comparabilityWarning = `Advertencia de comparabilidad (no confundir con ahorro real): ${reasons.join(' y ')}. Debido a ello, los costos totales de ambos escenarios NO son directamente comparables como indicadores de eficiencia logística ni debe interpretarse una caída de Z* como ahorro empresarial real mientras no se cubra el mismo nivel de demanda y se valoren costos de almacenamiento o faltantes.`;
  }

  const selectionCriteria: string[] = [];
  if (isTrueEfficiencyComparison) {
    if (diff < -EPSILON) {
      selectionCriteria.push(
        `El escenario alternativo logra un ahorro logístico genuino de $${fmt(Math.abs(diff))} MXN (${Math.abs(diffPct).toFixed(2)}%) manteniendo idéntico el volumen realmente entregado (${fmt(comparison.alternativeRealShippedUnits)} u) sin nodos ficticios.`
      );
      selectionCriteria.push(
        'Conviene adoptarlo si los cambios de entrada negociados (tarifas o redistribución de oferta/demanda) son operativamente viables.'
      );
    } else if (diff > EPSILON) {
      selectionCriteria.push(
        `El escenario original es más económico por $${fmt(diff)} MXN atendiendo las mismas ${fmt(comparison.originalRealShippedUnits)} u reales.`
      );
      selectionCriteria.push(
        'El alternativo solo se justificaría por restricciones comerciales o contractuales externas que obliguen a asumir el sobrecosto.'
      );
    } else {
      selectionCriteria.push(
        'Ambos escenarios tienen idéntico costo óptimo total atendiendo el mismo volumen real; conviene elegir el que requiera menos cambios operativos o menor número de rutas activas.'
      );
    }
  } else {
    selectionCriteria.push(
      'No seleccionar un escenario únicamente por mostrar menor Z* cuando existan unidades ficticias o distinta demanda cubierta.'
    );
    if (hasDeficit) {
      selectionCriteria.push(
        `Evaluar primero cómo cubrir el déficit de oferta (unidades en Origen Ficticio: ${fmt(comparison.originalDummyAmount)} u orig. vs. ${fmt(comparison.alternativeDummyAmount)} u alt.) y cuantificar el costo comercial de ventas perdidas.`
      );
    }
    if (hasSurplus) {
      selectionCriteria.push(
        `Considerar el costo financiero y de bodega del excedente retenido en Destino Ficticio (${fmt(comparison.originalDummyAmount)} u orig. vs. ${fmt(comparison.alternativeDummyAmount)} u alt.) antes de decidir.`
      );
    }
    if (realUnitsChanged) {
      selectionCriteria.push(
        `Normalizar la comparación por unidad realmente entregada o igualar la demanda atendida (${fmt(comparison.originalRealShippedUnits)} u vs. ${fmt(comparison.alternativeRealShippedUnits)} u) antes de validar eficiencia.`
      );
    }
  }

  return {
    hasChanges: true,
    valid: true,
    errorMessage: null,
    lowestMathematicalCostLabel,
    costDeltaSummary,
    routesDeltaSummary,
    selectionCriteria,
    comparabilityWarning,
    isTrueEfficiencyComparison,
  };
}

export function buildManagerialDecisionAnalysis(
  balanced: BalancedProblem,
  optimal: OptimalResult,
  costSensitivity: CostSensitivityAnalysis,
  rhsSensitivity: RhsSensitivityAnalysis,
  dualShadowPrices: DualShadowPriceAnalysis,
  scenarioComparison?: ScenarioComparisonResult | null,
  options?: { comparisonOutOfSync?: boolean }
): ManagerialDecisionAnalysis {
  const effectiveComparison = options?.comparisonOutOfSync ? null : scenarioComparison;
  const m = balanced.origins.length;
  const n = balanced.destinations.length;
  const realDistributedUnits = computeRealShippedUnits(balanced, optimal);

  // 1) Diagnóstico del escenario actual
  const activeRoutes: ManagerialActiveRouteItem[] = [];
  const unusedRoutes: ManagerialUnusedRouteItem[] = [];
  let degenerateBasicRoutesCount = 0;

  const nonBasicByCell = new Map<string, NonBasicCostSensitivity>();
  for (const nb of costSensitivity.nonBasicRoutes) {
    nonBasicByCell.set(`${nb.row}-${nb.col}`, nb);
  }

  for (let i = 0; i < m; i++) {
    if (i === balanced.dummyRowIndex) continue;
    for (let j = 0; j < n; j++) {
      if (j === balanced.dummyColIndex) continue;

      const qty = roundClean(optimal.allocations[i][j]);
      const cost = balanced.costs[i][j];
      const isBasic = optimal.basicMask[i][j];
      const originName = balanced.origins[i];
      const destinationName = balanced.destinations[j];

      if (qty > EPSILON) {
        activeRoutes.push({
          originName,
          destinationName,
          quantity: qty,
          unitCost: cost,
          subtotalCost: roundClean(qty * cost),
          shareOfRealUnitsPct:
            realDistributedUnits > EPSILON ? roundClean((qty / realDistributedUnits) * 100) : 0,
          isDegenerateBasic: false,
        });
      } else {
        if (isBasic) {
          degenerateBasicRoutesCount++;
          unusedRoutes.push({
            originName,
            destinationName,
            currentCost: cost,
            reducedCost: 0,
            requiredReduction: 0,
            alreadyAlternativeOptimum: false,
            cycleTheta: 0,
            conditionalNote:
              'Celda básica degenerada con envío físico de 0 u: sostiene la estructura matemática de m+n−1 celdas; podría recibir flujo físico si cambian las capacidades u ofertas.',
          });
        } else {
          const nb = nonBasicByCell.get(`${i}-${j}`);
          const rc = nb?.reducedCost ?? 0;
          const reqRed = nb?.requiredReduction ?? Math.max(0, rc);
          const alreadyAlt = nb?.alreadyAlternativeOptimum ?? false;
          const theta = nb?.cycleTheta ?? 0;

          let conditionalNote = '';
          if (alreadyAlt) {
            conditionalNote =
              theta > EPSILON
                ? `Inactiva actualmente, pero con Δ_ij = $0/u: es ruta óptima alternativa utilizable hasta ${fmt(theta)} u sin subir el costo total.`
                : 'Inactiva con Δ_ij = $0/u (empate degenerado θ = 0 u): su activación depende de cambios de capacidad.';
          } else if (nb && !nb.canBecomeCompetitiveWithNonNegativeCost) {
            conditionalNote = `No utilizada hoy (Δ_ij = +$${fmt(rc)}/u); su suma dual u_i + v_j es negativa ($${fmt(nb.impliedDualSum)}), por lo que solo entraría ante cambios en capacidades o en tarifas de otras rutas.`;
          } else {
            conditionalNote = `No utilizada bajo las tarifas actuales (Δ_ij = +$${fmt(rc)}/u). No es innecesaria de forma permanente: se volvería competitiva si su tarifa bajara en más de $${fmt(reqRed)} MXN/u (por debajo de $${fmt(nb?.minNonNegativeCostToKeepBasis ?? 0)} MXN/u) o si cambian las ofertas/demandas.`;
          }

          unusedRoutes.push({
            originName,
            destinationName,
            currentCost: cost,
            reducedCost: rc,
            requiredReduction: reqRed,
            alreadyAlternativeOptimum: alreadyAlt,
            cycleTheta: theta,
            conditionalNote,
          });
        }
      }
    }
  }

  const balanceLabel =
    balanced.balanceStatus === 'balanced'
      ? `Problema balanceado: oferta total (${fmt(balanced.originalSupplyTotal)} u) igual a demanda total (${fmt(balanced.originalDemandTotal)} u)`
      : balanced.balanceStatus === 'dummy_destination'
      ? `Superávit de oferta: oferta (${fmt(balanced.originalSupplyTotal)} u) supera a demanda (${fmt(balanced.originalDemandTotal)} u) en ${fmt(balanced.dummyAmount)} u`
      : `Déficit de oferta: demanda (${fmt(balanced.originalDemandTotal)} u) supera a oferta (${fmt(balanced.originalSupplyTotal)} u) en ${fmt(balanced.dummyAmount)} u`;

  const zeroFlowWarning = getZeroRealFlowWarning(
    balanced.originalSupplyTotal,
    balanced.originalDemandTotal
  );

  let dummyLimitationWarning: string | null = null;
  if (balanced.balanceStatus === 'dummy_destination') {
    dummyLimitationWarning = zeroFlowWarning
      ? `${zeroFlowWarning.message} Se incorporó un Destino Ficticio por ${fmt(balanced.dummyAmount)} u (costo $0/u) sin envíos reales ni costos de almacenamiento modelados.`
      : `Se incorporó un Destino Ficticio por ${fmt(balanced.dummyAmount)} u (costo $0/u): el envío físico real es de ${fmt(realDistributedUnits)} u, mientras ${fmt(balanced.dummyAmount)} u permanecen como capacidad excedente en almacén sin costo de almacenamiento modelado.`;
  } else if (balanced.balanceStatus === 'dummy_origin') {
    dummyLimitationWarning = zeroFlowWarning
      ? `${zeroFlowWarning.message} Se incorporó un Origen Ficticio por ${fmt(balanced.dummyAmount)} u (costo $0/u) sin entregas físicas reales ni penalización por desabasto modelada.`
      : `Se incorporó un Origen Ficticio por ${fmt(balanced.dummyAmount)} u (costo $0/u): solo se entregan físicamente ${fmt(realDistributedUnits)} u de las ${fmt(balanced.originalDemandTotal)} u demandadas; quedan ${fmt(balanced.dummyAmount)} u sin surtir sin penalización por desabasto modelada.`;
  }

  const realAltCells = costSensitivity.nonBasicRoutes.filter(
    (r) => !r.isDummy && r.alreadyAlternativeOptimum
  );
  let alternativeOptimaSummary = '';
  if (!optimal.hasAlternativeOptima) {
    alternativeOptimaSummary =
      'No existen soluciones óptimas alternativas (todas las rutas no básicas tienen Δ_ij > 0); la asignación óptima actual es única.';
  } else if (realAltCells.length > 0) {
    const desc = realAltCells
      .map(
        (c) =>
          `${c.originName} → ${c.destinationName} (Δ = 0, θ = ${fmt(c.cycleTheta)} u)`
      )
      .join('; ');
    alternativeOptimaSummary = `Existen soluciones óptimas alternativas (Δ_ij = 0): ${desc}. Permiten redistribuir flujo sin incrementar el costo total de $${fmt(optimal.totalCost)} MXN.`;
  } else {
    alternativeOptimaSummary =
      'Existe empate dual (Δ_ij = 0) únicamente en asignación vinculada al nodo ficticio; las rutas reales tienen costo óptimo único.';
  }

  const degeneracyWarning =
    degenerateBasicRoutesCount > 0 || costSensitivity.hasDegeneracy
      ? `Solución degenerada detectada (${degenerateBasicRoutesCount} celda(s) básica(s) real(es) con 0 u): la base conserva m+n−1 = ${costSensitivity.optimalBasisSize} celdas para garantizar los cálculos duales MODI, pero genera límites ajustados en δ = 0 en sensibilidad.`
      : null;

  const diagnosis: ManagerialDiagnosis = {
    totalOptimalCost: optimal.totalCost,
    realDistributedUnits,
    totalSupplyReal: balanced.originalSupplyTotal,
    totalDemandReal: balanced.originalDemandTotal,
    balanceStatus: balanced.balanceStatus,
    balanceLabel,
    dummyAmount: balanced.dummyAmount,
    dummyLimitationWarning,
    activeRoutes,
    degenerateBasicRoutesCount,
    unusedRoutes,
    hasAlternativeOptima: optimal.hasAlternativeOptima,
    alternativeOptimaSummary,
    degeneracyWarning,
  };

  // 2) Recomendaciones gerenciales fundamentadas
  const recommendations: ManagerialRecommendation[] = [];

  // 2.1 Distribución de mercancía
  const sortedActive = [...activeRoutes].sort((a, b) => b.quantity - a.quantity);
  const topRoute = sortedActive[0];
  const distSummaryList = activeRoutes
    .map(
      (r) =>
        `${r.originName} → ${r.destinationName}: ${fmt(r.quantity)} u ($${fmt(r.subtotalCost)})`
    )
    .join('; ');

  recommendations.push({
    id: 'rec_distribution',
    category: 'distribution',
    title: 'Plan de distribución física entre almacenes y sucursales',
    recommendation:
      activeRoutes.length > 0
        ? `Ejecutar el despacho real de ${fmt(realDistributedUnits)} u concentrado en ${activeRoutes.length} ruta(s) activa(s): ${distSummaryList}.${
            topRoute
              ? ` El corredor principal es ${topRoute.originName} → ${topRoute.destinationName} (${fmt(topRoute.quantity)} u, ${topRoute.shareOfRealUnitsPct.toFixed(1)}% del volumen real).`
              : ''
          }`
        : 'No existen envíos reales positivos en la solución actual (demanda o capacidad efectiva igual a cero).',
    mathematicalBasis: `Solución óptima certificada por MODI con costo mínimo total Z* = $${fmt(optimal.totalCost)} MXN y ${activeRoutes.length} ruta(s) real(es) con x_ij > 0.`,
    cautionNote: zeroFlowWarning
      ? zeroFlowWarning.message
      : balanced.balanceStatus !== 'balanced'
      ? `Las ${fmt(balanced.dummyAmount)} u asociadas al nodo ficticio no representan envíos físicos reales.`
      : null,
  });

  // 2.2 Rutas que conviene mantener
  const reliableActiveBasics = costSensitivity.basicRoutes.filter(
    (b) => !b.isDummy && b.allocation > EPSILON && b.reliable
  );
  const tightestUpperBasic = [...reliableActiveBasics]
    .filter((b) => b.deltaMax !== null)
    .sort((a, b) => (a.deltaMax ?? Infinity) - (b.deltaMax ?? Infinity))[0];
  const unboundedUpperBasics = reliableActiveBasics.filter((b) => b.maxCost === null);

  let keepRecText = '';
  if (reliableActiveBasics.length > 0) {
    const rangesSummary = reliableActiveBasics
      .map(
        (b) =>
          `${b.originName} → ${b.destinationName} ($${fmt(b.currentCost)}: [$${fmt(b.minCostNonNegative)}, ${b.maxCost === null ? '+∞' : `$${fmt(b.maxCost)}`}${b.maxCost === null ? ')' : ']'})`
      )
      .join('; ');
    keepRecText = `Mantener como columna vertebral las ${reliableActiveBasics.length} ruta(s) básica(s) activa(s): ${rangesSummary}.`;
    if (tightestUpperBasic) {
      keepRecText += ` La ruta más sensible a encarecimiento es ${tightestUpperBasic.originName} → ${tightestUpperBasic.destinationName}, que solo tolera un aumento de +$${fmt(tightestUpperBasic.deltaMax ?? 0)} MXN/u (hasta $${fmt(tightestUpperBasic.maxCost ?? 0)}/u).`;
    } else if (unboundedUpperBasics.length === reliableActiveBasics.length) {
      keepRecText +=
        ' Todas las rutas activas son estructuralmente robustas frente a incrementos de tarifa sin rutas competidoras que las sustituyan.';
    }
  } else {
    keepRecText =
      'No hay múltiples rutas básicas reales independientes con tolerancia calculable en el árbol actual.';
  }

  recommendations.push({
    id: 'rec_keep_routes',
    category: 'keep_routes',
    title: 'Rutas prioritarias a mantener y márgenes de estabilidad',
    recommendation: keepRecText,
    mathematicalBasis: costSensitivity.basisIsValidTree
      ? `Análisis de corte del árbol dual MODI (Etapa 1) sobre ${costSensitivity.optimalBasisSize} celdas básicas.`
      : 'La base actual no constituye un árbol generador válido; requiere reoptimización para certificar intervalos.',
    cautionNote: null,
  });

  // 2.3 Rutas alternativas sin incrementar el costo
  const realAltWithFlow = realAltCells.filter((c) => c.cycleTheta > EPSILON);
  const realAltZeroTheta = realAltCells.filter((c) => c.cycleTheta <= EPSILON);
  let altRouteRec = '';
  if (realAltWithFlow.length > 0) {
    const opts = realAltWithFlow
      .map(
        (c) =>
          `${c.originName} → ${c.destinationName} (hasta θ = ${fmt(c.cycleTheta)} u a tarifa $${fmt(c.currentCost)}/u)`
      )
      .join('; ');
    altRouteRec = `Zeli Distribuciones dispone de flexibilidad operativa sin sobrecosto: puede activar ${opts} manteniendo exactamente el costo mínimo total de $${fmt(optimal.totalCost)} MXN (útil ante contingencias de tráfico o balanceo de carga).`;
  } else if (realAltZeroTheta.length > 0) {
    altRouteRec =
      'Existe una celda no básica real con Δ_ij = 0, pero su ciclo de compensación tiene θ = 0 u por degeneración: no permite mover flujo físico adicional sin cambiar ofertas o demandas.';
  } else {
    altRouteRec =
      'No existen rutas alternativas reales que mantengan el costo mínimo actual; desviar envíos hacia cualquier ruta inactiva generaría un sobrecosto inmediato igual a su costo reducido Δ_ij > 0.';
  }

  recommendations.push({
    id: 'rec_alternative_routes',
    category: 'alternative_routes',
    title: 'Uso de rutas alternativas de respaldo sin costo adicional',
    recommendation: altRouteRec,
    mathematicalBasis:
      realAltCells.length > 0
        ? `Costos reducidos nulos (Δ_ij = 0) y valor de pivote θ en ciclo MODI (Etapa 1).`
        : `Todas las rutas no básicas reales presentan Δ_ij > 0 en el último tablero MODI.`,
    cautionNote:
      'Las rutas hoy no utilizadas no se descartan de forma permanente: solo resultan más costosas bajo las tarifas y capacidades vigentes.',
  });

  // 2.4 Cambios de tarifas que podrían modificar la solución óptima
  const competitiveNonBasics = costSensitivity.nonBasicRoutes
    .filter(
      (r) =>
        !r.isDummy &&
        !r.alreadyAlternativeOptimum &&
        r.canBecomeCompetitiveWithNonNegativeCost
    )
    .sort((a, b) => a.requiredReduction - b.requiredReduction);
  const closestNonBasic = competitiveNonBasics[0];

  const tariffParts: string[] = [];
  if (closestNonBasic) {
    tariffParts.push(
      `Vigilar la tarifa de ${closestNonBasic.originName} → ${closestNonBasic.destinationName} (hoy $${fmt(closestNonBasic.currentCost)}/u, Δ_ij = +$${fmt(closestNonBasic.reducedCost)}/u): si el flete se reduce en al menos $${fmt(closestNonBasic.requiredReduction)}/u (a $${fmt(closestNonBasic.minNonNegativeCostToKeepBasis)}/u o menos), esta ruta pasaría a ser competitiva e ingresaría al plan.`
    );
  } else if (costSensitivity.nonBasicRoutes.some((r) => !r.isDummy)) {
    tariffParts.push(
      'Ninguna ruta inactiva con costo no negativo (c_ij ≥ 0) puede desplazar a la base actual únicamente bajando su tarifa (u_i + v_j < 0).'
    );
  } else {
    tariffParts.push(
      'Todas las rutas reales ya forman parte de la base óptima (no existen rutas reales no básicas que puedan ingresar por descuento tarifario).'
    );
  }

  if (tightestUpperBasic) {
    tariffParts.push(
      `Por el lado de las rutas activas, un alza superior a +$${fmt(tightestUpperBasic.deltaMax ?? 0)}/u en ${tightestUpperBasic.originName} → ${tightestUpperBasic.destinationName} rompería la optimalidad actual.`
    );
  }

  recommendations.push({
    id: 'rec_tariff_changes',
    category: 'tariff_changes',
    title: 'Sensibilidad ante negociación o variación de tarifas (c_ij)',
    recommendation: tariffParts.join(' '),
    mathematicalBasis:
      'Condición de optimalidad MODI Δ_ij = c_ij − (u_i + v_j) ≥ 0 y límites de corte en rutas básicas (Etapa 1).',
    cautionNote:
      'Una ruta hoy inactiva podría volverse óptima en un escenario futuro si logra negociarse por debajo de su umbral u_i + v_j o si se encarece una ruta activa.',
  });

  // 2.5 Ajustes de oferta y demanda dentro de intervalos admisibles
  const reliableRhsPairs = rhsSensitivity.balancedPairs.filter(
    (p) => p.reliable && p.marginalCostPerUnit !== null
  );
  const positiveExpansionPairs = reliableRhsPairs
    .filter((p) => p.deltaMax === null || p.deltaMax > EPSILON)
    .sort((a, b) => (a.marginalCostPerUnit ?? 0) - (b.marginalCostPerUnit ?? 0));
  const bestExpansion = positiveExpansionPairs[0];

  const beneficialSupplyTransfer = dualShadowPrices.supplyTransfers
    .filter((t) => t.deltaMax > EPSILON || t.deltaMin < -EPSILON)
    .sort((a, b) => Math.abs(b.marginalCostPerUnit) - Math.abs(a.marginalCostPerUnit))[0];

  const capParts: string[] = [];
  if (bestExpansion) {
    const maxStr =
      bestExpansion.deltaMax === null ? '+∞' : `+${fmt(bestExpansion.deltaMax)}`;
    capParts.push(
      `Si se planea crecer conjuntamente oferta y demanda, el par con menor costo marginal vigente es ${bestExpansion.originName} con ${bestExpansion.destinationName} (u_i + v_j = $${fmt(bestExpansion.marginalCostPerUnit ?? 0)} MXN/u, válido para δ ∈ [${fmt(bestExpansion.deltaMin ?? 0)}, ${maxStr}${bestExpansion.deltaMax === null ? ')' : ']'} u).`
    );
  }
  if (beneficialSupplyTransfer && Math.abs(beneficialSupplyTransfer.marginalCostPerUnit) > EPSILON) {
    const cheaperName =
      beneficialSupplyTransfer.marginalCostPerUnit < 0
        ? beneficialSupplyTransfer.toName
        : beneficialSupplyTransfer.fromName;
    const costlierName =
      beneficialSupplyTransfer.marginalCostPerUnit < 0
        ? beneficialSupplyTransfer.fromName
        : beneficialSupplyTransfer.toName;
    capParts.push(
      `Dentro de la oferta total actual, trasladar inventario disponible desde ${costlierName} hacia ${cheaperName} ahorra $${fmt(Math.abs(beneficialSupplyTransfer.marginalCostPerUnit))} MXN/u mientras la variación permanezca dentro del rango admisible [${fmt(beneficialSupplyTransfer.deltaMin)}, +${fmt(beneficialSupplyTransfer.deltaMax)}] u.`
    );
  }
  if (capParts.length === 0) {
    capParts.push(
      'Cualquier incremento en una oferta o demanda individual sin compensación rompe el equilibrio Σa_i = Σb_j y exige reoptimización completa con nodo ficticio (Etapa 2.2).'
    );
  }

  recommendations.push({
    id: 'rec_capacity_adjustments',
    category: 'capacity_adjustments',
    title: 'Ajustes de capacidad y demanda dentro de rangos factibles',
    recommendation: capParts.join(' '),
    mathematicalBasis:
      'Trayectorias en el árbol básico [δ_mín, δ_máx] (Etapa 2) y diferencias duales invariantes (u_i − u_r, u_i + v_j) (Etapa 3).',
    cautionNote: rhsSensitivity.hasDegeneracy
      ? 'Existen cotas ajustadas en δ = 0 por degeneración: al alcanzar esos límites la base actual pierde factibilidad y se requiere reoptimizar con MODI.'
      : 'Nunca extrapolar estas tasas marginales fuera de [δ_mín, δ_máx] ni usar u_i o v_j individuales para cambios aislados desbalanceados.',
  });

  // 2.6 Riesgos de insuficiencia de inventario o capacidad excedente
  let riskRec = '';
  let riskCaution: string | null = null;
  if (balanced.balanceStatus === 'dummy_origin') {
    const unservedList =
      balanced.dummyRowIndex !== null
        ? balanced.destinations
            .map((d, j) => ({
              dest: d,
              qty: roundClean(optimal.allocations[balanced.dummyRowIndex!][j]),
            }))
            .filter((x) => x.qty > EPSILON)
            .map((x) => `${x.dest} (${fmt(x.qty)} u)`)
            .join(', ')
        : '';
    riskRec = `Riesgo crítico de insuficiencia de inventario: faltan ${fmt(balanced.dummyAmount)} u para cubrir la demanda total (${fmt(balanced.originalDemandTotal)} u). La afectación recae actualmente sobre ${unservedList || 'las sucursales asignadas al Origen Ficticio'}. Se recomienda gestionar abasto adicional o reasignación de stock antes de operar.`;
    riskCaution =
      'El modelo asigna $0/u al Origen Ficticio: esto NO significa costo cero real, sino demanda insatisfecha con riesgo de ventas perdidas y penalizaciones.';
  } else if (balanced.balanceStatus === 'dummy_destination') {
    const surplusList =
      balanced.dummyColIndex !== null
        ? balanced.origins
            .map((o, i) => ({
              orig: o,
              qty: roundClean(optimal.allocations[i][balanced.dummyColIndex!]),
            }))
            .filter((x) => x.qty > EPSILON)
            .map((x) => `${x.orig} (${fmt(x.qty)} u)`)
            .join(', ')
        : '';
    riskRec = `Riesgo operativo de capacidad excedente: sobran ${fmt(balanced.dummyAmount)} u respecto a la demanda actual (${fmt(balanced.originalDemandTotal)} u), concentradas como inventario no despachado en ${surplusList || 'los almacenes con excedente'}. Conviene evaluar campañas de colocación comercial o reajuste temporal de producción/compras.`;
    riskCaution =
      'El Destino Ficticio tiene tarifa matemática $0/u, por lo que Z* omite costos reales de almacenaje, seguro u obsolescencia del excedente.';
  } else {
    riskRec = `El sistema opera actualmente en equilibrio exacto (${fmt(realDistributedUnits)} u de oferta = ${fmt(realDistributedUnits)} u de demanda), sin holgura de reserva ante picos de demanda ni exceso de stock. Un aumento imprevisto en cualquier sucursal sin respaldo en almacenes generará desabasto inmediato (Origen Ficticio), mientras que una caída de demanda dejará inventario inmovilizado (Destino Ficticio).`;
  }

  if (zeroFlowWarning) {
    riskRec = `${zeroFlowWarning.message} ${riskRec}`;
  }

  recommendations.push({
    id: 'rec_inventory_risks',
    category: 'inventory_risks',
    title: 'Riesgos por insuficiencia de inventario o capacidad excedente',
    recommendation: riskRec,
    mathematicalBasis: `Balance Σa_i = ${fmt(balanced.originalSupplyTotal)} u frente a Σb_j = ${fmt(balanced.originalDemandTotal)} u (${balanced.balanceStatus}, ficticio = ${fmt(balanced.dummyAmount)} u).`,
    cautionNote: riskCaution,
  });

  // 3) Comparación de escenarios (Etapa 4)
  const scenarioComparisonAnalysis = buildManagerialScenarioSummary(
    effectiveComparison,
    options
  );

  // 4) Interpretación económica contextualizada con los resultados reales de Etapas 1 a 4
  const nonZeroNonBasics = costSensitivity.nonBasicRoutes.filter(
    (r) => !r.isDummy && r.reducedCost > EPSILON
  );
  const minRc =
    nonZeroNonBasics.length > 0
      ? Math.min(...nonZeroNonBasics.map((r) => r.reducedCost))
      : null;
  const maxRc =
    nonZeroNonBasics.length > 0
      ? Math.max(...nonZeroNonBasics.map((r) => r.reducedCost))
      : null;

  const sampleJoint = reliableRhsPairs[0];
  const basicWithFiniteUpper = reliableActiveBasics.filter((b) => b.maxCost !== null);

  const economicInterpretation: ManagerialEconomicConcept[] = [
    {
      id: 'reduced_costs',
      title: 'Costos reducidos (Δ_ij = c_ij − u_i − v_j)',
      plainExplanation:
        'Miden cuánto aumentaría el costo total Z* por cada unidad que se forzara a enviar por una ruta no básica (hoy inactiva). Si Δ_ij = 0, la ruta puede utilizarse como óptimo alternativo sin encarecer el plan.',
      currentModelEvidence:
        minRc !== null && maxRc !== null
          ? `En el escenario actual existen ${realAltCells.length} ruta(s) real(es) con Δ = $0/u y ${nonZeroNonBasics.length} ruta(s) con sobrecosto marginal entre +$${fmt(minRc)}/u y +$${fmt(maxRc)}/u.`
          : realAltCells.length > 0
          ? `Las rutas no básicas reales presentan Δ = $0/u (óptimos alternativos disponibles).`
          : 'No existen rutas no básicas reales fuera de la base óptima en este tamaño de red.',
    },
    {
      id: 'shadow_prices',
      title: 'Precios sombra y potenciales duales (u_i, v_j)',
      plainExplanation:
        'Los multiplicadores u_i y v_j resuelven u_i + v_j = c_ij bajo la referencia u_1 = 0. Como la red requiere equilibrio oferta-demanda, un potencial individual no mide un cambio aislado, sino combinaciones invariantes: u_i + v_j (crecimiento conjunto equilibrado), u_i − u_r (traslado entre almacenes) y v_j − v_l (traslado entre sucursales).',
      currentModelEvidence: sampleJoint
        ? `Ejemplo activo en la matriz: variar conjuntamente ${sampleJoint.originName} y ${sampleJoint.destinationName} tiene un precio sombra conjunto de u_i + v_j = $${fmt(sampleJoint.marginalCostPerUnit ?? 0)} MXN/u (potenciales u = [${optimal.finalU.map((x) => fmt(x)).join(', ')}], v = [${optimal.finalV.map((x) => fmt(x)).join(', ')}]).`
        : `Potenciales calculados por MODI con u_1 = 0: u = [${optimal.finalU.map((x) => fmt(x)).join(', ')}], v = [${optimal.finalV.map((x) => fmt(x)).join(', ')}].`,
    },
    {
      id: 'sensitivity_ranges',
      title: 'Rangos de sensibilidad (costos y capacidades)',
      plainExplanation:
        'Indican los límites dentro de los cuales puede variar una tarifa [c_mín, c_máx] sin que cambie la base óptima, o cambiar conjuntamente oferta y demanda [δ_mín, δ_máx] manteniendo factibles (≥ 0) las rutas básicas actuales.',
      currentModelEvidence: `${reliableActiveBasics.length} ruta(s) básica(s) activa(s) cuentan con rango tarifario calculado (${basicWithFiniteUpper.length} con tope superior finito) y ${reliableRhsPairs.length} par(es) (O_i, D_j) tienen intervalo balanceado en la Etapa 2.`,
    },
    {
      id: 'feasibility_constraints',
      title: 'Restricciones de factibilidad',
      plainExplanation:
        'Exigen que cada envío sea no negativo (x_ij ≥ 0), que se respeten las capacidades y demandas (con nodo ficticio si hay desbalance) y que las tasas marginales duales no se extrapolen fuera de [δ_mín, δ_máx].',
      currentModelEvidence: rhsSensitivity.hasDegeneracy
        ? `Base de tamaño m+n−1 = ${costSensitivity.optimalBasisSize} con degeneración activa: algunas trayectorias tienen límite δ = 0, por lo que rebasar el extremo nulo rompe la factibilidad de la base actual.`
        : `Base válida de ${costSensitivity.optimalBasisSize} celdas con verificación primal-dual certificada (Σa_i = Σb_j balanceado en ${fmt(balanced.supply.reduce((a, b) => a + b, 0))} u).`,
    },
    {
      id: 'parameter_impact',
      title: 'Impacto de cambios en costos, oferta y demanda',
      plainExplanation:
        'Un cambio de costo dentro de [c_mín, c_máx] altera el gasto Z* pero conserva las mismas rutas físicas; fuera de ese rango obliga a pivotar en MODI. Un cambio balanceado en oferta/demanda dentro de [δ_mín, δ_máx] ajusta linealmente el costo a razón de u_i + v_j; uno desbalanceado modifica el nodo ficticio y exige reoptimizar toda la red.',
      currentModelEvidence:
        options?.comparisonOutOfSync
          ? 'La comparación de Etapa 4 está pendiente de sincronización tras cambios en la matriz principal; sincroniza antes de contrastar escenarios.'
          : effectiveComparison &&
            effectiveComparison.valid &&
            effectiveComparison.hasInputChanges
          ? `En la comparación activa de Etapa 4 (${effectiveComparison.inputChanges.length} parámetro(s) editado(s)), la red pasó de $${fmt(effectiveComparison.originalOptimalCost)} MXN a $${fmt(effectiveComparison.alternativeOptimalCost ?? 0)} MXN (${effectiveComparison.addedRoutesCount} ruta(s) agregada(s), ${effectiveComparison.removedRoutesCount} eliminada(s)).`
          : `Usa el Comparador de Escenarios (Etapa 4) para observar en vivo cuándo un cambio de parámetros conserva las rutas y cuándo reconfigura la red óptima.`,
    },
  ];

  return {
    implemented: true,
    diagnosis,
    recommendations,
    scenarioComparisonAnalysis,
    economicInterpretation,
  };
}

/**
 * Construye la estructura extensible para análisis de sensibilidad post-óptimo.
 * Incluye las Etapas 1 a 5 implementadas junto con la Etapa 6 pendiente (PDF).
 */
export function buildSensitivityScaffold(
  balanced: BalancedProblem,
  optimal: OptimalResult
): SensitivityScaffold {
  const u = balanced.origins.map((label, i) => ({
    label,
    value: optimal.finalU[i] ?? 0,
  }));

  const v = balanced.destinations.map((label, j) => ({
    label,
    value: optimal.finalV[j] ?? 0,
  }));

  const costSensitivity = buildCostSensitivityAnalysis(balanced, optimal);
  const rhsSensitivity = buildRhsSensitivityAnalysis(balanced, optimal);
  const dualShadowPrices = buildDualShadowPriceAnalysis(balanced, optimal, rhsSensitivity);
  const managerialAnalysis = buildManagerialDecisionAnalysis(
    balanced,
    optimal,
    costSensitivity,
    rhsSensitivity,
    dualShadowPrices
  );

  const nonBasicOpportunityCosts = costSensitivity.nonBasicRoutes.map((route) => ({
    originName: route.originName,
    destinationName: route.destinationName,
    unitCost: route.currentCost,
    reducedCost: route.reducedCost,
    interpretation:
      route.reducedCost === 0
        ? `Costo marginal nulo (Δ = 0): puede ingresar a la base sin incrementar el costo total (óptimo alternativo).`
        : `Cada unidad enviada por ${route.originName} → ${route.destinationName} aumentaría el costo total en $${fmt(route.reducedCost)} MXN.`,
  }));

  return {
    status: 'partial',
    phaseLabel:
      'Etapas 1 a 6 implementadas · Costos, oferta/demanda, precios sombra, comparador, interpretación gerencial y PDF A4',
    computedDuals: {
      u,
      v,
      nonBasicOpportunityCosts,
    },
    costSensitivity,
    rhsSensitivity,
    dualShadowPrices,
    managerialAnalysis,
    plannedExtensions: [
      {
        id: 'cost_ranges',
        title: 'Intervalos de variación para costos unitarios (c_ij)',
        description:
          'Cálculo exacto de rangos admisibles en rutas básicas y umbrales de competitividad en rutas no básicas mediante corte del árbol dual MODI.',
        mathematicalBasis: 'Análisis de estabilidad sobre Δ_ij = c_ij - (u_i + v_j) ≥ 0.',
        implemented: true,
      },
      {
        id: 'rhs_ranges',
        title: 'Sensibilidad en capacidades de oferta y demanda (a_i, b_j)',
        description:
          'Intervalos conjuntos balanceados (a_i + δ, b_j + δ) sobre la base óptima MODI y reoptimización automática ante cambios individuales desbalanceados con nodos ficticios.',
        mathematicalBasis: 'Factibilidad primal x_rc(δ) ≥ 0 en trayectoria del árbol básico y costo marginal (u_i + v_j).',
        implemented: true,
      },
      {
        id: 'dual_shadow_prices',
        title: 'Interpretación económica de precios sombra y potenciales duales (u_i, v_j)',
        description:
          'Sistema dual básico, normalización u_1 = 0, efectos marginales balanceados (u_i + v_j, u_i − u_r, v_j − v_l) y ejemplos verificados con MODI.',
        mathematicalBasis: 'Invariancia dual ante renormalización y validez restringida a [δ_mín, δ_máx].',
        implemented: true,
      },
      {
        id: 'scenario_comparator',
        title: 'Comparador interactivo de escenarios',
        description:
          'Comparación lado a lado entre el escenario original inmutable y un escenario alternativo editando costos, ofertas o demandas mediante el motor real MODI.',
        mathematicalBasis: 'Reoptimización completa por balanceo, Costo Mínimo, Vogel y MODI con análisis diferencial de rutas y costos.',
        implemented: true,
      },
      {
        id: 'managerial_interpretation',
        title: 'Interpretación gerencial y recomendaciones para la toma de decisiones',
        description:
          'Diagnóstico ejecutivo del escenario óptimo, recomendaciones fundamentadas en rangos duales/primales, comparabilidad real de escenarios y síntesis económica.',
        mathematicalBasis: 'Integración determinista de los resultados certificados de las Etapas 1 a 4.',
        implemented: true,
      },
      {
        id: 'pdf_sensitivity_integration',
        title: 'Integración del análisis de sensibilidad e interpretación en el reporte PDF A4',
        description:
          'Incorporación de las tablas de sensibilidad, precios sombra, comparación de escenarios y recomendaciones gerenciales al documento académico A4.',
        mathematicalBasis: 'Exportación verificable de los módulos matemáticos y post-óptimos.',
        implemented: true,
      },
      {
        id: 'final_integral_validation',
        title: 'Pruebas integrales finales y validación de compilación (Etapa 7)',
        description:
          'Validación integral de extremo a extremo, verificación académica final y auditoría completa del repositorio antes de la exposición.',
        mathematicalBasis: 'Suite completa de pruebas deterministas, verificación de tipos y compilación de producción.',
        implemented: false,
      },
    ],
  };
}

/**
 * Calcula las holguras y saturación de restricciones de oferta (por almacén)
 * y demanda (por sucursal) a partir de la solución óptima certificada por MODI.
 */
export function buildSlackSaturationAnalysis(
  balanced: BalancedProblem,
  optimal: OptimalResult
): SlackSaturationAnalysis {
  const m = balanced.origins.length;
  const n = balanced.destinations.length;

  const supplyRows: SlackSupplyRow[] = [];
  let totalSupplyAvailable = 0;
  let totalRealShipped = 0;
  let totalSlackUnassigned = 0;

  for (let i = 0; i < m; i++) {
    if (i === balanced.dummyRowIndex) continue;

    const supplyAvailable = roundClean(balanced.supply[i]);
    let realShipped = 0;
    for (let j = 0; j < n; j++) {
      if (j === balanced.dummyColIndex) continue;
      realShipped = roundClean(realShipped + (optimal.allocations[i]?.[j] ?? 0));
    }

    const slackUnassigned =
      balanced.dummyColIndex !== null
        ? roundClean(optimal.allocations[i]?.[balanced.dummyColIndex] ?? 0)
        : roundClean(Math.max(0, supplyAvailable - realShipped));

    const utilizationPct =
      supplyAvailable > EPSILON
        ? roundClean((realShipped / supplyAvailable) * 100)
        : 100;

    const statusLabel =
      supplyAvailable <= EPSILON
        ? 'Sin capacidad disponible (0 u)'
        : slackUnassigned <= EPSILON
        ? 'Saturado (100% enviado)'
        : `Con holgura (${fmt(slackUnassigned)} u al Destino Ficticio)`;

    supplyRows.push({
      originIndex: i,
      originName: balanced.origins[i],
      supplyAvailable,
      realShipped,
      slackUnassigned,
      utilizationPct,
      statusLabel,
    });

    totalSupplyAvailable = roundClean(totalSupplyAvailable + supplyAvailable);
    totalRealShipped = roundClean(totalRealShipped + realShipped);
    totalSlackUnassigned = roundClean(totalSlackUnassigned + slackUnassigned);
  }

  const demandRows: SlackDemandRow[] = [];
  let totalDemandRequired = 0;
  let totalRealReceived = 0;
  let totalUnmetDemand = 0;

  for (let j = 0; j < n; j++) {
    if (j === balanced.dummyColIndex) continue;

    const demandRequired = roundClean(balanced.demand[j]);
    let realReceived = 0;
    for (let i = 0; i < m; i++) {
      if (i === balanced.dummyRowIndex) continue;
      realReceived = roundClean(realReceived + (optimal.allocations[i]?.[j] ?? 0));
    }

    const unmetDemand =
      balanced.dummyRowIndex !== null
        ? roundClean(optimal.allocations[balanced.dummyRowIndex]?.[j] ?? 0)
        : roundClean(Math.max(0, demandRequired - realReceived));

    const coveragePct =
      demandRequired > EPSILON
        ? roundClean((realReceived / demandRequired) * 100)
        : 100;

    const statusLabel =
      demandRequired <= EPSILON
        ? 'Sin requerimiento (0 u)'
        : unmetDemand <= EPSILON
        ? 'Saturada (100% cubierta)'
        : `Con déficit (${fmt(unmetDemand)} u desde Origen Ficticio)`;

    demandRows.push({
      destinationIndex: j,
      destinationName: balanced.destinations[j],
      demandRequired,
      realReceived,
      unmetDemand,
      coveragePct,
      statusLabel,
    });

    totalDemandRequired = roundClean(totalDemandRequired + demandRequired);
    totalRealReceived = roundClean(totalRealReceived + realReceived);
    totalUnmetDemand = roundClean(totalUnmetDemand + unmetDemand);
  }

  return {
    balanceStatus: balanced.balanceStatus,
    totalSupplyAvailable,
    totalRealShipped,
    totalSlackUnassigned,
    totalDemandRequired,
    totalRealReceived,
    totalUnmetDemand,
    supplyRows,
    demandRows,
  };
}
