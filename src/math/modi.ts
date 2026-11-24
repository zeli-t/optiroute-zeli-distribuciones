import { EPSILON, roundClean } from './balance';
import {
  AllocationStep,
  BalancedProblem,
  MethodResult,
  ModiIteration,
  OptimalResult,
  VerificationCertificate,
} from './types';

function computeTotalCost(allocations: number[][], costs: number[][]): number {
  let total = 0;
  for (let i = 0; i < allocations.length; i++) {
    for (let j = 0; j < allocations[i].length; j++) {
      total += allocations[i][j] * costs[i][j];
    }
  }
  return roundClean(total);
}

function solveDualPotentials(
  basicMask: boolean[][],
  costs: number[][]
): { u: number[]; v: number[] } {
  const m = costs.length;
  const n = costs[0].length;
  const u: (number | null)[] = new Array(m).fill(null);
  const v: (number | null)[] = new Array(n).fill(null);

  u[0] = 0;
  const queue: { type: 'row' | 'col'; index: number }[] = [{ type: 'row', index: 0 }];

  while (queue.length > 0) {
    const node = queue.shift()!;
    if (node.type === 'row') {
      const i = node.index;
      const ui = u[i]!;
      for (let j = 0; j < n; j++) {
        if (basicMask[i][j] && v[j] === null) {
          v[j] = roundClean(costs[i][j] - ui);
          queue.push({ type: 'col', index: j });
        }
      }
    } else {
      const j = node.index;
      const vj = v[j]!;
      for (let i = 0; i < m; i++) {
        if (basicMask[i][j] && u[i] === null) {
          u[i] = roundClean(costs[i][j] - vj);
          queue.push({ type: 'row', index: i });
        }
      }
    }
  }

  return {
    u: u.map((val) => val ?? 0),
    v: v.map((val) => val ?? 0),
  };
}

/**
 * Encuentra el ciclo cerrado único en el árbol generador de celdas básicas
 * al introducir la celda no básica (enterRow, enterCol).
 */
function findSteppingStoneCycle(
  basicMask: boolean[][],
  enterRow: number,
  enterCol: number
): { row: number; col: number; sign: '+' | '-' }[] {
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

  if (!found) {
    throw new Error('No se encontró un ciclo cerrado válido en la base actual.');
  }

  const pathNodes: number[] = [];
  let cur = targetNode;
  while (cur !== -1) {
    pathNodes.push(cur);
    cur = parent[cur];
  }
  pathNodes.reverse();

  const cycle: { row: number; col: number; sign: '+' | '-' }[] = [
    { row: enterRow, col: enterCol, sign: '+' },
  ];

  for (let k = 0; k < pathNodes.length - 1; k++) {
    const a = pathNodes[k];
    const b = pathNodes[k + 1];
    const r = a < m ? a : b;
    const c = a < m ? b - m : a - m;
    const sign: '+' | '-' = k % 2 === 0 ? '-' : '+';
    cycle.push({ row: r, col: c, sign });
  }

  return cycle;
}

function verifySolution(
  problem: BalancedProblem,
  allocations: number[][],
  basicMask: boolean[][],
  reducedCosts: (number | null)[][],
  totalCost: number
): VerificationCertificate {
  const m = problem.origins.length;
  const n = problem.destinations.length;

  let supplySatisfied = true;
  for (let i = 0; i < m; i++) {
    const sum = allocations[i].reduce((acc, val) => acc + val, 0);
    if (Math.abs(sum - problem.supply[i]) > 1e-6) {
      supplySatisfied = false;
    }
  }

  let demandSatisfied = true;
  for (let j = 0; j < n; j++) {
    let sum = 0;
    for (let i = 0; i < m; i++) {
      sum += allocations[i][j];
    }
    if (Math.abs(sum - problem.demand[j]) > 1e-6) {
      demandSatisfied = false;
    }
  }

  let nonNegative = true;
  let basicCellCount = 0;
  let allReducedCostsNonNegative = true;
  let recomputedCost = 0;

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (allocations[i][j] < -1e-6) {
        nonNegative = false;
      }
      if (basicMask[i][j]) {
        basicCellCount++;
      } else {
        const rc = reducedCosts[i][j];
        if (rc !== null && rc < -1e-6) {
          allReducedCostsNonNegative = false;
        }
      }
      recomputedCost += allocations[i][j] * problem.costs[i][j];
    }
  }

  return {
    supplySatisfied,
    demandSatisfied,
    nonNegative,
    basicCellCount,
    expectedBasicCount: m + n - 1,
    allReducedCostsNonNegative,
    costMatchesSum: Math.abs(recomputedCost - totalCost) <= 1e-6,
  };
}

export function solveModiOptimal(
  problem: BalancedProblem,
  initialBfs: MethodResult
): OptimalResult {
  const m = problem.origins.length;
  const n = problem.destinations.length;

  const allocations = initialBfs.allocations.map((row) => [...row]);
  const basicMask = initialBfs.basicMask.map((row) => [...row]);
  const iterations: ModiIteration[] = [];

  const maxIterations = Math.max(200, m * n * 20);
  let finalU: number[] = new Array(m).fill(0);
  let finalV: number[] = new Array(n).fill(0);
  let finalReducedCosts: (number | null)[][] = Array.from({ length: m }, () =>
    new Array(n).fill(null)
  );
  let consecutiveDegeneratePivots = 0;
  let converged = false;

  for (let iter = 1; iter <= maxIterations; iter++) {
    const allocationsBefore = allocations.map((row) => [...row]);
    const basicMaskBefore = basicMask.map((row) => [...row]);

    const { u, v } = solveDualPotentials(basicMask, problem.costs);
    const reducedCosts: (number | null)[][] = Array.from({ length: m }, () =>
      new Array(n).fill(null)
    );

    const useBlandRule = consecutiveDegeneratePivots >= 2;
    let bestEnterRow = -1;
    let bestEnterCol = -1;
    let minDelta = 0;

    for (let i = 0; i < m; i++) {
      for (let j = 0; j < n; j++) {
        if (basicMask[i][j]) {
          reducedCosts[i][j] = null;
          continue;
        }
        const delta = roundClean(problem.costs[i][j] - (u[i] + v[j]));
        reducedCosts[i][j] = delta;

        if (useBlandRule) {
          if (bestEnterRow === -1 && delta < -EPSILON) {
            minDelta = delta;
            bestEnterRow = i;
            bestEnterCol = j;
          }
        } else if (delta < minDelta - EPSILON) {
          minDelta = delta;
          bestEnterRow = i;
          bestEnterCol = j;
        }
      }
    }

    finalU = u;
    finalV = v;
    finalReducedCosts = reducedCosts;

    const totalCostBefore = computeTotalCost(allocations, problem.costs);

    if (bestEnterRow === -1) {
      iterations.push({
        iteration: iter,
        u,
        v,
        reducedCosts,
        basicMaskBefore,
        allocationsBefore,
        allocationsAfter: allocations.map((row) => [...row]),
        enteringCell: null,
        leavingCell: null,
        theta: 0,
        cycle: [],
        totalCostBefore,
        totalCostAfter: totalCostBefore,
        summary: `Todos los costos reducidos Δ_ij son mayores o iguales a 0. La solución actual de $${totalCostBefore} MXN es óptima certificada.`,
      });
      converged = true;
      break;
    }

    const rawCycle = findSteppingStoneCycle(basicMask, bestEnterRow, bestEnterCol);
    const cycle = rawCycle.map((node) => ({
      ...node,
      currentAllocation: allocationsBefore[node.row][node.col],
    }));

    let theta = Infinity;
    let leavingRow = -1;
    let leavingCol = -1;

    for (const node of cycle) {
      if (node.sign === '-') {
        const val = allocations[node.row][node.col];
        if (val < theta - EPSILON) {
          theta = val;
          leavingRow = node.row;
          leavingCol = node.col;
        } else if (useBlandRule && Math.abs(val - theta) <= EPSILON) {
          if (
            node.row < leavingRow ||
            (node.row === leavingRow && node.col < leavingCol)
          ) {
            leavingRow = node.row;
            leavingCol = node.col;
          }
        }
      }
    }

    theta = roundClean(theta);
    if (theta <= EPSILON) {
      consecutiveDegeneratePivots++;
    } else {
      consecutiveDegeneratePivots = 0;
    }

    for (const node of cycle) {
      if (node.sign === '+') {
        allocations[node.row][node.col] = roundClean(allocations[node.row][node.col] + theta);
      } else {
        allocations[node.row][node.col] = roundClean(allocations[node.row][node.col] - theta);
      }
    }

    basicMask[bestEnterRow][bestEnterCol] = true;
    basicMask[leavingRow][leavingCol] = false;
    allocations[leavingRow][leavingCol] = 0;

    const totalCostAfter = computeTotalCost(allocations, problem.costs);
    const enterLabel = `${problem.origins[bestEnterRow]} → ${problem.destinations[bestEnterCol]}`;
    const leaveLabel = `${problem.origins[leavingRow]} → ${problem.destinations[leavingCol]}`;

    iterations.push({
      iteration: iter,
      u,
      v,
      reducedCosts,
      basicMaskBefore,
      allocationsBefore,
      allocationsAfter: allocations.map((row) => [...row]),
      enteringCell: { row: bestEnterRow, col: bestEnterCol, delta: minDelta },
      leavingCell: { row: leavingRow, col: leavingCol },
      theta,
      cycle,
      totalCostBefore,
      totalCostAfter,
      summary: `Entra (${enterLabel}) con Δ = ${minDelta} MXN/u. Se ajusta el ciclo con θ = ${theta} u, sale (${leaveLabel}) y el costo pasa de $${totalCostBefore} a $${totalCostAfter} MXN.`,
    });
  }

  if (!converged) {
    throw new Error('El método MODI alcanzó el límite de iteraciones sin converger.');
  }

  const totalCost = computeTotalCost(allocations, problem.costs);

  const alternativeCells: { row: number; col: number; originName: string; destinationName: string }[] = [];
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (!basicMask[i][j]) {
        const rc = finalReducedCosts[i][j];
        if (rc !== null && Math.abs(rc) <= EPSILON) {
          alternativeCells.push({
            row: i,
            col: j,
            originName: problem.origins[i],
            destinationName: problem.destinations[j],
          });
        }
      }
    }
  }

  const steps: AllocationStep[] = [];
  let stepCounter = 1;
  let runningCost = 0;
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (allocations[i][j] > EPSILON) {
        const sc = roundClean(allocations[i][j] * problem.costs[i][j]);
        runningCost = roundClean(runningCost + sc);
        steps.push({
          stepNumber: stepCounter++,
          row: i,
          col: j,
          originName: problem.origins[i],
          destinationName: problem.destinations[j],
          quantity: allocations[i][j],
          unitCost: problem.costs[i][j],
          stepCost: sc,
          cumulativeCostAfter: runningCost,
          cellSupplyBefore: problem.supply[i],
          cellDemandBefore: problem.demand[j],
          cellSupplyAfter: 0,
          cellDemandAfter: 0,
          supplyAfter: [],
          demandAfter: [],
          crossedOut: {
            kind: 'both',
            description: 'Asignación óptima final',
          },
          reason: `Asignación óptima verificada por multiplicadores MODI (u_${i + 1}=${finalU[i]}, v_${j + 1}=${finalV[j]}).`,
        });
      }
    }
  }

  const verification = verifySolution(
    problem,
    allocations,
    basicMask,
    finalReducedCosts,
    totalCost
  );

  return {
    methodId: 'optimal',
    methodName: 'Solución Óptima (MODI)',
    allocations,
    basicMask,
    totalCost,
    steps,
    iterations,
    finalU,
    finalV,
    finalReducedCosts,
    hasAlternativeOptima: alternativeCells.length > 0,
    alternativeCells,
    verification,
  };
}
