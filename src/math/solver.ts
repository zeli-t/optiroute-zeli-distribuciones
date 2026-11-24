import { EPSILON, balanceProblem, roundClean, validateProblem } from './balance';
import { buildProblemExplanation } from './explanations';
import { solveLeastCost } from './leastCost';
import { solveModiOptimal } from './modi';
import { buildSensitivityScaffold } from './sensitivity';
import {
  MethodComparisonRow,
  MethodResult,
  SolveResponse,
  TransportationProblem,
} from './types';
import { solveVogel } from './vogel';

function countActiveRoutes(result: MethodResult): number {
  let count = 0;
  for (const row of result.allocations) {
    for (const val of row) {
      if (val > EPSILON) count++;
    }
  }
  return count;
}

export function solveTransportationProblem(problem: TransportationProblem): SolveResponse {
  const validation = validateProblem(problem);
  if (!validation.valid) {
    return {
      validation,
      balanced: null,
      leastCost: null,
      vogel: null,
      optimal: null,
      comparison: [],
      explanation: null,
      sensitivity: null,
    };
  }

  const balanced = balanceProblem(problem);
  const leastCost = solveLeastCost(balanced);
  const vogel = solveVogel(balanced);

  // Usar la mejor BFS entre Costo Mínimo y Vogel como punto de partida para MODI
  const bestInitial = vogel.totalCost <= leastCost.totalCost ? vogel : leastCost;
  const optimal = solveModiOptimal(balanced, bestInitial);

  const methods: MethodResult[] = [leastCost, vogel, optimal];
  const comparison: MethodComparisonRow[] = methods.map((m) => {
    const gap = roundClean(m.totalCost - optimal.totalCost);
    const gapPercentage =
      optimal.totalCost > EPSILON ? roundClean((gap / optimal.totalCost) * 100) : 0;

    return {
      methodId: m.methodId,
      methodName: m.methodName,
      totalCost: m.totalCost,
      gapFromOptimal: gap,
      gapPercentage,
      isOptimal: gap <= EPSILON,
      activeRoutesCount: countActiveRoutes(m),
    };
  });

  const explanation = buildProblemExplanation(balanced, optimal, comparison);
  const sensitivity = buildSensitivityScaffold(balanced, optimal);

  return {
    validation,
    balanced,
    leastCost,
    vogel,
    optimal,
    comparison,
    explanation,
    sensitivity,
  };
}
