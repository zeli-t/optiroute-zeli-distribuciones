import { EPSILON, roundClean } from './balance';
import { AllocationStep, BalancedProblem, MethodResult } from './types';

function computeLinePenalty(values: number[]): number {
  if (values.length === 0) return -1;
  if (values.length === 1) return values[0];
  const sorted = [...values].sort((a, b) => a - b);
  return roundClean(sorted[1] - sorted[0]);
}

export function solveVogel(problem: BalancedProblem): MethodResult {
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
    const rowPenalties: (number | null)[] = new Array(m).fill(null);
    const colPenalties: (number | null)[] = new Array(n).fill(null);

    if (activeRowCount > 1 && activeColCount > 1) {
      for (let i = 0; i < m; i++) {
        if (!activeRows[i]) continue;
        const costsInRow: number[] = [];
        for (let j = 0; j < n; j++) {
          if (activeCols[j]) costsInRow.push(problem.costs[i][j]);
        }
        rowPenalties[i] = computeLinePenalty(costsInRow);
      }

      for (let j = 0; j < n; j++) {
        if (!activeCols[j]) continue;
        const costsInCol: number[] = [];
        for (let i = 0; i < m; i++) {
          if (activeRows[i]) costsInCol.push(problem.costs[i][j]);
        }
        colPenalties[j] = computeLinePenalty(costsInCol);
      }
    }

    let chosenR = -1;
    let chosenC = -1;
    let reason = '';
    let selectedPenalty: AllocationStep['selectedPenalty'];

    if (activeRowCount === 1 || activeColCount === 1) {
      let minCost = Infinity;
      let bestMaxQty = -1;
      for (let i = 0; i < m; i++) {
        if (!activeRows[i]) continue;
        for (let j = 0; j < n; j++) {
          if (!activeCols[j]) continue;
          const c = problem.costs[i][j];
          const maxQty = Math.min(remSupply[i], remDemand[j]);
          if (
            c < minCost - EPSILON ||
            (Math.abs(c - minCost) <= EPSILON && maxQty > bestMaxQty + EPSILON)
          ) {
            minCost = c;
            bestMaxQty = maxQty;
            chosenR = i;
            chosenC = j;
          }
        }
      }
      const lineLabel =
        activeRowCount === 1
          ? problem.origins[chosenR]
          : problem.destinations[chosenC];
      selectedPenalty = {
        kind: 'single_line',
        lineName: lineLabel,
        penalty: null,
      };
      reason = `Solo queda una ${activeRowCount === 1 ? 'fila' : 'columna'} activa (${lineLabel}); se selecciona la celda de menor costo ($${problem.costs[chosenR][chosenC]} MXN).`;
    } else {
      type Candidate = {
        kind: 'row' | 'col';
        index: number;
        penalty: number;
        cellR: number;
        cellC: number;
        cellCost: number;
        maxQty: number;
      };

      const candidates: Candidate[] = [];

      for (let i = 0; i < m; i++) {
        const p = rowPenalties[i];
        if (p === null) continue;
        let minC = Infinity;
        let bestJ = -1;
        let bestQty = -1;
        for (let j = 0; j < n; j++) {
          if (!activeCols[j]) continue;
          const c = problem.costs[i][j];
          const q = Math.min(remSupply[i], remDemand[j]);
          if (c < minC - EPSILON || (Math.abs(c - minC) <= EPSILON && q > bestQty + EPSILON)) {
            minC = c;
            bestJ = j;
            bestQty = q;
          }
        }
        if (bestJ !== -1) {
          candidates.push({
            kind: 'row',
            index: i,
            penalty: p,
            cellR: i,
            cellC: bestJ,
            cellCost: minC,
            maxQty: bestQty,
          });
        }
      }

      for (let j = 0; j < n; j++) {
        const p = colPenalties[j];
        if (p === null) continue;
        let minC = Infinity;
        let bestI = -1;
        let bestQty = -1;
        for (let i = 0; i < m; i++) {
          if (!activeRows[i]) continue;
          const c = problem.costs[i][j];
          const q = Math.min(remSupply[i], remDemand[j]);
          if (c < minC - EPSILON || (Math.abs(c - minC) <= EPSILON && q > bestQty + EPSILON)) {
            minC = c;
            bestI = i;
            bestQty = q;
          }
        }
        if (bestI !== -1) {
          candidates.push({
            kind: 'col',
            index: j,
            penalty: p,
            cellR: bestI,
            cellC: j,
            cellCost: minC,
            maxQty: bestQty,
          });
        }
      }

      candidates.sort((a, b) => {
        if (Math.abs(b.penalty - a.penalty) > EPSILON) return b.penalty - a.penalty;
        if (Math.abs(a.cellCost - b.cellCost) > EPSILON) return a.cellCost - b.cellCost;
        if (Math.abs(b.maxQty - a.maxQty) > EPSILON) return b.maxQty - a.maxQty;
        return a.cellR !== b.cellR ? a.cellR - b.cellR : a.cellC - b.cellC;
      });

      const best = candidates[0];
      chosenR = best.cellR;
      chosenC = best.cellC;
      const lineName =
        best.kind === 'row'
          ? problem.origins[best.index]
          : problem.destinations[best.index];
      selectedPenalty = {
        kind: best.kind,
        lineName,
        penalty: best.penalty,
      };
      const lineLabel = best.kind === 'row' ? `fila ${lineName}` : `columna ${lineName}`;
      reason = `Mayor penalización (${best.penalty}) en la ${lineLabel}; se elige su celda de menor costo ($${best.cellCost} MXN).`;
    }

    if (chosenR === -1 || chosenC === -1) break;

    const cellSupplyBefore = remSupply[chosenR];
    const cellDemandBefore = remDemand[chosenC];
    const qty = roundClean(Math.min(cellSupplyBefore, cellDemandBefore));

    allocations[chosenR][chosenC] = qty;
    basicMask[chosenR][chosenC] = true;

    remSupply[chosenR] = roundClean(cellSupplyBefore - qty);
    remDemand[chosenC] = roundClean(cellDemandBefore - qty);

    const originName = problem.origins[chosenR];
    const destinationName = problem.destinations[chosenC];
    const stepCost = roundClean(qty * problem.costs[chosenR][chosenC]);
    cumulativeCost = roundClean(cumulativeCost + stepCost);

    let crossedKind: 'row' | 'col' | 'both' = 'row';
    let crossedText = '';
    if (activeRowCount === 1 && activeColCount === 1) {
      activeRows[chosenR] = false;
      activeCols[chosenC] = false;
      activeRowCount--;
      activeColCount--;
      crossedKind = 'both';
      crossedText = 'Se completan oferta y demanda.';
    } else if (remSupply[chosenR] < remDemand[chosenC] - EPSILON) {
      activeRows[chosenR] = false;
      activeRowCount--;
      crossedKind = 'row';
      crossedText = `Se agota ${originName}.`;
    } else if (remDemand[chosenC] < remSupply[chosenR] - EPSILON) {
      activeCols[chosenC] = false;
      activeColCount--;
      crossedKind = 'col';
      crossedText = `Se satisface ${destinationName}.`;
    } else {
      if (activeRowCount > 1) {
        activeRows[chosenR] = false;
        activeRowCount--;
        crossedKind = 'row';
        crossedText = `Empate de agotamiento; se cierra ${originName} y queda ${destinationName} con 0.`;
      } else {
        activeCols[chosenC] = false;
        activeColCount--;
        crossedKind = 'col';
        crossedText = `Empate de agotamiento; se cierra ${destinationName} y queda ${originName} con 0.`;
      }
    }

    steps.push({
      stepNumber: step,
      row: chosenR,
      col: chosenC,
      originName,
      destinationName,
      quantity: qty,
      unitCost: problem.costs[chosenR][chosenC],
      stepCost,
      cumulativeCostAfter: cumulativeCost,
      cellSupplyBefore,
      cellDemandBefore,
      cellSupplyAfter: remSupply[chosenR],
      cellDemandAfter: remDemand[chosenC],
      supplyAfter: [...remSupply],
      demandAfter: [...remDemand],
      crossedOut: {
        kind: crossedKind,
        description: crossedText,
      },
      reason: `${reason} Se asignan ${qty} u. ${crossedText}`,
      rowPenalties,
      colPenalties,
      selectedPenalty,
    });
  }

  let totalCost = 0;
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      totalCost += allocations[i][j] * problem.costs[i][j];
    }
  }

  return {
    methodId: 'vogel',
    methodName: 'Aproximación de Vogel (VAM)',
    allocations,
    basicMask,
    totalCost: roundClean(totalCost),
    steps,
  };
}
