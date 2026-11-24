import { AlertCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AdvancedAnalysisSection } from './components/AdvancedAnalysisSection';
import { Header } from './components/Header';
import { HeroOverview } from './components/HeroOverview';
import { MathematicalFormulationCard } from './components/MathematicalFormulationCard';
import {
  DraftMatrixState,
  MatrixEditor,
  parseDraftToProblem,
  problemToDraft,
} from './components/MatrixEditor';
import { ReportsSection } from './components/ReportsSection';
import { ResultsSection, SelectedMethodTab } from './components/ResultsSection';
import { useScenarioComparator } from './hooks/useScenarioComparator';
import { ACADEMIC_PRESETS, ZELI_DEFAULT_CASE } from './math/presets';
import { solveTransportationProblem } from './math/solver';

function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

export default function App() {
  const [selectedPresetId, setSelectedPresetId] = useState<string>('zeli_base');
  const [draft, setDraft] = useState<DraftMatrixState>(() =>
    problemToDraft(ZELI_DEFAULT_CASE)
  );
  const [activeMethod, setActiveMethod] = useState<SelectedMethodTab>('optimal');

  const { problem, parseErrors } = useMemo(() => parseDraftToProblem(draft), [draft]);

  const result = useMemo(() => {
    if (parseErrors.length > 0) {
      return {
        validation: { valid: false, errors: parseErrors },
        balanced: null,
        leastCost: null,
        vogel: null,
        optimal: null,
        comparison: [],
        explanation: null,
        sensitivity: null,
      };
    }
    return solveTransportationProblem(problem);
  }, [problem, parseErrors]);

  const comparator = useScenarioComparator(problem, result);

  const handleDraftChange = (next: DraftMatrixState) => {
    setDraft(next);
    setSelectedPresetId('custom');
  };

  const handleSelectPreset = (presetId: string) => {
    const preset = ACADEMIC_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setSelectedPresetId(preset.id);
    setDraft(problemToDraft(preset.problem));
  };

  const handleResetZeli = () => {
    setSelectedPresetId('zeli_base');
    setDraft(problemToDraft(ZELI_DEFAULT_CASE));
    setActiveMethod('optimal');
  };

  const handleStartAnalysis = () => {
    scrollToSection('configuracion');
  };

  const handleLoadZeliAndFocus = () => {
    handleResetZeli();
    scrollToSection('configuracion');
  };

  return (
    <div id="top" className="min-h-screen flex flex-col bg-[#F4F7FB] text-slate-900">
      <Header onResetZeli={handleLoadZeliAndFocus} />

      <HeroOverview
        onStartAnalysis={handleStartAnalysis}
        onLoadZeliExample={handleLoadZeliAndFocus}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* 1 · Configuración del modelo */}
        <MatrixEditor
          draft={draft}
          selectedPresetId={selectedPresetId}
          balanced={result.balanced}
          errors={result.validation.errors}
          onDraftChange={handleDraftChange}
          onSelectPreset={handleSelectPreset}
        />

        <MathematicalFormulationCard
          problem={problem}
          balanced={result.balanced}
          hasErrors={parseErrors.length > 0 || !result.validation.valid}
        />

        {/* 2, 3, 4 · Resultados, Análisis Avanzado y Reportes */}
        {result.balanced &&
        result.leastCost &&
        result.vogel &&
        result.optimal &&
        result.explanation &&
        result.sensitivity ? (
          <>
            <ResultsSection
              balanced={result.balanced}
              leastCost={result.leastCost}
              vogel={result.vogel}
              optimal={result.optimal}
              comparison={result.comparison}
              explanation={result.explanation}
              activeMethod={activeMethod}
              onSelectMethod={setActiveMethod}
            />

            <AdvancedAnalysisSection
              problem={problem}
              result={result}
              sensitivity={result.sensitivity}
              originalSnapshot={comparator.originalSnapshot}
              altDraft={comparator.altDraft}
              hasAltEdits={comparator.hasAltEdits}
              undoAltDraft={comparator.undoAltDraft}
              mainProblemChangedSinceSnapshot={comparator.mainProblemChangedSinceSnapshot}
              altParseErrors={comparator.altParseErrors}
              invalidAltFields={comparator.invalidAltFields}
              scenarioComparison={comparator.scenarioComparison}
              onSyncComparatorFromMain={comparator.handleSyncComparatorFromMain}
              onRestoreAlternativeToOriginal={
                comparator.handleRestoreAlternativeToOriginal
              }
              onUndoRestore={comparator.handleUndoRestore}
              onUpdateAltSupply={comparator.updateAltSupply}
              onUpdateAltDemand={comparator.updateAltDemand}
              onUpdateAltCost={comparator.updateAltCost}
            />

            <ReportsSection
              problem={problem}
              result={result}
              validExportScenarioComparison={comparator.validExportScenarioComparison}
              hasOutOfSyncScenarioEdits={
                comparator.hasAltEdits && comparator.mainProblemChangedSinceSnapshot
              }
              onSyncComparatorFromMain={comparator.handleSyncComparatorFromMain}
            />
          </>
        ) : (
          <section className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-red-600 mx-auto" />
            <h2 className="text-lg font-bold text-[#0B1F3A]">
              Esperando datos válidos para calcular el plan óptimo
            </h2>
            <p className="text-sm text-slate-600 max-w-xl mx-auto">
              Corrige las celdas marcadas en rojo dentro de la tabla de costos, oferta o demanda para recalcular automáticamente las rutas óptimas, el análisis de sensibilidad y habilitar el reporte PDF.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={handleResetZeli}
                className="min-h-[40px] px-4 py-2 text-sm font-semibold text-white bg-[#0B1F3A] hover:bg-[#13315C] rounded-lg transition-colors cursor-pointer"
              >
                Cargar ejemplo base de Zeli Distribuciones
              </button>
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            OptiRoute – Zeli Distribuciones · Planeación de transporte y distribución
          </span>
          <span>
            Cálculos deterministas verificados (Costo Mínimo, Vogel y MODI)
          </span>
        </div>
      </footer>
    </div>
  );
}
