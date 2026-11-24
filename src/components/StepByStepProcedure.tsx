import { Check, Info } from 'lucide-react';
import React, { useState } from 'react';
import { EPSILON } from '../math/balance';
import { BalancedProblem, MethodResult, OptimalResult } from '../math/types';

interface StepByStepProcedureProps {
  balanced: BalancedProblem;
  leastCost: MethodResult;
  vogel: MethodResult;
  optimal: OptimalResult;
}

type ProcedureTab = 'least_cost' | 'vogel' | 'optimal';

function fmt(n: number): string {
  return Number.isInteger(n)
    ? n.toLocaleString('es-MX')
    : n.toLocaleString('es-MX', { maximumFractionDigits: 4 });
}

export const StepByStepProcedureContent: React.FC<StepByStepProcedureProps> = ({
  balanced,
  leastCost,
  vogel,
  optimal,
}) => {
  const [activeMethod, setActiveMethod] = useState<ProcedureTab>('least_cost');

  const leastCostDegenerateSteps = leastCost.steps.filter((s) => s.quantity <= EPSILON);
  const vogelDegenerateSteps = vogel.steps.filter((s) => s.quantity <= EPSILON);

  return (
    <div className="space-y-6">
            {/* Selector de método dentro del procedimiento */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div
                role="tablist"
                aria-label="Seleccionar procedimiento por método"
                className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg"
              >
                {(
                  [
                    {
                      id: 'least_cost',
                      label: `1. Costo Mínimo (${leastCost.steps.length} pasos)`,
                    },
                    {
                      id: 'vogel',
                      label: `2. Aproximación de Vogel (${vogel.steps.length} pasos)`,
                    },
                    {
                      id: 'optimal',
                      label: `3. Método MODI (${optimal.iterations.length} iter.)`,
                    },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={activeMethod === tab.id}
                    onClick={() => setActiveMethod(tab.id)}
                    className={`px-3.5 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      activeMethod === tab.id
                        ? 'bg-[#0B1F3A] text-white shadow-xs'
                        : 'text-slate-700 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="text-xs sm:text-sm font-mono tabular-nums text-slate-600">
                Total del método:{' '}
                <strong className="text-[#0B1F3A] text-base">
                  $
                  {fmt(
                    activeMethod === 'least_cost'
                      ? leastCost.totalCost
                      : activeMethod === 'vogel'
                      ? vogel.totalCost
                      : optimal.totalCost
                  )}{' '}
                  MXN
                </strong>
              </div>
            </div>

            {/* 1. PROCEDIMIENTO DE COSTO MÍNIMO */}
            {activeMethod === 'least_cost' && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700 space-y-1">
                  <div className="font-bold text-[#0B1F3A]">
                    Regla del Método de Costo Mínimo
                  </div>
                  <p>
                    En cada iteración se localiza la celda activa con menor costo unitario{' '}
                    <span className="font-mono text-[#0B1F3A]">c_ij</span>, se asigna{' '}
                    <span className="font-mono text-[#0B1F3A]">
                      x_ij = mín(oferta_i, demanda_j)
                    </span>{' '}
                    y se descuenta esa cantidad de la oferta y demanda restantes antes de cerrar la fila o columna satisfecha.
                  </p>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr className="bg-[#0B1F3A] text-white">
                        <th className="text-left py-2.5 px-3 font-semibold">Iteración</th>
                        <th className="text-left py-2.5 px-3 font-semibold">Celda elegida</th>
                        <th className="text-right py-2.5 px-3 font-semibold">Costo u.</th>
                        <th className="text-right py-2.5 px-3 font-semibold">Asignación</th>
                        <th className="text-left py-2.5 px-3 font-semibold">
                          Oferta y demanda restante
                        </th>
                        <th className="text-right py-2.5 px-3 font-semibold">Costo acumulado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {leastCost.steps.map((step) => {
                        const isDegenerate = step.quantity <= EPSILON;
                        return (
                          <tr
                            key={step.stepNumber}
                            className={`align-top ${
                              isDegenerate ? 'bg-indigo-50/45' : 'hover:bg-slate-50/60'
                            }`}
                          >
                            <td className="py-3 px-3 font-mono tabular-nums font-semibold text-[#0B1F3A]">
                              #{step.stepNumber}
                            </td>
                            <td className="py-3 px-3">
                              <div className="font-semibold text-slate-900">
                                {step.originName} → {step.destinationName}
                              </div>
                              <div className="mt-0.5 text-xs text-slate-500">
                                {step.crossedOut.description}
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-800">
                              ${fmt(step.unitCost)}
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums">
                              <div
                                className={`font-bold ${
                                  isDegenerate ? 'text-indigo-800' : 'text-cyan-800'
                                }`}
                              >
                                {isDegenerate ? '0 u (Básica degenerada)' : `${fmt(step.quantity)} u`}
                              </div>
                              <div className="text-xs text-slate-500">
                                mín({fmt(step.cellSupplyBefore)}, {fmt(step.cellDemandBefore)})
                              </div>
                            </td>
                            <td className="py-3 px-3 font-mono tabular-nums text-xs text-slate-700 space-y-1">
                              <div>
                                <span className="text-slate-500">{step.originName}:</span>{' '}
                                {fmt(step.cellSupplyBefore)} →{' '}
                                <strong className="text-slate-900">
                                  {fmt(step.cellSupplyAfter)} u
                                </strong>
                              </div>
                              <div>
                                <span className="text-slate-500">{step.destinationName}:</span>{' '}
                                {fmt(step.cellDemandBefore)} →{' '}
                                <strong className="text-slate-900">
                                  {fmt(step.cellDemandAfter)} u
                                </strong>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums">
                              <div className="font-bold text-[#0B1F3A]">
                                ${fmt(step.cumulativeCostAfter)}
                              </div>
                              <div className="text-xs text-slate-500">
                                +${fmt(step.stepCost)}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {leastCostDegenerateSteps.length > 0 && (
                  <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-indigo-50/75 border border-indigo-200 text-xs sm:text-sm text-indigo-950">
                    <Info className="w-4 h-4 text-indigo-700 shrink-0 mt-0.5" />
                    <span>
                      <strong>Nota sobre asignación de 0 unidades:</strong>{' '}
                      {leastCostDegenerateSteps
                        .map((s) => `Paso #${s.stepNumber} (${s.originName} → ${s.destinationName})`)
                        .join(', ')}{' '}
                      corresponde a una asignación básica degenerada utilizada para mantener la estructura matemática de la solución (<span className="font-mono">m + n − 1</span> celdas básicas) y no representa un envío real ni una ruta activa.
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* 2. PROCEDIMIENTO DE VOGEL */}
            {activeMethod === 'vogel' && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700 space-y-1">
                  <div className="font-bold text-[#0B1F3A]">
                    Fórmula y criterio de Aproximación de Vogel (VAM)
                  </div>
                  <p>
                    Para cada fila y columna activa se calcula su penalización{' '}
                    <span className="font-mono text-[#0B1F3A]">P = c_(2) − c_(1)</span>{' '}
                    (diferencia entre los dos menores costos unitarios disponibles). Se selecciona la línea con mayor penalización y se asigna en su celda más barata.
                  </p>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr className="bg-[#0B1F3A] text-white">
                        <th className="text-left py-2.5 px-3 font-semibold">Iter.</th>
                        <th className="text-left py-2.5 px-3 font-semibold">
                          Penalizaciones (Filas / Columnas)
                        </th>
                        <th className="text-left py-2.5 px-3 font-semibold">
                          Penalización elegida
                        </th>
                        <th className="text-left py-2.5 px-3 font-semibold">Celda elegida</th>
                        <th className="text-right py-2.5 px-3 font-semibold">Asignación</th>
                        <th className="text-left py-2.5 px-3 font-semibold">Restante</th>
                        <th className="text-right py-2.5 px-3 font-semibold">Acumulado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {vogel.steps.map((step) => {
                        const isDegenerate = step.quantity <= EPSILON;
                        return (
                          <tr
                            key={step.stepNumber}
                            className={`align-top ${
                              isDegenerate ? 'bg-indigo-50/45' : 'hover:bg-slate-50/60'
                            }`}
                          >
                            <td className="py-3 px-3 font-mono tabular-nums font-semibold text-[#0B1F3A]">
                              #{step.stepNumber}
                            </td>
                            <td className="py-3 px-3 font-mono text-xs text-slate-700 space-y-1 min-w-[215px]">
                              <div>
                                <span className="text-slate-500">Filas:</span>{' '}
                                {step.rowPenalties
                                  ? step.rowPenalties
                                      .map((p, idx) =>
                                        `${balanced.origins[idx]}: ${p === null ? '×' : fmt(p)}`
                                      )
                                      .join(' · ')
                                  : '—'}
                              </div>
                              <div>
                                <span className="text-slate-500">Cols:</span>{' '}
                                {step.colPenalties
                                  ? step.colPenalties
                                      .map((p, idx) =>
                                        `${balanced.destinations[idx]}: ${p === null ? '×' : fmt(p)}`
                                      )
                                      .join(' · ')
                                  : '—'}
                              </div>
                            </td>
                            <td className="py-3 px-3 text-slate-800">
                              {step.selectedPenalty?.kind === 'single_line' ? (
                                <span className="text-xs text-slate-600">
                                  Línea única restante ({step.selectedPenalty.lineName})
                                </span>
                              ) : step.selectedPenalty ? (
                                <div>
                                  <div className="font-semibold text-slate-900">
                                    {step.selectedPenalty.kind === 'row' ? 'Fila' : 'Columna'}{' '}
                                    {step.selectedPenalty.lineName}
                                  </div>
                                  <div className="text-xs font-mono tabular-nums text-cyan-800 font-semibold">
                                    P = {fmt(step.selectedPenalty.penalty ?? 0)}
                                  </div>
                                </div>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="py-3 px-3">
                              <div className="font-semibold text-slate-900">
                                {step.originName} → {step.destinationName}
                              </div>
                              <div className="text-xs font-mono tabular-nums text-slate-500">
                                Costo: ${fmt(step.unitCost)}/u
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums">
                              <div
                                className={`font-bold ${
                                  isDegenerate ? 'text-indigo-800' : 'text-cyan-800'
                                }`}
                              >
                                {isDegenerate ? '0 u (Básica degenerada)' : `${fmt(step.quantity)} u`}
                              </div>
                              <div className="text-xs text-slate-500">
                                +${fmt(step.stepCost)}
                              </div>
                            </td>
                            <td className="py-3 px-3 font-mono tabular-nums text-xs text-slate-700 space-y-0.5">
                              <div>
                                {step.originName}: {fmt(step.cellSupplyAfter)} u
                              </div>
                              <div>
                                {step.destinationName}: {fmt(step.cellDemandAfter)} u
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-[#0B1F3A]">
                              ${fmt(step.cumulativeCostAfter)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {vogelDegenerateSteps.length > 0 && (
                  <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-indigo-50/75 border border-indigo-200 text-xs sm:text-sm text-indigo-950">
                    <Info className="w-4 h-4 text-indigo-700 shrink-0 mt-0.5" />
                    <span>
                      <strong>Nota sobre asignación de 0 unidades:</strong>{' '}
                      {vogelDegenerateSteps
                        .map((s) => `Paso #${s.stepNumber} (${s.originName} → ${s.destinationName})`)
                        .join(', ')}{' '}
                      corresponde a una asignación básica degenerada utilizada para mantener la estructura matemática de la solución (<span className="font-mono">m + n − 1</span> celdas básicas) y no representa un envío real ni una ruta activa.
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* 3. PROCEDIMIENTO DE MODI */}
            {activeMethod === 'optimal' && (
              <div className="space-y-5">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700 space-y-1.5">
                  <div className="font-bold text-[#0B1F3A]">
                    Fórmulas del Método de los Multiplicadores (MODI / Stepping-Stone)
                  </div>
                  <p>
                    1) Multiplicadores duales: fijando{' '}
                    <span className="font-mono text-[#0B1F3A]">u_1 = 0</span>, se resuelve{' '}
                    <span className="font-mono text-[#0B1F3A]">u_i + v_j = c_ij</span> para todas las celdas básicas.
                  </p>
                  <p>
                    2) Costos reducidos (índices de mejora): para cada celda no básica se calcula{' '}
                    <span className="font-mono text-[#0B1F3A]">
                      Δ_ij = c_ij − (u_i + v_j)
                    </span>
                    . Si existe <span className="font-mono text-[#0B1F3A]">Δ_ij &lt; 0</span>, esa celda entra por un ciclo cerrado de ajuste con cantidad{' '}
                    <span className="font-mono text-[#0B1F3A]">θ = mín(x_ij⁻)</span>.
                  </p>
                </div>

                {/* Iteraciones reales instrumentadas de MODI */}
                <div className="space-y-4">
                  {optimal.iterations.map((iter) => {
                    const isOptimalIter = iter.enteringCell === null;
                    return (
                      <div
                        key={iter.iteration}
                        className="border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
                          <div className="font-bold text-[#0B1F3A]">
                            Iteración #{iter.iteration}{' '}
                            <span className="text-sm font-normal text-slate-500">
                              ·{' '}
                              {isOptimalIter
                                ? 'Prueba de optimalidad final'
                                : 'Pivote de mejora Stepping-Stone'}
                            </span>
                          </div>
                          <div className="font-mono tabular-nums text-sm text-slate-800">
                            Costo total:{' '}
                            <strong>${fmt(iter.totalCostBefore)}</strong>
                            {!isOptimalIter && (
                              <>
                                {' '}
                                →{' '}
                                <strong className="text-cyan-800">
                                  ${fmt(iter.totalCostAfter)} MXN
                                </strong>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                          {/* Matriz de potenciales u_i, v_j y costos reducidos Δ_ij */}
                          <div className="xl:col-span-7 overflow-x-auto">
                            <table className="w-full border-collapse text-xs border border-slate-200 rounded-lg overflow-hidden">
                              <thead>
                                <tr className="bg-[#0B1F3A] text-white">
                                  <th className="text-left py-2 px-2.5 border-r border-slate-700">
                                    Origen \ Destino
                                  </th>
                                  {balanced.destinations.map((dest, j) => (
                                    <th
                                      key={j}
                                      className="text-center py-2 px-2 border-r border-slate-700 font-semibold"
                                    >
                                      {dest}
                                    </th>
                                  ))}
                                  <th className="text-right py-2 px-2.5 bg-[#13315C] font-semibold">
                                    u_i
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200">
                                {balanced.origins.map((origin, i) => (
                                  <tr key={i}>
                                    <th
                                      scope="row"
                                      className="text-left py-2 px-2.5 bg-slate-50 border-r border-slate-200 font-semibold text-[#0B1F3A]"
                                    >
                                      {origin}
                                    </th>
                                    {balanced.destinations.map((_, j) => {
                                      const isBasic = iter.basicMaskBefore[i][j];
                                      const allocVal = iter.allocationsBefore[i][j];
                                      const delta = iter.reducedCosts[i][j];
                                      const isEntering =
                                        iter.enteringCell?.row === i &&
                                        iter.enteringCell?.col === j;
                                      const cycleNode = iter.cycle.find(
                                        (n) => n.row === i && n.col === j
                                      );

                                      return (
                                        <td
                                          key={j}
                                          className={`py-2 px-2 border-r border-slate-200 font-mono tabular-nums ${
                                            isEntering
                                              ? 'bg-red-50/75'
                                              : isBasic
                                              ? 'bg-cyan-50/55'
                                              : 'bg-white'
                                          }`}
                                        >
                                          <div className="flex items-center justify-between gap-1 text-[11px] text-slate-500">
                                            <span>c=${fmt(balanced.costs[i][j])}</span>
                                            {cycleNode && (
                                              <span
                                                className={`font-bold ${
                                                  cycleNode.sign === '+'
                                                    ? 'text-emerald-700'
                                                    : 'text-amber-700'
                                                }`}
                                              >
                                                [{cycleNode.sign}θ]
                                              </span>
                                            )}
                                          </div>
                                          {isBasic ? (
                                            <div className="mt-0.5 text-[#0B1F3A] font-semibold">
                                              Básica: {fmt(allocVal)} u
                                            </div>
                                          ) : (
                                            <div
                                              className={`mt-0.5 font-semibold ${
                                                delta !== null && delta < -EPSILON
                                                  ? 'text-red-700'
                                                  : delta !== null && Math.abs(delta) <= EPSILON
                                                  ? 'text-cyan-800'
                                                  : 'text-slate-700'
                                              }`}
                                            >
                                              Δ = {delta === null ? '—' : fmt(delta)}
                                            </div>
                                          )}
                                        </td>
                                      );
                                    })}
                                    <td className="py-2 px-2.5 text-right font-mono tabular-nums font-semibold text-[#0B1F3A] bg-sky-50/60">
                                      {fmt(iter.u[i])}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="bg-slate-100 border-t border-slate-200 font-mono tabular-nums">
                                  <th className="text-left py-2 px-2.5 border-r border-slate-200 font-semibold text-[#0B1F3A]">
                                    v_j
                                  </th>
                                  {iter.v.map((vj, j) => (
                                    <td
                                      key={j}
                                      className="py-2 px-2 text-center border-r border-slate-200 font-semibold text-[#0B1F3A]"
                                    >
                                      {fmt(vj)}
                                    </td>
                                  ))}
                                  <td className="py-2 px-2.5" />
                                </tr>
                              </tfoot>
                            </table>
                          </div>

                          {/* Detalle de transición de la iteración */}
                          <div className="xl:col-span-5 space-y-2.5 text-xs sm:text-sm text-slate-700">
                            <p className="text-slate-800 leading-relaxed">{iter.summary}</p>

                            {!isOptimalIter && iter.enteringCell && iter.leavingCell && (
                              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2 text-xs">
                                <div>
                                  <span className="font-semibold text-[#0B1F3A]">
                                    Celda entrante:
                                  </span>{' '}
                                  {balanced.origins[iter.enteringCell.row]} →{' '}
                                  {balanced.destinations[iter.enteringCell.col]} (
                                  <span className="font-mono text-red-700 font-semibold">
                                    Δ = {fmt(iter.enteringCell.delta)}
                                  </span>
                                  )
                                </div>

                                <div>
                                  <span className="font-semibold text-[#0B1F3A]">
                                    Ciclo cerrado de mejora:
                                  </span>
                                  <div className="mt-1 font-mono text-slate-700 leading-relaxed">
                                    {iter.cycle
                                      .map(
                                        (n) =>
                                          `${n.sign}(${balanced.origins[n.row]}→${balanced.destinations[n.col]}: ${fmt(n.currentAllocation)}u)`
                                      )
                                      .join('  →  ')}
                                  </div>
                                </div>

                                <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono">
                                  <span>
                                    <strong className="font-sans text-[#0B1F3A]">θ =</strong>{' '}
                                    {fmt(iter.theta)} u
                                  </span>
                                  <span>
                                    <strong className="font-sans text-[#0B1F3A]">Sale:</strong>{' '}
                                    {balanced.origins[iter.leavingCell.row]} →{' '}
                                    {balanced.destinations[iter.leavingCell.col]}
                                  </span>
                                  <span>
                                    <strong className="font-sans text-[#0B1F3A]">
                                      Variación:
                                    </strong>{' '}
                                    {fmt(iter.enteringCell.delta)} × {fmt(iter.theta)} ={' '}
                                    {fmt(iter.enteringCell.delta * iter.theta)} MXN
                                  </span>
                                </div>
                              </div>
                            )}

                            {isOptimalIter && (
                              <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50/80 border border-emerald-200 text-xs sm:text-sm text-emerald-900">
                                <Check className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                                <span>
                                  Condición de optimalidad cumplida: todos los valores Δ_ij son ≥ 0.
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Explicación didáctica: por qué es óptima y cuándo hay óptimos alternativos */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                    <div className="text-sm font-bold text-[#0B1F3A]">
                      ¿Por qué esta solución es óptima?
                    </div>
                    <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                      Cada costo reducido{' '}
                      <span className="font-mono">Δ_ij = c_ij − (u_i + v_j)</span> indica cuánto cambiaría el costo total por cada unidad enviada en una ruta inactiva. Como todas las rutas no utilizadas tienen{' '}
                      <span className="font-mono">Δ_ij ≥ 0</span>, ninguna reasignación puede reducir el costo de{' '}
                      <strong className="font-mono">${fmt(optimal.totalCost)} MXN</strong>.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                    <div className="text-sm font-bold text-[#0B1F3A]">
                      ¿Cuándo existen soluciones óptimas alternativas?
                    </div>
                    <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                      Cuando una celda no básica tiene{' '}
                      <span className="font-mono">Δ_ij = 0</span>, introducirla al ciclo de ajuste redistribuye unidades sin aumentar ni disminuir el costo total.{' '}
                      {optimal.hasAlternativeOptima ? (
                        <span className="inline-flex items-baseline gap-1 font-medium text-cyan-900">
                          <Info className="w-3.5 h-3.5 text-cyan-700 shrink-0 self-center" />
                          En este modelo existe óptimo alternativo al activar{' '}
                          {optimal.alternativeCells
                            .map((c) => `${c.originName} → ${c.destinationName}`)
                            .join(', ')}.
                        </span>
                      ) : (
                        <span>
                          En este caso todas las celdas no básicas cumplen{' '}
                          <span className="font-mono">Δ_ij &gt; 0</span>, por lo que la solución óptima es única.
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}
    </div>
  );
};
