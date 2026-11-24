import { ChevronDown, ChevronUp, Sigma } from 'lucide-react';
import React, { useState } from 'react';
import { EPSILON } from '../math/balance';
import { BalancedProblem, TransportationProblem } from '../math/types';

interface MathematicalFormulationCardProps {
  problem: TransportationProblem;
  balanced: BalancedProblem | null;
  hasErrors: boolean;
}

function fmt(n: number): string {
  return Number.isInteger(n)
    ? n.toLocaleString('es-MX')
    : n.toLocaleString('es-MX', { maximumFractionDigits: 4 });
}

function varSub(i: number, j: number, useComma: boolean): string {
  return useComma ? `${i + 1},${j + 1}` : `${i + 1}${j + 1}`;
}

export const MathematicalFormulationCard: React.FC<MathematicalFormulationCardProps> = ({
  problem,
  balanced,
  hasErrors,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  const m = problem.origins.length;
  const n = problem.destinations.length;
  const useComma = m >= 10 || n >= 10;

  const totalSupply = problem.supply.reduce(
    (acc, val) => (Number.isFinite(val) ? acc + val : acc),
    0
  );
  const totalDemand = problem.demand.reduce(
    (acc, val) => (Number.isFinite(val) ? acc + val : acc),
    0
  );
  const diff = totalSupply - totalDemand;

  const supplyOperator = diff > EPSILON ? '≤' : '=';
  const demandOperator = diff < -EPSILON ? '≤' : '=';

  return (
    <section
      aria-label="Formulación Matemática del Modelo de Transporte"
      className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-[#0B1F3A] text-cyan-300 shrink-0 mt-0.5">
            <Sigma className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[#0B1F3A]">
              Formulación Matemática del Modelo de Transporte
            </h2>
            <p className="text-xs sm:text-sm text-slate-600">
              Representación algebraica actualizada en tiempo real con los datos de tu matriz ({m}{' '}
              {m === 1 ? 'almacén' : 'almacenes'} × {n}{' '}
              {n === 1 ? 'sucursal' : 'sucursales'}).
            </p>
          </div>
        </div>

        <button
          type="button"
          aria-expanded={isExpanded}
          aria-controls="formulacion-matematica-contenido"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="min-h-[38px] inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium text-[#0B1F3A] bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-cyan-600"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-4 h-4 text-slate-600 shrink-0" />
              Contraer formulación
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4 text-slate-600 shrink-0" />
              Ver formulación
            </>
          )}
        </button>
      </div>

      {isExpanded && (
        <div
          id="formulacion-matematica-contenido"
          className="mt-5 pt-5 border-t border-slate-200 space-y-4"
        >
          {hasErrors ? (
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs sm:text-sm text-slate-600">
              Corrige las celdas inválidas en la matriz superior para generar la función objetivo y el sistema completo de restricciones.
            </div>
          ) : (
            <>
              {/* a) Variables de decisión */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-cyan-800">
                  a) Variables de decisión
                </div>
                <p className="text-xs sm:text-sm text-slate-800 leading-relaxed">
                  <span className="font-mono font-bold text-[#0B1F3A]">
                    X<sub>i,j</sub>
                  </span>{' '}
                  = unidades de producto enviadas desde el almacén{' '}
                  <span className="font-mono font-semibold text-[#0B1F3A]">i</span> hasta la sucursal{' '}
                  <span className="font-mono font-semibold text-[#0B1F3A]">j</span>.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs text-slate-600">
                  <div>
                    <span className="font-semibold text-[#0B1F3A]">Índices de almacenes (i):</span>{' '}
                    {problem.origins
                      .map((o, i) => `${i + 1} = ${o.trim() || `Almacén ${i + 1}`}`)
                      .join(' · ')}
                  </div>
                  <div>
                    <span className="font-semibold text-[#0B1F3A]">Índices de sucursales (j):</span>{' '}
                    {problem.destinations
                      .map((d, j) => `${j + 1} = ${d.trim() || `Sucursal ${j + 1}`}`)
                      .join(' · ')}
                  </div>
                </div>
              </div>

              {/* b) Función Objetivo */}
              <div className="p-4 rounded-xl bg-[#0B1F3A] text-white space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
                  b) Función Objetivo (Minimización de Costos Totales)
                </div>
                <div className="text-xs text-slate-300 font-mono">
                  Minimizar Z = Σ<sub>i=1..{m}</sub> Σ<sub>j=1..{n}</sub> c<sub>i,j</sub> · X<sub>i,j</sub>
                </div>
                <div className="p-3 rounded-lg bg-white/10 border border-white/15 font-mono tabular-nums text-xs sm:text-sm text-cyan-100 leading-relaxed overflow-x-auto">
                  <span className="font-bold text-white">Minimizar Z = </span>
                  {problem.origins.flatMap((_, i) =>
                    problem.destinations.map((__, j) => {
                      const cost = problem.costs[i][j];
                      const isFirst = i === 0 && j === 0;
                      return (
                        <React.Fragment key={`obj-${i}-${j}`}>
                          {!isFirst && <span className="text-slate-300"> + </span>}
                          <span>
                            {fmt(cost)}·X<sub>{varSub(i, j, useComma)}</sub>
                          </span>
                        </React.Fragment>
                      );
                    })
                  )}
                </div>
              </div>

              {/* c) Restricciones de Oferta, Demanda y No Negatividad */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Restricciones de Oferta */}
                <div className="p-4 rounded-xl bg-sky-50/55 border border-sky-200 space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-sky-900">
                    c.1) Restricciones de Oferta (por almacén)
                  </div>
                  <ul className="space-y-1.5 font-mono tabular-nums text-xs text-slate-800">
                    {problem.origins.map((origin, i) => (
                      <li
                        key={`sup-${i}`}
                        className="p-2 rounded-md bg-white border border-sky-200/80 overflow-x-auto whitespace-nowrap"
                      >
                        <span className="font-sans font-semibold text-[#0B1F3A] mr-2">
                          {origin.trim() || `Almacén ${i + 1}`}:
                        </span>
                        {problem.destinations.map((_, j) => (
                          <React.Fragment key={`sup-${i}-${j}`}>
                            {j > 0 && ' + '}
                            X<sub>{varSub(i, j, useComma)}</sub>
                          </React.Fragment>
                        ))}{' '}
                        <span className="font-bold text-sky-900">
                          {supplyOperator} {fmt(problem.supply[i])}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Restricciones de Demanda */}
                <div className="p-4 rounded-xl bg-cyan-50/55 border border-cyan-200 space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-cyan-900">
                    c.2) Restricciones de Demanda (por sucursal)
                  </div>
                  <ul className="space-y-1.5 font-mono tabular-nums text-xs text-slate-800">
                    {problem.destinations.map((dest, j) => (
                      <li
                        key={`dem-${j}`}
                        className="p-2 rounded-md bg-white border border-cyan-200/80 overflow-x-auto whitespace-nowrap"
                      >
                        <span className="font-sans font-semibold text-[#0B1F3A] mr-2">
                          {dest.trim() || `Sucursal ${j + 1}`}:
                        </span>
                        {problem.origins.map((_, i) => (
                          <React.Fragment key={`dem-${i}-${j}`}>
                            {i > 0 && ' + '}
                            X<sub>{varSub(i, j, useComma)}</sub>
                          </React.Fragment>
                        ))}{' '}
                        <span className="font-bold text-cyan-900">
                          {demandOperator} {fmt(problem.demand[j])}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* No negatividad + nota de equilibrio */}
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-slate-700">
                <div>
                  <strong className="text-[#0B1F3A]">c.3) Restricción de No Negatividad:</strong>{' '}
                  <span className="font-mono font-semibold text-[#0B1F3A]">
                    X<sub>i,j</sub> ≥ 0
                  </span>{' '}
                  para todo <span className="font-mono">i = 1..{m}</span>,{' '}
                  <span className="font-mono">j = 1..{n}</span>.
                </div>
                {balanced && balanced.balanceStatus !== 'balanced' && (
                  <div className="text-amber-900 font-medium">
                    {balanced.balanceStatus === 'dummy_destination'
                      ? `Para resolver con MODI se convierte en igualdad agregando Destino Ficticio (+${fmt(balanced.dummyAmount)} u, costo $0).`
                      : `Para resolver con MODI se convierte en igualdad agregando Origen Ficticio (+${fmt(balanced.dummyAmount)} u, costo $0).`}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
};
