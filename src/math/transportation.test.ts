import assert from 'node:assert/strict';
import test from 'node:test';
import { EPSILON, balanceProblem, validateProblem } from './balance';
import { solveLeastCost } from './leastCost';
import { solveModiOptimal } from './modi';
import { buildAcademicPdfReport } from './pdfReport';
import { ACADEMIC_PRESETS, ZELI_DEFAULT_CASE } from './presets';
import {
  buildCostSensitivityAnalysis,
  buildManagerialDecisionAnalysis,
  buildManagerialScenarioSummary,
  buildRhsSensitivityAnalysis,
  cloneTransportationProblem,
  compareTransportationScenarios,
  evaluateUnbalancedRhsScenario,
  getZeroRealFlowWarning,
} from './sensitivity';
import { solveTransportationProblem } from './solver';
import { BalancedProblem, MethodResult, TransportationProblem } from './types';
import { solveVogel } from './vogel';

function assertSupplyAndDemandExact(
  balanced: BalancedProblem,
  result: MethodResult,
  label: string
) {
  const m = balanced.origins.length;
  const n = balanced.destinations.length;

  for (let i = 0; i < m; i++) {
    const rowSum = result.allocations[i].reduce((a, b) => a + b, 0);
    assert.ok(
      Math.abs(rowSum - balanced.supply[i]) <= 1e-6,
      `${label}: fila ${i} suma ${rowSum}, esperado ${balanced.supply[i]}`
    );
  }

  for (let j = 0; j < n; j++) {
    let colSum = 0;
    for (let i = 0; i < m; i++) {
      colSum += result.allocations[i][j];
    }
    assert.ok(
      Math.abs(colSum - balanced.demand[j]) <= 1e-6,
      `${label}: columna ${j} suma ${colSum}, esperado ${balanced.demand[j]}`
    );
  }

  let basicCount = 0;
  let recomputedCost = 0;
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      assert.ok(
        result.allocations[i][j] >= -EPSILON,
        `${label}: asignación negativa en (${i},${j})`
      );
      if (result.basicMask[i][j]) basicCount++;
      recomputedCost += result.allocations[i][j] * balanced.costs[i][j];
    }
  }
  assert.equal(
    basicCount,
    m + n - 1,
    `${label}: debe tener m+n-1=${m + n - 1} celdas básicas, obtuvo ${basicCount}`
  );
  assert.ok(
    Math.abs(recomputedCost - result.totalCost) <= 1e-6,
    `${label}: costo total ${result.totalCost} no coincide con suma ${recomputedCost}`
  );
}

/**
 * Construye una solución básica factible por Esquina Noroeste (habitualmente subóptima)
 * para demostrar que MODI optimiza iterativamente desde cualquier base inicial válida.
 */
function buildNorthwestCornerBfs(balanced: BalancedProblem): MethodResult {
  const m = balanced.origins.length;
  const n = balanced.destinations.length;
  const allocations: number[][] = Array.from({ length: m }, () => new Array(n).fill(0));
  const basicMask: boolean[][] = Array.from({ length: m }, () => new Array(n).fill(false));
  const remS = [...balanced.supply];
  const remD = [...balanced.demand];

  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    const qty = Math.min(remS[i], remD[j]);
    allocations[i][j] = qty;
    basicMask[i][j] = true;
    remS[i] -= qty;
    remD[j] -= qty;

    if (i === m - 1 && j === n - 1) break;
    if (remS[i] <= remD[j] && i < m - 1) {
      i++;
    } else if (j < n - 1) {
      j++;
    } else {
      i++;
    }
  }

  let totalCost = 0;
  for (let r = 0; r < m; r++) {
    for (let c = 0; c < n; c++) {
      totalCost += allocations[r][c] * balanced.costs[r][c];
    }
  }

  return {
    methodId: 'least_cost',
    methodName: 'Esquina Noroeste (prueba)',
    allocations,
    basicMask,
    totalCost,
    steps: [],
  };
}

test('1. Caso base Zeli Distribuciones: oferta A=100, B=150; demanda [80,90,80]; costos [[8,6,10],[9,7,4]]', () => {
  const res = solveTransportationProblem(ZELI_DEFAULT_CASE);

  assert.equal(res.validation.valid, true);
  assert.ok(res.balanced && res.leastCost && res.vogel && res.optimal);

  assert.equal(res.balanced.balanceStatus, 'balanced');
  assert.equal(res.balanced.originalSupplyTotal, 250);
  assert.equal(res.balanced.originalDemandTotal, 250);

  assertSupplyAndDemandExact(res.balanced, res.leastCost, 'Costo Mínimo Zeli');
  assertSupplyAndDemandExact(res.balanced, res.vogel, 'Vogel Zeli');
  assertSupplyAndDemandExact(res.balanced, res.optimal, 'MODI Zeli');

  // A->S1: 10*8=80, A->S2: 90*6=540, B->S1: 70*9=630, B->S3: 80*4=320 => Total = 1570
  assert.equal(res.leastCost.totalCost, 1570);
  assert.equal(res.vogel.totalCost, 1570);
  assert.equal(res.optimal.totalCost, 1570);

  assert.equal(res.optimal.verification.allReducedCostsNonNegative, true);
  assert.equal(res.optimal.hasAlternativeOptima, true);
  assert.equal(res.optimal.alternativeCells[0].originName, 'Almacén B');
  assert.equal(res.optimal.alternativeCells[0].destinationName, 'Sucursal 2');

  // Base alternativa por Esquina Noroeste: A->S1=80, A->S2=20, B->S2=70, B->S3=80 => 1570
  const nwBfs = buildNorthwestCornerBfs(res.balanced);
  assert.equal(nwBfs.totalCost, 1570);
  const optFromNw = solveModiOptimal(res.balanced, nwBfs);
  assert.equal(optFromNw.totalCost, 1570);
  assert.equal(optFromNw.verification.allReducedCostsNonNegative, true);
});

test('2. Caso comparativo 3x4 (Taha): Costo Mínimo = 475, Vogel = 475, MODI mejora a 435 desde cualquier BFS', () => {
  const comparative = ACADEMIC_PRESETS.find((p) => p.id === 'comparative_3x4')!.problem;
  const balanced = balanceProblem(comparative);

  const lcm = solveLeastCost(balanced);
  const vogel = solveVogel(balanced);
  const nw = buildNorthwestCornerBfs(balanced);

  assertSupplyAndDemandExact(balanced, lcm, 'LCM 3x4');
  assertSupplyAndDemandExact(balanced, vogel, 'Vogel 3x4');
  assertSupplyAndDemandExact(balanced, nw, 'NW 3x4');

  assert.equal(lcm.totalCost, 475);
  assert.equal(vogel.totalCost, 475);
  assert.equal(nw.totalCost, 520);

  const optFromLcm = solveModiOptimal(balanced, lcm);
  const optFromVogel = solveModiOptimal(balanced, vogel);
  const optFromNw = solveModiOptimal(balanced, nw);

  assert.equal(optFromLcm.totalCost, 435);
  assert.equal(optFromVogel.totalCost, 435);
  assert.equal(optFromNw.totalCost, 435);
  assert.ok(optFromLcm.iterations.length >= 2);
  assert.ok(optFromNw.iterations.length >= 2);
  assert.equal(optFromLcm.verification.allReducedCostsNonNegative, true);
  assert.equal(optFromNw.verification.allReducedCostsNonNegative, true);
});

test('3. Caso con penalización alta: Vogel (940) supera ampliamente a Costo Mínimo (3300) y MODI certifica el óptimo', () => {
  const penaltyCase: TransportationProblem = {
    origins: ['O1', 'O2', 'O3'],
    destinations: ['D1', 'D2', 'D3'],
    supply: [20, 30, 50],
    demand: [30, 40, 30],
    costs: [
      [1, 10, 10],
      [2, 3, 20],
      [10, 10, 100],
    ],
  };

  const res = solveTransportationProblem(penaltyCase);
  assert.equal(res.validation.valid, true);
  assert.ok(res.balanced && res.leastCost && res.vogel && res.optimal);

  assertSupplyAndDemandExact(res.balanced, res.leastCost, 'LCM penaltyCase');
  assertSupplyAndDemandExact(res.balanced, res.vogel, 'Vogel penaltyCase');
  assertSupplyAndDemandExact(res.balanced, res.optimal, 'MODI penaltyCase');

  assert.equal(res.leastCost.totalCost, 3300);
  assert.equal(res.vogel.totalCost, 940);

  const optFromLcm = solveModiOptimal(res.balanced, res.leastCost);
  assert.equal(optFromLcm.totalCost, res.optimal.totalCost);
  assert.ok(res.optimal.totalCost <= res.vogel.totalCost);
  assert.equal(res.optimal.verification.allReducedCostsNonNegative, true);
});

test('4. Escenario desbalanceado con exceso de oferta: agrega Destino Ficticio y MODI mejora de 1580 a 1530', () => {
  const surplusCase = ACADEMIC_PRESETS.find((p) => p.id === 'zeli_surplus')!.problem;
  const res = solveTransportationProblem(surplusCase);

  assert.equal(res.validation.valid, true);
  assert.ok(res.balanced && res.leastCost && res.vogel && res.optimal);
  assert.equal(res.balanced.balanceStatus, 'dummy_destination');
  assert.equal(res.balanced.dummyAmount, 50);
  assert.equal(res.balanced.dummyColIndex, 3);

  assertSupplyAndDemandExact(res.balanced, res.leastCost, 'LCM surplus');
  assertSupplyAndDemandExact(res.balanced, res.vogel, 'Vogel surplus');
  assertSupplyAndDemandExact(res.balanced, res.optimal, 'MODI surplus');

  assert.equal(res.leastCost.totalCost, 1580);
  assert.equal(res.vogel.totalCost, 1580);
  assert.equal(res.optimal.totalCost, 1530);
  assert.ok(res.optimal.iterations.length >= 2);
  assert.equal(res.optimal.verification.allReducedCostsNonNegative, true);
});

test('5. Escenario desbalanceado con exceso de demanda: agrega Origen Ficticio con costo 0', () => {
  const deficitCase = ACADEMIC_PRESETS.find((p) => p.id === 'zeli_deficit')!.problem;
  const res = solveTransportationProblem(deficitCase);

  assert.equal(res.validation.valid, true);
  assert.ok(res.balanced && res.leastCost && res.vogel && res.optimal);
  assert.equal(res.balanced.balanceStatus, 'dummy_origin');
  assert.equal(res.balanced.dummyAmount, 50);
  assert.equal(res.balanced.dummyRowIndex, 2);

  assertSupplyAndDemandExact(res.balanced, res.leastCost, 'LCM deficit');
  assertSupplyAndDemandExact(res.balanced, res.vogel, 'Vogel deficit');
  assertSupplyAndDemandExact(res.balanced, res.optimal, 'MODI deficit');

  assert.equal(res.optimal.totalCost, 1230);
  assert.equal(res.optimal.verification.allReducedCostsNonNegative, true);
});

test('6. Escenario altamente degenerado (empates múltiples y pivotes θ=0): sin ciclado y base m+n-1 válida', () => {
  const degenerate: TransportationProblem = {
    origins: ['A1', 'A2', 'A3', 'A4'],
    destinations: ['D1', 'D2', 'D3', 'D4'],
    supply: [40, 60, 40, 60],
    demand: [40, 60, 40, 60],
    costs: [
      [10, 2, 8, 12],
      [6, 9, 3, 7],
      [4, 8, 9, 2],
      [5, 3, 6, 9],
    ],
  };

  const res = solveTransportationProblem(degenerate);
  assert.equal(res.validation.valid, true);
  assert.ok(res.balanced && res.leastCost && res.vogel && res.optimal);

  assertSupplyAndDemandExact(res.balanced, res.leastCost, 'LCM degenerate');
  assertSupplyAndDemandExact(res.balanced, res.vogel, 'Vogel degenerate');
  assertSupplyAndDemandExact(res.balanced, res.optimal, 'MODI degenerate');

  const optFromNw = solveModiOptimal(res.balanced, buildNorthwestCornerBfs(res.balanced));
  assert.equal(optFromNw.totalCost, res.optimal.totalCost);
  assert.equal(res.optimal.verification.allReducedCostsNonNegative, true);
});

test('7. Casos límite: matriz 1x1, matriz 1x3, oferta en 0 y costos decimales', () => {
  const oneByOne: TransportationProblem = {
    origins: ['Único'],
    destinations: ['Única'],
    supply: [75],
    demand: [75],
    costs: [[12]],
  };
  const r1 = solveTransportationProblem(oneByOne);
  assert.equal(r1.optimal?.totalCost, 900);
  assertSupplyAndDemandExact(r1.balanced!, r1.optimal!, '1x1');

  const oneByThree: TransportationProblem = {
    origins: ['Central'],
    destinations: ['S1', 'S2', 'S3'],
    supply: [120],
    demand: [30, 50, 40],
    costs: [[4, 7, 2]],
  };
  const r2 = solveTransportationProblem(oneByThree);
  assert.equal(r2.optimal?.totalCost, 550);
  assertSupplyAndDemandExact(r2.balanced!, r2.optimal!, '1x3');

  const decimalAndZeroSupply: TransportationProblem = {
    origins: ['A', 'B', 'C'],
    destinations: ['D1', 'D2'],
    supply: [0, 10.5, 9.5],
    demand: [8.25, 11.75],
    costs: [
      [1.5, 2.5],
      [3.2, 1.1],
      [2.0, 4.4],
    ],
  };
  const r3 = solveTransportationProblem(decimalAndZeroSupply);
  assert.equal(r3.validation.valid, true);
  assert.ok(r3.balanced && r3.optimal);
  assertSupplyAndDemandExact(r3.balanced, r3.optimal, 'Decimales y oferta cero');
  assert.equal(r3.optimal.totalCost, 33.55);
  assert.equal(r3.optimal.verification.allReducedCostsNonNegative, true);
});

test('8. Reactividad matemática: modificar costo, oferta o demanda recalcula sin valores fijos', () => {
  const base = solveTransportationProblem(ZELI_DEFAULT_CASE);
  assert.equal(base.optimal?.totalCost, 1570);

  // Modificar un costo (A->S1 de 8 a 2)
  const modifiedCost: TransportationProblem = {
    ...ZELI_DEFAULT_CASE,
    costs: [
      [2, 6, 10],
      [9, 7, 4],
    ],
  };
  const rCost = solveTransportationProblem(modifiedCost);
  assert.equal(rCost.optimal?.totalCost, 1090);

  // Modificar una oferta (A de 100 a 120 -> exceso de oferta +20 -> B->S3 80*4=320, A->S1 80*8=640, A->S2 40*6=240, B->S2 50*7=350 => 1550)
  const modifiedSupply: TransportationProblem = {
    ...ZELI_DEFAULT_CASE,
    supply: [120, 150],
  };
  const rSupply = solveTransportationProblem(modifiedSupply);
  assert.equal(rSupply.balanced?.balanceStatus, 'dummy_destination');
  assert.equal(rSupply.optimal?.totalCost, 1550);

  // Modificar una demanda (S3 de 80 a 120 -> exceso de demanda +40 -> B->S3 120*4=480, B->S2 30*7=210, A->S2 60*6=360, A->S1 40*8=320, Dummy->S1 40*0 => 1370)
  const modifiedDemand: TransportationProblem = {
    ...ZELI_DEFAULT_CASE,
    demand: [80, 90, 120],
  };
  const rDemand = solveTransportationProblem(modifiedDemand);
  assert.equal(rDemand.balanced?.balanceStatus, 'dummy_origin');
  assert.equal(rDemand.optimal?.totalCost, 1370);
});

test('9. Validación de entradas numéricas inválidas', () => {
  const invalidNegCost: TransportationProblem = {
    ...ZELI_DEFAULT_CASE,
    costs: [
      [-5, 6, 10],
      [9, 7, 4],
    ],
  };
  const v1 = validateProblem(invalidNegCost);
  assert.equal(v1.valid, false);
  assert.ok(v1.errors.some((e) => e.field === 'costs.0.0'));

  const invalidZeroTotals: TransportationProblem = {
    origins: ['A'],
    destinations: ['S1'],
    supply: [0],
    demand: [0],
    costs: [[5]],
  };
  const v2 = validateProblem(invalidZeroTotals);
  assert.equal(v2.valid, false);
  assert.ok(v2.errors.some((e) => e.field === 'totals'));

  const invalidNaN: TransportationProblem = {
    ...ZELI_DEFAULT_CASE,
    supply: [Number.NaN, 150],
  };
  const v3 = validateProblem(invalidNaN);
  assert.equal(v3.valid, false);
  assert.ok(v3.errors.some((e) => e.field === 'supply.0'));
});

test('10. Consistencia de instrumentación paso a paso en Costo Mínimo y Vogel', () => {
  const problemsToCheck: TransportationProblem[] = [
    ZELI_DEFAULT_CASE,
    ACADEMIC_PRESETS.find((p) => p.id === 'comparative_3x4')!.problem,
    ACADEMIC_PRESETS.find((p) => p.id === 'zeli_surplus')!.problem,
    ACADEMIC_PRESETS.find((p) => p.id === 'zeli_deficit')!.problem,
  ];

  for (const prob of problemsToCheck) {
    const res = solveTransportationProblem(prob);
    assert.ok(res.balanced && res.leastCost && res.vogel);
    const m = res.balanced.origins.length;
    const n = res.balanced.destinations.length;

    for (const method of [res.leastCost, res.vogel]) {
      assert.equal(method.steps.length, m + n - 1);

      const reconstructed: number[][] = Array.from({ length: m }, () => new Array(n).fill(0));
      let runningCost = 0;

      for (const step of method.steps) {
        reconstructed[step.row][step.col] += step.quantity;
        runningCost += step.quantity * res.balanced.costs[step.row][step.col];

        assert.ok(
          Math.abs(step.stepCost - step.quantity * step.unitCost) <= 1e-6,
          `${method.methodName}: stepCost inconsistente en paso ${step.stepNumber}`
        );
        assert.ok(
          Math.abs(step.cumulativeCostAfter - runningCost) <= 1e-6,
          `${method.methodName}: cumulativeCostAfter inconsistente en paso ${step.stepNumber}`
        );
        assert.ok(
          Math.abs(step.cellSupplyAfter - (step.cellSupplyBefore - step.quantity)) <= 1e-6
        );
        assert.ok(
          Math.abs(step.cellDemandAfter - (step.cellDemandBefore - step.quantity)) <= 1e-6
        );

        if (method.methodId === 'vogel' && step.selectedPenalty && step.selectedPenalty.kind !== 'single_line') {
          const allPenalties = [
            ...(step.rowPenalties ?? []),
            ...(step.colPenalties ?? []),
          ].filter((p): p is number => p !== null);
          const maxPenalty = Math.max(...allPenalties);
          assert.ok(
            Math.abs((step.selectedPenalty.penalty ?? -1) - maxPenalty) <= 1e-6,
            `Vogel debe seleccionar la penalización máxima (${maxPenalty})`
          );
        }
      }

      // La matriz reconstruida desde los pasos debe coincidir exactamente con allocations
      for (let i = 0; i < m; i++) {
        for (let j = 0; j < n; j++) {
          assert.ok(
            Math.abs(reconstructed[i][j] - method.allocations[i][j]) <= 1e-6,
            `Diferencia entre pasos y asignación final en (${i},${j})`
          );
        }
      }

      const lastStep = method.steps[method.steps.length - 1];
      assert.ok(Math.abs(lastStep.cumulativeCostAfter - method.totalCost) <= 1e-6);
      assert.ok(lastStep.supplyAfter.every((s) => Math.abs(s) <= 1e-6));
      assert.ok(lastStep.demandAfter.every((d) => Math.abs(d) <= 1e-6));
    }
  }
});

test('11. Consistencia de iteraciones MODI: potenciales u_i+v_j=c_ij, Δ_ij, ciclo y nuevo costo', () => {
  const comparative = ACADEMIC_PRESETS.find((p) => p.id === 'comparative_3x4')!.problem;
  const balanced = balanceProblem(comparative);
  const lcm = solveLeastCost(balanced);
  const optimal = solveModiOptimal(balanced, lcm);

  assert.ok(optimal.iterations.length >= 2);
  const m = balanced.origins.length;
  const n = balanced.destinations.length;

  for (const iter of optimal.iterations) {
    // Verificar u_i + v_j = c_ij en celdas básicas y Δ_ij = c_ij - (u_i + v_j) en no básicas
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < n; j++) {
        if (iter.basicMaskBefore[i][j]) {
          assert.ok(
            Math.abs(iter.u[i] + iter.v[j] - balanced.costs[i][j]) <= 1e-6,
            `Iter ${iter.iteration}: u_${i}+v_${j} != c_${i}${j}`
          );
          assert.equal(iter.reducedCosts[i][j], null);
        } else {
          const expectedDelta = balanced.costs[i][j] - (iter.u[i] + iter.v[j]);
          assert.ok(
            iter.reducedCosts[i][j] !== null &&
              Math.abs(iter.reducedCosts[i][j]! - expectedDelta) <= 1e-6,
            `Iter ${iter.iteration}: Δ_${i}${j} inconsistente`
          );
        }
      }
    }

    // Verificar identidad de pivote: costoDespues = costoAntes + delta * theta
    if (iter.enteringCell) {
      const expectedAfter = iter.totalCostBefore + iter.enteringCell.delta * iter.theta;
      assert.ok(
        Math.abs(iter.totalCostAfter - expectedAfter) <= 1e-6,
        `Iter ${iter.iteration}: costo después (${iter.totalCostAfter}) != ${expectedAfter}`
      );
      assert.ok(iter.cycle.length >= 4 && iter.cycle.length % 2 === 0);
      assert.equal(iter.cycle[0].sign, '+');
    } else {
      assert.equal(iter.totalCostBefore, iter.totalCostAfter);
    }
  }

  const finalIter = optimal.iterations[optimal.iterations.length - 1];
  assert.equal(finalIter.enteringCell, null);
  assert.equal(finalIter.totalCostAfter, optimal.totalCost);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      assert.ok(Math.abs(finalIter.allocationsAfter[i][j] - optimal.allocations[i][j]) <= 1e-6);
    }
  }
});

test('12. Generación de reporte PDF A4 con datos reales, ahorro y matrices de distintos tamaños', () => {
  // 1) Caso base Zeli Distribuciones
  const zeliRes = solveTransportationProblem(ZELI_DEFAULT_CASE);
  const { doc: zeliDoc, summary: zeliSummary, finalCursorY: zeliFinalY } = buildAcademicPdfReport(
    ZELI_DEFAULT_CASE,
    zeliRes,
    new Date('2026-11-20T12:00:00Z')
  );
  const zeliPdfStr = zeliDoc.output();
  assert.ok(zeliPdfStr.startsWith('%PDF-'));
  assert.ok(zeliDoc.getNumberOfPages() >= 2);
  // Evitar última página casi vacía: el cursor final debe superar los 80mm en la última página
  assert.ok(
    zeliFinalY >= 80,
    `La última página del PDF Zeli quedó muy vacía (finalCursorY=${zeliFinalY}mm)`
  );
  assert.equal(zeliSummary.balanceLabel, 'Problema balanceado: oferta total igual a demanda total');
  assert.equal(zeliSummary.modiVerifiedWithoutPivots, true);
  assert.equal(zeliSummary.optimalCost, zeliRes.optimal!.totalCost);
  assert.equal(zeliSummary.leastCostTotal, zeliRes.leastCost!.totalCost);
  assert.equal(zeliSummary.vogelTotal, zeliRes.vogel!.totalCost);
  assert.equal(zeliSummary.savingsVsLeastCost, 0);
  assert.equal(zeliSummary.gapPctVsLeastCost, 0);
  assert.equal(zeliSummary.savingsPctVsLeastCost, 0);
  assert.equal(zeliSummary.leastCostHasDegeneracy, false);
  assert.equal(zeliSummary.vogelHasDegeneracy, false);
  assert.equal(zeliSummary.modiIterationsCount, zeliRes.optimal!.iterations.length);

  // 2) Caso comparativo 3x4 (ahorro real de MODI = 475 - 435 = 40; brecha = 9.20%, ahorro = 8.42%)
  const compProb = ACADEMIC_PRESETS.find((p) => p.id === 'comparative_3x4')!.problem;
  const compRes = solveTransportationProblem(compProb);
  const { doc: compDoc, summary: compSummary } = buildAcademicPdfReport(compProb, compRes);
  assert.ok(compDoc.output().startsWith('%PDF-'));
  assert.equal(compSummary.modiVerifiedWithoutPivots, false);
  assert.equal(compSummary.optimalCost, 435);
  assert.equal(compSummary.savingsVsLeastCost, 40);
  assert.equal(compSummary.savingsVsVogel, 40);
  assert.equal(compSummary.gapPctVsLeastCost.toFixed(2), '9.20');
  assert.equal(compSummary.savingsPctVsLeastCost.toFixed(2), '8.42');
  assert.equal(compSummary.gapPctVsVogel.toFixed(2), '9.20');
  assert.equal(compSummary.savingsPctVsVogel.toFixed(2), '8.42');
  assert.equal(compSummary.leastCostHasDegeneracy, true);
  assert.equal(compSummary.vogelHasDegeneracy, true);

  // 3) Caso desbalanceado con Destino Ficticio (ahorro = 1580 - 1530 = 50)
  const surplusProb = ACADEMIC_PRESETS.find((p) => p.id === 'zeli_surplus')!.problem;
  const surplusRes = solveTransportationProblem(surplusProb);
  const { doc: surplusDoc, summary: surplusSummary } = buildAcademicPdfReport(
    surplusProb,
    surplusRes
  );
  assert.ok(surplusDoc.output().startsWith('%PDF-'));
  assert.equal(surplusSummary.savingsVsLeastCost, 50);
  assert.ok(surplusSummary.balanceLabel.includes('Destino Ficticio'));

  // 4) Matriz ancha 4x9 para validar paginación horizontal sin errores
  const wideProb: TransportationProblem = {
    origins: ['Almacén 1', 'Almacén 2', 'Almacén 3', 'Almacén 4'],
    destinations: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9'],
    supply: [100, 120, 90, 110],
    demand: [40, 50, 45, 55, 60, 40, 45, 50, 35],
    costs: [
      [4, 7, 5, 8, 6, 9, 3, 7, 5],
      [6, 3, 8, 5, 7, 4, 6, 8, 9],
      [5, 8, 4, 6, 9, 5, 7, 4, 6],
      [7, 5, 6, 4, 5, 8, 4, 6, 3],
    ],
  };
  const wideRes = solveTransportationProblem(wideProb);
  const { doc: wideDoc, summary: wideSummary } = buildAcademicPdfReport(wideProb, wideRes);
  assert.ok(wideDoc.output().startsWith('%PDF-'));
  assert.ok(wideDoc.getNumberOfPages() >= 3);
  assert.equal(wideSummary.optimalCost, wideRes.optimal!.totalCost);
});

function verifyPerturbationBoundsWithModi(problem: TransportationProblem, label: string) {
  const res = solveTransportationProblem(problem);
  assert.ok(res.balanced && res.optimal && res.sensitivity);
  const balanced = res.balanced;
  const optimal = res.optimal;
  const cs = res.sensitivity.costSensitivity;

  assert.equal(cs.implemented, true);
  assert.equal(cs.basisIsValidTree, true);

  const initialBfs: MethodResult = {
    methodId: 'optimal',
    methodName: 'Base óptima previa',
    allocations: optimal.allocations.map((r) => [...r]),
    basicMask: optimal.basicMask.map((r) => [...r]),
    totalCost: optimal.totalCost,
    steps: [],
  };

  // Comprobar rangos de todas las rutas básicas con perturbaciones reales en MODI
  for (const b of cs.basicRoutes) {
    assert.equal(b.reliable, true, `${label}: ruta básica (${b.row},${b.col}) debe ser confiable`);

    if (b.maxCost !== null) {
      // En el límite superior inclusivo: la base sigue siendo óptima (1 iteración, sin pivote)
      const atUpper = {
        ...balanced,
        costs: balanced.costs.map((row, ri) =>
          row.map((val, ci) => (ri === b.row && ci === b.col ? b.maxCost! : val))
        ),
      };
      const modiAtUpper = solveModiOptimal(atUpper, initialBfs);
      assert.equal(
        modiAtUpper.iterations.length,
        1,
        `${label} básica (${b.row},${b.col}) en límite superior ${b.maxCost} debe conservar base óptima`
      );
      assert.equal(modiAtUpper.iterations[0].enteringCell, null);

      // Estrictamente por encima del límite superior: la base actual deja de ser óptima (>= 2 iteraciones)
      const aboveUpper = {
        ...balanced,
        costs: balanced.costs.map((row, ri) =>
          row.map((val, ci) => (ri === b.row && ci === b.col ? b.maxCost! + 0.05 : val))
        ),
      };
      const modiAboveUpper = solveModiOptimal(aboveUpper, initialBfs);
      assert.ok(
        modiAboveUpper.iterations.length >= 2,
        `${label} básica (${b.row},${b.col}) por encima de ${b.maxCost} debe perder optimalidad de la base`
      );
    }

    if (b.minCostMath !== null && b.minCostMath >= 0) {
      // En el límite inferior inclusivo: la base sigue siendo óptima
      const atLower = {
        ...balanced,
        costs: balanced.costs.map((row, ri) =>
          row.map((val, ci) => (ri === b.row && ci === b.col ? b.minCostMath! : val))
        ),
      };
      const modiAtLower = solveModiOptimal(atLower, initialBfs);
      assert.equal(
        modiAtLower.iterations.length,
        1,
        `${label} básica (${b.row},${b.col}) en límite inferior ${b.minCostMath} debe conservar base óptima`
      );

      if (b.minCostMath >= 0.05) {
        const belowLower = {
          ...balanced,
          costs: balanced.costs.map((row, ri) =>
            row.map((val, ci) => (ri === b.row && ci === b.col ? b.minCostMath! - 0.05 : val))
          ),
        };
        const modiBelowLower = solveModiOptimal(belowLower, initialBfs);
        assert.ok(
          modiBelowLower.iterations.length >= 2,
          `${label} básica (${b.row},${b.col}) por debajo de ${b.minCostMath} debe perder optimalidad de la base`
        );
      }
    }
  }

  // Comprobar umbrales de todas las rutas no básicas con perturbaciones reales en MODI
  for (const nb of cs.nonBasicRoutes) {
    if (nb.canBecomeCompetitiveWithNonNegativeCost) {
      const atTie = {
        ...balanced,
        costs: balanced.costs.map((row, ri) =>
          row.map((val, ci) =>
            ri === nb.row && ci === nb.col ? nb.minNonNegativeCostToKeepBasis : val
          )
        ),
      };
      const modiAtTie = solveModiOptimal(atTie, initialBfs);
      assert.equal(
        modiAtTie.iterations.length,
        1,
        `${label} no básica (${nb.row},${nb.col}) en umbral ${nb.minNonNegativeCostToKeepBasis} debe conservar base óptima`
      );
      assert.equal(
        modiAtTie.hasAlternativeOptima,
        true,
        `${label} no básica (${nb.row},${nb.col}) en umbral debe generar óptimo alternativo`
      );

      if (nb.minNonNegativeCostToKeepBasis >= 0.05) {
        const belowTie = {
          ...balanced,
          costs: balanced.costs.map((row, ri) =>
            row.map((val, ci) =>
              ri === nb.row && ci === nb.col ? nb.minNonNegativeCostToKeepBasis - 0.05 : val
            )
          ),
        };
        const modiBelowTie = solveModiOptimal(belowTie, initialBfs);
        assert.ok(
          modiBelowTie.iterations.length >= 2,
          `${label} no básica (${nb.row},${nb.col}) debajo del umbral debe romper optimalidad de la base`
        );
      }
    }
  }
}

test('13. Etapa 1 - Sensibilidad de costos en Zeli base (óptimo alternativo), 3x4 (degeneración) y perturbaciones verificadas con MODI', () => {
  // 1) Caso base Zeli Distribuciones: valores exactos analíticos
  const zeliRes = solveTransportationProblem(ZELI_DEFAULT_CASE);
  assert.ok(zeliRes.sensitivity);
  const zeliCs = zeliRes.sensitivity.costSensitivity;

  assert.equal(zeliCs.implemented, true);
  assert.equal(zeliCs.basisIsValidTree, true);
  assert.equal(zeliCs.hasAlternativeOptima, true);
  assert.equal(zeliCs.hasDegeneracy, false);
  assert.equal(zeliCs.basicRoutes.length, 4);
  assert.equal(zeliCs.nonBasicRoutes.length, 2);

  // No básicas: (A, S3) con Δ=7 y (B, S2) con Δ=0 (óptimo alternativo)
  const nbAS3 = zeliCs.nonBasicRoutes.find((r) => r.row === 0 && r.col === 2)!;
  assert.equal(nbAS3.currentCost, 10);
  assert.equal(nbAS3.reducedCost, 7);
  assert.equal(nbAS3.impliedDualSum, 3);
  assert.equal(nbAS3.requiredReduction, 7);
  assert.equal(nbAS3.alreadyAlternativeOptimum, false);
  assert.equal(nbAS3.changesAllocationAtTie, true);

  const nbBS2 = zeliCs.nonBasicRoutes.find((r) => r.row === 1 && r.col === 1)!;
  assert.equal(nbBS2.currentCost, 7);
  assert.equal(nbBS2.reducedCost, 0);
  assert.equal(nbBS2.alreadyAlternativeOptimum, true);
  assert.equal(nbBS2.requiredReduction, 0);
  assert.equal(nbBS2.changesAllocationAtTie, true);
  assert.equal(nbBS2.cycleTheta, 70);

  // Básicas: (A,S1)=[8,15], (A,S2)=(-∞,6], (B,S1)=[2,9], (B,S3)=(-∞,11]
  const bAS1 = zeliCs.basicRoutes.find((r) => r.row === 0 && r.col === 0)!;
  assert.equal(bAS1.minCostMath, 8);
  assert.equal(bAS1.maxCost, 15);
  assert.equal(bAS1.hasTightLowerBound, true);

  const bAS2 = zeliCs.basicRoutes.find((r) => r.row === 0 && r.col === 1)!;
  assert.equal(bAS2.minCostMath, null);
  assert.equal(bAS2.minCostNonNegative, 0);
  assert.equal(bAS2.maxCost, 6);
  assert.equal(bAS2.hasTightUpperBound, true);

  const bBS1 = zeliCs.basicRoutes.find((r) => r.row === 1 && r.col === 0)!;
  assert.equal(bBS1.minCostMath, 2);
  assert.equal(bBS1.maxCost, 9);
  assert.equal(bBS1.hasTightUpperBound, true);

  const bBS3 = zeliCs.basicRoutes.find((r) => r.row === 1 && r.col === 2)!;
  assert.equal(bBS3.minCostMath, null);
  assert.equal(bBS3.minCostNonNegative, 0);
  assert.equal(bBS3.maxCost, 11);

  // 2) Verificación exhaustiva por perturbación real sobre Zeli, 3x4 (degenerado) y Zeli superávit
  verifyPerturbationBoundsWithModi(ZELI_DEFAULT_CASE, 'Zeli Base');
  verifyPerturbationBoundsWithModi(
    ACADEMIC_PRESETS.find((p) => p.id === 'comparative_3x4')!.problem,
    'Comparativo 3x4'
  );
  verifyPerturbationBoundsWithModi(
    ACADEMIC_PRESETS.find((p) => p.id === 'zeli_surplus')!.problem,
    'Zeli Superávit'
  );
});

test('14. Etapa 1 - Casos límite de sensibilidad: degeneración extrema, 1x3 sin no básicas y árbol básico inválido', () => {
  // 1) Caso altamente degenerado 4x4 (de prueba 6)
  const degenerate: TransportationProblem = {
    origins: ['A1', 'A2', 'A3', 'A4'],
    destinations: ['D1', 'D2', 'D3', 'D4'],
    supply: [40, 60, 40, 60],
    demand: [40, 60, 40, 60],
    costs: [
      [10, 2, 8, 12],
      [6, 9, 3, 7],
      [4, 8, 9, 2],
      [5, 3, 6, 9],
    ],
  };
  const degRes = solveTransportationProblem(degenerate);
  assert.ok(degRes.sensitivity);
  assert.equal(degRes.sensitivity.costSensitivity.hasDegeneracy, true);
  assert.equal(degRes.sensitivity.costSensitivity.basisIsValidTree, true);
  assert.ok(
    degRes.sensitivity.costSensitivity.basicRoutes.some((r) => r.isDegenerateBasic)
  );
  verifyPerturbationBoundsWithModi(degenerate, 'Degenerado 4x4');

  // 2) Caso 1x3: todas las celdas son básicas, intervalos abiertos [-∞, +∞)
  const oneByThree: TransportationProblem = {
    origins: ['Central'],
    destinations: ['S1', 'S2', 'S3'],
    supply: [120],
    demand: [30, 50, 40],
    costs: [[4, 7, 2]],
  };
  const r1x3 = solveTransportationProblem(oneByThree);
  assert.ok(r1x3.sensitivity);
  assert.equal(r1x3.sensitivity.costSensitivity.nonBasicRoutes.length, 0);
  assert.equal(r1x3.sensitivity.costSensitivity.basicRoutes.length, 3);
  for (const b of r1x3.sensitivity.costSensitivity.basicRoutes) {
    assert.equal(b.reliable, true);
    assert.equal(b.deltaMin, null);
    assert.equal(b.deltaMax, null);
    assert.equal(b.minCostNonNegative, 0);
    assert.equal(b.maxCost, null);
  }

  // 3) Si una base no forma un árbol generador válido, debe marcar reliable=false explícitamente
  const zeliRes = solveTransportationProblem(ZELI_DEFAULT_CASE);
  const brokenMask = zeliRes.optimal!.basicMask.map((r) => [...r]);
  brokenMask[0][0] = false; // Rompe m+n-1
  const brokenOptimal = { ...zeliRes.optimal!, basicMask: brokenMask };
  const brokenSensitivity = buildCostSensitivityAnalysis(zeliRes.balanced!, brokenOptimal);
  assert.equal(brokenSensitivity.basisIsValidTree, false);
  assert.ok(brokenSensitivity.basicRoutes.every((r) => r.reliable === false && r.unreliableReason !== null));
});

function verifyBalancedRhsPairWithModi(problem: TransportationProblem, label: string) {
  const res = solveTransportationProblem(problem);
  assert.ok(res.balanced && res.optimal && res.sensitivity);
  const balanced = res.balanced;
  const optimal = res.optimal;
  const rhs = res.sensitivity.rhsSensitivity;

  assert.equal(rhs.implemented, true);
  assert.equal(rhs.basisIsValidTree, true);

  for (const pair of rhs.balancedPairs) {
    assert.equal(pair.reliable, true, `${label}: par (${pair.originName}, ${pair.destinationName}) debe ser confiable`);
    assert.ok(pair.deltaMin !== null && pair.deltaMin <= EPSILON);
    assert.ok(pair.marginalCostPerUnit !== null);

    // Verificar identidad marginal: suma alternante de costos en el árbol == u_i + v_j
    const dualSum = optimal.finalU[pair.originIndex] + optimal.finalV[pair.destinationIndex];
    assert.ok(
      Math.abs(pair.marginalCostPerUnit - dualSum) <= 1e-6,
      `${label} (${pair.originName},${pair.destinationName}): marginal ${pair.marginalCostPerUnit} != u+v ${dualSum}`
    );

    const testDeltas: number[] = [];
    if (pair.deltaMin !== null) testDeltas.push(pair.deltaMin);
    if (pair.deltaMax !== null) {
      testDeltas.push(pair.deltaMax);
      testDeltas.push((pair.deltaMin! + pair.deltaMax) / 2);
    } else {
      testDeltas.push(pair.deltaMin! / 2);
      testDeltas.push(25);
    }

    for (const delta of testDeltas) {
      const nextSupply = [...balanced.supply];
      const nextDemand = [...balanced.demand];
      nextSupply[pair.originIndex] += delta;
      nextDemand[pair.destinationIndex] += delta;

      // Conservación del balance oferta-demanda
      const sumS = nextSupply.reduce((a, b) => a + b, 0);
      const sumD = nextDemand.reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(sumS - sumD) <= 1e-6, `${label}: balance roto con δ=${delta}`);
      assert.ok(nextSupply[pair.originIndex] >= -EPSILON);
      assert.ok(nextDemand[pair.destinationIndex] >= -EPSILON);

      // Reconstruir asignaciones en la base actual siguiendo la trayectoria del árbol
      const nextAlloc = optimal.allocations.map((row) => [...row]);
      for (const step of pair.pathSteps) {
        nextAlloc[step.row][step.col] += step.sign === '+' ? delta : -delta;
      }

      // Toda asignación básica debe permanecer >= 0 dentro de [deltaMin, deltaMax]
      for (let r = 0; r < balanced.origins.length; r++) {
        for (let c = 0; c < balanced.destinations.length; c++) {
          assert.ok(
            nextAlloc[r][c] >= -1e-6,
            `${label} (${pair.originName},${pair.destinationName}) δ=${delta}: celda (${r},${c}) negativa (${nextAlloc[r][c]})`
          );
        }
      }

      const perturbedBalanced: BalancedProblem = {
        ...balanced,
        supply: nextSupply,
        demand: nextDemand,
      };
      const expectedCost = optimal.totalCost + delta * pair.marginalCostPerUnit!;
      const bfsOnSameBasis: MethodResult = {
        methodId: 'optimal',
        methodName: 'Base perturbada RHS',
        allocations: nextAlloc,
        basicMask: optimal.basicMask.map((r) => [...r]),
        totalCost: expectedCost,
        steps: [],
      };
      assertSupplyAndDemandExact(perturbedBalanced, bfsOnSameBasis, `${label} RHS δ=${delta}`);

      // MODI debe certificar optimalidad de la misma base en 1 iteración sin pivotes
      const modiCheck = solveModiOptimal(perturbedBalanced, bfsOnSameBasis);
      assert.equal(modiCheck.iterations.length, 1);
      assert.equal(modiCheck.iterations[0].enteringCell, null);
      assert.ok(Math.abs(modiCheck.totalCost - expectedCost) <= 1e-6);
    }

    // Rebasar límite superior o inferior: la base actual se vuelve infactible (< 0 en la trayectoria)
    if (pair.deltaMax !== null) {
      const overDelta = pair.deltaMax + 1;
      const overAlloc = optimal.allocations.map((row) => [...row]);
      for (const step of pair.pathSteps) {
        overAlloc[step.row][step.col] += step.sign === '+' ? overDelta : -overDelta;
      }
      const hasNegativeOnCurrentBasis = pair.pathSteps.some(
        (step) => overAlloc[step.row][step.col] < -1e-6
      );
      assert.equal(
        hasNegativeOnCurrentBasis,
        true,
        `${label} (${pair.originName},${pair.destinationName}): rebasar δ_max=${pair.deltaMax} debe volver infactible la base actual`
      );
    }

    if (pair.deltaMin !== null && pair.currentSupply + pair.deltaMin - 1 >= 0 && pair.currentDemand + pair.deltaMin - 1 >= 0) {
      const underDelta = pair.deltaMin - 1;
      const underAlloc = optimal.allocations.map((row) => [...row]);
      for (const step of pair.pathSteps) {
        underAlloc[step.row][step.col] += step.sign === '+' ? underDelta : -underDelta;
      }
      const hasNegativeOnCurrentBasis = pair.pathSteps.some(
        (step) => underAlloc[step.row][step.col] < -1e-6
      );
      assert.equal(
        hasNegativeOnCurrentBasis,
        true,
        `${label} (${pair.originName},${pair.destinationName}): bajar de δ_min=${pair.deltaMin} debe volver infactible la base actual`
      );
    }
  }
}

test('15. Etapa 2 - Variaciones balanceadas conjuntas: rangos exactos, conservación, costo marginal y comportamiento fuera de límites', () => {
  // 1) Valores analíticos exactos en Zeli base
  const zeliRes = solveTransportationProblem(ZELI_DEFAULT_CASE);
  assert.ok(zeliRes.sensitivity);
  const zeliRhs = zeliRes.sensitivity.rhsSensitivity;
  assert.equal(zeliRhs.balancedPairs.length, 6);

  // Par básico (A, S1): x=10, c=8 => δ ∈ [-10, +∞), marginal $8/u
  const pAS1 = zeliRhs.balancedPairs.find((p) => p.originIndex === 0 && p.destinationIndex === 0)!;
  assert.equal(pAS1.isBasicPair, true);
  assert.equal(pAS1.deltaMin, -10);
  assert.equal(pAS1.deltaMax, null);
  assert.equal(pAS1.minSupply, 90);
  assert.equal(pAS1.minDemand, 70);
  assert.equal(pAS1.marginalCostPerUnit, 8);
  assert.equal(pAS1.optimalCostAtMin, 1490);

  // Par no básico (A, S3): trayectoria +(A->S1) -(B->S1) +(B->S3) => δ ∈ [-10, +70], marginal 8-9+4 = $3/u
  const pAS3 = zeliRhs.balancedPairs.find((p) => p.originIndex === 0 && p.destinationIndex === 2)!;
  assert.equal(pAS3.isBasicPair, false);
  assert.equal(pAS3.deltaMin, -10);
  assert.equal(pAS3.deltaMax, 70);
  assert.equal(pAS3.minSupply, 90);
  assert.equal(pAS3.maxSupply, 170);
  assert.equal(pAS3.minDemand, 70);
  assert.equal(pAS3.maxDemand, 150);
  assert.equal(pAS3.marginalCostPerUnit, 3);
  assert.equal(pAS3.optimalCostAtMin, 1540);
  assert.equal(pAS3.optimalCostAtMax, 1780);

  // Al rebasar +70 a +71 en (A, S3), la reoptimización produce nuevo óptimo 1790 (pendiente cambia de $3 a $10/u)
  const zeliOutOfBounds: TransportationProblem = {
    ...ZELI_DEFAULT_CASE,
    supply: [171, 150],
    demand: [80, 90, 151],
  };
  const outRes = solveTransportationProblem(zeliOutOfBounds);
  assert.equal(outRes.optimal?.totalCost, 1790);

  // 2) Verificación exhaustiva sobre Zeli base, comparativo 3x4, déficit, superávit y degenerado 4x4
  verifyBalancedRhsPairWithModi(ZELI_DEFAULT_CASE, 'Zeli Base');
  verifyBalancedRhsPairWithModi(
    ACADEMIC_PRESETS.find((p) => p.id === 'comparative_3x4')!.problem,
    'Comparativo 3x4'
  );
  verifyBalancedRhsPairWithModi(
    ACADEMIC_PRESETS.find((p) => p.id === 'zeli_surplus')!.problem,
    'Zeli Superávit'
  );
  verifyBalancedRhsPairWithModi(
    ACADEMIC_PRESETS.find((p) => p.id === 'zeli_deficit')!.problem,
    'Zeli Déficit'
  );

  const degenerate4x4: TransportationProblem = {
    origins: ['A1', 'A2', 'A3', 'A4'],
    destinations: ['D1', 'D2', 'D3', 'D4'],
    supply: [40, 60, 40, 60],
    demand: [40, 60, 40, 60],
    costs: [
      [10, 2, 8, 12],
      [6, 9, 3, 7],
      [4, 8, 9, 2],
      [5, 3, 6, 9],
    ],
  };
  const degRes = solveTransportationProblem(degenerate4x4);
  assert.equal(degRes.sensitivity?.rhsSensitivity.hasDegeneracy, true);
  assert.ok(
    degRes.sensitivity?.rhsSensitivity.balancedPairs.some(
      (p) => p.hasTightLowerBound || p.hasTightUpperBound
    )
  );
  verifyBalancedRhsPairWithModi(degenerate4x4, 'Degenerado 4x4');

  // 3) Base inválida marcada explícitamente como no confiable
  const brokenMask = zeliRes.optimal!.basicMask.map((r) => [...r]);
  brokenMask[0][0] = false;
  const brokenRhs = buildRhsSensitivityAnalysis(zeliRes.balanced!, {
    ...zeliRes.optimal!,
    basicMask: brokenMask,
  });
  assert.equal(brokenRhs.basisIsValidTree, false);
  assert.ok(brokenRhs.balancedPairs.every((p) => p.reliable === false && p.unreliableReason !== null));
});

test('16. Etapa 2 - Escenarios desbalanceados individuales: nodos ficticios, comparación de costos y validaciones', () => {
  const zeliRes = solveTransportationProblem(ZELI_DEFAULT_CASE);

  // 1) Aumentar oferta de Almacén A de 100 a 130 (+30) => Destino Ficticio 30 u, nuevo costo = $1540 (-$30)
  const surplusEval = evaluateUnbalancedRhsScenario(ZELI_DEFAULT_CASE, zeliRes, 'supply', 0, 130);
  assert.equal(surplusEval.valid, true);
  assert.equal(surplusEval.balanceStatus, 'dummy_destination');
  assert.equal(surplusEval.dummyAmount, 30);
  assert.equal(surplusEval.originalOptimalCost, 1570);
  assert.equal(surplusEval.newOptimalCost, 1540);
  assert.equal(surplusEval.costDifference, -30);
  assert.equal(surplusEval.realAssignedUnits, 250);
  assert.equal(surplusEval.dummyDestinationUnits, 30);
  assert.equal(surplusEval.dummyOriginUnits, 0);
  assert.equal(surplusEval.dummyAllocations.length, 1);
  assert.equal(surplusEval.dummyAllocations[0].destinationName, 'Destino Ficticio');
  assert.equal(surplusEval.dummyAllocations[0].quantity, 30);
  assert.ok(surplusEval.dummyCostAssumptionNote.includes('$0'));

  // 2) Aumentar demanda de Sucursal 3 de 80 a 120 (+40) => Origen Ficticio 40 u, nuevo costo = $1370 (-$200)
  const deficitEval = evaluateUnbalancedRhsScenario(ZELI_DEFAULT_CASE, zeliRes, 'demand', 2, 120);
  assert.equal(deficitEval.valid, true);
  assert.equal(deficitEval.balanceStatus, 'dummy_origin');
  assert.equal(deficitEval.dummyAmount, 40);
  assert.equal(deficitEval.originalOptimalCost, 1570);
  assert.equal(deficitEval.newOptimalCost, 1370);
  assert.equal(deficitEval.costDifference, -200);
  assert.equal(deficitEval.realAssignedUnits, 250);
  assert.equal(deficitEval.dummyDestinationUnits, 0);
  assert.equal(deficitEval.dummyOriginUnits, 40);
  assert.equal(deficitEval.dummyAllocations[0].originName, 'Origen Ficticio');
  assert.equal(deficitEval.dummyAllocations[0].quantity, 40);

  // 3) Desde zeli_surplus (A=140, B=160; Demanda=250), reducir oferta de A en -50 (a 90) restaura balance exacto
  const surplusProb = ACADEMIC_PRESETS.find((p) => p.id === 'zeli_surplus')!.problem;
  const surplusBaseRes = solveTransportationProblem(surplusProb);
  const rebalancedEval = evaluateUnbalancedRhsScenario(surplusProb, surplusBaseRes, 'supply', 0, 90);
  assert.equal(rebalancedEval.valid, true);
  assert.equal(rebalancedEval.balanceStatus, 'balanced');
  assert.equal(rebalancedEval.dummyAmount, 0);
  assert.equal(rebalancedEval.newOptimalCost, 1580);
  assert.equal(rebalancedEval.dummyAllocations.length, 0);

  // 4) Entrada negativa inválida no debe lanzar excepción ni inventar resultados
  const invalidEval = evaluateUnbalancedRhsScenario(ZELI_DEFAULT_CASE, zeliRes, 'supply', 0, -10);
  assert.equal(invalidEval.valid, false);
  assert.equal(invalidEval.newOptimalCost, null);
});

function verifyTransfersWithModi(problem: TransportationProblem, label: string) {
  const res = solveTransportationProblem(problem);
  assert.ok(res.balanced && res.optimal && res.sensitivity);
  const balanced = res.balanced;
  const optimal = res.optimal;
  const dualSp = res.sensitivity.dualShadowPrices;

  assert.equal(dualSp.implemented, true);
  assert.equal(dualSp.basisIsValidTree, true);
  assert.equal(dualSp.dualFeasibilityVerified, true);

  // 1) Ecuaciones duales u_i + v_j = c_ij en todas las celdas básicas
  for (const eq of dualSp.basicEquations) {
    assert.ok(
      Math.abs(eq.uValue + eq.vValue - eq.unitCost) <= 1e-6,
      `${label}: ecuación dual falló en (${eq.row},${eq.col})`
    );
  }

  // 2) Factibilidad dual global: c_ij - (u_i + v_j) >= 0 para toda celda
  for (let i = 0; i < balanced.origins.length; i++) {
    for (let j = 0; j < balanced.destinations.length; j++) {
      const rc = balanced.costs[i][j] - (optimal.finalU[i] + optimal.finalV[j]);
      assert.ok(rc >= -1e-6, `${label}: costo reducido negativo en (${i},${j}): ${rc}`);
    }
  }

  // 3) Comprobar todos los ejemplos numéricos con MODI
  for (const ex of dualSp.workedExamples) {
    assert.equal(
      ex.verifiedWithModi,
      true,
      `${label}: ejemplo ${ex.id} no coincidió con MODI (${ex.expectedNewCost} vs ${ex.verifiedModiCost})`
    );
  }

  // 4) Comprobar transferencias balanceadas de oferta y demanda dentro de [deltaMin, deltaMax]
  const allTransfers = [...dualSp.supplyTransfers, ...dualSp.demandTransfers];
  for (const tr of allTransfers) {
    const testDeltas = [tr.deltaMin, tr.deltaMax, (tr.deltaMin + tr.deltaMax) / 2];
    for (const delta of testDeltas) {
      const nextSupply = [...balanced.supply];
      const nextDemand = [...balanced.demand];
      if (tr.kind === 'supply_transfer') {
        nextSupply[tr.toIndex] += delta;
        nextSupply[tr.fromIndex] -= delta;
      } else {
        nextDemand[tr.toIndex] += delta;
        nextDemand[tr.fromIndex] -= delta;
      }

      const nextAlloc = optimal.allocations.map((row) => [...row]);
      for (const step of tr.pathSteps) {
        nextAlloc[step.row][step.col] += step.sign === '+' ? delta : -delta;
      }

      const expectedCost = optimal.totalCost + tr.marginalCostPerUnit * delta;
      const perturbedBalanced: BalancedProblem = {
        ...balanced,
        supply: nextSupply,
        demand: nextDemand,
      };
      const bfs: MethodResult = {
        methodId: 'optimal',
        methodName: 'Transferencia dual',
        allocations: nextAlloc,
        basicMask: optimal.basicMask.map((r) => [...r]),
        totalCost: expectedCost,
        steps: [],
      };
      assertSupplyAndDemandExact(perturbedBalanced, bfs, `${label} ${tr.kind} δ=${delta}`);

      const modiCheck = solveModiOptimal(perturbedBalanced, bfs);
      assert.equal(modiCheck.iterations.length, 1);
      assert.equal(modiCheck.iterations[0].enteringCell, null);
      assert.ok(Math.abs(modiCheck.totalCost - expectedCost) <= 1e-6);
    }
  }
}

test('17. Etapa 3 - Ecuaciones duales, factibilidad, invariancia ante normalización y ejemplos comprobados con MODI', () => {
  const zeliRes = solveTransportationProblem(ZELI_DEFAULT_CASE);
  assert.ok(zeliRes.optimal && zeliRes.sensitivity);
  const dualSp = zeliRes.sensitivity.dualShadowPrices;

  assert.equal(dualSp.basicEquations.length, 4);
  assert.equal(dualSp.dualFeasibilityVerified, true);
  assert.equal(dualSp.workedExamples.length, 3);
  assert.ok(dualSp.workedExamples.every((ex) => ex.verifiedWithModi));

  // Potenciales reales de Zeli base: u=[0,1], v=[8,6,3]
  assert.deepEqual(zeliRes.optimal.finalU, [0, 1]);
  assert.deepEqual(zeliRes.optimal.finalV, [8, 6, 3]);

  // Invariancia ante cambio de normalización: u'_i = u_i + k, v'_j = v_j - k
  for (const shift of [100, -37.5]) {
    const shiftedU: number[] = zeliRes.optimal!.finalU.map((val) => val + shift);
    const shiftedV: number[] = zeliRes.optimal!.finalV.map((val) => val - shift);

    for (let i = 0; i < shiftedU.length; i++) {
      for (let j = 0; j < shiftedV.length; j++) {
        assert.equal(
          shiftedU[i] + shiftedV[j],
          zeliRes.optimal.finalU[i] + zeliRes.optimal.finalV[j]
        );
      }
    }
    assert.equal(
      shiftedU[1] - shiftedU[0],
      zeliRes.optimal.finalU[1] - zeliRes.optimal.finalU[0]
    );
    assert.equal(
      shiftedV[2] - shiftedV[0],
      zeliRes.optimal.finalV[2] - zeliRes.optimal.finalV[0]
    );
  }

  // Verificar transferencia exacta en Zeli base: u_B - u_A = 1 => -1/u al pasar de B a A
  assert.equal(dualSp.supplyTransfers.length, 1);
  assert.equal(dualSp.supplyTransfers[0].marginalCostPerUnit, 1);
  assert.equal(dualSp.supplyTransfers[0].deltaMin, -70);
  assert.equal(dualSp.supplyTransfers[0].deltaMax, 10);

  // Verificar todos los presets
  verifyTransfersWithModi(ZELI_DEFAULT_CASE, 'Zeli Base');
  verifyTransfersWithModi(
    ACADEMIC_PRESETS.find((p) => p.id === 'comparative_3x4')!.problem,
    'Comparativo 3x4'
  );
  verifyTransfersWithModi(
    ACADEMIC_PRESETS.find((p) => p.id === 'zeli_surplus')!.problem,
    'Zeli Superávit'
  );
  verifyTransfersWithModi(
    ACADEMIC_PRESETS.find((p) => p.id === 'zeli_deficit')!.problem,
    'Zeli Déficit'
  );
});

test('18. Etapa 3 - Degeneración, óptimos alternativos, límites de factibilidad y advertencia contra cambios desbalanceados', () => {
  // 1) Degeneración extrema 4x4: límites ajustados en δ=0 y tasas marginales consistentes con MODI
  const degenerate4x4: TransportationProblem = {
    origins: ['A1', 'A2', 'A3', 'A4'],
    destinations: ['D1', 'D2', 'D3', 'D4'],
    supply: [40, 60, 40, 60],
    demand: [40, 60, 40, 60],
    costs: [
      [10, 2, 8, 12],
      [6, 9, 3, 7],
      [4, 8, 9, 2],
      [5, 3, 6, 9],
    ],
  };
  verifyTransfersWithModi(degenerate4x4, 'Degenerado 4x4');
  const degRes = solveTransportationProblem(degenerate4x4);
  const degDual = degRes.sensitivity!.dualShadowPrices;
  assert.ok(
    degDual.supplyTransfers.some((t) => t.hasTightBound) ||
      degDual.demandTransfers.some((t) => t.hasTightBound)
  );
  assert.ok(degDual.limitationsNote.some((n) => n.toLowerCase().includes('degeneración')));

  // 2) Óptimos alternativos (Zeli Base): el análisis dual incluye advertencia explícita y conserva validez
  const zeliRes = solveTransportationProblem(ZELI_DEFAULT_CASE);
  const zeliDual = zeliRes.sensitivity!.dualShadowPrices;
  assert.ok(zeliDual.limitationsNote.some((n) => n.toLowerCase().includes('óptimos alternativos')));

  // 3) Al rebasar el límite de transferencia en Zeli (pasar +71 de B a A, fuera de [-70, +10]), cambia la base y pendiente
  const overTransferProblem: TransportationProblem = {
    ...ZELI_DEFAULT_CASE,
    supply: [171, 79],
  };
  const overRes = solveTransportationProblem(overTransferProblem);
  // Con A=171, B=79: B->S3=79*4=316, A->S3=1*10=10, A->S2=90*6=540, A->S1=80*8=640 => 1506 (vs extrapolación lineal 1570 - 71 = 1499)
  assert.equal(overRes.optimal?.totalCost, 1506);
  assert.notEqual(overRes.optimal?.totalCost, 1570 - 71);

  // 4) Advertencia explícita contra interpretación de u_i o v_j aislados en cambios desbalanceados
  assert.ok(zeliDual.isolatedChangeWarning.includes('NO mide'));
  const isolatedEval = evaluateUnbalancedRhsScenario(ZELI_DEFAULT_CASE, zeliRes, 'supply', 0, 130);
  // u_A = 0 predijera ΔZ = 0 si se interpretara erróneamente, pero la reoptimización real da ΔZ = -$30
  assert.equal(zeliRes.optimal!.finalU[0], 0);
  assert.equal(isolatedEval.costDifference, -30);
});

test('19. Etapa 4 - Comparador de escenarios: independencia, cambios individuales/combinados, rutas y restauración', () => {
  const original = cloneTransportationProblem(ZELI_DEFAULT_CASE);
  const origSolved = solveTransportationProblem(original);
  const originalBeforeJson = JSON.stringify(original);

  // 1) Cambio individual dentro del rango admisible de costo: (A -> S1) de 8 a 10 dentro de [8, 15]
  const altSingleCost = cloneTransportationProblem(original);
  altSingleCost.costs[0][0] = 10;

  const singleComp = compareTransportationScenarios(original, altSingleCost, origSolved);
  assert.equal(singleComp.valid, true);
  assert.equal(singleComp.hasInputChanges, true);
  assert.equal(singleComp.inputChanges.length, 1);
  assert.equal(singleComp.inputChanges[0].kind, 'cost');
  assert.equal(singleComp.originalOptimalCost, 1570);
  assert.equal(singleComp.alternativeOptimalCost, 1590);
  assert.equal(singleComp.costDifference, 20);
  assert.ok(Math.abs((singleComp.costDifferencePct ?? 0) - (20 / 1570) * 100) < 0.02);
  assert.ok(singleComp.costFormulaText.includes('1,570'));
  assert.equal(singleComp.addedRoutesCount, 0);
  assert.equal(singleComp.removedRoutesCount, 0);
  assert.equal(singleComp.changedQuantityRoutesCount, 0);
  assert.equal(singleComp.unchangedRoutesCount, 4);
  assert.ok(
    singleComp.structuralAlerts.some((a) => a.includes('Estabilidad física del plan'))
  );

  // Independencia: el escenario original no sufrió ninguna mutación
  assert.equal(JSON.stringify(original), originalBeforeJson);
  assert.equal(solveTransportationProblem(original).optimal?.totalCost, 1570);

  // 2) Cambio combinado (tarifa A->S3 baja de 10 a 2, oferta A sube a 120 y demanda S3 sube a 100)
  const altCombined = cloneTransportationProblem(original);
  altCombined.costs[0][2] = 2;
  altCombined.supply[0] = 120;
  altCombined.demand[2] = 100;

  const combinedComp = compareTransportationScenarios(original, altCombined, origSolved);
  const expectedCombinedSolved = solveTransportationProblem(altCombined);
  assert.equal(combinedComp.valid, true);
  assert.equal(combinedComp.inputChanges.length, 3);
  assert.equal(
    combinedComp.alternativeOptimalCost,
    expectedCombinedSolved.optimal?.totalCost
  );
  assert.ok(combinedComp.addedRoutesCount >= 1);
  assert.ok(
    combinedComp.routeDiffs.some(
      (r) =>
        r.originName === 'Almacén A' &&
        r.destinationName === 'Sucursal 3' &&
        r.status === 'added' &&
        r.alternativeQuantity > 0
    )
  );
  assert.ok(
    combinedComp.routeDiffs.some((r) => r.status === 'removed' || r.status === 'decreased')
  );
  assert.ok(combinedComp.dynamicExplanation.costSummary.length > 0);
  assert.ok(combinedComp.dynamicExplanation.routeSummary.includes('Rutas agregadas:'));
  assert.ok(combinedComp.dynamicExplanation.validityPrincipleNote.includes('Δ_ij ≥ 0'));

  // 3) Restauración al escenario original
  const restored = cloneTransportationProblem(original);
  const restoredComp = compareTransportationScenarios(original, restored, origSolved);
  assert.equal(restoredComp.valid, true);
  assert.equal(restoredComp.hasInputChanges, false);
  assert.equal(restoredComp.inputChanges.length, 0);
  assert.equal(restoredComp.costDifference, 0);
  assert.equal(restoredComp.costDifferencePct, 0);
  assert.equal(restoredComp.addedRoutesCount, 0);
  assert.equal(restoredComp.removedRoutesCount, 0);
  assert.equal(restoredComp.changedQuantityRoutesCount, 0);
});

test('20. Etapa 4 - Comparador de escenarios: nodos ficticios, degeneración, óptimos alternativos y validación', () => {
  const original = cloneTransportationProblem(ZELI_DEFAULT_CASE);
  const origSolved = solveTransportationProblem(original);

  // 1) Escenario alternativo con exceso de oferta (Destino Ficticio de 40 u)
  const altSurplus = cloneTransportationProblem(original);
  altSurplus.supply[0] = 140; // +40 u
  const surplusComp = compareTransportationScenarios(original, altSurplus, origSolved);
  assert.equal(surplusComp.valid, true);
  assert.equal(surplusComp.originalBalanceStatus, 'balanced');
  assert.equal(surplusComp.alternativeBalanceStatus, 'dummy_destination');
  assert.equal(surplusComp.originalDummyAmount, 0);
  assert.equal(surplusComp.alternativeDummyAmount, 40);
  assert.equal(surplusComp.originalRealShippedUnits, 250);
  assert.equal(surplusComp.alternativeRealShippedUnits, 250);
  assert.ok(surplusComp.dummyRouteDiffs.some((d) => d.destinationName === 'Destino Ficticio' && d.alternativeQuantity === 40));
  assert.ok(surplusComp.structuralAlerts.some((a) => a.includes('Cambio de régimen de balanceo')));
  assert.ok(surplusComp.dynamicExplanation.dummyLimitationNote !== null);

  // 2) Escenario alternativo con exceso de demanda (Origen Ficticio de 40 u)
  const altDeficit = cloneTransportationProblem(original);
  altDeficit.demand[2] = 120; // +40 u
  const deficitComp = compareTransportationScenarios(original, altDeficit, origSolved);
  assert.equal(deficitComp.valid, true);
  assert.equal(deficitComp.alternativeBalanceStatus, 'dummy_origin');
  assert.equal(deficitComp.alternativeDummyAmount, 40);
  assert.equal(deficitComp.alternativeOptimalCost, 1370);
  assert.equal(deficitComp.costDifference, -200);
  assert.ok(deficitComp.dummyRouteDiffs.some((d) => d.originName === 'Origen Ficticio' && d.alternativeQuantity === 40));
  assert.ok(deficitComp.dynamicExplanation.dummyLimitationNote?.includes('$0'));

  // 3) Óptimos alternativos en Zeli base (Δ_ij = 0)
  assert.equal(surplusComp.originalHasAlternativeOptima, true);
  assert.ok(
    surplusComp.structuralAlerts.some((a) => a.includes('Óptimos alternativos presentes'))
  );

  // 4) Caso altamente degenerado 4x4: detección explícita de degeneración básica
  const degenerate4x4: TransportationProblem = {
    origins: ['A1', 'A2', 'A3', 'A4'],
    destinations: ['D1', 'D2', 'D3', 'D4'],
    supply: [40, 60, 40, 60],
    demand: [40, 60, 40, 60],
    costs: [
      [10, 2, 8, 12],
      [6, 9, 3, 7],
      [4, 8, 9, 2],
      [5, 3, 6, 9],
    ],
  };
  const degAlt = cloneTransportationProblem(degenerate4x4);
  degAlt.costs[0][1] = 3;
  const degComp = compareTransportationScenarios(degenerate4x4, degAlt);
  assert.equal(degComp.valid, true);
  assert.equal(degComp.originalHasDegeneracy, true);
  assert.ok(degComp.structuralAlerts.some((a) => a.includes('Degeneración básica detectada')));

  // 5) Validación robusta ante datos negativos o dimensiones inconsistentes
  const invalidNegative = cloneTransportationProblem(original);
  invalidNegative.costs[0][0] = -5;
  const negComp = compareTransportationScenarios(original, invalidNegative, origSolved);
  assert.equal(negComp.valid, false);
  assert.ok(negComp.errors.length > 0);
  assert.equal(negComp.alternativeOptimalCost, null);

  const mismatchedDims = cloneTransportationProblem(original);
  mismatchedDims.destinations.push('Extra');
  mismatchedDims.demand.push(10);
  mismatchedDims.costs = mismatchedDims.costs.map((r) => [...r, 5]);
  const dimComp = compareTransportationScenarios(original, mismatchedDims, origSolved);
  assert.equal(dimComp.valid, false);
  assert.ok(dimComp.errors.some((e) => e.includes('dimensiones')));
});

test('21. Etapa 5 - Diagnóstico, recomendaciones fundamentadas, rutas alternativas y actualización dinámica', () => {
  // 1) Caso base Zeli Distribuciones: Z* = $1,570, 250 u reales, 4 rutas activas, 2 inactivas, óptimo alternativo (B -> S2)
  const zeliRes = solveTransportationProblem(ZELI_DEFAULT_CASE);
  assert.ok(zeliRes.sensitivity);
  const mgmtZeli = zeliRes.sensitivity.managerialAnalysis;

  assert.equal(mgmtZeli.implemented, true);
  assert.equal(mgmtZeli.diagnosis.totalOptimalCost, 1570);
  assert.equal(mgmtZeli.diagnosis.realDistributedUnits, 250);
  assert.equal(mgmtZeli.diagnosis.balanceStatus, 'balanced');
  assert.equal(mgmtZeli.diagnosis.dummyAmount, 0);
  assert.equal(mgmtZeli.diagnosis.dummyLimitationWarning, null);
  assert.equal(mgmtZeli.diagnosis.activeRoutes.length, 4);
  assert.equal(mgmtZeli.diagnosis.unusedRoutes.length, 2);
  assert.equal(mgmtZeli.diagnosis.hasAlternativeOptima, true);
  assert.ok(mgmtZeli.diagnosis.alternativeOptimaSummary.includes('Almacén B → Sucursal 2'));
  assert.ok(mgmtZeli.diagnosis.alternativeOptimaSummary.includes('70'));

  // Ninguna ruta no utilizada se clasifica como innecesaria permanentemente
  for (const ur of mgmtZeli.diagnosis.unusedRoutes) {
    assert.ok(!ur.conditionalNote.toLowerCase().includes('innecesaria permanentemente'));
  }

  // 6 categorías de recomendaciones con respaldo matemático explícito
  assert.equal(mgmtZeli.recommendations.length, 6);
  for (const rec of mgmtZeli.recommendations) {
    assert.ok(rec.mathematicalBasis.trim().length > 0);
    assert.ok(rec.recommendation.trim().length > 0);
  }
  const altRec = mgmtZeli.recommendations.find((r) => r.category === 'alternative_routes')!;
  assert.ok(altRec.recommendation.includes('Almacén B → Sucursal 2'));
  assert.ok(altRec.recommendation.includes('70'));

  // Interpretación económica completa (5 conceptos con evidencia real)
  assert.equal(mgmtZeli.economicInterpretation.length, 5);
  assert.ok(mgmtZeli.economicInterpretation.every((e) => e.currentModelEvidence.trim().length > 0));

  // 2) Actualización dinámica al cambiar a otro escenario (Comparativo 3x4 Taha: Z*=$435, solución única)
  const tahaProblem = ACADEMIC_PRESETS.find((p) => p.id === 'comparative_3x4')!.problem;
  const tahaRes = solveTransportationProblem(tahaProblem);
  const mgmtTaha = tahaRes.sensitivity!.managerialAnalysis;

  assert.equal(mgmtTaha.diagnosis.totalOptimalCost, 435);
  assert.equal(mgmtTaha.diagnosis.hasAlternativeOptima, false);
  const tahaAltRec = mgmtTaha.recommendations.find((r) => r.category === 'alternative_routes')!;
  assert.ok(tahaAltRec.recommendation.includes('No existen rutas alternativas reales'));
  assert.notEqual(
    mgmtTaha.recommendations.find((r) => r.category === 'distribution')!.recommendation,
    mgmtZeli.recommendations.find((r) => r.category === 'distribution')!.recommendation
  );
});

test('22. Etapa 5 - Superávit/déficit, prohibición de ahorro ficticio, degeneración y escenarios inválidos', () => {
  // 1) Superávit (zeli_surplus: oferta 300, demanda 250, excedente 50 u)
  const surplusProb = ACADEMIC_PRESETS.find((p) => p.id === 'zeli_surplus')!.problem;
  const surplusRes = solveTransportationProblem(surplusProb);
  const mgmtSurplus = surplusRes.sensitivity!.managerialAnalysis;
  assert.equal(mgmtSurplus.diagnosis.balanceStatus, 'dummy_destination');
  assert.equal(mgmtSurplus.diagnosis.dummyAmount, 50);
  assert.equal(mgmtSurplus.diagnosis.realDistributedUnits, 250);
  assert.ok(mgmtSurplus.diagnosis.dummyLimitationWarning?.includes('Destino Ficticio'));
  const surplusRisk = mgmtSurplus.recommendations.find((r) => r.category === 'inventory_risks')!;
  assert.ok(surplusRisk.recommendation.includes('capacidad excedente'));
  assert.ok(surplusRisk.cautionNote?.includes('$0/u'));

  // 2) Déficit (zeli_deficit: oferta 220, demanda 270, faltante 50 u)
  const deficitProb = ACADEMIC_PRESETS.find((p) => p.id === 'zeli_deficit')!.problem;
  const deficitRes = solveTransportationProblem(deficitProb);
  const mgmtDeficit = deficitRes.sensitivity!.managerialAnalysis;
  assert.equal(mgmtDeficit.diagnosis.balanceStatus, 'dummy_origin');
  assert.equal(mgmtDeficit.diagnosis.dummyAmount, 50);
  assert.equal(mgmtDeficit.diagnosis.realDistributedUnits, 220);
  assert.ok(mgmtDeficit.diagnosis.dummyLimitationWarning?.includes('Origen Ficticio'));
  const deficitRisk = mgmtDeficit.recommendations.find((r) => r.category === 'inventory_risks')!;
  assert.ok(deficitRisk.recommendation.includes('insuficiencia de inventario'));
  assert.ok(deficitRisk.cautionNote?.includes('NO significa costo cero real'));

  // 3) Ausencia de recomendaciones de ahorro ficticio al comparar contra escenario con déficit o superávit
  const orig = cloneTransportationProblem(ZELI_DEFAULT_CASE);
  const origRes = solveTransportationProblem(orig);

  const altDeficit = cloneTransportationProblem(orig);
  altDeficit.demand[2] = 120; // Z* baja de $1,570 a $1,370, pero con Origen Ficticio 40 u
  const compDeficit = compareTransportationScenarios(orig, altDeficit, origRes);
  const mgmtCompDeficit = buildManagerialDecisionAnalysis(
    origRes.balanced!,
    origRes.optimal!,
    origRes.sensitivity!.costSensitivity,
    origRes.sensitivity!.rhsSensitivity,
    origRes.sensitivity!.dualShadowPrices,
    compDeficit
  );
  assert.equal(mgmtCompDeficit.scenarioComparisonAnalysis.valid, true);
  assert.equal(mgmtCompDeficit.scenarioComparisonAnalysis.isTrueEfficiencyComparison, false);
  assert.ok(
    mgmtCompDeficit.scenarioComparisonAnalysis.comparabilityWarning?.includes(
      'NO son directamente comparables'
    )
  );
  assert.ok(
    mgmtCompDeficit.scenarioComparisonAnalysis.selectionCriteria.some((c) =>
      c.includes('No seleccionar un escenario únicamente por mostrar menor Z*')
    )
  );
  assert.ok(
    !mgmtCompDeficit.scenarioComparisonAnalysis.selectionCriteria.some((c) =>
      c.includes('ahorro logístico genuino')
    )
  );

  // Comparación balanceada con mismo volumen entregado y tarifa menor -> ahorro genuino válido
  const altCheaperTariff = cloneTransportationProblem(orig);
  altCheaperTariff.costs[1][0] = 5; // B -> S1 baja de 9 a 5
  const compGenuine = compareTransportationScenarios(orig, altCheaperTariff, origRes);
  const summaryGenuine = buildManagerialScenarioSummary(compGenuine);
  assert.equal(summaryGenuine.valid, true);
  assert.equal(summaryGenuine.isTrueEfficiencyComparison, true);
  assert.equal(summaryGenuine.comparabilityWarning, null);
  assert.ok(summaryGenuine.selectionCriteria.some((c) => c.includes('ahorro logístico genuino')));

  // 4) Manejo de problema altamente degenerado 4x4
  const degenerate4x4: TransportationProblem = {
    origins: ['A1', 'A2', 'A3', 'A4'],
    destinations: ['D1', 'D2', 'D3', 'D4'],
    supply: [40, 60, 40, 60],
    demand: [40, 60, 40, 60],
    costs: [
      [10, 2, 8, 12],
      [6, 9, 3, 7],
      [4, 8, 9, 2],
      [5, 3, 6, 9],
    ],
  };
  const degRes = solveTransportationProblem(degenerate4x4);
  const mgmtDeg = degRes.sensitivity!.managerialAnalysis;
  assert.ok(mgmtDeg.diagnosis.degenerateBasicRoutesCount >= 1);
  assert.ok(mgmtDeg.diagnosis.degeneracyWarning?.includes('Solución degenerada detectada'));
  assert.ok(
    mgmtDeg.recommendations
      .find((r) => r.category === 'capacity_adjustments')!
      .cautionNote?.includes('δ = 0')
  );

  // 5) Manejo de escenario alternativo inválido en Etapa 4 -> Etapa 5 bloquea conclusiones
  const altInvalid = cloneTransportationProblem(orig);
  altInvalid.costs[0][0] = -15;
  const compInvalid = compareTransportationScenarios(orig, altInvalid, origRes);
  const summaryInvalid = buildManagerialScenarioSummary(compInvalid);
  assert.equal(summaryInvalid.valid, false);
  assert.equal(summaryInvalid.isTrueEfficiencyComparison, false);
  assert.ok(summaryInvalid.errorMessage !== null);
  assert.ok(summaryInvalid.comparabilityWarning?.includes('Escenario inválido'));
});

function extractJsPdfRawText(doc: ReturnType<typeof buildAcademicPdfReport>['doc']): string {
  const internalPages = (doc as unknown as { internal: { pages: (string[] | null)[] } }).internal
    .pages;
  const chunks: string[] = [];
  for (let p = 1; p < internalPages.length; p++) {
    const lines = internalPages[p];
    if (!lines) continue;
    for (const cmd of lines) {
      const matches = cmd.match(/\((?:\\.|[^\\()])*\)/g);
      if (matches) {
        for (const m of matches) {
          chunks.push(
            m
              .slice(1, -1)
              .replace(/\\([()\\])/g, '$1')
          );
        }
      }
    }
  }
  return chunks.join(' ');
}

function assertAllPdfPagesPopulated(
  doc: ReturnType<typeof buildAcademicPdfReport>['doc'],
  label: string
) {
  const internalPages = (doc as unknown as { internal: { pages: (string[] | null)[] } }).internal
    .pages;
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    const cmds = internalPages[p] ?? [];
    assert.ok(
      cmds.length > 15,
      `${label}: página ${p} de ${total} parece vacía (solo ${cmds.length} comandos)`
    );
  }
}

test('23. Etapa 6 - PDF A4: conservación previa, nuevas secciones (A-C, E), comparación opcional y coincidencia con MODI', () => {
  const zeliRes = solveTransportationProblem(ZELI_DEFAULT_CASE);

  // 1) Sin comparación alternativa: conserva Secciones 1-7 + agrega 8, 9, 10 y 11 (Gerencial) SIN inventar comparación
  const { doc: baseDoc, summary: baseSummary, finalCursorY: baseFinalY } = buildAcademicPdfReport(
    ZELI_DEFAULT_CASE,
    zeliRes,
    new Date('2026-11-21T12:00:00Z')
  );
  assert.ok(baseDoc.output().startsWith('%PDF-'));
  assert.ok(baseFinalY >= 80, `Última página Zeli demasiado vacía (${baseFinalY}mm)`);
  assertAllPdfPagesPopulated(baseDoc, 'Zeli Base sin comparación');

  assert.equal(baseSummary.includedCostSensitivity, true);
  assert.equal(baseSummary.includedRhsSensitivity, true);
  assert.equal(baseSummary.includedShadowPrices, true);
  assert.equal(baseSummary.includedScenarioComparison, false);
  assert.equal(baseSummary.includedManagerialAnalysis, true);
  assert.equal(baseSummary.scenarioComparisonComparable, null);
  assert.equal(baseSummary.realDistributedUnits, 250);

  const baseText = extractJsPdfRawText(baseDoc);
  // Contenido previo preservado
  assert.ok(baseText.includes('1. Descripción del problema de transporte'));
  assert.ok(baseText.includes('6.1 Método de Costo Mínimo'));
  assert.ok(baseText.includes('6.3 Método MODI'));
  assert.ok(baseText.includes('7. Interpretación de resultados y conclusión'));
  assert.ok(baseText.includes('$1,570 MXN'));
  // Nuevas secciones Etapas 1-3 y 5
  assert.ok(baseText.includes('8. Análisis de sensibilidad de costos unitarios (Etapa 1)'));
  assert.ok(baseText.includes('9. Sensibilidad de oferta y demanda (Etapa 2)'));
  assert.ok(baseText.includes('10. Interpretación económica de precios sombra'));
  assert.ok(baseText.includes('11. Interpretación gerencial y recomendaciones (Etapa 5)'));
  assert.ok(baseText.includes('Almacén B -> Sucursal 2'));
  assert.ok(baseText.includes('theta = 70'));
  assert.ok(baseText.includes('Coincide con MODI'));
  // No debe inventar sección de comparación de escenarios
  assert.ok(!baseText.includes('Comparación de escenarios: original vs. alternativo'));

  // 2) Con comparación válida balanceada (tarifa B -> S1 baja de $9 a $5)
  const altCheaper = cloneTransportationProblem(ZELI_DEFAULT_CASE);
  altCheaper.costs[1][0] = 5;
  const compValid = compareTransportationScenarios(ZELI_DEFAULT_CASE, altCheaper, zeliRes);
  const { doc: compDoc, summary: compSummary } = buildAcademicPdfReport(
    ZELI_DEFAULT_CASE,
    zeliRes,
    new Date('2026-11-21T12:00:00Z'),
    { scenarioComparison: compValid }
  );
  assert.ok(compDoc.output().startsWith('%PDF-'));
  assertAllPdfPagesPopulated(compDoc, 'Zeli con comparación balanceada');
  assert.equal(compSummary.includedScenarioComparison, true);
  assert.equal(compSummary.scenarioComparisonComparable, true);

  const compText = extractJsPdfRawText(compDoc);
  assert.ok(compText.includes('11. Comparación de escenarios: original vs. alternativo (Etapa 4)'));
  assert.ok(compText.includes('12. Interpretación gerencial y recomendaciones (Etapa 5)'));
  assert.ok(compText.includes(`$${compValid.alternativeOptimalCost!.toLocaleString('es-MX')} MXN`));

  // 3) Con comparación inválida o sin cambios: NO incluye sección de comparación ni inventa datos
  const altInvalid = cloneTransportationProblem(ZELI_DEFAULT_CASE);
  altInvalid.costs[0][0] = -10;
  const compInvalid = compareTransportationScenarios(ZELI_DEFAULT_CASE, altInvalid, zeliRes);
  const { summary: invalidPdfSummary } = buildAcademicPdfReport(
    ZELI_DEFAULT_CASE,
    zeliRes,
    new Date('2026-11-21T12:00:00Z'),
    { scenarioComparison: compInvalid }
  );
  assert.equal(invalidPdfSummary.includedScenarioComparison, false);
  assert.equal(invalidPdfSummary.scenarioComparisonComparable, null);
});

test('24. Etapa 6 - PDF A4: desbalanceado con advertencias de comparabilidad y matrices grandes', () => {
  // 1) Escenario desbalanceado (déficit) y comparación con cambio en unidades atendidas
  const deficitProb = ACADEMIC_PRESETS.find((p) => p.id === 'zeli_deficit')!.problem;
  const deficitRes = solveTransportationProblem(deficitProb);
  const { doc: defDoc, summary: defSummary } = buildAcademicPdfReport(deficitProb, deficitRes);
  assert.ok(defDoc.output().startsWith('%PDF-'));
  assertAllPdfPagesPopulated(defDoc, 'Zeli Déficit');
  assert.equal(defSummary.realDistributedUnits, 220);
  const defText = extractJsPdfRawText(defDoc);
  assert.ok(defText.includes('Origen Ficticio'));
  assert.ok(defText.includes('$0 MXN/u'));

  // Comparación de Zeli Base contra escenario con déficit (demanda S3 sube de 80 a 120)
  const baseRes = solveTransportationProblem(ZELI_DEFAULT_CASE);
  const altDeficit = cloneTransportationProblem(ZELI_DEFAULT_CASE);
  altDeficit.demand[2] = 120;
  const compWithDeficit = compareTransportationScenarios(ZELI_DEFAULT_CASE, altDeficit, baseRes);
  const { doc: warnDoc, summary: warnSummary } = buildAcademicPdfReport(
    ZELI_DEFAULT_CASE,
    baseRes,
    new Date('2026-11-21T12:00:00Z'),
    { scenarioComparison: compWithDeficit }
  );
  assert.equal(warnSummary.includedScenarioComparison, true);
  assert.equal(warnSummary.scenarioComparisonComparable, false);
  const warnText = extractJsPdfRawText(warnDoc);
  assert.ok(warnText.includes('NO son directamente comparables'));
  assert.ok(warnText.includes('$1,370 MXN'));

  // 2) Matriz grande 5x8 con tablas extensas (40 rutas -> múltiples pares RHS y páginas)
  const largeProb: TransportationProblem = {
    origins: ['Centro 1', 'Centro 2', 'Centro 3', 'Centro 4', 'Centro 5'],
    destinations: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'],
    supply: [120, 140, 100, 110, 130],
    demand: [70, 80, 65, 85, 75, 90, 60, 75],
    costs: [
      [5, 8, 6, 9, 4, 7, 10, 6],
      [7, 4, 9, 5, 8, 6, 4, 9],
      [6, 7, 4, 8, 5, 9, 6, 5],
      [9, 5, 7, 4, 6, 5, 8, 7],
      [4, 6, 8, 7, 9, 4, 5, 6],
    ],
  };
  const largeRes = solveTransportationProblem(largeProb);
  const { doc: largeDoc, summary: largeSummary } = buildAcademicPdfReport(largeProb, largeRes);
  assert.ok(largeDoc.output().startsWith('%PDF-'));
  assert.ok(largeDoc.getNumberOfPages() >= 4);
  assert.equal(largeSummary.optimalCost, largeRes.optimal!.totalCost);
  assertAllPdfPagesPopulated(largeDoc, 'Matriz grande 5x8');
});

test('25. Etapa 7 (Regresión) - Bloqueo de comparaciones gerenciales desactualizadas y advertencias de oferta o demanda real cero', () => {
  // 1) Escenario desfasado: problema principal cambia a Taha 3x4 mientras Etapa 4 conserva comparación basada en Zeli
  const zeliOrig = cloneTransportationProblem(ZELI_DEFAULT_CASE);
  const zeliRes = solveTransportationProblem(zeliOrig);
  const zeliAlt = cloneTransportationProblem(zeliOrig);
  zeliAlt.costs[1][0] = 5; // cambiaría Z* de 1570 a 1530 en Zeli
  const staleZeliComparison = compareTransportationScenarios(zeliOrig, zeliAlt, zeliRes);
  assert.equal(staleZeliComparison.valid, true);
  assert.equal(staleZeliComparison.hasInputChanges, true);

  const tahaProb = ACADEMIC_PRESETS.find((p) => p.id === 'comparative_3x4')!.problem;
  const tahaRes = solveTransportationProblem(tahaProb);

  const syncedOutMgmt = buildManagerialDecisionAnalysis(
    tahaRes.balanced!,
    tahaRes.optimal!,
    tahaRes.sensitivity!.costSensitivity,
    tahaRes.sensitivity!.rhsSensitivity,
    tahaRes.sensitivity!.dualShadowPrices,
    null,
    { comparisonOutOfSync: true }
  );
  // Incluso si por error alguien pasara staleZeliComparison junto con comparisonOutOfSync: true, debe ignorarlo
  const guardedMgmt = buildManagerialDecisionAnalysis(
    tahaRes.balanced!,
    tahaRes.optimal!,
    tahaRes.sensitivity!.costSensitivity,
    tahaRes.sensitivity!.rhsSensitivity,
    tahaRes.sensitivity!.dualShadowPrices,
    staleZeliComparison,
    { comparisonOutOfSync: true }
  );

  for (const mgmt of [syncedOutMgmt, guardedMgmt]) {
    assert.equal(mgmt.scenarioComparisonAnalysis.valid, false);
    assert.equal(mgmt.scenarioComparisonAnalysis.hasChanges, false);
    assert.equal(mgmt.scenarioComparisonAnalysis.isTrueEfficiencyComparison, false);
    assert.ok(
      mgmt.scenarioComparisonAnalysis.lowestMathematicalCostLabel.includes('pendiente de sincronización')
    );
    assert.ok(
      mgmt.scenarioComparisonAnalysis.comparabilityWarning?.includes('Sincroniza el escenario alternativo')
    );
    assert.ok(!mgmt.scenarioComparisonAnalysis.costDeltaSummary.includes('1,570'));
    assert.ok(!mgmt.scenarioComparisonAnalysis.costDeltaSummary.includes('1,530'));
    const paramConcept = mgmt.economicInterpretation.find((e) => e.id === 'parameter_impact')!;
    assert.ok(paramConcept.currentModelEvidence.includes('pendiente de sincronización'));
    assert.ok(!paramConcept.currentModelEvidence.includes('1,570'));
  }

  // 2) Toda la oferta real es cero con demanda positiva -> advertencia explícita de Origen Ficticio (sin alterar balance.ts)
  const zeroSupplyProb: TransportationProblem = {
    origins: ['Almacén A', 'Almacén B'],
    destinations: ['Sucursal 1', 'Sucursal 2'],
    supply: [0, 0],
    demand: [80, 90],
    costs: [
      [8, 6],
      [9, 7],
    ],
  };
  const zeroSupplyRes = solveTransportationProblem(zeroSupplyProb);
  assert.equal(zeroSupplyRes.validation.valid, true);
  assert.equal(zeroSupplyRes.balanced?.balanceStatus, 'dummy_origin');
  assert.equal(zeroSupplyRes.balanced?.dummyAmount, 170);
  assert.equal(zeroSupplyRes.optimal?.totalCost, 0);

  const zeroSupWarn = getZeroRealFlowWarning(
    zeroSupplyRes.balanced!.originalSupplyTotal,
    zeroSupplyRes.balanced!.originalDemandTotal
  );
  assert.equal(zeroSupWarn?.kind, 'zero_real_supply');
  assert.ok(zeroSupWarn?.message.includes('Origen Ficticio'));
  assert.ok(zeroSupWarn?.message.includes('NO representa una distribución física real'));

  const mgmtZeroSup = zeroSupplyRes.sensitivity!.managerialAnalysis;
  assert.equal(mgmtZeroSup.diagnosis.realDistributedUnits, 0);
  assert.ok(mgmtZeroSup.diagnosis.dummyLimitationWarning?.includes('Origen Ficticio'));
  assert.ok(
    mgmtZeroSup.diagnosis.dummyLimitationWarning?.includes('NO representa una distribución física real')
  );
  const riskZeroSup = mgmtZeroSup.recommendations.find((r) => r.category === 'inventory_risks')!;
  assert.ok(riskZeroSup.recommendation.includes('Origen Ficticio'));

  // 3) Toda la demanda real es cero con oferta positiva -> advertencia equivalente de Destino Ficticio
  const zeroDemandProb: TransportationProblem = {
    origins: ['Almacén A', 'Almacén B'],
    destinations: ['Sucursal 1', 'Sucursal 2'],
    supply: [60, 40],
    demand: [0, 0],
    costs: [
      [8, 6],
      [9, 7],
    ],
  };
  const zeroDemandRes = solveTransportationProblem(zeroDemandProb);
  assert.equal(zeroDemandRes.validation.valid, true);
  assert.equal(zeroDemandRes.balanced?.balanceStatus, 'dummy_destination');
  assert.equal(zeroDemandRes.balanced?.dummyAmount, 100);
  assert.equal(zeroDemandRes.optimal?.totalCost, 0);

  const zeroDemWarn = getZeroRealFlowWarning(
    zeroDemandRes.balanced!.originalSupplyTotal,
    zeroDemandRes.balanced!.originalDemandTotal
  );
  assert.equal(zeroDemWarn?.kind, 'zero_real_demand');
  assert.ok(zeroDemWarn?.message.includes('Destino Ficticio'));
  assert.ok(zeroDemWarn?.message.includes('NO representa una distribución física real'));

  const mgmtZeroDem = zeroDemandRes.sensitivity!.managerialAnalysis;
  assert.equal(mgmtZeroDem.diagnosis.realDistributedUnits, 0);
  assert.ok(mgmtZeroDem.diagnosis.dummyLimitationWarning?.includes('Destino Ficticio'));
  assert.ok(
    mgmtZeroDem.diagnosis.dummyLimitationWarning?.includes('NO representa una distribución física real')
  );
  const riskZeroDem = mgmtZeroDem.recommendations.find((r) => r.category === 'inventory_risks')!;
  assert.ok(riskZeroDem.recommendation.includes('Destino Ficticio'));
});

test('26. Etapa 7 (Regresión) - PDF A4 sin advertencias de ancho, contenido íntegro y preservación de algoritmos base', () => {
  // 1) Verificar que generar PDF en múltiples escenarios NO emite advertencias de ancho de jspdf-autotable
  const widthWarnings: string[] = [];
  const origLog = console.log;
  const origWarn = console.warn;
  console.log = (...args: unknown[]) => {
    const line = args.map(String).join(' ');
    if (line.includes('could not fit page')) widthWarnings.push(line);
  };
  console.warn = (...args: unknown[]) => {
    const line = args.map(String).join(' ');
    if (line.includes('could not fit page')) widthWarnings.push(line);
  };

  try {
    const zeliRes = solveTransportationProblem(ZELI_DEFAULT_CASE);
    const tahaProb = ACADEMIC_PRESETS.find((p) => p.id === 'comparative_3x4')!.problem;
    const tahaRes = solveTransportationProblem(tahaProb);
    const surplusProb = ACADEMIC_PRESETS.find((p) => p.id === 'zeli_surplus')!.problem;
    const surplusRes = solveTransportationProblem(surplusProb);
    const deficitProb = ACADEMIC_PRESETS.find((p) => p.id === 'zeli_deficit')!.problem;
    const deficitRes = solveTransportationProblem(deficitProb);

    const zeliAlt = cloneTransportationProblem(ZELI_DEFAULT_CASE);
    zeliAlt.costs[1][0] = 5;
    const zeliComp = compareTransportationScenarios(ZELI_DEFAULT_CASE, zeliAlt, zeliRes);

    const pdfZeli = buildAcademicPdfReport(
      ZELI_DEFAULT_CASE,
      zeliRes,
      new Date('2026-11-21T12:00:00Z'),
      { scenarioComparison: zeliComp }
    );
    const pdfTaha = buildAcademicPdfReport(tahaProb, tahaRes);
    const pdfSurplus = buildAcademicPdfReport(surplusProb, surplusRes);
    const pdfDeficit = buildAcademicPdfReport(deficitProb, deficitRes);

    assert.equal(widthWarnings.length, 0, `Advertencias de ancho detectadas: ${widthWarnings.join(' | ')}`);

    // Conservar formato A4 (210 x 297 mm), portada, índice, secciones 1-12 y resultados
    assert.ok(Math.abs(pdfZeli.doc.internal.pageSize.getWidth() - 210) < 0.5);
    assert.ok(Math.abs(pdfZeli.doc.internal.pageSize.getHeight() - 297) < 0.5);
    const zeliPdfText = extractJsPdfRawText(pdfZeli.doc);
    assert.ok(zeliPdfText.includes('REPORTE ACADÉMICO DE OPTIMIZACIÓN'));
    assert.ok(zeliPdfText.includes('Contenido del reporte'));
    assert.ok(zeliPdfText.includes('1. Descripción del problema de transporte'));
    assert.ok(zeliPdfText.includes('8. Análisis de sensibilidad de costos unitarios (Etapa 1)'));
    assert.ok(zeliPdfText.includes('11. Comparación de escenarios: original vs. alternativo (Etapa 4)'));
    assert.ok(zeliPdfText.includes('12. Interpretación gerencial y recomendaciones (Etapa 5)'));

    const tahaPdfText = extractJsPdfRawText(pdfTaha.doc);
    assert.ok(tahaPdfText.includes('$475 MXN'));
    assert.ok(tahaPdfText.includes('$435 MXN'));
    assert.ok(extractJsPdfRawText(pdfSurplus.doc).includes('$1,530 MXN'));
    assert.ok(extractJsPdfRawText(pdfDeficit.doc).includes('$1,230 MXN'));

    // 2) Confirmar que los algoritmos base (Costo Mínimo, Vogel, MODI) mantienen exactamente sus valores
    assert.equal(zeliRes.leastCost?.totalCost, 1570);
    assert.equal(zeliRes.vogel?.totalCost, 1570);
    assert.equal(zeliRes.optimal?.totalCost, 1570);
    assert.equal(tahaRes.leastCost?.totalCost, 475);
    assert.equal(tahaRes.vogel?.totalCost, 475);
    assert.equal(tahaRes.optimal?.totalCost, 435);
    assert.equal(surplusRes.leastCost?.totalCost, 1580);
    assert.equal(surplusRes.vogel?.totalCost, 1580);
    assert.equal(surplusRes.optimal?.totalCost, 1530);
    assert.equal(deficitRes.leastCost?.totalCost, 1230);
    assert.equal(deficitRes.vogel?.totalCost, 1230);
    assert.equal(deficitRes.optimal?.totalCost, 1230);
  } finally {
    console.log = origLog;
    console.warn = origWarn;
  }
});
