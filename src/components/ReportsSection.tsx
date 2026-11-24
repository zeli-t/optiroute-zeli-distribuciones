import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileDown,
  FileText,
  Printer,
  ShieldCheck,
  TableProperties,
} from 'lucide-react';
import React, { useState } from 'react';
import { downloadAcademicPdfReport } from '../math/pdfReport';
import { generateAllocationsCsv, generateMarkdownReport } from '../math/reports';
import {
  ScenarioComparisonResult,
  SolveResponse,
  TransportationProblem,
} from '../math/types';

interface ReportsSectionProps {
  problem: TransportationProblem;
  result: SolveResponse;
  validExportScenarioComparison: ScenarioComparisonResult | null;
  hasOutOfSyncScenarioEdits: boolean;
  onSyncComparatorFromMain: () => void;
}

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const ReportsSection: React.FC<ReportsSectionProps> = ({
  problem,
  result,
  validExportScenarioComparison,
  hasOutOfSyncScenarioEdits,
  onSyncComparatorFromMain,
}) => {
  const [pdfFeedback, setPdfFeedback] = useState<'idle' | 'generating' | 'done' | 'error'>('idle');

  const handleDownloadPdf = () => {
    setPdfFeedback('generating');
    try {
      downloadAcademicPdfReport(problem, result, {
        scenarioComparison: validExportScenarioComparison,
      });
      setPdfFeedback('done');
      window.setTimeout(() => setPdfFeedback('idle'), 3500);
    } catch {
      setPdfFeedback('error');
    }
  };

  const handleDownloadMarkdown = () => {
    const md = generateMarkdownReport(problem, result);
    downloadFile('reporte-optiroute-zeli.md', md, 'text/markdown;charset=utf-8');
  };

  const handleDownloadCsv = () => {
    const csv = generateAllocationsCsv(result);
    downloadFile('asignaciones-zeli.csv', csv, 'text/csv;charset=utf-8');
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <section id="reportes" className="scroll-mt-20">
      <div className="bg-[#0B1F3A] text-white rounded-xl p-6 sm:p-8 border border-slate-800 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5 pb-6 border-b border-white/15">
          <div className="max-w-2xl">
            <div className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
              Paso 4 · Reportes y exportación
            </div>
            <h2 className="mt-1 text-xl sm:text-2xl font-bold text-white">
              Descarga tu reporte completo y tus tablas de distribución
            </h2>
            <p className="mt-1.5 text-sm text-slate-300 leading-relaxed">
              Genera el documento académico en PDF A4 con todos los resultados vigentes, o exporta los datos en texto estructurado y formato compatible con Excel.
            </p>
          </div>

          <div className="shrink-0 no-print">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={pdfFeedback === 'generating'}
              className="w-full sm:w-auto min-h-[48px] inline-flex items-center justify-center gap-3 px-6 py-3 text-sm sm:text-base font-bold text-[#0B1F3A] bg-cyan-400 hover:bg-cyan-300 active:bg-cyan-500 disabled:opacity-70 rounded-lg transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
            >
              <FileDown className="w-5 h-5 shrink-0" />
              {pdfFeedback === 'generating'
                ? 'Generando reporte PDF...'
                : 'Descargar reporte PDF'}
            </button>
          </div>
        </div>

        {pdfFeedback === 'done' && (
          <div className="flex items-center gap-2 text-xs sm:text-sm text-cyan-100 bg-white/10 border border-cyan-400/35 rounded-lg px-4 py-3">
            <CheckCircle2 className="w-4 h-4 text-cyan-300 shrink-0" />
            <span>
              Reporte PDF A4 descargado correctamente con los datos actuales.
            </span>
          </div>
        )}

        {pdfFeedback === 'error' && (
          <div className="text-xs sm:text-sm text-red-200 bg-red-900/50 border border-red-400/40 rounded-lg px-4 py-3">
            No se pudo generar el PDF. Verifica que la matriz de configuración tenga datos válidos.
          </div>
        )}

        {hasOutOfSyncScenarioEdits && (
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-lg bg-amber-500/15 border border-amber-300/40 text-xs sm:text-sm text-amber-100 no-print">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
              <span>
                Tienes una comparación de escenarios en Análisis Avanzado basada en datos anteriores. El PDF actual usará únicamente tu configuración principal vigente salvo que sincronices el comparador.
              </span>
            </div>
            <button
              type="button"
              onClick={onSyncComparatorFromMain}
              className="min-h-[34px] px-3.5 py-1.5 text-xs font-semibold text-[#0B1F3A] bg-amber-300 hover:bg-amber-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Sincronizar comparador
            </button>
          </div>
        )}

        {/* Opciones de exportación con explicación clara de su contenido */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 no-print">
          <div className="p-4 rounded-xl bg-white/5 border border-white/15 flex flex-col justify-between space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <FileDown className="w-4 h-4 text-cyan-300 shrink-0" />
                <span>Reporte Académico PDF (A4)</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Documento completo listo para entregar: portada, formulación, Costo Mínimo, Vogel, MODI paso a paso, análisis de sensibilidad, precios sombra, comparador (si hay cambios válidos) y recomendaciones gerenciales.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={pdfFeedback === 'generating'}
              className="w-full min-h-[40px] inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold text-[#0B1F3A] bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              Descargar PDF A4
            </button>
          </div>

          <div className="p-4 rounded-xl bg-white/5 border border-white/15 flex flex-col justify-between space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <FileText className="w-4 h-4 text-cyan-300 shrink-0" />
                <span>Resumen en Markdown (.md)</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Incluye el resumen del problema base, tabla comparativa de los 3 métodos, rutas óptimas MODI, multiplicadores duales (u_i, v_j) y matriz de costos en texto estructurado.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDownloadMarkdown}
              className="w-full min-h-[40px] inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-white bg-white/10 hover:bg-white/15 border border-white/20 rounded-lg transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
              Descargar .md
            </button>
          </div>

          <div className="p-4 rounded-xl bg-white/5 border border-white/15 flex flex-col justify-between space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <TableProperties className="w-4 h-4 text-cyan-300 shrink-0" />
                <span>Tabla para Excel (.csv)</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Exporta la tabla de asignaciones óptimas con almacén, sucursal, unidades asignadas, costo unitario y subtotal para analizarla o graficarla en hojas de cálculo.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="w-full min-h-[40px] inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-white bg-white/10 hover:bg-white/15 border border-white/20 rounded-lg transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
              Exportar .csv
            </button>
          </div>

          <div className="p-4 rounded-xl bg-white/5 border border-white/15 flex flex-col justify-between space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Printer className="w-4 h-4 text-cyan-300 shrink-0" />
                <span>Imprimir / Vista limpia</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Abre la vista de impresión del navegador para imprimir los resultados en pantalla o guardarlos rápidamente como PDF desde tu equipo.
              </p>
            </div>
            <button
              type="button"
              onClick={handlePrint}
              className="w-full min-h-[40px] inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-white bg-white/10 hover:bg-white/15 border border-white/20 rounded-lg transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
              Imprimir pantalla
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-white/15 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-slate-300">
          <div className="flex items-center gap-2 font-semibold text-white">
            <ShieldCheck className="w-4 h-4 text-cyan-300 shrink-0" />
            <span>Cálculos deterministas verificables</span>
          </div>
          <span>
            {validExportScenarioComparison
              ? 'Tu comparación de escenarios activa (Etapa 4) se incluirá automáticamente en el PDF.'
              : 'Todos los archivos reflejan en tiempo real la configuración actual de tu matriz.'}
          </span>
        </div>
      </div>
    </section>
  );
};
