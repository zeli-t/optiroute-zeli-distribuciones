import {
  ChevronDown,
  ChevronUp,
  Info,
  RotateCcw,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { AltScenarioDraft } from '../hooks/useScenarioComparator';
import {
  buildManagerialDecisionAnalysis,
  evaluateUnbalancedRhsScenario,
} from '../math/sensitivity';
import {
  ScenarioComparisonResult,
  SensitivityScaffold,
  SolveResponse,
  TransportationProblem,
} from '../math/types';
import { StepByStepProcedureContent } from './StepByStepProcedure';

export type AnalysisPanelId =
  | 'step_by_step'
  | 'cost_sensitivity'
  | 'alternative_optima'
  | 'rhs_sensitivity'
  | 'shadow_prices'
  | 'scenario_comparator'
  | 'managerial';

interface AdvancedAnalysisSectionProps {
  problem: TransportationProblem;
  result: SolveResponse;
  sensitivity: SensitivityScaffold;
  originalSnapshot: TransportationProblem;
  altDraft: AltScenarioDraft;
  hasAltEdits: boolean;
  undoAltDraft: AltScenarioDraft | null;
  mainProblemChangedSinceSnapshot: boolean;
  altParseErrors: string[];
  invalidAltFields: Set<string>;
  scenarioComparison: ScenarioComparisonResult;
  onSyncComparatorFromMain: () => void;
  onRestoreAlternativeToOriginal: () => void;
  onUndoRestore: () => void;
  onUpdateAltSupply: (i: number, value: string) => void;
  onUpdateAltDemand: (j: number, value: string) => void;
  onUpdateAltCost: (i: number, j: number, value: string) => void;
}

const ALL_PANELS: AnalysisPanelId[] = [
  'step_by_step',
  'cost_sensitivity',
  'alternative_optima',
  'rhs_sensitivity',
  'shadow_prices',
  'scenario_comparator',
  'managerial',
];

function fmt(n: number): string {
  return Number.isInteger(n)
    ? n.toLocaleString('es-MX')
    : n.toLocaleString('es-MX', { maximumFractionDigits: 4 });
}

interface AccordionItemProps {
  id: AnalysisPanelId;
  title: string;
  subtitle: string;
  statusLabel: string;
  isOpen: boolean;
  onToggle: (id: AnalysisPanelId) => void;
  children: React.ReactNode;
}

const AccordionItem: React.FC<AccordionItemProps> = ({
  id,
  title,
  subtitle,
  statusLabel,
  isOpen,
  onToggle,
  children,
}) => {
  return (
    <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={`panel-${id}`}
        onClick={() => onToggle(id)}
        className={`w-full text-left px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-cyan-600 ${
          isOpen ? 'bg-slate-50/90 border-b border-slate-200' : 'bg-white hover:bg-slate-50/70'
        }`}
      >
        <div className="min-w-0">
          <div className="text-sm sm:text-base font-bold text-[#0B1F3A]">{title}</div>
          <div className="mt-0.5 text-xs text-slate-600">{subtitle}</div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs font-mono tabular-nums font-medium text-cyan-900 whitespace-nowrap">
            {statusLabel}
          </span>
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
          )}
        </div>
      </button>

      {isOpen && (
        <div id={`panel-${id}`} className="p-5 sm:p-6 space-y-5">
          {children}
        </div>
      )}
    </div>
  );
};

export const AdvancedAnalysisSection: React.FC<AdvancedAnalysisSectionProps> = ({
  problem,
  result,
  sensitivity,
  originalSnapshot,
  altDraft,
  hasAltEdits,
  undoAltDraft,
  mainProblemChangedSinceSnapshot,
  altParseErrors,
  invalidAltFields,
  scenarioComparison,
  onSyncComparatorFromMain,
  onRestoreAlternativeToOriginal,
  onUndoRestore,
  onUpdateAltSupply,
  onUpdateAltDemand,
  onUpdateAltCost,
}) => {
  const [openPanels, setOpenPanels] = useState<Set<AnalysisPanelId>>(() => new Set());

  const togglePanel = (id: AnalysisPanelId) => {
    setOpenPanels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expandAll = () => setOpenPanels(new Set(ALL_PANELS));
  const collapseAll = () => setOpenPanels(new Set());

  // Evaluador interactivo de escenarios desbalanceados (Etapa 2)
  const [targetKind, setTargetKind] = useState<'supply' | 'demand'>('supply');
  const [targetIndex, setTargetIndex] = useState<number>(0);

  const safeTargetList = targetKind === 'supply' ? problem.origins : problem.destinations;
  const safeValueList = targetKind === 'supply' ? problem.supply : problem.demand;
  const safeIndex = targetIndex < safeTargetList.length ? targetIndex : 0;
  const currentBaseValue = safeValueList[safeIndex] ?? 0;

  const [rhsInput, setRhsInput] = useState<string>(() => String(currentBaseValue + 20));

  useEffect(() => {
    const list = targetKind === 'supply' ? problem.supply : problem.demand;
    const idx = targetIndex < list.length ? targetIndex : 0;
    if (idx !== targetIndex) {
      setTargetIndex(idx);
    }
    const baseVal = list[idx] ?? 0;
    setRhsInput(String(baseVal + 20));
  }, [problem, targetKind, targetIndex]);

  const handleKindChange = (nextKind: 'supply' | 'demand') => {
    setTargetKind(nextKind);
    setTargetIndex(0);
    const baseVal = (nextKind === 'supply' ? problem.supply : problem.demand)[0] ?? 0;
    setRhsInput(String(baseVal + 20));
  };

  const handleNodeChange = (nextIdx: number) => {
    setTargetIndex(nextIdx);
    const baseVal = (targetKind === 'supply' ? problem.supply : problem.demand)[nextIdx] ?? 0;
    setRhsInput(String(baseVal + 20));
  };

  const handleStepRhs = (delta: number) => {
    const parsed = Number(rhsInput);
    const base = Number.isFinite(parsed) ? parsed : currentBaseValue;
    const next = Math.max(0, Math.round((base + delta) * 10000) / 10000);
    setRhsInput(String(next));
  };

  const unbalancedEval = useMemo(() => {
    const trimmed = rhsInput.trim();
    const parsed = trimmed === '' ? Number.NaN : Number(trimmed);
    return evaluateUnbalancedRhsScenario(problem, result, targetKind, safeIndex, parsed);
  }, [problem, result, targetKind, safeIndex, rhsInput]);

  const { costSensitivity, rhsSensitivity, dualShadowPrices, managerialAnalysis } =
    sensitivity;

  const dynamicManagerial = useMemo(() => {
    if (result.balanced && result.optimal) {
      return buildManagerialDecisionAnalysis(
        result.balanced,
        result.optimal,
        costSensitivity,
        rhsSensitivity,
        dualShadowPrices,
        mainProblemChangedSinceSnapshot ? null : scenarioComparison,
        { comparisonOutOfSync: mainProblemChangedSinceSnapshot }
      );
    }
    return managerialAnalysis;
  }, [
    result.balanced,
    result.optimal,
    costSensitivity,
    rhsSensitivity,
    dualShadowPrices,
    scenarioComparison,
    mainProblemChangedSinceSnapshot,
    managerialAnalysis,
  ]);

  if (!result.balanced || !result.leastCost || !result.vogel || !result.optimal) {
    return null;
  }

  const { balanced, leastCost, vogel, optimal } = result;

  const altOptimaStatus = optimal.hasAlternativeOptima
    ? `${optimal.alternativeCells.length} ruta(s) alternativa(s)`
    : 'Solución única';

  return (
    <section id="analisis" className="scroll-mt-20">
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-7 space-y-5">
        {/* Encabezado de Análisis Avanzado */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-5 border-b border-slate-200">
          <div className="max-w-2xl">
            <div className="text-xs font-semibold uppercase tracking-wider text-cyan-800">
              Paso 3 · Análisis avanzado
            </div>
            <h2 className="mt-1 text-xl sm:text-2xl font-bold text-[#0B1F3A]">
              Desarrollo técnico, sensibilidad y toma de decisiones
            </h2>
            <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
              Abre solo las secciones que necesites revisar: cada módulo comienza con una explicación sencilla seguida de las tablas y cálculos reales.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0 no-print">
            <button
              type="button"
              onClick={expandAll}
              className="min-h-[38px] px-3.5 py-2 text-xs font-semibold text-[#0B1F3A] bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              Expandir todo ({ALL_PANELS.length})
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="min-h-[38px] px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              Contraer todo
            </button>
          </div>
        </div>

        {/* Secciones colapsables */}
        <div className="space-y-3">
          {/* 1. Desarrollo paso a paso */}
          <AccordionItem
            id="step_by_step"
            title="1. Desarrollo matemático paso a paso"
            subtitle="Procedimiento detallado de Costo Mínimo, Vogel y ciclos de mejora MODI"
            statusLabel={`${leastCost.steps.length} + ${vogel.steps.length} pasos · ${optimal.iterations.length} iter. MODI`}
            isOpen={openPanels.has('step_by_step')}
            onToggle={togglePanel}
          >
            <div className="p-3.5 rounded-lg bg-cyan-50/60 border border-cyan-200 text-xs sm:text-sm text-slate-700 leading-relaxed">
              <strong className="text-[#0B1F3A]">¿Qué muestra esta sección?</strong>{' '}
              Aquí puedes auditar paso a paso cómo se asignaron las unidades en cada método, qué penalizaciones calculó Vogel y qué ciclos cerrados usó MODI hasta certificar que no existe una solución más económica.
            </div>
            <StepByStepProcedureContent
              balanced={balanced}
              leastCost={leastCost}
              vogel={vogel}
              optimal={optimal}
            />
          </AccordionItem>

          {/* 2. Sensibilidad de costos unitarios (Etapa 1) */}
          <AccordionItem
            id="cost_sensitivity"
            title="2. Sensibilidad de costos unitarios (Etapa 1)"
            subtitle="Hasta cuánto puede subir o bajar cada tarifa sin que cambie la combinación óptima"
            statusLabel={`${costSensitivity.basicRoutes.length} básicas · ${costSensitivity.nonBasicRoutes.length} no básicas`}
            isOpen={openPanels.has('cost_sensitivity')}
            onToggle={togglePanel}
          >
            <div className="p-3.5 rounded-lg bg-cyan-50/60 border border-cyan-200 text-xs sm:text-sm text-slate-700 leading-relaxed">
              <strong className="text-[#0B1F3A]">¿Qué muestra esta sección?</strong>{' '}
              Permite saber qué tanto margen tienen las tarifas actuales antes de que convenga cambiar las rutas elegidas. Si una tarifa sale de su rango admisible, el modelo debe reoptimizarse.
            </div>

            {/* Rutas básicas */}
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-bold text-[#0B1F3A]">
                  A. Rutas actualmente utilizadas (intervalos admisibles de c_ij)
                </h3>
                <span className="text-xs font-mono text-slate-500">
                  Base: {costSensitivity.optimalBasisSize}/{costSensitivity.expectedBasisSize} celdas
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Rango en el que cada costo básico puede variar individualmente manteniendo óptima la base actual.
              </p>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#0B1F3A] text-white">
                      <th className="text-left py-2.5 px-3 font-semibold">Ruta básica</th>
                      <th className="text-right py-2.5 px-2.5 font-semibold">x_ij</th>
                      <th className="text-right py-2.5 px-2.5 font-semibold">c_ij</th>
                      <th className="text-left py-2.5 px-3 font-semibold">
                        Intervalo (c_ij ≥ 0 / Mat.)
                      </th>
                      <th className="text-right py-2.5 px-2.5 font-semibold">Tolerancia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {costSensitivity.basicRoutes.map((route) => {
                      const maxStr =
                        route.maxCost === null ? '+∞' : `$${fmt(route.maxCost)}`;
                      const minNonNegStr =
                        route.minCostMath === null || route.minCostMath < 0
                          ? '$0'
                          : `$${fmt(route.minCostNonNegative)}`;
                      const minMathStr =
                        route.minCostMath === null ? '-∞' : `$${fmt(route.minCostMath)}`;
                      const dMinStr =
                        route.deltaMin === null
                          ? '-∞'
                          : route.deltaMin === 0
                          ? '0'
                          : fmt(route.deltaMin);
                      const dMaxStr =
                        route.deltaMax === null
                          ? '+∞'
                          : route.deltaMax === 0
                          ? '0'
                          : `+${fmt(route.deltaMax)}`;

                      return (
                        <tr
                          key={`${route.row}-${route.col}`}
                          className={`align-top ${
                            route.isDegenerateBasic
                              ? 'bg-indigo-50/40'
                              : route.isDummy
                              ? 'bg-amber-50/35'
                              : 'hover:bg-slate-50/70'
                          }`}
                        >
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-[#0B1F3A] whitespace-nowrap">
                              {route.originName} → {route.destinationName}
                            </div>
                            {(route.isDegenerateBasic || route.isDummy) && (
                              <div className="text-[11px] text-slate-600 mt-0.5">
                                {route.isDegenerateBasic
                                  ? 'Básica degenerada (0 u)'
                                  : 'Celda ficticia ($0/u)'}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-800 whitespace-nowrap">
                            {fmt(route.allocation)} u
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold text-[#0B1F3A] whitespace-nowrap">
                            ${fmt(route.currentCost)}
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums">
                            {route.reliable ? (
                              <div>
                                <div className="font-semibold text-cyan-900 whitespace-nowrap">
                                  [{minNonNegStr}, {maxStr}
                                  {route.maxCost === null ? ')' : ']'}
                                </div>
                                <div className="text-[11px] text-slate-500 whitespace-nowrap">
                                  Mat: {route.minCostMath === null ? '(-∞' : `[${minMathStr}`},{' '}
                                  {route.maxCost === null ? '+∞)' : `${maxStr}]`}
                                </div>
                                {(route.hasTightLowerBound || route.hasTightUpperBound) && (
                                  <div className="font-sans text-[11px] text-amber-800 mt-0.5">
                                    Empate actual en{' '}
                                    {route.hasTightLowerBound && route.hasTightUpperBound
                                      ? 'ambos extremos'
                                      : route.hasTightLowerBound
                                      ? 'límite inferior'
                                      : 'límite superior'}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="font-sans text-red-700">
                                {route.unreliableReason}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                            {dMinStr} / {dMaxStr}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Rutas no básicas */}
            <div className="space-y-2.5">
              <h3 className="text-sm font-bold text-[#0B1F3A]">
                B. Rutas no utilizadas (cuánto deben bajar para volverse atractivas)
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Muestra el costo reducido Δ_ij = c_ij − (u_i + v_j) y el umbral de tarifa necesario para competir con el plan actual.
              </p>

              {costSensitivity.nonBasicRoutes.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Todas las celdas pertenecen a la base actual (caso 1×N o N×1).
                </p>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#0B1F3A] text-white">
                        <th className="text-left py-2.5 px-3 font-semibold">Ruta no básica</th>
                        <th className="text-right py-2.5 px-2.5 font-semibold">c_ij</th>
                        <th className="text-right py-2.5 px-2.5 font-semibold">Δ_ij</th>
                        <th className="text-right py-2.5 px-2.5 font-semibold">u_i+v_j</th>
                        <th className="text-left py-2.5 px-3 font-semibold">
                          Umbral y efecto (base vs. asignación)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {costSensitivity.nonBasicRoutes.map((route) => (
                        <tr
                          key={`${route.row}-${route.col}`}
                          className={`align-top ${
                            route.alreadyAlternativeOptimum
                              ? 'bg-cyan-50/50'
                              : 'hover:bg-slate-50/70'
                          }`}
                        >
                          <td className="py-2.5 px-3 font-medium text-[#0B1F3A] whitespace-nowrap">
                            <div>
                              {route.originName} → {route.destinationName}
                            </div>
                            {route.isDummy && (
                              <div className="text-[11px] font-normal text-slate-500">
                                Celda ficticia
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-800 whitespace-nowrap">
                            ${fmt(route.currentCost)}
                          </td>
                          <td
                            className={`py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                              route.alreadyAlternativeOptimum
                                ? 'text-cyan-800'
                                : 'text-slate-900'
                            }`}
                          >
                            +${fmt(route.reducedCost)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                            ${fmt(route.impliedDualSum)}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 leading-relaxed">
                            <div className="font-semibold text-slate-800">
                              {route.alreadyAlternativeOptimum
                                ? 'Reducción requerida: $0 (Óptimo alternativo)'
                                : !route.canBecomeCompetitiveWithNonNegativeCost
                                ? `Inalcanzable con c_ij ≥ 0 (umbral negativo: $${fmt(route.minCostToKeepBasis)})`
                                : `Reducción necesaria: -$${fmt(route.requiredReduction)}/u (límite: $${fmt(route.minCostToKeepBasis)})`}
                            </div>
                            <div className="mt-0.5 text-[11px]">
                              {route.basisVsAllocationNote}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1.5">
              <div className="font-bold text-[#0B1F3A]">
                Condiciones matemáticas de la sensibilidad de costos
              </div>
              <ul className="list-disc list-inside space-y-1 leading-relaxed">
                {costSensitivity.limitationsNote.map((note, idx) => (
                  <li key={idx}>{note}</li>
                ))}
              </ul>
            </div>
          </AccordionItem>

          {/* 3. Óptimos alternativos */}
          <AccordionItem
            id="alternative_optima"
            title="3. Óptimos alternativos"
            subtitle="Comprueba si existen otras rutas distintas con exactamente el mismo costo mínimo"
            statusLabel={altOptimaStatus}
            isOpen={openPanels.has('alternative_optima')}
            onToggle={togglePanel}
          >
            <div className="p-3.5 rounded-lg bg-cyan-50/60 border border-cyan-200 text-xs sm:text-sm text-slate-700 leading-relaxed">
              <strong className="text-[#0B1F3A]">¿Qué significa esto en la práctica?</strong>{' '}
              A veces hay más de una forma de repartir los envíos gastando exactamente lo mismo. Eso ocurre cuando una ruta que hoy no se usa tiene costo marginal <span className="font-mono">Δ_ij = 0</span>.
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs sm:text-sm">
              <div className="font-bold text-[#0B1F3A]">
                {optimal.hasAlternativeOptima
                  ? `Sí existen soluciones óptimas alternativas (costo constante de $${fmt(optimal.totalCost)} MXN)`
                  : `La solución óptima actual es única ($${fmt(optimal.totalCost)} MXN)`}
              </div>

              <p className="text-slate-700 leading-relaxed">
                {dynamicManagerial.diagnosis.alternativeOptimaSummary}
              </p>

              {optimal.hasAlternativeOptima ? (
                <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#0B1F3A] text-white">
                        <th className="text-left py-2 px-3 font-semibold">Ruta alternativa (Δ_ij = 0)</th>
                        <th className="text-right py-2 px-3 font-semibold">Tarifa c_ij</th>
                        <th className="text-left py-2 px-3 font-semibold">Efecto al activarla</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {optimal.alternativeCells.map((cell, idx) => (
                        <tr key={idx}>
                          <td className="py-2 px-3 font-semibold text-[#0B1F3A]">
                            {cell.originName} → {cell.destinationName}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-800">
                            ${fmt(balanced.costs[cell.row][cell.col])}/u
                          </td>
                          <td className="py-2 px-3 text-slate-600">
                            Puede incorporarse en un ciclo cerrado sin incrementar el costo total de ${fmt(optimal.totalCost)} MXN.
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex items-start gap-2 text-xs text-slate-600">
                  <Info className="w-4 h-4 text-cyan-700 shrink-0 mt-0.5" />
                  <span>
                    Todas las rutas no utilizadas tienen costo reducido estrictamente positivo (<span className="font-mono">Δ_ij &gt; 0</span>), por lo que utilizar cualquiera de ellas aumentaría el costo total.
                  </span>
                </div>
              )}
            </div>
          </AccordionItem>

          {/* 4. Sensibilidad de oferta y demanda (Etapa 2) */}
          <AccordionItem
            id="rhs_sensitivity"
            title="4. Sensibilidad de oferta y demanda (Etapa 2)"
            subtitle="Margen ante cambios de capacidad o demanda y prueba rápida de desbalanceos"
            statusLabel={`${rhsSensitivity.balancedPairs.length} pares analizados`}
            isOpen={openPanels.has('rhs_sensitivity')}
            onToggle={togglePanel}
          >
            <div className="p-3.5 rounded-lg bg-cyan-50/60 border border-cyan-200 text-xs sm:text-sm text-slate-700 leading-relaxed">
              <strong className="text-[#0B1F3A]">¿Qué muestra esta sección?</strong>{' '}
              Analiza cuánto pueden subir o bajar la capacidad de un almacén y la demanda de una sucursal sin romper el esquema actual de envíos, y te permite simular un cambio individual para ver su impacto inmediato.
            </div>

            {/* 4.1 Variaciones balanceadas conjuntas */}
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-bold text-[#0B1F3A]">
                  A. Variaciones balanceadas conjuntas (a_i + δ, b_j + δ)
                </h3>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                  Los siguientes intervalos miden cuánto pueden aumentar o disminuir{' '}
                  <strong className="text-[#0B1F3A]">juntos un almacén y una sucursal en δ unidades</strong>{' '}
                  manteniendo factible y óptima la base actual de rutas.
                </p>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#0B1F3A] text-white">
                      <th className="text-left py-2.5 px-3 font-semibold">Par conjunto (O_i, D_j)</th>
                      <th className="text-left py-2.5 px-2.5 font-semibold">Intervalo de δ</th>
                      <th className="text-left py-2.5 px-3 font-semibold">Capacidades admisibles</th>
                      <th className="text-right py-2.5 px-2.5 font-semibold">Impacto marginal</th>
                      <th className="text-left py-2.5 px-3 font-semibold">Celdas limitantes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {rhsSensitivity.balancedPairs.map((pair) => {
                      const dMinStr = pair.deltaMin === null ? '-∞' : fmt(pair.deltaMin);
                      const dMaxStr =
                        pair.deltaMax === null
                          ? '+∞'
                          : pair.deltaMax === 0
                          ? '0'
                          : `+${fmt(pair.deltaMax)}`;
                      const maxSupStr = pair.maxSupply === null ? '+∞' : fmt(pair.maxSupply);
                      const maxDemStr = pair.maxDemand === null ? '+∞' : fmt(pair.maxDemand);
                      const costMinStr =
                        pair.optimalCostAtMin === null ? '-∞' : `$${fmt(pair.optimalCostAtMin)}`;
                      const costMaxStr =
                        pair.optimalCostAtMax === null ? '+∞' : `$${fmt(pair.optimalCostAtMax)}`;

                      return (
                        <tr
                          key={`${pair.originIndex}-${pair.destinationIndex}`}
                          className={`align-top ${
                            pair.isBasicPair
                              ? 'hover:bg-slate-50/70'
                              : 'bg-cyan-50/25 hover:bg-cyan-50/45'
                          }`}
                        >
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-[#0B1F3A] whitespace-nowrap">
                              {pair.originName} ({fmt(pair.currentSupply)} u) +{' '}
                              {pair.destinationName} ({fmt(pair.currentDemand)} u)
                            </div>
                            <div className="text-[11px] text-slate-600 mt-0.5">
                              {pair.isBasicPair
                                ? 'Ruta básica directa'
                                : `Ajuste vía árbol (${pair.pathSteps.length} celdas)`}
                              {pair.usesDummyInPath ? ' · Incluye nodo ficticio' : ''}
                            </div>
                            {pair.pathSteps.length > 0 && (
                              <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                                {pair.pathSteps
                                  .map((s) => `${s.sign}(${s.originName}→${s.destinationName})`)
                                  .join(' ')}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-2.5 font-mono tabular-nums whitespace-nowrap">
                            {pair.reliable ? (
                              <div>
                                <div className="font-semibold text-cyan-900">
                                  [{dMinStr}, {dMaxStr}
                                  {pair.deltaMax === null ? ')' : ']'} u
                                </div>
                                {(pair.hasTightLowerBound || pair.hasTightUpperBound) && (
                                  <div className="font-sans text-[11px] text-amber-800 mt-0.5 whitespace-normal">
                                    Límite en δ = 0 por degeneración
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="font-sans text-red-700">{pair.unreliableReason}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                            {pair.reliable ? (
                              <div>
                                <div>
                                  a_i: [{pair.minSupply === null ? '-∞' : fmt(pair.minSupply)},{' '}
                                  {maxSupStr}
                                  {pair.maxSupply === null ? ')' : ']'}
                                </div>
                                <div>
                                  b_j: [{pair.minDemand === null ? '-∞' : fmt(pair.minDemand)},{' '}
                                  {maxDemStr}
                                  {pair.maxDemand === null ? ')' : ']'}
                                </div>
                              </div>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                            {pair.reliable && pair.marginalCostPerUnit !== null ? (
                              <div>
                                <div className="font-semibold text-[#0B1F3A]">
                                  {pair.marginalCostPerUnit >= 0
                                    ? `+$${fmt(pair.marginalCostPerUnit)}/u`
                                    : `-$${fmt(Math.abs(pair.marginalCostPerUnit))}/u`}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  Z*: {costMinStr} a {costMaxStr}
                                </div>
                              </div>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-[11px] text-slate-600 leading-relaxed">
                            {pair.reliable ? (
                              <div>
                                <div>
                                  <span className="font-semibold text-slate-800">Baja (-δ):</span>{' '}
                                  {pair.limitingLowerCells.join(', ')}
                                </div>
                                <div className="mt-0.5">
                                  <span className="font-semibold text-slate-800">Sube (+δ):</span>{' '}
                                  {pair.limitingUpperCells.length > 0
                                    ? pair.limitingUpperCells.join(', ')
                                    : 'Sin límite superior en esta base'}
                                </div>
                              </div>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1.5">
                <div className="font-bold text-[#0B1F3A]">
                  Condiciones y limitaciones de los intervalos balanceados
                </div>
                <ul className="list-disc list-inside space-y-1 leading-relaxed">
                  {rhsSensitivity.limitationsNote.map((note, idx) => (
                    <li key={idx}>{note}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* 4.2 Evaluador de escenarios desbalanceados */}
            <div className="space-y-4 pt-3 border-t border-slate-200">
              <div>
                <h3 className="text-sm font-bold text-[#0B1F3A]">
                  B. Simular un cambio individual de oferta o demanda (escenario desbalanceado)
                </h3>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                  Cambia la oferta de un solo almacén o la demanda de una sola sucursal: el sistema balancea automáticamente con nodos ficticios ($0/u) y vuelve a calcular el plan óptimo.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="rhs-target-kind"
                    className="block text-xs font-semibold text-[#0B1F3A] mb-1"
                  >
                    Parámetro a variar
                  </label>
                  <select
                    id="rhs-target-kind"
                    value={targetKind}
                    onChange={(e) => handleKindChange(e.target.value as 'supply' | 'demand')}
                    className="w-full min-h-[38px] px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-cyan-600"
                  >
                    <option value="supply">Oferta de almacén (a_i)</option>
                    <option value="demand">Demanda de sucursal (b_j)</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="rhs-target-node"
                    className="block text-xs font-semibold text-[#0B1F3A] mb-1"
                  >
                    {targetKind === 'supply' ? 'Almacén seleccionado' : 'Sucursal seleccionada'}
                  </label>
                  <select
                    id="rhs-target-node"
                    value={safeIndex}
                    onChange={(e) => handleNodeChange(Number(e.target.value))}
                    className="w-full min-h-[38px] px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-cyan-600"
                  >
                    {safeTargetList.map((label, idx) => (
                      <option key={idx} value={idx}>
                        {label} (actual: {fmt(safeValueList[idx] ?? 0)} u)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="rhs-new-value"
                    className="block text-xs font-semibold text-[#0B1F3A] mb-1"
                  >
                    Nueva cantidad (u)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleStepRhs(-20)}
                      className="min-h-[38px] px-2.5 text-xs font-semibold text-[#0B1F3A] bg-white hover:bg-slate-100 border border-slate-300 rounded-lg cursor-pointer"
                      title="Disminuir 20 unidades"
                    >
                      -20
                    </button>
                    <input
                      id="rhs-new-value"
                      type="number"
                      min={0}
                      step="any"
                      value={rhsInput}
                      onChange={(e) => setRhsInput(e.target.value)}
                      className="w-full min-h-[38px] px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-cyan-600"
                    />
                    <button
                      type="button"
                      onClick={() => handleStepRhs(20)}
                      className="min-h-[38px] px-2.5 text-xs font-semibold text-[#0B1F3A] bg-white hover:bg-slate-100 border border-slate-300 rounded-lg cursor-pointer"
                      title="Aumentar 20 unidades"
                    >
                      +20
                    </button>
                  </div>
                </div>
              </div>

              {!unbalancedEval.valid ? (
                <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                  {unbalancedEval.error}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-[11px] font-semibold text-slate-500">
                        Costo óptimo original
                      </div>
                      <div className="mt-1 text-lg font-bold font-mono tabular-nums text-[#0B1F3A]">
                        ${fmt(unbalancedEval.originalOptimalCost)} MXN
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-600 font-mono tabular-nums">
                        Oferta {fmt(unbalancedEval.originalSupplyTotal)} u · Demanda{' '}
                        {fmt(unbalancedEval.originalDemandTotal)} u
                      </div>
                    </div>

                    <div className="p-3.5 rounded-lg bg-cyan-50/70 border border-cyan-200">
                      <div className="text-[11px] font-semibold text-cyan-900">
                        Nuevo costo óptimo MODI
                      </div>
                      <div className="mt-1 text-lg font-bold font-mono tabular-nums text-[#0B1F3A]">
                        ${fmt(unbalancedEval.newOptimalCost ?? 0)} MXN
                      </div>
                      <div className="mt-0.5 text-[11px] font-semibold text-cyan-900 font-mono tabular-nums">
                        Diferencia:{' '}
                        {(unbalancedEval.costDifference ?? 0) >= 0
                          ? `+$${fmt(unbalancedEval.costDifference ?? 0)}`
                          : `-$${fmt(Math.abs(unbalancedEval.costDifference ?? 0))}`}{' '}
                        MXN ({(unbalancedEval.costDifferencePct ?? 0) >= 0 ? '+' : ''}
                        {(unbalancedEval.costDifferencePct ?? 0).toFixed(2)}%)
                      </div>
                    </div>

                    <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-[11px] font-semibold text-slate-500">
                        Balanceo y unidades
                      </div>
                      <div className="mt-1 text-sm font-bold text-[#0B1F3A]">
                        {unbalancedEval.balanceStatus === 'balanced'
                          ? 'Balance exacto (0 u ficticias)'
                          : unbalancedEval.balanceStatus === 'dummy_destination'
                          ? `Destino Ficticio: ${fmt(unbalancedEval.dummyDestinationUnits)} u`
                          : `Origen Ficticio: ${fmt(unbalancedEval.dummyOriginUnits)} u`}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-600 font-mono tabular-nums">
                        Envío real: {fmt(unbalancedEval.realAssignedUnits)} u · Ficticio:{' '}
                        {fmt(unbalancedEval.dummyDestinationUnits + unbalancedEval.dummyOriginUnits)} u
                      </div>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-700 leading-relaxed">
                    {unbalancedEval.interpretation}
                  </div>

                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="bg-[#0B1F3A] text-white">
                          <th className="text-left py-2 px-3 font-semibold">Tipo de flujo</th>
                          <th className="text-left py-2 px-3 font-semibold">Ruta reoptimizada</th>
                          <th className="text-right py-2 px-3 font-semibold">Unidades</th>
                          <th className="text-right py-2 px-3 font-semibold">Costo unitario</th>
                          <th className="text-right py-2 px-3 font-semibold">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {unbalancedEval.realAllocationsSummary.map((item, idx) => (
                          <tr key={`real-${idx}`} className="hover:bg-slate-50/70">
                            <td className="py-2 px-3 font-semibold text-[#0B1F3A] whitespace-nowrap">
                              Envío real
                            </td>
                            <td className="py-2 px-3 text-slate-800 whitespace-nowrap">
                              {item.originName} → {item.destinationName}
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                              {fmt(item.quantity)} u
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                              ${fmt(item.unitCost)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-[#0B1F3A] whitespace-nowrap">
                              ${fmt(item.subtotalCost)}
                            </td>
                          </tr>
                        ))}
                        {unbalancedEval.dummyAllocations.map((item, idx) => (
                          <tr key={`dummy-${idx}`} className="bg-amber-50/50">
                            <td className="py-2 px-3 font-semibold text-amber-900 whitespace-nowrap">
                              {unbalancedEval.balanceStatus === 'dummy_destination'
                                ? 'Excedente ficticio'
                                : 'Faltante ficticio'}
                            </td>
                            <td className="py-2 px-3 text-amber-950 whitespace-nowrap">
                              {item.originName} → {item.destinationName}
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-amber-950 whitespace-nowrap">
                              {fmt(item.quantity)} u
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums text-amber-900 whitespace-nowrap">
                              $0 (hipótesis)
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums text-amber-900 whitespace-nowrap">
                              $0
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="p-3.5 rounded-lg bg-amber-50/70 border border-amber-200 text-xs text-amber-950 leading-relaxed">
                    <strong className="font-semibold">Nota académica sobre el costo ficticio ($0):</strong>{' '}
                    {unbalancedEval.dummyCostAssumptionNote}
                  </div>
                </div>
              )}
            </div>
          </AccordionItem>

          {/* 5. Precios sombra y potenciales duales (Etapa 3) */}
          <AccordionItem
            id="shadow_prices"
            title="5. Precios sombra y potenciales duales (Etapa 3)"
            subtitle="Valores u_i y v_j de MODI e impacto económico de reasignar oferta o demanda"
            statusLabel={`${sensitivity.computedDuals.u.length} u_i · ${sensitivity.computedDuals.v.length} v_j`}
            isOpen={openPanels.has('shadow_prices')}
            onToggle={togglePanel}
          >
            <div className="p-3.5 rounded-lg bg-cyan-50/60 border border-cyan-200 text-xs sm:text-sm text-slate-700 leading-relaxed">
              <strong className="text-[#0B1F3A]">¿Qué muestra esta sección?</strong>{' '}
              Traduce los multiplicadores <span className="font-mono">u_i</span> y{' '}
              <span className="font-mono">v_j</span> de MODI en ahorro o sobrecosto por unidad al mover inventario entre almacenes, reasignar demanda entre sucursales o expandir ambos juntos.
            </div>

            {/* Potenciales calculados */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-xs font-semibold text-[#0B1F3A]">
                  Potenciales de orígenes (u_i)
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono tabular-nums text-xs text-slate-700">
                  {sensitivity.computedDuals.u.map((item, idx) => (
                    <span key={idx}>
                      {item.label}: <strong className="text-[#0B1F3A]">{item.value}</strong>
                    </span>
                  ))}
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-xs font-semibold text-[#0B1F3A]">
                  Potenciales de destinos (v_j)
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono tabular-nums text-xs text-slate-700">
                  {sensitivity.computedDuals.v.map((item, idx) => (
                    <span key={idx}>
                      {item.label}: <strong className="text-[#0B1F3A]">{item.value}</strong>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-bold text-[#0B1F3A]">
                  A. Obtención de potenciales (u_i + v_j = c_ij) y normalización (u_1 = 0)
                </h3>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                  {dualShadowPrices.normalizationNote}{' '}
                  {dualShadowPrices.normalizationInvarianceNote}
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-amber-50/70 border border-amber-200 text-xs text-amber-950 leading-relaxed">
                {dualShadowPrices.isolatedChangeWarning}
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#0B1F3A] text-white">
                      <th className="text-left py-2 px-3 font-semibold">Celda básica</th>
                      <th className="text-right py-2 px-2.5 font-semibold">u_i</th>
                      <th className="text-right py-2 px-2.5 font-semibold">v_j</th>
                      <th className="text-right py-2 px-2.5 font-semibold">c_ij</th>
                      <th className="text-left py-2 px-3 font-semibold">Ecuación dual (u_i + v_j = c_ij)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {dualShadowPrices.basicEquations.map((eq) => (
                      <tr
                        key={`${eq.row}-${eq.col}`}
                        className={eq.isDummy ? 'bg-amber-50/40' : 'hover:bg-slate-50/70'}
                      >
                        <td className="py-2 px-3 font-semibold text-[#0B1F3A] whitespace-nowrap">
                          {eq.originName} → {eq.destinationName}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono tabular-nums text-slate-800 whitespace-nowrap">
                          {fmt(eq.uValue)}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono tabular-nums text-slate-800 whitespace-nowrap">
                          {fmt(eq.vValue)}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono tabular-nums font-semibold text-[#0B1F3A] whitespace-nowrap">
                          ${fmt(eq.unitCost)}
                        </td>
                        <td className="py-2 px-3 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                          {eq.formulaText}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-bold text-[#0B1F3A]">
                B. Significado económico de u_i + v_j, (u_i − u_r) y (v_j − v_l)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                  <div className="font-bold text-[#0B1F3A]">Par conjunto (u_i + v_j)</div>
                  <p className="text-slate-600 leading-relaxed">
                    Cambio por unidad en Z* cuando aumentan juntos a_i y b_j dentro de [δ_mín, δ_máx].
                  </p>
                </div>
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                  <div className="font-bold text-[#0B1F3A]">Entre almacenes (u_i − u_r)</div>
                  <p className="text-slate-600 leading-relaxed">
                    Impacto de trasladar 1 unidad de oferta del almacén r al almacén i manteniendo la oferta total.
                  </p>
                </div>
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                  <div className="font-bold text-[#0B1F3A]">Entre sucursales (v_j − v_l)</div>
                  <p className="text-slate-600 leading-relaxed">
                    Efecto marginal de mover 1 unidad de demanda de la sucursal l hacia la sucursal j.
                  </p>
                </div>
              </div>

              {dualShadowPrices.supplyTransfers.length > 0 && (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#0B1F3A] text-white">
                        <th className="text-left py-2 px-3 font-semibold">Transferencia de oferta (O_r → O_i)</th>
                        <th className="text-left py-2 px-2.5 font-semibold">Intervalo δ</th>
                        <th className="text-right py-2 px-2.5 font-semibold">u_i − u_r</th>
                        <th className="text-left py-2 px-3 font-semibold">Interpretación económica</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {dualShadowPrices.supplyTransfers.map((tr) => (
                        <tr
                          key={`${tr.fromIndex}-${tr.toIndex}`}
                          className="align-top hover:bg-slate-50/70"
                        >
                          <td className="py-2.5 px-3 font-semibold text-[#0B1F3A] whitespace-nowrap">
                            {tr.toName} (+δ) / {tr.fromName} (-δ)
                          </td>
                          <td className="py-2.5 px-2.5 font-mono tabular-nums text-cyan-900 whitespace-nowrap">
                            [{fmt(tr.deltaMin)}, +{fmt(tr.deltaMax)}] u
                          </td>
                          <td
                            className={`py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                              tr.signCategory === 'negative'
                                ? 'text-emerald-700'
                                : tr.signCategory === 'zero'
                                ? 'text-slate-600'
                                : 'text-[#0B1F3A]'
                            }`}
                          >
                            {tr.marginalCostPerUnit >= 0
                              ? `+$${fmt(tr.marginalCostPerUnit)}/u`
                              : `-$${fmt(Math.abs(tr.marginalCostPerUnit))}/u`}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 leading-relaxed">
                            {tr.interpretation}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {dualShadowPrices.demandTransfers.length > 0 && (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#0B1F3A] text-white">
                        <th className="text-left py-2 px-3 font-semibold">Transferencia de demanda (D_l → D_j)</th>
                        <th className="text-left py-2 px-2.5 font-semibold">Intervalo δ</th>
                        <th className="text-right py-2 px-2.5 font-semibold">v_j − v_l</th>
                        <th className="text-left py-2 px-3 font-semibold">Interpretación económica</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {dualShadowPrices.demandTransfers.map((tr) => (
                        <tr
                          key={`${tr.fromIndex}-${tr.toIndex}`}
                          className="align-top hover:bg-slate-50/70"
                        >
                          <td className="py-2.5 px-3 font-semibold text-[#0B1F3A] whitespace-nowrap">
                            {tr.toName} (+δ) / {tr.fromName} (-δ)
                          </td>
                          <td className="py-2.5 px-2.5 font-mono tabular-nums text-cyan-900 whitespace-nowrap">
                            [{fmt(tr.deltaMin)}, +{fmt(tr.deltaMax)}] u
                          </td>
                          <td
                            className={`py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                              tr.signCategory === 'negative'
                                ? 'text-emerald-700'
                                : tr.signCategory === 'zero'
                                ? 'text-slate-600'
                                : 'text-[#0B1F3A]'
                            }`}
                          >
                            {tr.marginalCostPerUnit >= 0
                              ? `+$${fmt(tr.marginalCostPerUnit)}/u`
                              : `-$${fmt(Math.abs(tr.marginalCostPerUnit))}/u`}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 leading-relaxed">
                            {tr.interpretation}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-bold text-[#0B1F3A]">
                  C. Ejemplos numéricos del escenario actual (comprobados con MODI)
                </h3>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                  Calculados directamente con tus datos vigentes y comprobados reoptimizando el modelo perturbado.
                </p>
              </div>

              {dualShadowPrices.workedExamples.length === 0 ? (
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
                  No fue posible generar ejemplos comprobados porque la base actual no constituye un árbol generador válido.
                </div>
              ) : (
                <div className="space-y-3">
                  {dualShadowPrices.workedExamples.map((ex) => (
                    <div
                      key={ex.id}
                      className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 text-xs"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div className="font-bold text-[#0B1F3A] text-sm">{ex.title}</div>
                        <span className="font-mono text-[11px] font-semibold text-cyan-800">
                          {ex.verifiedWithModi
                            ? `Verificado con MODI: $${fmt(ex.verifiedModiCost)} MXN`
                            : 'Requiere revisión de base'}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700">
                        <div>
                          <span className="font-semibold text-[#0B1F3A]">Almacén(es):</span>{' '}
                          {ex.involvedOrigin}
                        </div>
                        <div>
                          <span className="font-semibold text-[#0B1F3A]">Sucursal(es):</span>{' '}
                          {ex.involvedDestination}
                        </div>
                        <div>
                          <span className="font-semibold text-[#0B1F3A]">Variación:</span>{' '}
                          <span className="font-mono tabular-nums">{fmt(ex.deltaUnits)} u</span>
                        </div>
                        <div>
                          <span className="font-semibold text-[#0B1F3A]">Potenciales usados:</span>{' '}
                          <span className="font-mono tabular-nums">{ex.potentialsUsed}</span>
                        </div>
                      </div>

                      <div className="p-2.5 rounded-lg bg-white border border-slate-200 font-mono tabular-nums text-[11px] text-[#0B1F3A] overflow-x-auto">
                        {ex.formulaApplied}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono tabular-nums">
                        <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                          <div className="font-sans text-[11px] text-slate-500">Costo original</div>
                          <div className="font-bold text-[#0B1F3A]">
                            ${fmt(ex.originalOptimalCost)} MXN
                          </div>
                        </div>
                        <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                          <div className="font-sans text-[11px] text-slate-500">Costo esperado (dual)</div>
                          <div className="font-bold text-cyan-900">
                            ${fmt(ex.expectedNewCost)} MXN
                          </div>
                        </div>
                        <div className="p-2.5 rounded-lg bg-cyan-50/70 border border-cyan-200">
                          <div className="font-sans text-[11px] text-cyan-900">Reoptimización MODI</div>
                          <div className="font-bold text-[#0B1F3A]">
                            ${fmt(ex.verifiedModiCost)} MXN
                          </div>
                        </div>
                      </div>

                      <div className="text-slate-700 leading-relaxed">{ex.interpretation}</div>

                      <div>
                        <div className="font-semibold text-[#0B1F3A] mb-1">
                          Condiciones que deben cumplirse:
                        </div>
                        <ul className="list-disc list-inside space-y-0.5 text-slate-600 leading-relaxed">
                          {ex.conditions.map((cond, idx) => (
                            <li key={idx}>{cond}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1.5">
              <div className="font-bold text-[#0B1F3A]">
                Condiciones matemáticas de los precios sombra
              </div>
              <ul className="list-disc list-inside space-y-1 leading-relaxed">
                {dualShadowPrices.limitationsNote.map((note, idx) => (
                  <li key={idx}>{note}</li>
                ))}
              </ul>
            </div>
          </AccordionItem>

          {/* 6. Comparador interactivo de escenarios (Etapa 4) */}
          <AccordionItem
            id="scenario_comparator"
            title="6. Comparador interactivo de escenarios (Etapa 4)"
            subtitle="Modifica tarifas, ofertas o demandas en una copia segura y compara contra el original"
            statusLabel={
              scenarioComparison.hasInputChanges
                ? `${scenarioComparison.inputChanges.length} cambio(s) activo(s)`
                : 'Sin cambios aún'
            }
            isOpen={openPanels.has('scenario_comparator')}
            onToggle={togglePanel}
          >
            <div className="p-3.5 rounded-lg bg-cyan-50/60 border border-cyan-200 text-xs sm:text-sm text-slate-700 leading-relaxed">
              <strong className="text-[#0B1F3A]">¿Para qué sirve este comparador?</strong>{' '}
              Te permite probar qué pasaría si cambiaran tarifas de transporte, capacidades o pedidos de sucursales sin perder ni sobrescribir tu escenario original.
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-mono text-slate-600">
                {scenarioComparison.hasInputChanges
                  ? `${scenarioComparison.inputChanges.length} parámetro(s) modificado(s)`
                  : 'Copia sincronizada con el escenario original'}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {hasAltEdits && (
                  <button
                    type="button"
                    onClick={onRestoreAlternativeToOriginal}
                    className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0B1F3A] bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Restaurar valores originales
                  </button>
                )}
                {undoAltDraft && (
                  <button
                    type="button"
                    onClick={onUndoRestore}
                    className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-cyan-900 bg-cyan-50 hover:bg-cyan-100 border border-cyan-300 rounded-lg transition-colors cursor-pointer"
                  >
                    Deshacer restauración
                  </button>
                )}
              </div>
            </div>

            {mainProblemChangedSinceSnapshot && (
              <div className="p-3.5 rounded-lg bg-cyan-50/70 border border-cyan-200 text-xs text-cyan-950 flex flex-wrap items-center justify-between gap-2">
                <span>
                  Los datos principales en Configuración cambiaron; tu comparación actual permanece protegida con su referencia original independiente.
                </span>
                <button
                  type="button"
                  onClick={onSyncComparatorFromMain}
                  className="min-h-[32px] px-3 py-1 text-xs font-semibold text-white bg-[#0B1F3A] hover:bg-[#13315C] rounded-lg transition-colors cursor-pointer"
                >
                  Sincronizar con configuración actual
                </button>
              </div>
            )}

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-[#0B1F3A] text-white">
                    <th className="text-left py-2.5 px-3 font-semibold">Almacén \ Sucursal</th>
                    {originalSnapshot.destinations.map((dest, j) => (
                      <th
                        key={j}
                        className="text-center py-2.5 px-2 font-semibold whitespace-nowrap"
                      >
                        {dest}
                      </th>
                    ))}
                    <th className="text-center py-2.5 px-3 font-semibold bg-[#13315C] whitespace-nowrap">
                      Oferta alt. (u)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {originalSnapshot.origins.map((origin, i) => {
                    const supplyInvalid = invalidAltFields.has(`supply.${i}`);
                    const supplyModified =
                      Number(altDraft.supply[i]) !== originalSnapshot.supply[i];

                    return (
                      <tr key={i} className="hover:bg-slate-50/50">
                        <td className="py-2 px-3 font-semibold text-[#0B1F3A] whitespace-nowrap">
                          {origin}
                        </td>
                        {originalSnapshot.destinations.map((_, j) => {
                          const costInvalid = invalidAltFields.has(`costs.${i}.${j}`);
                          const origCost = originalSnapshot.costs[i][j];
                          const costModified =
                            !costInvalid && Number(altDraft.costs[i]?.[j]) !== origCost;

                          return (
                            <td key={j} className="p-1.5 text-center align-top">
                              <input
                                type="number"
                                min={0}
                                step="any"
                                aria-label={`Costo alternativo ${origin} a ${originalSnapshot.destinations[j]}`}
                                value={altDraft.costs[i]?.[j] ?? ''}
                                onChange={(e) => onUpdateAltCost(i, j, e.target.value)}
                                className={`w-20 min-h-[34px] px-2 py-1 text-center font-mono tabular-nums text-xs rounded-md border focus:outline-none ${
                                  costInvalid
                                    ? 'border-red-500 bg-red-50 text-red-900'
                                    : costModified
                                    ? 'border-cyan-600 bg-cyan-50/60 font-semibold text-[#0B1F3A]'
                                    : 'border-slate-300 bg-white text-slate-900 focus:border-cyan-600'
                                }`}
                              />
                              <div className="mt-0.5 text-[10px] font-mono tabular-nums text-slate-500">
                                Orig: ${fmt(origCost)}
                              </div>
                            </td>
                          );
                        })}
                        <td className="p-1.5 text-center align-top bg-sky-50/40">
                          <input
                            type="number"
                            min={0}
                            step="any"
                            aria-label={`Oferta alternativa ${origin}`}
                            value={altDraft.supply[i] ?? ''}
                            onChange={(e) => onUpdateAltSupply(i, e.target.value)}
                            className={`w-22 min-h-[34px] px-2 py-1 text-center font-mono tabular-nums text-xs rounded-md border focus:outline-none ${
                              supplyInvalid
                                ? 'border-red-500 bg-red-50 text-red-900'
                                : supplyModified
                                ? 'border-cyan-600 bg-cyan-50 font-semibold text-[#0B1F3A]'
                                : 'border-sky-300 bg-white text-slate-900 focus:border-cyan-600'
                            }`}
                          />
                          <div className="mt-0.5 text-[10px] font-mono tabular-nums text-slate-500">
                            Orig: {fmt(originalSnapshot.supply[i])} u
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-cyan-50/40">
                    <td className="py-2 px-3 font-semibold text-[#0B1F3A] whitespace-nowrap">
                      Demanda alt. (u)
                    </td>
                    {originalSnapshot.destinations.map((dest, j) => {
                      const demandInvalid = invalidAltFields.has(`demand.${j}`);
                      const origDemand = originalSnapshot.demand[j];
                      const demandModified =
                        !demandInvalid && Number(altDraft.demand[j]) !== origDemand;

                      return (
                        <td key={j} className="p-1.5 text-center align-top">
                          <input
                            type="number"
                            min={0}
                            step="any"
                            aria-label={`Demanda alternativa ${dest}`}
                            value={altDraft.demand[j] ?? ''}
                            onChange={(e) => onUpdateAltDemand(j, e.target.value)}
                            className={`w-20 min-h-[34px] px-2 py-1 text-center font-mono tabular-nums text-xs rounded-md border focus:outline-none ${
                              demandInvalid
                                ? 'border-red-500 bg-red-50 text-red-900'
                                : demandModified
                                ? 'border-cyan-700 bg-cyan-100/70 font-semibold text-[#0B1F3A]'
                                : 'border-cyan-300 bg-white text-slate-900 focus:border-cyan-700'
                            }`}
                          />
                          <div className="mt-0.5 text-[10px] font-mono tabular-nums text-slate-500">
                            Orig: {fmt(origDemand)} u
                          </div>
                        </td>
                      );
                    })}
                    <td className="py-2 px-3 text-center font-mono tabular-nums text-[11px] text-[#0B1F3A] bg-slate-100">
                      <div className="font-semibold">
                        Σa: {fmt(scenarioComparison.alternativeSupplyTotal)} u
                      </div>
                      <div>Σb: {fmt(scenarioComparison.alternativeDemandTotal)} u</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {altParseErrors.length > 0 && (
              <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 space-y-1">
                {altParseErrors.map((err, idx) => (
                  <div key={idx}>{err}</div>
                ))}
              </div>
            )}

            {scenarioComparison.valid && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-[11px] font-semibold text-slate-500">
                      Costo óptimo original (MODI)
                    </div>
                    <div className="mt-1 text-lg font-bold font-mono tabular-nums text-[#0B1F3A]">
                      ${fmt(scenarioComparison.originalOptimalCost)} MXN
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-600 font-mono tabular-nums">
                      Envío real: {fmt(scenarioComparison.originalRealShippedUnits)} u · Ficticio:{' '}
                      {fmt(scenarioComparison.originalDummyAmount)} u
                    </div>
                  </div>

                  <div className="p-3.5 rounded-lg bg-cyan-50/70 border border-cyan-200">
                    <div className="text-[11px] font-semibold text-cyan-900">
                      Costo óptimo alternativo (MODI)
                    </div>
                    <div className="mt-1 text-lg font-bold font-mono tabular-nums text-[#0B1F3A]">
                      ${fmt(scenarioComparison.alternativeOptimalCost ?? 0)} MXN
                    </div>
                    <div className="mt-0.5 text-[11px] text-cyan-900 font-mono tabular-nums">
                      CM: ${fmt(scenarioComparison.alternativeLeastCost ?? 0)} · Vogel: $
                      {fmt(scenarioComparison.alternativeVogelCost ?? 0)}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-[11px] font-semibold text-slate-500">
                      Diferencia absoluta y porcentual
                    </div>
                    <div
                      className={`mt-1 text-lg font-bold font-mono tabular-nums ${
                        (scenarioComparison.costDifference ?? 0) > 0
                          ? 'text-amber-900'
                          : (scenarioComparison.costDifference ?? 0) < 0
                          ? 'text-emerald-800'
                          : 'text-[#0B1F3A]'
                      }`}
                    >
                      {(scenarioComparison.costDifference ?? 0) >= 0
                        ? `+$${fmt(scenarioComparison.costDifference ?? 0)}`
                        : `-$${fmt(Math.abs(scenarioComparison.costDifference ?? 0))}`}{' '}
                      MXN ({(scenarioComparison.costDifferencePct ?? 0) >= 0 ? '+' : ''}
                      {(scenarioComparison.costDifferencePct ?? 0).toFixed(2)}%)
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-600 font-mono tabular-nums">
                      {scenarioComparison.costFormulaText}
                    </div>
                  </div>
                </div>

                {scenarioComparison.structuralAlerts.length > 0 && (
                  <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-950 space-y-1">
                    <div className="font-bold text-[#0B1F3A]">
                      Alertas sobre la estructura del modelo
                    </div>
                    <ul className="list-disc list-inside space-y-1 leading-relaxed">
                      {scenarioComparison.structuralAlerts.map((alert, idx) => (
                        <li key={idx}>{alert}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#0B1F3A] text-white">
                        <th className="text-left py-2.5 px-3 font-semibold">Ruta</th>
                        <th className="text-left py-2.5 px-2.5 font-semibold">Estado</th>
                        <th className="text-right py-2.5 px-2.5 font-semibold">Orig. (u)</th>
                        <th className="text-right py-2.5 px-2.5 font-semibold">Alt. (u)</th>
                        <th className="text-right py-2.5 px-2.5 font-semibold">Δ Cant.</th>
                        <th className="text-right py-2.5 px-2.5 font-semibold">Tarifa c_ij</th>
                        <th className="text-right py-2.5 px-3 font-semibold">Δ Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {scenarioComparison.routeDiffs.map((diff, idx) => {
                        const statusLabel =
                          diff.status === 'added'
                            ? 'Agregada'
                            : diff.status === 'removed'
                            ? 'Eliminada'
                            : diff.status === 'increased'
                            ? 'Aumentó'
                            : diff.status === 'decreased'
                            ? 'Disminuyó'
                            : 'Sin cambio';

                        return (
                          <tr
                            key={`diff-${idx}`}
                            className={
                              diff.status === 'added'
                                ? 'bg-cyan-50/50'
                                : diff.status === 'removed'
                                ? 'bg-red-50/40'
                                : 'hover:bg-slate-50/70'
                            }
                          >
                            <td className="py-2 px-3 font-semibold text-[#0B1F3A] whitespace-nowrap">
                              {diff.originName} → {diff.destinationName}
                            </td>
                            <td className="py-2 px-2.5 font-medium text-slate-800 whitespace-nowrap">
                              {statusLabel}
                            </td>
                            <td className="py-2 px-2.5 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                              {fmt(diff.originalQuantity)} u
                            </td>
                            <td className="py-2 px-2.5 text-right font-mono tabular-nums font-semibold text-[#0B1F3A] whitespace-nowrap">
                              {fmt(diff.alternativeQuantity)} u
                            </td>
                            <td className="py-2 px-2.5 text-right font-mono tabular-nums text-slate-800 whitespace-nowrap">
                              {diff.quantityDelta > 0
                                ? `+${fmt(diff.quantityDelta)}`
                                : fmt(diff.quantityDelta)}{' '}
                              u
                            </td>
                            <td className="py-2 px-2.5 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                              ${fmt(diff.originalUnitCost ?? 0)} → ${fmt(diff.alternativeUnitCost ?? 0)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-[#0B1F3A] whitespace-nowrap">
                              {diff.subtotalDelta >= 0
                                ? `+$${fmt(diff.subtotalDelta)}`
                                : `-$${fmt(Math.abs(diff.subtotalDelta))}`}
                            </td>
                          </tr>
                        );
                      })}
                      {scenarioComparison.dummyRouteDiffs.map((diff, idx) => (
                        <tr key={`dummy-diff-${idx}`} className="bg-amber-50/50">
                          <td className="py-2 px-3 font-semibold text-amber-950 whitespace-nowrap">
                            {diff.originName} → {diff.destinationName} (Ficticio)
                          </td>
                          <td className="py-2 px-2.5 text-amber-900 whitespace-nowrap">
                            Balanceo ($0/u)
                          </td>
                          <td className="py-2 px-2.5 text-right font-mono tabular-nums text-amber-900 whitespace-nowrap">
                            {fmt(diff.originalQuantity)} u
                          </td>
                          <td className="py-2 px-2.5 text-right font-mono tabular-nums font-semibold text-amber-950 whitespace-nowrap">
                            {fmt(diff.alternativeQuantity)} u
                          </td>
                          <td className="py-2 px-2.5 text-right font-mono tabular-nums text-amber-950 whitespace-nowrap">
                            {diff.quantityDelta > 0
                              ? `+${fmt(diff.quantityDelta)}`
                              : fmt(diff.quantityDelta)}{' '}
                            u
                          </td>
                          <td className="py-2 px-2.5 text-right font-mono tabular-nums text-amber-900 whitespace-nowrap">
                            $0 → $0
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-amber-900 whitespace-nowrap">
                            $0
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-2 leading-relaxed">
                  <div className="font-bold text-[#0B1F3A] text-sm">
                    Interpretación dinámica de la comparación
                  </div>
                  <p>
                    <strong className="text-[#0B1F3A]">Impacto en el costo:</strong>{' '}
                    {scenarioComparison.dynamicExplanation.costSummary}
                  </p>
                  <p>
                    <strong className="text-[#0B1F3A]">Cambios de entrada detectados:</strong>{' '}
                    {scenarioComparison.dynamicExplanation.driverSummary}
                  </p>
                  <p>
                    <strong className="text-[#0B1F3A]">Rutas y asignaciones:</strong>{' '}
                    {scenarioComparison.dynamicExplanation.routeSummary}
                  </p>
                  {scenarioComparison.dynamicExplanation.dummyLimitationNote && (
                    <p className="text-amber-950 bg-amber-50/70 border border-amber-200 rounded-lg p-2.5">
                      {scenarioComparison.dynamicExplanation.dummyLimitationNote}
                    </p>
                  )}
                  <p className="text-slate-600">
                    {scenarioComparison.dynamicExplanation.validityPrincipleNote}
                  </p>
                </div>
              </div>
            )}
          </AccordionItem>

          {/* 7. Interpretación gerencial y recomendaciones (Etapa 5) */}
          <AccordionItem
            id="managerial"
            title="7. Interpretación gerencial y recomendaciones (Etapa 5)"
            subtitle="Conclusiones prácticas para Zeli Distribuciones respaldadas por el modelo"
            statusLabel={`${dynamicManagerial.recommendations.length} recomendaciones`}
            isOpen={openPanels.has('managerial')}
            onToggle={togglePanel}
          >
            <div className="p-3.5 rounded-lg bg-cyan-50/60 border border-cyan-200 text-xs sm:text-sm text-slate-700 leading-relaxed">
              <strong className="text-[#0B1F3A]">¿Qué muestra esta sección?</strong>{' '}
              Traduce todos los resultados matemáticos en recomendaciones accionables sobre cómo repartir inventario, qué tarifas negociar y qué decisiones tomar ante cambios operativos.
            </div>

            {dynamicManagerial.diagnosis.dummyLimitationWarning && (
              <div className="p-3.5 rounded-lg bg-amber-50/70 border border-amber-200 text-xs text-amber-950 leading-relaxed">
                <strong className="font-semibold">Desbalance oferta-demanda:</strong>{' '}
                {dynamicManagerial.diagnosis.dummyLimitationWarning}
              </div>
            )}

            {dynamicManagerial.diagnosis.degeneracyWarning && (
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 leading-relaxed">
                <strong className="font-semibold text-[#0B1F3A]">Degeneración básica:</strong>{' '}
                {dynamicManagerial.diagnosis.degeneracyWarning}
              </div>
            )}

            {/* Rutas usadas vs no usadas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-2">
                <div className="text-xs font-bold text-[#0B1F3A]">
                  Rutas utilizadas ({dynamicManagerial.diagnosis.activeRoutes.length})
                </div>
                <ul className="divide-y divide-slate-100 text-xs">
                  {dynamicManagerial.diagnosis.activeRoutes.map((r, idx) => (
                    <li key={idx} className="py-1.5 flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-800">
                        {r.originName} → {r.destinationName}
                      </span>
                      <span className="font-mono tabular-nums text-[#0B1F3A] font-semibold whitespace-nowrap">
                        {fmt(r.quantity)} u · ${fmt(r.subtotalCost)} ({r.shareOfRealUnitsPct.toFixed(1)}%)
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-2">
                <div className="text-xs font-bold text-[#0B1F3A]">
                  Rutas no utilizadas actualmente ({dynamicManagerial.diagnosis.unusedRoutes.length})
                </div>
                {dynamicManagerial.diagnosis.unusedRoutes.length === 0 ? (
                  <p className="text-xs text-slate-600">
                    Todas las rutas reales participan con envío positivo en la solución óptima.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100 text-xs">
                    {dynamicManagerial.diagnosis.unusedRoutes.map((uRoute, idx) => (
                      <li key={idx} className="py-2 space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-[#0B1F3A]">
                            {uRoute.originName} → {uRoute.destinationName}
                          </span>
                          <span className="font-mono tabular-nums text-cyan-900 font-semibold whitespace-nowrap">
                            c = ${fmt(uRoute.currentCost)} · Δ = +${fmt(uRoute.reducedCost)}/u
                          </span>
                        </div>
                        <p className="text-slate-600 leading-relaxed">
                          {uRoute.conditionalNote}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Recomendaciones gerenciales */}
            <div className="space-y-2.5">
              <h3 className="text-sm font-bold text-[#0B1F3A]">
                Recomendaciones gerenciales fundamentadas
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {dynamicManagerial.recommendations.map((rec) => (
                  <div
                    key={rec.id}
                    className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs flex flex-col justify-between"
                  >
                    <div className="space-y-1.5">
                      <div className="font-bold text-[#0B1F3A] text-sm">{rec.title}</div>
                      <p className="text-slate-700 leading-relaxed">{rec.recommendation}</p>
                    </div>
                    <div className="space-y-1.5 pt-2 border-t border-slate-200/80">
                      <div className="text-[11px] text-cyan-950 bg-cyan-50/70 border border-cyan-200 rounded-md px-2.5 py-1.5 leading-relaxed">
                        <strong className="font-semibold">Respaldo matemático:</strong>{' '}
                        {rec.mathematicalBasis}
                      </div>
                      {rec.cautionNote && (
                        <div className="text-[11px] text-amber-950 bg-amber-50/70 border border-amber-200 rounded-md px-2.5 py-1.5 leading-relaxed">
                          <strong className="font-semibold">Nota de criterio:</strong>{' '}
                          {rec.cautionNote}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Decisión sobre comparación de escenarios */}
            <div className="space-y-2.5">
              <h3 className="text-sm font-bold text-[#0B1F3A]">
                Decisión sobre comparación de escenarios (Etapa 4)
              </h3>
              <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-[#0B1F3A] text-sm">
                    {dynamicManagerial.scenarioComparisonAnalysis.lowestMathematicalCostLabel}
                  </span>
                  {dynamicManagerial.scenarioComparisonAnalysis.hasChanges &&
                    dynamicManagerial.scenarioComparisonAnalysis.valid && (
                      <span
                        className={`font-semibold px-2.5 py-0.5 rounded-md border ${
                          dynamicManagerial.scenarioComparisonAnalysis.isTrueEfficiencyComparison
                            ? 'bg-cyan-50 border-cyan-200 text-cyan-900'
                            : 'bg-amber-50 border-amber-200 text-amber-950'
                        }`}
                      >
                        {dynamicManagerial.scenarioComparisonAnalysis.isTrueEfficiencyComparison
                          ? 'Comparación directa de eficiencia'
                          : 'No comparable como ahorro directo'}
                      </span>
                    )}
                </div>

                <p className="text-slate-700 leading-relaxed">
                  <strong className="text-[#0B1F3A]">Variación de costo:</strong>{' '}
                  {dynamicManagerial.scenarioComparisonAnalysis.costDeltaSummary}
                </p>
                <p className="text-slate-700 leading-relaxed">
                  <strong className="text-[#0B1F3A]">Cambio en rutas:</strong>{' '}
                  {dynamicManagerial.scenarioComparisonAnalysis.routesDeltaSummary}
                </p>

                {dynamicManagerial.scenarioComparisonAnalysis.comparabilityWarning && (
                  <div className="p-3 rounded-lg bg-amber-50/80 border border-amber-300 text-amber-950 leading-relaxed flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {dynamicManagerial.scenarioComparisonAnalysis.comparabilityWarning}
                    </span>
                    {mainProblemChangedSinceSnapshot && (
                      <button
                        type="button"
                        onClick={onSyncComparatorFromMain}
                        className="min-h-[32px] px-3 py-1 text-xs font-semibold text-white bg-[#0B1F3A] hover:bg-[#13315C] rounded-lg transition-colors cursor-pointer shrink-0"
                      >
                        Sincronizar con configuración actual
                      </button>
                    )}
                  </div>
                )}

                <div>
                  <div className="font-semibold text-[#0B1F3A] mb-1">
                    Criterios para elegir escenario:
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-slate-600 leading-relaxed">
                    {dynamicManagerial.scenarioComparisonAnalysis.selectionCriteria.map(
                      (crit, idx) => (
                        <li key={idx}>{crit}</li>
                      )
                    )}
                  </ul>
                </div>
              </div>
            </div>

            {/* Interpretación económica */}
            <div className="space-y-2.5">
              <h3 className="text-sm font-bold text-[#0B1F3A]">
                Interpretación económica para presentación ejecutiva
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {dynamicManagerial.economicInterpretation.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs"
                  >
                    <div className="font-bold text-[#0B1F3A]">{item.title}</div>
                    <p className="text-slate-700 leading-relaxed">{item.plainExplanation}</p>
                    <p className="text-cyan-950 bg-white border border-slate-200 rounded-md px-2.5 py-1.5 leading-relaxed">
                      <strong className="font-semibold text-[#0B1F3A]">Evidencia actual:</strong>{' '}
                      {item.currentModelEvidence}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </AccordionItem>
        </div>
      </div>
    </section>
  );
};
