import { EPSILON, roundClean } from './balance';
import {
  BalancedProblem,
  MethodComparisonRow,
  OptimalResult,
  ProblemExplanation,
  RouteExplanation,
} from './types';

function formatNumber(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString('es-MX') : n.toLocaleString('es-MX', { maximumFractionDigits: 2 });
}

export function buildProblemExplanation(
  balanced: BalancedProblem,
  optimal: OptimalResult,
  comparison: MethodComparisonRow[]
): ProblemExplanation {
  const m = balanced.origins.length;
  const n = balanced.destinations.length;

  let balanceSummary = '';
  let unbalancedNote: string | null = null;

  if (balanced.balanceStatus === 'balanced') {
    balanceSummary = `El modelo está equilibrado de origen: la oferta total (${formatNumber(balanced.originalSupplyTotal)} u) coincide exactamente con la demanda total (${formatNumber(balanced.originalDemandTotal)} u).`;
  } else if (balanced.balanceStatus === 'dummy_destination') {
    balanceSummary = `La oferta total (${formatNumber(balanced.originalSupplyTotal)} u) supera a la demanda (${formatNumber(balanced.originalDemandTotal)} u) por ${formatNumber(balanced.dummyAmount)} u. Se incorporó un Destino Ficticio con costo unitario $0 MXN para balancear el sistema.`;
    unbalancedNote = `Las unidades asignadas al "Destino Ficticio" representan inventario excedente (${formatNumber(balanced.dummyAmount)} u) que permanece almacenado sin enviarse.`;
  } else {
    balanceSummary = `La demanda total (${formatNumber(balanced.originalDemandTotal)} u) supera a la oferta (${formatNumber(balanced.originalSupplyTotal)} u) por ${formatNumber(balanced.dummyAmount)} u. Se incorporó un Origen Ficticio con costo unitario $0 MXN para balancear el sistema.`;
    unbalancedNote = `Las unidades asignadas desde el "Origen Ficticio" representan demanda insatisfecha o faltante (${formatNumber(balanced.dummyAmount)} u) que no puede cubrirse con la capacidad actual.`;
  }

  const routeExplanations: RouteExplanation[] = [];

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      const qty = optimal.allocations[i][j];
      if (qty <= EPSILON) continue;

      const isDummy = i === balanced.dummyRowIndex || j === balanced.dummyColIndex;
      const originName = balanced.origins[i];
      const destinationName = balanced.destinations[j];
      const unitCost = balanced.costs[i][j];
      const subtotalCost = roundClean(qty * unitCost);
      const supplyVal = balanced.supply[i];
      const demandVal = balanced.demand[j];
      const shareOfSupplyPct = supplyVal > 0 ? roundClean((qty / supplyVal) * 100) : 0;
      const shareOfDemandPct = demandVal > 0 ? roundClean((qty / demandVal) * 100) : 0;

      let summary = '';
      if (j === balanced.dummyColIndex) {
        summary = `${originName} retiene ${formatNumber(qty)} unidades en inventario (excedente no enviado a costo $0 MXN).`;
      } else if (i === balanced.dummyRowIndex) {
        summary = `${destinationName} queda con un faltante de ${formatNumber(qty)} unidades sin abastecer (asignado a Origen Ficticio).`;
      } else {
        summary = `Enviar ${formatNumber(qty)} unidades desde ${originName} hacia ${destinationName} a $${formatNumber(unitCost)} MXN/u (subtotal: $${formatNumber(subtotalCost)} MXN). Cubre el ${formatNumber(shareOfDemandPct)}% de la demanda de esta sucursal.`;
      }

      routeExplanations.push({
        originIndex: i,
        destinationIndex: j,
        originName,
        destinationName,
        quantity: qty,
        unitCost,
        subtotalCost,
        isDummy,
        shareOfSupplyPct,
        shareOfDemandPct,
        summary,
      });
    }
  }

  const realRoutes = routeExplanations.filter((r) => !r.isDummy);
  const totalRealUnits = roundClean(realRoutes.reduce((acc, r) => acc + r.quantity, 0));

  const headlineSummary = `El plan óptimo de distribución moviliza ${formatNumber(totalRealUnits)} unidades reales mediante ${realRoutes.length} ${realRoutes.length === 1 ? 'ruta activa' : 'rutas activas'}, logrando un costo mínimo garantizado de $${formatNumber(optimal.totalCost)} MXN.`;

  const leastCostRow = comparison.find((c) => c.methodId === 'least_cost');
  const vogelRow = comparison.find((c) => c.methodId === 'vogel');

  let methodComparisonSummary = '';
  if (leastCostRow && vogelRow) {
    if (leastCostRow.gapFromOptimal <= EPSILON && vogelRow.gapFromOptimal <= EPSILON) {
      methodComparisonSummary = `Tanto Costo Mínimo como Aproximación de Vogel alcanzaron directamente el óptimo global ($${formatNumber(optimal.totalCost)} MXN), lo cual fue verificado mediante los multiplicadores MODI (Δ_ij ≥ 0 en todas las celdas no básicas).`;
    } else {
      const lcmDiff = formatNumber(leastCostRow.gapFromOptimal);
      const vamDiff = formatNumber(vogelRow.gapFromOptimal);
      methodComparisonSummary = `Costo Mínimo obtuvo $${formatNumber(leastCostRow.totalCost)} MXN (brecha de $${lcmDiff} MXN sobre el óptimo) y Aproximación de Vogel obtuvo $${formatNumber(vogelRow.totalCost)} MXN (brecha de $${vamDiff} MXN). El algoritmo MODI optimizó la base hasta certificar $${formatNumber(optimal.totalCost)} MXN.`;
    }
  }

  let alternativeOptimaNote: string | null = null;
  if (optimal.hasAlternativeOptima && optimal.alternativeCells.length > 0) {
    const altNames = optimal.alternativeCells
      .map((c) => `${c.originName} → ${c.destinationName}`)
      .join(', ');
    alternativeOptimaNote = `Se detectó costo marginal Δ = 0 en ${optimal.alternativeCells.length === 1 ? 'la ruta no básica' : 'las rutas no básicas'} (${altNames}). Esto indica que existen soluciones óptimas alternativas con exactamente el mismo costo mínimo de $${formatNumber(optimal.totalCost)} MXN.`;
  }

  return {
    balanceSummary,
    headlineSummary,
    methodComparisonSummary,
    alternativeOptimaNote,
    routeExplanations,
    unbalancedNote,
  };
}
