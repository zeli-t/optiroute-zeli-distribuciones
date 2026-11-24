import { EPSILON, roundClean } from './balance';
import { AllocationStep, BalancedProblem, MethodResult } from './types';

export function solveLeastCost(problem: BalancedProblem): MethodResult {
  const m = problem.origins.length;
  const n = problem.destinations.length;

  const allocations: number[][] = Array.from({ length: m }, () => new Array(n).fill(0));
  const basicMask: boolean[][] = Array.from({ length: m }, () => new Array(n).fill(false));
  const remSupply = [...problem.supply];
  const remDemand = [...problem.demand];
  const activeRows = new Array(m).fill(true);
  const activeCols = new Array(n).fill(true);

  let activeRowCount = m;
  let activeColCount = n;
  let cumulativeCost = 0;
  const steps: AllocationStep[] = [];
  const totalSteps = m + n - 1;

  for (let step = 1; step <= totalSteps; step++) {
    let bestR = -1;
    let bestC = -1;
    let bestCost = Infinity;
    let bestMaxQty = -1;

    for (let i = 0; i < m; i++) {
      if (!activeRows[i]) continue;
      for (let j = 0; j < n; j++) {
        if (!activeCols[j]) continue;
        const c = problem.costs[i][j];
        const maxQty = Math.min(remSupply[i], remDemand[j]);
        if (
          c < bestCost - EPSILON ||
          (Math.abs(c - bestCost) <= EPSILON && maxQty > bestMaxQty + EPSILON)
        ) {
          bestCost = c;
          bestMaxQty = maxQty;
          bestR = i;
          bestC = j;
        }
      }
    }

    if (bestR === -1 || bestC === -1) {
      break;
    }

    const cellSupplyBefore = remSupply[bestR];
    const cellDemandBefore = remDemand[bestC];
    const qty = roundClean(Math.min(cellSupplyBefore, cellDemandBefore));

    allocations[bestR][bestC] = qty;
    basicMask[bestR][bestC] = true;

    remSupply[bestR] = roundClean(cellSupplyBefore - qty);
    remDemand[bestC] = roundClean(cellDemandBefore - qty);

    const stepCost = roundClean(qty * problem.costs[bestR][bestC]);
    cumulativeCost = roundClean(cumulativeCost + stepCost);

    const originName = problem.origins[bestR];
    const destinationName = problem.destinations[bestC];

    let crossedKind: 'row' | 'col' | 'both' = 'row';
    let crossedText = '';
    if (activeRowCount === 1 && activeColCount === 1) {
      activeRows[bestR] = false;
      activeCols[bestC] = false;
      activeRowCount--;
      activeColCount--;
      crossedKind = 'both';
      crossedText = 'Se completan todas las restricciones de oferta y demanda.';
    } else if (remSupply[bestR] < remDemand[bestC] - EPSILON) {
      activeRows[bestR] = false;
      activeRowCount--;
      crossedKind = 'row';
      crossedText = `Se agota la oferta de ${originName}.`;
    } else if (remDemand[bestC] < remSupply[bestR] - EPSILON) {
      activeCols[bestC] = false;
      activeColCount--;
      crossedKind = 'col';
      crossedText = `Se satisface la demanda de ${destinationName}.`;
    } else {
      // Degeneración: oferta y demanda se anulan al mismo tiempo; se tacha una sola línea para conservar m+n-1 celdas básicas.
      if (activeRowCount > 1) {
        activeRows[bestR] = false;
        activeRowCount--;
        crossedKind = 'row';
        crossedText = `Empate al agotar fila y columna; se cierra ${originName} y queda ${destinationName} con demanda restante 0.`;
      } else {
        activeCols[bestC] = false;
        activeColCount--;
        crossedKind = 'col';
        crossedText = `Empate al agotar fila y columna; se cierra ${destinationName} y queda ${originName} con oferta restante 0.`;
      }
    }

    steps.push({
      stepNumber: step,
      row: bestR,
      col: bestC,
      originName,
      destinationName,
      quantity: qty,
      unitCost: problem.costs[bestR][bestC],
      stepCost,
      cumulativeCostAfter: cumulativeCost,
      cellSupplyBefore,
      cellDemandBefore,
      cellSupplyAfter: remSupply[bestR],
      cellDemandAfter: remDemand[bestC],
      supplyAfter: [...remSupply],
      demandAfter: [...remDemand],
      crossedOut: {
        kind: crossedKind,
        description: crossedText,
      },
      reason: `Costo unitario mínimo disponible ($${problem.costs[bestR][bestC]} MXN) en (${originName} → ${destinationName}). Se asignan ${qty} u. ${crossedText}`,
    });
  }

  let totalCost = 0;
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      totalCost += allocations[i][j] * problem.costs[i][j];
    }
  }

  return {
    methodId: 'least_cost',
    methodName: 'Costo Mínimo',
    allocations,
    basicMask,
    totalCost: roundClean(totalCost),
    steps,
  };
}
