import {
  AlertTriangle,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Info,
  Package,
  Route,
  Sparkles,
  TrendingDown,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { EPSILON } from '../math/balance';
import {
  buildSlackSaturationAnalysis,
  getZeroRealFlowWarning,
} from '../math/sensitivity';
import {
  BalancedProblem,
  MethodComparisonRow,
  MethodResult,
  OptimalResult,
  ProblemExplanation,
} from '../math/types';
import { RouteFlowDiagram } from './RouteFlowDiagram';

export type SelectedMethodTab = 'optimal' | 'vogel' | 'least_cost';

interface ResultsSectionProps {
  balanced: BalancedProblem;
  leastCost: MethodResult;
  vogel: MethodResult;
  optimal: OptimalResult;
  comparison: MethodComparisonRow[];
  explanation: ProblemExplanation;
  activeMethod: SelectedMethodTab;
  onSelectMethod: (method: SelectedMethodTab) => void;
}

function fmt(n: number): string {
  return Number.isInteger(n)
    ? n.toLocaleString('es-MX')
    : n.toLocaleString('es-MX', { maximumFractionDigits: 2 });
}

export const ResultsSection: React.FC<ResultsSectionProps> = ({
  balanced,
  leastCost,
  vogel,
  optimal,
  comparison,
  explanation,
  activeMethod,
  onSelectMethod,
}) => {
  const [showMatrixDetail, setShowMatrixDetail] = useState<boolean>(false);

  const activeResult: MethodResult =
    activeMethod === 'optimal'
      ? optimal
      : activeMethod === 'vogel'
      ? vogel
      : leastCost;

  const activeMethodLabel =
    activeMethod === 'optimal'
      ? 'Plan Óptimo (MODI)'
      : activeMethod === 'vogel'
      ? 'Aproximación de Vogel'
      : 'Costo Mínimo';

  const m = balanced.origins.length;
  const n = balanced.destinations.length;
  const realOriginsCount = balanced.dummyRowIndex === null ? m : m - 1;
  const realDestCount = balanced.dummyColIndex === null ? n : n - 1;
  const realCellsCount = realOriginsCount * realDestCount;

  // Unidades realmente distribuidas y rutas reales en el plan óptimo MODI
  let realDistributedUnits = 0;
  let activeRealRoutesCount = 0;
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (i === balanced.dummyRowIndex || j === balanced.dummyColIndex) continue;
      const qty = optimal.allocations[i][j];
      if (qty > EPSILON) {
        realDistributedUnits += qty;
        activeRealRoutesCount++;
      }
    }
  }

  const optimalCost = optimal.totalCost;
  const leastCostSavings = Math.max(0, leastCost.totalCost - optimalCost);
  const vogelSavings = Math.max(0, vogel.totalCost - optimalCost);
  const maxSavingsMxn = Math.max(leastCostSavings, vogelSavings);
  const maxInitialCost = Math.max(leastCost.totalCost, vogel.totalCost);
  const maxSavingsPct =
    maxInitialCost > EPSILON ? (maxSavingsMxn / maxInitialCost) * 100 : 0;

  const worstInitialLabel =
    leastCost.totalCost >= vogel.totalCost ? 'Costo Mínimo' : 'Vogel';

  const zeroFlowWarning = getZeroRealFlowWarning(
    balanced.originalSupplyTotal,
    balanced.originalDemandTotal
  );

  const slackAnalysis = useMemo(
    () => buildSlackSaturationAnalysis(balanced, optimal),
    [balanced, optimal]
  );

  const maxChartCost = Math.max(
    ...comparison.map((c) => c.totalCost),
    optimal.totalCost,
    1
  );

  const orderedMethods = [
    comparison.find((c) => c.methodId === 'least_cost'),
    comparison.find((c) => c.methodId === 'vogel'),
    comparison.find((c) => c.methodId === 'optimal'),
  ].filter((r): r is MethodComparisonRow => Boolean(r));

  const plainMethodDescription: Record<SelectedMethodTab, string> = {
    least_cost:
      'Elige primero las rutas con menor costo por unidad. Es rápido, pero a veces deja envíos más caros para el final.',
    vogel:
      'Calcula cuánto costaría perder la mejor opción de cada almacén o sucursal antes de asignar. Suele quedar muy cerca del óptimo.',
    optimal:
      'Revisa matemáticamente todas las rutas posibles y ajusta los envíos hasta garantizar el menor costo total posible.',
  };

  const hasDegenerateInActiveView = activeResult.basicMask.some((row, i) =>
    row.some((isBasic, j) => isBasic && activeResult.allocations[i][j] <= EPSILON)
  );

  return (
    <section id="resultados" className="scroll-mt-20 space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-7 space-y-7">
        {/* Encabezado de Resultados */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 pb-5 border-b border-slate-200">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-cyan-800">
              Paso 2 · Resultados
            </div>
            <h2 className="mt-1 text-xl sm:text-2xl font-bold text-[#0B1F3A]">
              Plan óptimo de distribución y rutas recomendadas
            </h2>
            <p className="mt-1.5 text-sm text-slate-600 max-w-2xl">
              {explanation.headlineSummary}
            </p>
          </div>
          <div className="text-xs text-slate-500 whitespace-nowrap shrink-0">
            Óptimo certificado mediante algoritmo MODI
          </div>
        </div>

        {/* 1. Los 4 números clave */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 sm:p-5 rounded-xl bg-[#0B1F3A] text-white">
            <div className="flex items-center justify-between gap-2 text-xs font-medium text-cyan-200">
              <span>Costo mínimo total</span>
              <DollarSign className="w-4 h-4 text-cyan-300 shrink-0" />
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-bold font-mono tabular-nums">
              ${fmt(optimal.totalCost)}{' '}
              <span className="text-xs font-medium text-cyan-300">MXN</span>
            </div>
            <p className="mt-1.5 text-xs text-slate-300">
              Menor gasto posible garantizado por MODI.
            </p>
          </div>

          <div className="p-4 sm:p-5 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-600">
              <span>Unidades distribuidas</span>
              <Package className="w-4 h-4 text-cyan-700 shrink-0" />
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-[#0B1F3A]">
              {fmt(realDistributedUnits)} <span className="text-sm font-medium">u</span>
            </div>
            <p className="mt-1.5 text-xs text-slate-600">
              {balanced.balanceStatus === 'balanced'
                ? 'Total enviado entre almacenes y sucursales.'
                : `Envíos físicos reales (+${fmt(balanced.dummyAmount)} u ficticias de ajuste).`}
            </p>
          </div>

          <div className="p-4 sm:p-5 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-600">
              <span>Rutas recomendadas</span>
              <Route className="w-4 h-4 text-cyan-700 shrink-0" />
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-[#0B1F3A]">
              {activeRealRoutesCount}{' '}
              <span className="text-sm font-medium text-slate-500">
                de {realCellsCount}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-slate-600">
              Conexiones activas con envío positivo en el plan óptimo.
            </p>
          </div>

          <div className="p-4 sm:p-5 rounded-xl bg-cyan-50/70 border border-cyan-200">
            <div className="flex items-center justify-between gap-2 text-xs font-semibold text-cyan-950">
              <span>Ahorro vs soluciones iniciales</span>
              <TrendingDown className="w-4 h-4 text-cyan-700 shrink-0" />
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-[#0B1F3A]">
              ${fmt(maxSavingsMxn)}{' '}
              <span className="text-xs font-medium text-cyan-900">MXN</span>
            </div>
            <p className="mt-1.5 text-xs text-cyan-950 leading-snug">
              {maxSavingsMxn > EPSILON
                ? `${maxSavingsPct.toFixed(2)}% de ahorro frente a ${worstInitialLabel}.`
                : 'Ahorro adicional $0 (0.00%): los métodos iniciales ya encontraron el óptimo.'}
            </p>
          </div>
        </div>

        {/* Alertas importantes de flujo físico nulo o desbalanceo / óptimos alternativos */}
        {zeroFlowWarning && (
          <div
            role="alert"
            className="flex items-start gap-3 p-4 rounded-xl bg-red-50/85 border border-red-300 text-xs sm:text-sm text-red-950"
          >
            <AlertTriangle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
            <span>{zeroFlowWarning.message}</span>
          </div>
        )}

        {(explanation.unbalancedNote || explanation.alternativeOptimaNote) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {explanation.unbalancedNote && (
              <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-amber-50/80 border border-amber-200 text-xs sm:text-sm text-amber-950">
                <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <span>{explanation.unbalancedNote}</span>
              </div>
            )}
            {explanation.alternativeOptimaNote && (
              <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-cyan-50/80 border border-cyan-200 text-xs sm:text-sm text-cyan-950">
                <Sparkles className="w-4 h-4 text-cyan-700 shrink-0 mt-0.5" />
                <span>{explanation.alternativeOptimaNote}</span>
              </div>
            )}
          </div>
        )}

        {/* 2. Visualización clara de las rutas de distribución */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-[#0B1F3A]">
                Visualización de las rutas de distribución
              </h3>
              <p className="text-xs sm:text-sm text-slate-600">
                Observa de un vistazo cómo salen los productos de cada almacén hacia cada sucursal.
              </p>
            </div>

            <div
              role="tablist"
              aria-label="Seleccionar método para visualizar rutas"
              className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0"
            >
              {(
                [
                  { id: 'optimal', label: 'Plan Óptimo (MODI)' },
                  { id: 'vogel', label: 'Vogel' },
                  { id: 'least_cost', label: 'Costo Mínimo' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeMethod === tab.id}
                  onClick={() => onSelectMethod(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeMethod === tab.id
                      ? 'bg-[#0B1F3A] text-white shadow-xs'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <RouteFlowDiagram
            balanced={balanced}
            methodResult={activeResult}
            methodLabel={activeMethodLabel}
          />
        </div>

        {/* 3. Comparación en lenguaje sencillo: Costo Mínimo, Vogel y MODI */}
        <div className="pt-6 border-t border-slate-200 space-y-5">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-[#0B1F3A]">
              Comparación de métodos: Costo Mínimo, Vogel y MODI
            </h3>
            <p className="mt-1 text-xs sm:text-sm text-slate-600">
              {maxSavingsMxn > EPSILON
                ? `Los métodos iniciales obtuvieron costos mayores, pero MODI encontró un plan más barato ahorrando hasta $${fmt(maxSavingsMxn)} MXN (${maxSavingsPct.toFixed(2)}%).`
                : `En este problema, tanto Costo Mínimo como Aproximación de Vogel llegaron directamente al mejor costo ($${fmt(optimalCost)} MXN). Por eso el ahorro adicional de MODI es $0 MXN (0.00%) y su función aquí es certificar que no existe una combinación más barata.`}
            </p>
          </div>

          {/* 3 tarjetas explicadas en lenguaje sencillo */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {orderedMethods.map((row) => {
              const id = row.methodId as SelectedMethodTab;
              const isSelected = activeMethod === id;
              const isModi = id === 'optimal';
              const diff = Math.max(0, row.totalCost - optimalCost);
              const savingsPct =
                row.totalCost > EPSILON ? (diff / row.totalCost) * 100 : 0;

              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelectMethod(id)}
                  className={`text-left p-4 sm:p-5 rounded-xl border transition-colors cursor-pointer flex flex-col justify-between ${
                    isModi
                      ? isSelected
                        ? 'bg-[#0B1F3A] text-white border-[#0B1F3A]'
                        : 'bg-[#0F294A] text-white border-[#0F294A] hover:bg-[#0B1F3A]'
                      : isSelected
                      ? 'bg-cyan-50/55 border-cyan-600'
                      : 'bg-slate-50/70 border-slate-200 hover:bg-white'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-sm font-bold ${
                          isModi ? 'text-white' : 'text-[#0B1F3A]'
                        }`}
                      >
                        {row.methodName}
                      </span>
                      {isModi ? (
                        <CheckCircle2 className="w-4 h-4 text-cyan-300 shrink-0" />
                      ) : row.isOptimal ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                      ) : (
                        <TrendingDown className="w-4 h-4 text-amber-700 shrink-0" />
                      )}
                    </div>

                    <p
                      className={`mt-1.5 text-xs leading-relaxed ${
                        isModi ? 'text-slate-300' : 'text-slate-600'
                      }`}
                    >
                      {plainMethodDescription[id]}
                    </p>
                  </div>

                  <div
                    className={`mt-4 pt-3 border-t flex items-baseline justify-between gap-2 ${
                      isModi ? 'border-white/15' : 'border-slate-200'
                    }`}
                  >
                    <div>
                      <div
                        className={`text-xl font-bold font-mono tabular-nums ${
                          isModi ? 'text-white' : 'text-[#0B1F3A]'
                        }`}
                      >
                        ${fmt(row.totalCost)} MXN
                      </div>
                      <div
                        className={`text-xs mt-0.5 ${
                          isModi ? 'text-cyan-300' : 'text-slate-600'
                        }`}
                      >
                        {isModi
                          ? 'Óptimo garantizado'
                          : diff <= EPSILON
                          ? 'Igualó al óptimo ($0 extra)'
                          : `+$${fmt(diff)} MXN sobre el óptimo (${savingsPct.toFixed(1)}% ahorro con MODI)`}
                      </div>
                    </div>

                    <span
                      className={`text-xs font-semibold whitespace-nowrap ${
                        isModi
                          ? 'text-cyan-200'
                          : isSelected
                          ? 'text-cyan-800'
                          : 'text-slate-500'
                      }`}
                    >
                      {isSelected ? 'En mapa' : 'Ver mapa'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Barra comparativa + tabla compacta */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
            <div className="xl:col-span-5 border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#0B1F3A]">
                  Comparación visual de costos
                </span>
                <BarChart3 className="w-4 h-4 text-cyan-700 shrink-0" />
              </div>

              <div className="space-y-3">
                {orderedMethods.map((row) => {
                  const id = row.methodId as SelectedMethodTab;
                  const ratioPct = Math.max(8, (row.totalCost / maxChartCost) * 100);
                  const diff = Math.max(0, row.totalCost - optimalCost);

                  return (
                    <div key={id} className="space-y-1">
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="font-semibold text-slate-800">
                          {row.methodName}
                        </span>
                        <span className="font-mono tabular-nums font-bold text-[#0B1F3A]">
                          ${fmt(row.totalCost)} MXN
                        </span>
                      </div>
                      <div className="h-5 w-full bg-slate-200/70 rounded-sm overflow-hidden">
                        <div
                          className={`h-full transition-all duration-200 ${
                            id === 'optimal'
                              ? 'bg-cyan-600'
                              : diff <= EPSILON
                              ? 'bg-[#0F294A]'
                              : 'bg-slate-600'
                          }`}
                          style={{ width: `${ratioPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="xl:col-span-7 overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-[#0B1F3A] text-white">
                    <th className="text-left font-semibold py-2.5 px-3">Método</th>
                    <th className="text-right font-semibold py-2.5 px-3">Costo Total</th>
                    <th className="text-right font-semibold py-2.5 px-3">Sobrecosto</th>
                    <th className="text-right font-semibold py-2.5 px-3">Ahorro MODI</th>
                    <th className="text-right font-semibold py-2.5 px-3">Rutas</th>
                    <th className="text-left font-semibold py-2.5 px-3">Resultado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {orderedMethods.map((row) => {
                    const diff = Math.max(0, row.totalCost - optimalCost);
                    const savingsPct =
                      row.totalCost > EPSILON ? (diff / row.totalCost) * 100 : 0;

                    return (
                      <tr
                        key={row.methodId}
                        onClick={() => onSelectMethod(row.methodId as SelectedMethodTab)}
                        className={`cursor-pointer transition-colors ${
                          activeMethod === row.methodId
                            ? 'bg-cyan-50/50'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-2.5 px-3 font-semibold text-slate-900">
                          {row.methodName}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-[#0B1F3A]">
                          ${fmt(row.totalCost)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                          {diff <= EPSILON ? '$0' : `+$${fmt(diff)}`}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                          {row.methodId === 'optimal'
                            ? '—'
                            : `${savingsPct.toFixed(2)}%`}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                          {row.activeRoutesCount}
                        </td>
                        <td className="py-2.5 px-3">
                          {row.methodId === 'optimal' ? (
                            <span className="inline-flex items-center gap-1 text-cyan-800 font-semibold">
                              <Check className="w-3.5 h-3.5 shrink-0" />
                              Óptimo final
                            </span>
                          ) : row.isOptimal ? (
                            <span className="inline-flex items-center gap-1 text-emerald-800 font-medium">
                              <Check className="w-3.5 h-3.5 shrink-0" />
                              Ya era óptimo
                            </span>
                          ) : (
                            <span className="text-amber-800 font-medium">
                              Mejorable con MODI
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 4. Análisis de Holguras y Saturación de Restricciones */}
        <div className="pt-6 border-t border-slate-200 space-y-4">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-[#0B1F3A]">
              Análisis de Holguras y Saturación de Restricciones
            </h3>
            <p className="mt-1 text-xs sm:text-sm text-slate-600">
              Verifica qué almacenes agotan toda su capacidad (holgura = 0) y qué sucursales reciben el 100 % de su demanda. Cuando existe desbalanceo, las holguras muestran el inventario sin asignar (Destino Ficticio) o la demanda insatisfecha (Origen Ficticio).
            </p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {/* Tabla de Almacenes (Restricciones de Oferta) */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-[#0B1F3A] text-white">
                    <th className="text-left font-semibold py-2.5 px-3">Almacén (Oferta)</th>
                    <th className="text-right font-semibold py-2.5 px-2.5">Oferta disp.</th>
                    <th className="text-right font-semibold py-2.5 px-2.5">Enviado real</th>
                    <th className="text-right font-semibold py-2.5 px-2.5">Holgura / Sin asignar</th>
                    <th className="text-left font-semibold py-2.5 px-3">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {slackAnalysis.supplyRows.map((row) => (
                    <tr
                      key={`slack-sup-${row.originIndex}`}
                      className={row.slackUnassigned > EPSILON ? 'bg-amber-50/40' : 'hover:bg-slate-50/70'}
                    >
                      <td className="py-2.5 px-3 font-semibold text-[#0B1F3A] whitespace-nowrap">
                        {row.originName}
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-800 whitespace-nowrap">
                        {fmt(row.supplyAvailable)} u
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold text-[#0B1F3A] whitespace-nowrap">
                        {fmt(row.realShipped)} u
                      </td>
                      <td
                        className={`py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                          row.slackUnassigned > EPSILON ? 'text-amber-800' : 'text-emerald-800'
                        }`}
                      >
                        {fmt(row.slackUnassigned)} u
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">{row.statusLabel}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 border-t border-slate-200 font-semibold text-[#0B1F3A]">
                    <td className="py-2.5 px-3">Total oferta</td>
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                      {fmt(slackAnalysis.totalSupplyAvailable)} u
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                      {fmt(slackAnalysis.totalRealShipped)} u
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                      {fmt(slackAnalysis.totalSlackUnassigned)} u
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 font-normal">
                      {slackAnalysis.totalSlackUnassigned > EPSILON
                        ? 'Asignado a Destino Ficticio'
                        : 'Oferta 100 % saturada'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Tabla de Sucursales (Restricciones de Demanda) */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-[#0B1F3A] text-white">
                    <th className="text-left font-semibold py-2.5 px-3">Sucursal (Demanda)</th>
                    <th className="text-right font-semibold py-2.5 px-2.5">Demanda req.</th>
                    <th className="text-right font-semibold py-2.5 px-2.5">Recibido real</th>
                    <th className="text-right font-semibold py-2.5 px-2.5">Holgura / Insatisfecha</th>
                    <th className="text-left font-semibold py-2.5 px-3">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {slackAnalysis.demandRows.map((row) => (
                    <tr
                      key={`slack-dem-${row.destinationIndex}`}
                      className={row.unmetDemand > EPSILON ? 'bg-amber-50/40' : 'hover:bg-slate-50/70'}
                    >
                      <td className="py-2.5 px-3 font-semibold text-[#0B1F3A] whitespace-nowrap">
                        {row.destinationName}
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-800 whitespace-nowrap">
                        {fmt(row.demandRequired)} u
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold text-[#0B1F3A] whitespace-nowrap">
                        {fmt(row.realReceived)} u
                      </td>
                      <td
                        className={`py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                          row.unmetDemand > EPSILON ? 'text-amber-800' : 'text-emerald-800'
                        }`}
                      >
                        {fmt(row.unmetDemand)} u
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">{row.statusLabel}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 border-t border-slate-200 font-semibold text-[#0B1F3A]">
                    <td className="py-2.5 px-3">Total demanda</td>
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                      {fmt(slackAnalysis.totalDemandRequired)} u
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                      {fmt(slackAnalysis.totalRealReceived)} u
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                      {fmt(slackAnalysis.totalUnmetDemand)} u
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 font-normal">
                      {slackAnalysis.totalUnmetDemand > EPSILON
                        ? 'Cubierta por Origen Ficticio'
                        : 'Demanda 100 % saturada'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        {/* 5. Matriz detallada de asignaciones (desplegable para mantener la vista limpia) */}
        <div className="pt-5 border-t border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-[#0B1F3A]">
                Matriz detallada de asignaciones ({activeMethodLabel})
              </h3>
              <p className="text-xs text-slate-600">
                Consulta las cantidades por celda, tarifas unitarias, costos reducidos (Δ_ij) y multiplicadores duales (u_i, v_j).
              </p>
            </div>

            <button
              type="button"
              aria-expanded={showMatrixDetail}
              onClick={() => setShowMatrixDetail((prev) => !prev)}
              className="min-h-[38px] inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium text-[#0B1F3A] bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {showMatrixDetail ? (
                <>
                  <ChevronUp className="w-4 h-4 text-slate-600 shrink-0" />
                  Ocultar matriz completa
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4 text-slate-600 shrink-0" />
                  Ver matriz completa
                </>
              )}
            </button>
          </div>

          {showMatrixDetail && (
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-600">
                <span className="font-semibold text-slate-800">Leyenda:</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded-xs bg-cyan-50 border border-cyan-400 inline-block" />
                  Ruta activa (x_ij &gt; 0)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded-xs bg-indigo-50 border border-dashed border-indigo-400 inline-block" />
                  Básica degenerada (0 u)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded-xs bg-amber-50 border border-amber-300 inline-block" />
                  Nodo ficticio ($0/u)
                </span>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-[#0B1F3A] text-white border-b border-slate-700">
                      <th className="text-left font-semibold py-3 px-3.5 border-r border-slate-700/70 min-w-[165px]">
                        Origen \ Destino
                      </th>
                      {balanced.destinations.map((dest, j) => {
                        const isDummyCol = j === balanced.dummyColIndex;
                        return (
                          <th
                            key={j}
                            className={`text-center font-semibold py-3 px-3 border-r border-slate-700/70 min-w-[148px] ${
                              isDummyCol ? 'bg-amber-900/50 text-amber-100' : ''
                            }`}
                          >
                            <div>{dest}</div>
                            <div className="text-[11px] font-normal text-cyan-200 font-mono tabular-nums mt-0.5">
                              Demanda: {fmt(balanced.demand[j])} u
                            </div>
                          </th>
                        );
                      })}
                      <th className="text-right font-semibold py-3 px-3.5 bg-[#13315C] min-w-[96px]">
                        Oferta
                      </th>
                      {activeMethod === 'optimal' && (
                        <th className="text-right font-semibold py-3 px-3.5 bg-[#13315C] border-l border-slate-700/70 min-w-[76px]">
                          u_i
                        </th>
                      )}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-200">
                    {balanced.origins.map((origin, i) => {
                      const isDummyRow = i === balanced.dummyRowIndex;
                      return (
                        <tr key={i}>
                          <th
                            scope="row"
                            className={`text-left font-semibold py-3 px-3.5 border-r border-slate-200 ${
                              isDummyRow
                                ? 'bg-amber-50 text-amber-950'
                                : 'bg-slate-50 text-[#0B1F3A]'
                            }`}
                          >
                            <div>{origin}</div>
                            <div className="text-xs font-normal text-slate-500 font-mono tabular-nums mt-0.5">
                              Oferta: {fmt(balanced.supply[i])} u
                            </div>
                          </th>

                          {balanced.destinations.map((_, j) => {
                            const qty = activeResult.allocations[i][j];
                            const isBasic = activeResult.basicMask[i][j];
                            const unitCost = balanced.costs[i][j];
                            const subtotal = qty * unitCost;
                            const isDummyCell =
                              isDummyRow || j === balanced.dummyColIndex;
                            const isDegenerateBasic = isBasic && qty <= EPSILON;
                            const reducedCost =
                              activeMethod === 'optimal'
                                ? optimal.finalReducedCosts[i][j]
                                : null;
                            const isAltOptima =
                              activeMethod === 'optimal' &&
                              !isBasic &&
                              reducedCost !== null &&
                              Math.abs(reducedCost) <= EPSILON;

                            return (
                              <td
                                key={j}
                                className={`p-3 border-r border-slate-200 align-top ${
                                  qty > EPSILON
                                    ? isDummyCell
                                      ? 'bg-amber-50/75'
                                      : 'bg-cyan-50/80'
                                    : isDegenerateBasic
                                    ? 'bg-indigo-50/70'
                                    : 'bg-white'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <span className="text-xs font-mono tabular-nums text-slate-500">
                                    ${fmt(unitCost)}/u
                                  </span>
                                  {qty > EPSILON && !isDummyCell && (
                                    <span className="text-[11px] font-semibold text-cyan-800">
                                      Activa
                                    </span>
                                  )}
                                  {qty > EPSILON && isDummyCell && (
                                    <span className="text-[11px] font-semibold text-amber-800">
                                      Ficticio
                                    </span>
                                  )}
                                  {isDegenerateBasic && (
                                    <span className="text-[11px] font-semibold text-indigo-800">
                                      Básica (0 u)
                                    </span>
                                  )}
                                  {activeMethod === 'optimal' &&
                                    !isBasic &&
                                    reducedCost !== null && (
                                      <span
                                        className={`text-[11px] font-mono tabular-nums ${
                                          isAltOptima
                                            ? 'font-bold text-cyan-800'
                                            : 'text-slate-500'
                                        }`}
                                      >
                                        Δ={fmt(reducedCost)}
                                      </span>
                                    )}
                                </div>

                                <div className="mt-1.5">
                                  {qty > EPSILON ? (
                                    <>
                                      <div className="text-lg font-mono tabular-nums font-bold text-[#0B1F3A]">
                                        {fmt(qty)}{' '}
                                        <span className="text-xs font-medium text-slate-600">
                                          u
                                        </span>
                                      </div>
                                      <div className="text-xs font-mono tabular-nums font-medium text-cyan-900">
                                        Subtotal: ${fmt(subtotal)} MXN
                                      </div>
                                    </>
                                  ) : isDegenerateBasic ? (
                                    <div className="text-sm font-mono tabular-nums font-semibold text-indigo-900">
                                      0 u (degenerada)
                                    </div>
                                  ) : (
                                    <div className="text-sm font-mono tabular-nums text-slate-300">
                                      0 u
                                      {isAltOptima && (
                                        <span className="block text-[11px] font-sans font-medium text-cyan-800">
                                          Óptimo alternativo
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </td>
                            );
                          })}

                          <td className="py-3 px-3.5 text-right font-mono tabular-nums font-semibold text-slate-800 bg-sky-50/50">
                            {fmt(balanced.supply[i])} u
                          </td>

                          {activeMethod === 'optimal' && (
                            <td className="py-3 px-3.5 text-right font-mono tabular-nums font-semibold text-[#0B1F3A] bg-sky-50/50 border-l border-slate-200">
                              {fmt(optimal.finalU[i])}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>

                  <tfoot>
                    <tr className="bg-cyan-50/60 border-t border-slate-200">
                      <th className="text-left font-semibold text-[#0B1F3A] py-2.5 px-3.5 border-r border-slate-200">
                        Demanda
                      </th>
                      {balanced.demand.map((d, j) => (
                        <td
                          key={j}
                          className="py-2.5 px-3 text-center font-mono tabular-nums font-semibold text-slate-800 border-r border-slate-200"
                        >
                          {fmt(d)} u
                        </td>
                      ))}
                      <td className="py-2.5 px-3.5 text-right font-mono tabular-nums font-bold text-[#0B1F3A] bg-slate-100">
                        {fmt(balanced.supply.reduce((a, b) => a + b, 0))} u
                      </td>
                      {activeMethod === 'optimal' && (
                        <td className="py-2.5 px-3.5 bg-slate-100 border-l border-slate-200" />
                      )}
                    </tr>

                    {activeMethod === 'optimal' && (
                      <tr className="bg-slate-100 border-t border-slate-200">
                        <th className="text-left font-semibold text-[#0B1F3A] py-2.5 px-3.5 border-r border-slate-200">
                          v_j (MODI)
                        </th>
                        {optimal.finalV.map((vj, j) => (
                          <td
                            key={j}
                            className="py-2.5 px-3 text-center font-mono tabular-nums font-semibold text-[#0B1F3A] border-r border-slate-200"
                          >
                            {fmt(vj)}
                          </td>
                        ))}
                        <td className="py-2.5 px-3.5 bg-slate-100" colSpan={2} />
                      </tr>
                    )}
                  </tfoot>
                </table>
              </div>

              {hasDegenerateInActiveView && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-indigo-50/75 border border-indigo-200 text-xs sm:text-sm text-indigo-950">
                  <Info className="w-4 h-4 text-indigo-700 shrink-0 mt-0.5" />
                  <span>
                    Esta matriz incluye una <strong>asignación básica degenerada (0 u)</strong> para mantener{' '}
                    <span className="font-mono">m + n − 1 = {m + n - 1}</span> celdas básicas; no representa un envío físico real.
                  </span>
                </div>
              )}

              {activeMethod === 'optimal' && (
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-600">
                  <span className="font-semibold text-[#0B1F3A]">Certificado MODI:</span>
                  <span className="inline-flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    Oferta y demanda cubiertas (
                    {optimal.verification.supplySatisfied &&
                    optimal.verification.demandSatisfied
                      ? 'Sí'
                      : 'No'}
                    )
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    Base conexa ({optimal.verification.basicCellCount}/{m + n - 1})
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    Costos reducidos Δ_ij ≥ 0 (
                    {optimal.verification.allReducedCostsNonNegative
                      ? 'Verificado'
                      : 'Pendiente'}
                    )
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
