import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Plus,
  Scale,
  Store,
  Trash2,
} from 'lucide-react';
import React from 'react';
import { EPSILON } from '../math/balance';
import { ACADEMIC_PRESETS } from '../math/presets';
import { getZeroRealFlowWarning } from '../math/sensitivity';
import { BalancedProblem, TransportationProblem, ValidationError } from '../math/types';

export interface DraftMatrixState {
  origins: string[];
  destinations: string[];
  supply: string[];
  demand: string[];
  costs: string[][];
}

export function problemToDraft(problem: TransportationProblem): DraftMatrixState {
  return {
    origins: [...problem.origins],
    destinations: [...problem.destinations],
    supply: problem.supply.map((v) => String(v)),
    demand: problem.demand.map((v) => String(v)),
    costs: problem.costs.map((row) => row.map((v) => String(v))),
  };
}

export function parseDraftToProblem(draft: DraftMatrixState): {
  problem: TransportationProblem;
  parseErrors: ValidationError[];
} {
  const parseErrors: ValidationError[] = [];

  const parseNonNeg = (raw: string, field: string, label: string): number => {
    const trimmed = raw.trim();
    if (trimmed === '') {
      parseErrors.push({ field, message: `${label} no puede quedar vacío.` });
      return NaN;
    }
    const num = Number(trimmed);
    if (!Number.isFinite(num) || num < 0) {
      parseErrors.push({ field, message: `${label} debe ser un número mayor o igual a 0.` });
      return NaN;
    }
    return num;
  };

  const supply = draft.supply.map((raw, i) =>
    parseNonNeg(raw, `supply.${i}`, `La oferta de ${draft.origins[i] || `Almacén ${i + 1}`}`)
  );
  const demand = draft.demand.map((raw, j) =>
    parseNonNeg(raw, `demand.${j}`, `La demanda de ${draft.destinations[j] || `Sucursal ${j + 1}`}`)
  );
  const costs = draft.costs.map((row, i) =>
    row.map((raw, j) =>
      parseNonNeg(
        raw,
        `costs.${i}.${j}`,
        `El costo (${draft.origins[i] || `A${i + 1}`} → ${draft.destinations[j] || `S${j + 1}`})`
      )
    )
  );

  return {
    problem: {
      origins: draft.origins,
      destinations: draft.destinations,
      supply,
      demand,
      costs,
    },
    parseErrors,
  };
}

interface MatrixEditorProps {
  draft: DraftMatrixState;
  selectedPresetId: string;
  balanced: BalancedProblem | null;
  errors: ValidationError[];
  onDraftChange: (next: DraftMatrixState) => void;
  onSelectPreset: (presetId: string) => void;
}

function fmt(n: number): string {
  return Number.isInteger(n)
    ? n.toLocaleString('es-MX')
    : n.toLocaleString('es-MX', { maximumFractionDigits: 2 });
}

export const MatrixEditor: React.FC<MatrixEditorProps> = ({
  draft,
  selectedPresetId,
  balanced,
  errors,
  onDraftChange,
  onSelectPreset,
}) => {
  const errorMap = new Map(errors.map((e) => [e.field, e.message]));

  const updateOriginName = (i: number, value: string) => {
    const origins = [...draft.origins];
    origins[i] = value;
    onDraftChange({ ...draft, origins });
  };

  const updateDestinationName = (j: number, value: string) => {
    const destinations = [...draft.destinations];
    destinations[j] = value;
    onDraftChange({ ...draft, destinations });
  };

  const updateSupply = (i: number, value: string) => {
    const supply = [...draft.supply];
    supply[i] = value;
    onDraftChange({ ...draft, supply });
  };

  const updateDemand = (j: number, value: string) => {
    const demand = [...draft.demand];
    demand[j] = value;
    onDraftChange({ ...draft, demand });
  };

  const updateCost = (i: number, j: number, value: string) => {
    const costs = draft.costs.map((row) => [...row]);
    costs[i][j] = value;
    onDraftChange({ ...draft, costs });
  };

  const addOrigin = () => {
    const idx = draft.origins.length;
    const letter = String.fromCharCode(65 + (idx % 26));
    const newLabel = idx < 26 ? `Almacén ${letter}` : `Almacén ${idx + 1}`;
    onDraftChange({
      ...draft,
      origins: [...draft.origins, newLabel],
      supply: [...draft.supply, '50'],
      costs: [...draft.costs, new Array(draft.destinations.length).fill('5')],
    });
  };

  const removeOrigin = (i: number) => {
    if (draft.origins.length <= 1) return;
    onDraftChange({
      ...draft,
      origins: draft.origins.filter((_, idx) => idx !== i),
      supply: draft.supply.filter((_, idx) => idx !== i),
      costs: draft.costs.filter((_, idx) => idx !== i),
    });
  };

  const addDestination = () => {
    const idx = draft.destinations.length + 1;
    onDraftChange({
      ...draft,
      destinations: [...draft.destinations, `Sucursal ${idx}`],
      demand: [...draft.demand, '50'],
      costs: draft.costs.map((row) => [...row, '5']),
    });
  };

  const removeDestination = (j: number) => {
    if (draft.destinations.length <= 1) return;
    onDraftChange({
      ...draft,
      destinations: draft.destinations.filter((_, idx) => idx !== j),
      demand: draft.demand.filter((_, idx) => idx !== j),
      costs: draft.costs.map((row) => row.filter((_, idx) => idx !== j)),
    });
  };

  const supplyTotal = draft.supply.reduce((acc, s) => {
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? acc + n : acc;
  }, 0);

  const demandTotal = draft.demand.reduce((acc, d) => {
    const n = Number(d);
    return Number.isFinite(n) && n >= 0 ? acc + n : acc;
  }, 0);

  const diffUnits = Math.abs(supplyTotal - demandTotal);
  const activePreset = ACADEMIC_PRESETS.find((p) => p.id === selectedPresetId);

  return (
    <section id="configuracion" className="scroll-mt-20">
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-7">
        {/* Encabezado de sección y controles de dimensión */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5 pb-6 border-b border-slate-200">
          <div className="max-w-2xl">
            <div className="text-xs font-semibold uppercase tracking-wider text-cyan-800">
              Paso 1 · Configuración
            </div>
            <h2 className="mt-1 text-xl sm:text-2xl font-bold text-[#0B1F3A]">
              Almacenes, sucursales y costos de transporte
            </h2>
            <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
              Define cuántas unidades puede enviar cada almacén (oferta), cuántas necesita cada sucursal (demanda) y cuánto cuesta transportar cada unidad. Todo se recalcula al instante.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={addOrigin}
              className="min-h-[40px] inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-[#0B1F3A] bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-cyan-600"
            >
              <Plus className="w-4 h-4 text-sky-700 shrink-0" />
              Agregar almacén
            </button>

            <button
              type="button"
              onClick={addDestination}
              className="min-h-[40px] inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-[#0B1F3A] bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-cyan-600"
            >
              <Plus className="w-4 h-4 text-cyan-700 shrink-0" />
              Agregar sucursal
            </button>
          </div>
        </div>

        {/* Selector rápido de escenarios académicos */}
        <div className="mt-5 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-lg">
            {ACADEMIC_PRESETS.map((preset) => {
              const isActive = selectedPresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onSelectPreset(preset.id)}
                  className={`min-h-[36px] px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-[#0B1F3A] text-white shadow-xs'
                      : 'text-slate-700 hover:text-slate-900 hover:bg-white/70'
                  }`}
                >
                  {preset.name}
                </button>
              );
            })}
            {selectedPresetId === 'custom' && (
              <span className="px-3 py-1.5 text-xs font-medium text-cyan-900 bg-cyan-100 rounded-md whitespace-nowrap">
                Datos personalizados
              </span>
            )}
          </div>

          <p className="text-xs text-slate-500">
            {activePreset
              ? activePreset.description
              : 'Escenario editado manualmente: los resultados se actualizan en tiempo real.'}
          </p>
        </div>

        {/* Indicadores claros de Oferta, Demanda y Balance con explicación breve */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="px-4 py-3 rounded-lg bg-sky-50/70 border border-sky-200/80">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-sky-950">
                <Building2 className="w-4 h-4 text-sky-700 shrink-0" />
                <span>Oferta total ({draft.origins.length} almacenes)</span>
              </div>
              <span className="font-mono tabular-nums text-base font-bold text-[#0B1F3A]">
                {fmt(supplyTotal)} u
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Unidades disponibles para enviar desde tus almacenes.
            </p>
          </div>

          <div className="px-4 py-3 rounded-lg bg-cyan-50/70 border border-cyan-200/80">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-cyan-950">
                <Store className="w-4 h-4 text-cyan-700 shrink-0" />
                <span>Demanda total ({draft.destinations.length} sucursales)</span>
              </div>
              <span className="font-mono tabular-nums text-base font-bold text-[#0B1F3A]">
                {fmt(demandTotal)} u
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Unidades solicitadas por cada punto de entrega.
            </p>
          </div>

          <div className="px-4 py-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <Scale className="w-4 h-4 text-slate-600 shrink-0" />
                <span>Balance</span>
              </div>
              <span
                className={`font-mono tabular-nums text-xs sm:text-sm font-bold ${
                  diffUnits <= EPSILON ? 'text-emerald-800' : 'text-amber-800'
                }`}
              >
                {diffUnits <= EPSILON
                  ? 'Equilibrado'
                  : supplyTotal > demandTotal
                  ? `Sobra oferta (+${fmt(diffUnits)} u)`
                  : `Falta oferta (-${fmt(diffUnits)} u)`}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              {diffUnits <= EPSILON
                ? 'La oferta cubre exactamente toda la demanda.'
                : 'Se agrega un nodo ficticio ($0/u) automáticamente para equilibrarlo.'}
            </p>
          </div>
        </div>

        {/* Guía rápida junto a los campos de captura */}
        <div className="mt-4 p-3.5 rounded-lg bg-slate-50 border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-600">
          <div className="flex items-start gap-2">
            <span className="w-3 h-3 rounded-xs bg-white border border-slate-300 inline-block shrink-0 mt-0.5" />
            <span>
              <strong className="text-slate-800">Costos unitarios ($):</strong> precio por enviar 1 unidad desde un almacén a una sucursal.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-3 h-3 rounded-xs bg-sky-100 border border-sky-300 inline-block shrink-0 mt-0.5" />
            <span>
              <strong className="text-slate-800">Oferta (columna derecha):</strong> capacidad máxima disponible en cada almacén.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-3 h-3 rounded-xs bg-cyan-100 border border-cyan-300 inline-block shrink-0 mt-0.5" />
            <span>
              <strong className="text-slate-800">Demanda (fila inferior):</strong> cantidad que necesita recibir cada sucursal.
            </span>
          </div>
        </div>

        {/* Matriz interactiva de costos, oferta y demanda */}
        <div className="mt-4 overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[#0B1F3A] text-white">
                <th className="text-left font-semibold py-3.5 px-3.5 min-w-[185px] border-r border-slate-700/70">
                  <div>Almacén \ Sucursal</div>
                  <div className="text-[11px] font-normal text-slate-300">
                    Edita nombres y tarifas ($/u)
                  </div>
                </th>
                {draft.destinations.map((dest, j) => (
                  <th key={j} className="py-2.5 px-2.5 min-w-[138px] border-r border-slate-700/70">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        aria-label={`Nombre de sucursal ${j + 1}`}
                        value={dest}
                        onChange={(e) => updateDestinationName(j, e.target.value)}
                        className="w-full px-2 py-1.5 text-xs sm:text-sm font-semibold text-white bg-white/10 border border-white/20 rounded-md focus:bg-white focus:text-slate-900 focus:border-cyan-400 focus:outline-none text-center transition-colors"
                      />
                      {draft.destinations.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeDestination(j)}
                          title={`Eliminar ${dest}`}
                          aria-label={`Eliminar ${dest}`}
                          className="p-1.5 text-slate-300 hover:text-red-300 hover:bg-white/10 rounded-md transition-colors cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </th>
                ))}
                <th className="text-right font-semibold py-3.5 px-3.5 min-w-[140px] bg-[#13315C]">
                  <div>Oferta (u)</div>
                  <div className="text-[11px] font-normal text-sky-200">
                    Disponible en almacén
                  </div>
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 bg-white">
              {draft.origins.map((origin, i) => (
                <tr key={i} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-2.5 px-3 bg-slate-50/70 border-r border-slate-200">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        aria-label={`Nombre de almacén ${i + 1}`}
                        value={origin}
                        onChange={(e) => updateOriginName(i, e.target.value)}
                        className="w-full px-2.5 py-1.5 text-sm font-semibold text-slate-900 bg-white border border-slate-200 rounded-md focus:border-cyan-600 focus:outline-none"
                      />
                      {draft.origins.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeOrigin(i)}
                          title={`Eliminar ${origin}`}
                          aria-label={`Eliminar ${origin}`}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>

                  {draft.destinations.map((_, j) => {
                    const hasError = errorMap.has(`costs.${i}.${j}`);
                    return (
                      <td key={j} className="py-2.5 px-2.5 border-r border-slate-200">
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-mono pointer-events-none">
                            $
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            aria-label={`Costo de ${origin} a ${draft.destinations[j]}`}
                            value={draft.costs[i]?.[j] ?? ''}
                            onChange={(e) => updateCost(i, j, e.target.value)}
                            className={`w-full pl-6 pr-2.5 py-2 text-right font-mono tabular-nums text-sm rounded-md border focus:outline-none transition-colors ${
                              hasError
                                ? 'border-red-500 bg-red-50 text-red-900'
                                : 'border-slate-200 bg-white text-slate-900 focus:border-cyan-600 focus:ring-2 focus:ring-cyan-500/20'
                            }`}
                          />
                        </div>
                      </td>
                    );
                  })}

                  <td className="py-2.5 px-3 bg-sky-50/70">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      aria-label={`Oferta de ${origin}`}
                      value={draft.supply[i] ?? ''}
                      onChange={(e) => updateSupply(i, e.target.value)}
                      className={`w-full px-2.5 py-2 text-right font-mono tabular-nums text-sm font-semibold rounded-md border focus:outline-none transition-colors ${
                        errorMap.has(`supply.${i}`)
                          ? 'border-red-500 bg-red-50 text-red-900'
                          : 'border-sky-300 bg-white text-[#0B1F3A] focus:border-sky-600 focus:ring-2 focus:ring-sky-500/20'
                      }`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>

            <tfoot>
              <tr className="border-t-2 border-cyan-200 bg-cyan-50/75">
                <th className="text-left font-semibold text-cyan-950 py-3 px-3.5 border-r border-cyan-200/80">
                  <div>Demanda (u)</div>
                  <div className="text-[11px] font-normal text-cyan-800">
                    Requerimiento sucursal
                  </div>
                </th>
                {draft.destinations.map((dest, j) => {
                  const hasError = errorMap.has(`demand.${j}`);
                  return (
                    <td key={j} className="py-2.5 px-2.5 border-r border-cyan-200/80">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        aria-label={`Demanda de ${dest}`}
                        value={draft.demand[j] ?? ''}
                        onChange={(e) => updateDemand(j, e.target.value)}
                        className={`w-full px-2.5 py-2 text-right font-mono tabular-nums text-sm font-semibold rounded-md border focus:outline-none transition-colors ${
                          hasError
                            ? 'border-red-500 bg-red-50 text-red-900'
                            : 'border-cyan-300 bg-white text-[#0B1F3A] focus:border-cyan-600 focus:ring-2 focus:ring-cyan-500/20'
                        }`}
                      />
                    </td>
                  );
                })}
                <td className="py-3 px-3.5 text-right font-mono tabular-nums text-xs bg-[#0B1F3A] text-white">
                  <div>Σ Oferta: {fmt(supplyTotal)} u</div>
                  <div className="text-cyan-300 mt-0.5">Σ Demanda: {fmt(demandTotal)} u</div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Estado de validación y balanceo automático */}
        <div className="mt-5">
          {errors.length > 0 ? (
            <div
              role="alert"
              className="flex items-start gap-3 p-4 rounded-lg bg-red-50 border border-red-200 text-red-900 text-sm"
            >
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Corrige los datos para calcular la solución:</p>
                <ul className="mt-1 list-disc list-inside space-y-0.5 text-red-800">
                  {errors.slice(0, 5).map((err, idx) => (
                    <li key={idx}>{err.message}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : balanced ? (
            balanced.balanceStatus === 'balanced' ? (
              <div className="flex items-center gap-3 text-sm text-emerald-900 bg-emerald-50/75 border border-emerald-200 rounded-lg px-4 py-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>
                  Problema balanceado: oferta total (
                  <strong className="font-mono tabular-nums">
                    {fmt(balanced.originalSupplyTotal)} u
                  </strong>
                  ) igual a demanda total (
                  <strong className="font-mono tabular-nums">
                    {fmt(balanced.originalDemandTotal)} u
                  </strong>
                  ). No requiere nodo ficticio.
                </span>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex items-start gap-3 text-sm text-amber-950 bg-amber-50/85 border border-amber-200 rounded-lg px-4 py-3">
                  <Scale className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <span>
                    {balanced.balanceStatus === 'dummy_destination' ? (
                      <>
                        <strong>Balanceo automático aplicado (Destino Ficticio):</strong> la oferta ({fmt(balanced.originalSupplyTotal)} u) supera a la demanda ({fmt(balanced.originalDemandTotal)} u). Se incorporó automáticamente la columna <strong>Destino Ficticio</strong> con demanda de{' '}
                        <strong className="font-mono tabular-nums">
                          {fmt(balanced.dummyAmount)} u
                        </strong>{' '}
                        y costo unitario <strong className="font-mono tabular-nums">$0 MXN</strong>.
                      </>
                    ) : (
                      <>
                        <strong>Balanceo automático aplicado (Origen Ficticio):</strong> la demanda ({fmt(balanced.originalDemandTotal)} u) supera a la oferta ({fmt(balanced.originalSupplyTotal)} u). Se incorporó automáticamente la fila <strong>Origen Ficticio</strong> con oferta de{' '}
                        <strong className="font-mono tabular-nums">
                          {fmt(balanced.dummyAmount)} u
                        </strong>{' '}
                        y costo unitario <strong className="font-mono tabular-nums">$0 MXN</strong>.
                      </>
                    )}
                  </span>
                </div>

                {(() => {
                  const zeroWarn = getZeroRealFlowWarning(
                    balanced.originalSupplyTotal,
                    balanced.originalDemandTotal
                  );
                  if (!zeroWarn) return null;
                  return (
                    <div
                      role="alert"
                      className="flex items-start gap-3 text-sm text-red-950 bg-red-50/85 border border-red-300 rounded-lg px-4 py-3"
                    >
                      <AlertTriangle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                      <span>{zeroWarn.message}</span>
                    </div>
                  );
                })()}
              </div>
            )
          ) : null}
        </div>
      </div>
    </section>
  );
};
