import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { EPSILON } from './balance';
import {
  buildManagerialDecisionAnalysis,
  buildSensitivityScaffold,
  buildSlackSaturationAnalysis,
  getZeroRealFlowWarning,
} from './sensitivity';
import {
  ScenarioComparisonResult,
  SolveResponse,
  TransportationProblem,
} from './types';

function fmt(n: number): string {
  return Number.isInteger(n)
    ? n.toLocaleString('es-MX')
    : n.toLocaleString('es-MX', { maximumFractionDigits: 4 });
}

function fmtPct(n: number): string {
  if (Math.abs(n) <= EPSILON) return '0.00%';
  return `${n.toFixed(2)}%`;
}

/**
 * Convierte símbolos matemáticos fuera de WinAnsiEncoding a notación legible
 * compatible con las fuentes integradas de jsPDF (Helvetica / Courier).
 */
export function pdfSafeText(text: string): string {
  return text
    .replace(/Δ/g, 'Delta')
    .replace(/δ/g, 'delta')
    .replace(/θ/g, 'theta')
    .replace(/∞/g, 'inf')
    .replace(/Σ/g, 'Sum')
    .replace(/∈/g, 'en')
    .replace(/⇒/g, '=>')
    .replace(/→/g, '->')
    .replace(/−/g, '-')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/×/g, 'x')
    .replace(/·/g, '*');
}

export interface PdfReportOptions {
  scenarioComparison?: ScenarioComparisonResult | null;
}

export interface PdfReportDataSummary {
  generatedAtText: string;
  optimalCost: number;
  leastCostTotal: number;
  vogelTotal: number;
  savingsVsLeastCost: number;
  savingsVsVogel: number;
  gapPctVsLeastCost: number;
  gapPctVsVogel: number;
  savingsPctVsLeastCost: number;
  savingsPctVsVogel: number;
  leastCostHasDegeneracy: boolean;
  vogelHasDegeneracy: boolean;
  balanceLabel: string;
  leastCostStepsCount: number;
  vogelStepsCount: number;
  modiIterationsCount: number;
  modiVerifiedWithoutPivots: boolean;
  routesCount: number;
  realDistributedUnits: number;
  includedCostSensitivity: boolean;
  includedRhsSensitivity: boolean;
  includedShadowPrices: boolean;
  includedScenarioComparison: boolean;
  includedManagerialAnalysis: boolean;
  scenarioComparisonComparable: boolean | null;
}

export function extractPdfSummary(
  result: SolveResponse,
  generatedAt: Date = new Date(),
  options?: PdfReportOptions
): PdfReportDataSummary {
  if (
    !result.balanced ||
    !result.leastCost ||
    !result.vogel ||
    !result.optimal ||
    !result.explanation
  ) {
    throw new Error('No es posible generar el reporte PDF sin una solución válida.');
  }

  const optimalCost = result.optimal.totalCost;
  const leastCostTotal = result.leastCost.totalCost;
  const vogelTotal = result.vogel.totalCost;

  const savingsVsLeastCost = Math.max(0, leastCostTotal - optimalCost);
  const savingsVsVogel = Math.max(0, vogelTotal - optimalCost);

  const gapPctVsLeastCost =
    optimalCost > EPSILON ? (savingsVsLeastCost / optimalCost) * 100 : 0;
  const gapPctVsVogel =
    optimalCost > EPSILON ? (savingsVsVogel / optimalCost) * 100 : 0;

  const savingsPctVsLeastCost =
    leastCostTotal > EPSILON ? (savingsVsLeastCost / leastCostTotal) * 100 : 0;
  const savingsPctVsVogel =
    vogelTotal > EPSILON ? (savingsVsVogel / vogelTotal) * 100 : 0;

  const leastCostHasDegeneracy = result.leastCost.steps.some(
    (s) => s.quantity <= EPSILON
  );
  const vogelHasDegeneracy = result.vogel.steps.some(
    (s) => s.quantity <= EPSILON
  );

  const balanceLabel =
    result.balanced.balanceStatus === 'balanced'
      ? 'Problema balanceado: oferta total igual a demanda total'
      : result.balanced.balanceStatus === 'dummy_destination'
      ? `Desbalanceado: Destino Ficticio (+${fmt(result.balanced.dummyAmount)} u)`
      : `Desbalanceado: Origen Ficticio (+${fmt(result.balanced.dummyAmount)} u)`;

  const modiVerifiedWithoutPivots =
    result.optimal.iterations.length === 1 &&
    result.optimal.iterations[0].enteringCell === null;

  let realDistributedUnits = 0;
  for (let i = 0; i < result.balanced.origins.length; i++) {
    if (i === result.balanced.dummyRowIndex) continue;
    for (let j = 0; j < result.balanced.destinations.length; j++) {
      if (j === result.balanced.dummyColIndex) continue;
      realDistributedUnits += result.optimal.allocations[i][j];
    }
  }

  const validComparison =
    options?.scenarioComparison &&
    options.scenarioComparison.valid &&
    options.scenarioComparison.hasInputChanges
      ? options.scenarioComparison
      : null;

  const scenarioComparisonComparable = validComparison
    ? Math.abs(
        validComparison.alternativeRealShippedUnits -
          validComparison.originalRealShippedUnits
      ) <= EPSILON &&
      validComparison.originalBalanceStatus === 'balanced' &&
      validComparison.alternativeBalanceStatus === 'balanced' &&
      validComparison.originalDummyAmount <= EPSILON &&
      validComparison.alternativeDummyAmount <= EPSILON
    : null;

  return {
    generatedAtText: generatedAt.toLocaleString('es-MX', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
    optimalCost,
    leastCostTotal,
    vogelTotal,
    savingsVsLeastCost,
    savingsVsVogel,
    gapPctVsLeastCost,
    gapPctVsVogel,
    savingsPctVsLeastCost,
    savingsPctVsVogel,
    leastCostHasDegeneracy,
    vogelHasDegeneracy,
    balanceLabel,
    leastCostStepsCount: result.leastCost.steps.length,
    vogelStepsCount: result.vogel.steps.length,
    modiIterationsCount: result.optimal.iterations.length,
    modiVerifiedWithoutPivots,
    routesCount: result.explanation.routeExplanations.length,
    realDistributedUnits,
    includedCostSensitivity: true,
    includedRhsSensitivity: true,
    includedShadowPrices: true,
    includedScenarioComparison: validComparison !== null,
    includedManagerialAnalysis: true,
    scenarioComparisonComparable,
  };
}

interface JsPdfWithAutoTable extends jsPDF {
  lastAutoTable?: {
    finalY: number;
  };
}

const PAGE_MARGIN = { top: 20, right: 14, bottom: 16, left: 14 };
const CONTENT_WIDTH = 182; // A4 (210mm) - 14mm - 14mm
const MAX_Y = 278;

function getLastY(doc: JsPdfWithAutoTable, fallback: number): number {
  return doc.lastAutoTable?.finalY ?? fallback;
}

function ensureSpace(doc: jsPDF, cursorY: number, neededHeight: number): number {
  if (cursorY + neededHeight > MAX_Y) {
    doc.addPage();
    return PAGE_MARGIN.top;
  }
  return cursorY;
}

/**
 * Dibuja el título de sección asegurando espacio suficiente para mantenerlo
 * unido al contenido o tabla que le sigue inmediatamente.
 */
function drawSectionHeading(
  doc: jsPDF,
  cursorY: number,
  title: string,
  minFollowerHeight: number = 34
): number {
  const y = ensureSpace(doc, cursorY, 10 + minFollowerHeight);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(pdfSafeText(title), PAGE_MARGIN.left, y);

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.35);
  doc.line(PAGE_MARGIN.left, y + 2, PAGE_MARGIN.left + CONTENT_WIDTH, y + 2);

  return y + 5.5;
}

function drawParagraph(
  doc: jsPDF,
  cursorY: number,
  text: string,
  options?: { fontSize?: number; bold?: boolean; color?: [number, number, number]; gapAfter?: number }
): number {
  const fontSize = options?.fontSize ?? 9;
  const lineHeight = fontSize * 0.4;
  doc.setFont('helvetica', options?.bold ? 'bold' : 'normal');
  doc.setFontSize(fontSize);
  const color = options?.color ?? [51, 65, 85];
  doc.setTextColor(color[0], color[1], color[2]);

  const lines: string[] = doc.splitTextToSize(pdfSafeText(text), CONTENT_WIDTH);
  let y = cursorY;

  for (const line of lines) {
    if (y + lineHeight > MAX_Y) {
      doc.addPage();
      y = PAGE_MARGIN.top;
    }
    doc.text(line, PAGE_MARGIN.left, y);
    y += lineHeight;
  }

  return y + (options?.gapAfter ?? 1.8);
}

export function buildAcademicPdfReport(
  problem: TransportationProblem,
  result: SolveResponse,
  generatedAt: Date = new Date(),
  options?: PdfReportOptions
): { doc: jsPDF; summary: PdfReportDataSummary; finalCursorY: number } {
  if (
    !result.validation.valid ||
    !result.balanced ||
    !result.leastCost ||
    !result.vogel ||
    !result.optimal ||
    !result.explanation
  ) {
    throw new Error('No hay una solución válida para exportar a PDF.');
  }

  const summary = extractPdfSummary(result, generatedAt, options);
  const balanced = result.balanced;
  const leastCost = result.leastCost;
  const vogel = result.vogel;
  const optimal = result.optimal;
  const explanation = result.explanation;

  const scaffold =
    result.sensitivity ?? buildSensitivityScaffold(balanced, optimal);
  const validComparison =
    options?.scenarioComparison &&
    options.scenarioComparison.valid &&
    options.scenarioComparison.hasInputChanges
      ? options.scenarioComparison
      : null;

  const costSensitivity = scaffold.costSensitivity;
  const rhsSensitivity = scaffold.rhsSensitivity;
  const dualShadowPrices = scaffold.dualShadowPrices;
  const managerialAnalysis = validComparison
    ? buildManagerialDecisionAnalysis(
        balanced,
        optimal,
        costSensitivity,
        rhsSensitivity,
        dualShadowPrices,
        validComparison
      )
    : scaffold.managerialAnalysis;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  }) as JsPdfWithAutoTable;

  // =========================================================================
  // 1. PORTADA (PÁGINA 1)
  // =========================================================================
  doc.setFillColor(29, 78, 216);
  doc.rect(0, 0, 210, 8, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(29, 78, 216);
  doc.text('REPORTE ACADÉMICO DE OPTIMIZACIÓN', PAGE_MARGIN.left, 34);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.setTextColor(15, 23, 42);
  doc.text(pdfSafeText('OptiRoute – Zeli Distribuciones'), PAGE_MARGIN.left, 48);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.setTextColor(51, 65, 85);
  doc.text('Proyecto de Investigación de Operaciones', PAGE_MARGIN.left, 58);

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.5);
  doc.line(PAGE_MARGIN.left, 65, PAGE_MARGIN.left + CONTENT_WIDTH, 65);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(
    pdfSafeText('Modelo de Transporte con Costos Unitarios (Costo Mínimo, Vogel y MODI)'),
    PAGE_MARGIN.left,
    74
  );
  doc.text(
    pdfSafeText(`Fecha de generación: ${summary.generatedAtText}`),
    PAGE_MARGIN.left,
    81
  );

  autoTable(doc, {
    startY: 94,
    margin: PAGE_MARGIN,
    tableWidth: CONTENT_WIDTH,
    theme: 'grid',
    head: [['Indicador del escenario evaluado', 'Valor calculado']],
    body: [
      [
        'Dimensiones originales del modelo',
        `${problem.origins.length} almacenes x ${problem.destinations.length} sucursales`,
      ],
      [
        'Oferta total / Demanda total original',
        `${fmt(balanced.originalSupplyTotal)} u / ${fmt(balanced.originalDemandTotal)} u`,
      ],
      ['Estado de balanceo', pdfSafeText(summary.balanceLabel)],
      ['Costo total por Costo Mínimo', `$${fmt(leastCost.totalCost)} MXN`],
      ['Costo total por Aproximación de Vogel (VAM)', `$${fmt(vogel.totalCost)} MXN`],
      ['Costo mínimo óptimo verificado (MODI)', `$${fmt(optimal.totalCost)} MXN`],
      [
        'Ahorro logrado por MODI vs heurísticas',
        `Costo Mínimo: $${fmt(summary.savingsVsLeastCost)} MXN (${fmtPct(summary.savingsPctVsLeastCost)}) | Vogel: $${fmt(summary.savingsVsVogel)} MXN (${fmtPct(summary.savingsPctVsVogel)})`,
      ],
      ['Rutas activas en el plan óptimo', `${summary.routesCount}`],
    ],
    styles: {
      font: 'helvetica',
      fontSize: 9.5,
      cellPadding: 3.3,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.25,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 82, fontStyle: 'bold' },
      1: { cellWidth: 100 },
    },
    rowPageBreak: 'avoid',
  });

  const afterCoverTableY = getLastY(doc, 175) + 12;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('Contenido del reporte', PAGE_MARGIN.left, afterCoverTableY);

  const tocItems = [
    '1. Descripción del problema de transporte y variables matemáticas',
    '2. Matriz de costos unitarios, oferta y demanda',
    '3. Balanceo del problema',
    '4. Comparación de métodos y ahorro obtenido',
    '5. Matriz de asignaciones óptimas (MODI)',
    '6. Desarrollo matemático paso a paso',
    '7. Interpretación de resultados y conclusión',
    '8. Análisis de sensibilidad de costos unitarios (Etapa 1)',
    '9. Sensibilidad de oferta y demanda (Etapa 2)',
    '10. Interpretación económica de precios sombra (Etapa 3)',
    ...(validComparison
      ? [
          '11. Comparación de escenarios: original vs. alternativo (Etapa 4)',
          '12. Interpretación gerencial y recomendaciones (Etapa 5)',
        ]
      : ['11. Interpretación gerencial y recomendaciones (Etapa 5)']),
  ];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  tocItems.forEach((item, idx) => {
    doc.text(pdfSafeText(item), PAGE_MARGIN.left + 2, afterCoverTableY + 6.5 + idx * 4.8);
  });

  // =========================================================================
  // PÁGINA 2+: DESARROLLO TÉCNICO DEL MODELO
  // =========================================================================
  doc.addPage();
  let y = PAGE_MARGIN.top;

  // 1. Descripción del problema y variables matemáticas
  y = drawSectionHeading(doc, y, '1. Descripción del problema de transporte y variables matemáticas', 48);
  y = drawParagraph(
    doc,
    y,
    `Zeli Distribuciones requiere determinar las cantidades óptimas de envío (x_ij) desde ${problem.origins.length} almacenes de origen hacia ${problem.destinations.length} sucursales de destino para minimizar el costo total de transporte en MXN, sujeto a la capacidad de oferta de cada almacén y a la demanda requerida por cada sucursal.`
  );
  y = drawParagraph(
    doc,
    y,
    'Formulación matemática: Minimizar Z = sum_i sum_j (c_ij * x_ij), sujeto a sum_j x_ij = a_i (oferta), sum_i x_ij = b_j (demanda) y x_ij >= 0 para todo par (i, j).',
    { fontSize: 8.8, color: [71, 85, 105], gapAfter: 2.5 }
  );

  autoTable(doc, {
    startY: y,
    margin: PAGE_MARGIN,
    theme: 'grid',
    head: [['Variable', 'Significado en el modelo matemático']],
    body: [
      ['x_ij', 'Cantidad de unidades asignadas desde el almacén i hacia la sucursal j (x_ij >= 0).'],
      ['c_ij', 'Costo unitario de transporte (MXN/unidad) del almacén i a la sucursal j.'],
      ['u_i', 'Multiplicador dual (potencial) asociado al origen i en el método MODI.'],
      ['v_j', 'Multiplicador dual (potencial) asociado al destino j en el método MODI.'],
      [
        'Delta_ij',
        'Costo reducido de una celda no básica: Delta_ij = c_ij - (u_i + v_j). Mide el cambio en Z por unidad enviada.',
      ],
    ],
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    styles: {
      font: 'helvetica',
      fontSize: 7.8,
      cellPadding: 1.5,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 22, fontStyle: 'bold', halign: 'center' },
    },
  });

  y = getLastY(doc, y) + 4;

  // 2. Matriz original de costos, oferta y demanda
  const origRowsEstHeight = 14 + (problem.origins.length + 2) * 7;
  y = drawSectionHeading(
    doc,
    y,
    '2. Matriz de costos unitarios, oferta y demanda (datos originales)',
    Math.min(origRowsEstHeight, 48)
  );

  const origColCount = problem.destinations.length + 2;
  const origFontSize = origColCount > 8 ? 7 : origColCount > 6 ? 8 : 8.5;

  const origHead = [
    'Almacén \\ Sucursal',
    ...problem.destinations.map((d) => pdfSafeText(d)),
    'Oferta (u)',
  ];
  const origBody = problem.origins.map((orig, i) => [
    pdfSafeText(orig),
    ...problem.costs[i].map((c) => `$${fmt(c)}`),
    fmt(problem.supply[i]),
  ]);
  const origFoot = [
    'Demanda (u)',
    ...problem.demand.map((d) => fmt(d)),
    `${fmt(balanced.originalSupplyTotal)} / ${fmt(balanced.originalDemandTotal)}`,
  ];

  autoTable(doc, {
    startY: y,
    margin: PAGE_MARGIN,
    theme: 'grid',
    head: [origHead],
    body: origBody,
    foot: [origFoot],
    showHead: 'everyPage',
    showFoot: 'lastPage',
    rowPageBreak: 'avoid',
    horizontalPageBreak: true,
    horizontalPageBreakRepeat: 0,
    styles: {
      font: 'helvetica',
      fontSize: origFontSize,
      cellPadding: 2.1,
      halign: 'right',
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      halign: 'center',
    },
    footStyles: {
      fillColor: [248, 250, 252],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { halign: 'left', fontStyle: 'bold' },
    },
  });

  y = getLastY(doc, y) + 5.5;

  // 3. Balanceo del problema
  y = drawSectionHeading(doc, y, '3. Balanceo del problema', 18);
  const balanceSectionText =
    balanced.balanceStatus === 'balanced'
      ? `Problema balanceado: oferta total igual a demanda total (${fmt(balanced.originalSupplyTotal)} u = ${fmt(balanced.originalDemandTotal)} u). No se requiere agregar origen ni destino ficticio.`
      : explanation.balanceSummary;
  y = drawParagraph(doc, y, balanceSectionText);
  if (explanation.unbalancedNote) {
    y = drawParagraph(doc, y, explanation.unbalancedNote, {
      color: [146, 64, 14],
    });
  }
  const zeroFlowWarning = getZeroRealFlowWarning(
    balanced.originalSupplyTotal,
    balanced.originalDemandTotal
  );
  if (zeroFlowWarning) {
    y = drawParagraph(doc, y, zeroFlowWarning.message, {
      bold: true,
      color: [153, 27, 27],
    });
  }
  y += 2;

  // 4. Comparación de métodos y ahorro
  y = drawSectionHeading(
    doc,
    y,
    '4. Comparación de métodos y ahorro respecto a soluciones iniciales',
    42
  );

  const compBody = result.comparison.map((row) => {
    const diff = Math.max(0, row.totalCost - optimal.totalCost);
    const gapPct = optimal.totalCost > EPSILON ? (diff / optimal.totalCost) * 100 : 0;
    const savingsPct = row.totalCost > EPSILON ? (diff / row.totalCost) * 100 : 0;

    return [
      pdfSafeText(row.methodName),
      `$${fmt(row.totalCost)} MXN`,
      diff <= EPSILON ? '$0 MXN' : `+$${fmt(diff)} MXN`,
      diff <= EPSILON ? '0.00%' : `+${fmtPct(gapPct)}`,
      row.methodId === 'optimal' ? '-' : fmtPct(savingsPct),
      String(row.activeRoutesCount),
      row.methodId === 'optimal'
        ? 'Óptimo certificado'
        : row.isOptimal
        ? 'Alcanzó el óptimo'
        : 'Subóptimo',
    ];
  });

  autoTable(doc, {
    startY: y,
    margin: PAGE_MARGIN,
    theme: 'grid',
    head: [
      [
        'Método',
        'Costo Total',
        'Sobrecosto',
        'Brecha vs óptimo',
        'Ahorro vs inicial',
        'Rutas',
        'Evaluación',
      ],
    ],
    body: compBody,
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    styles: {
      font: 'helvetica',
      fontSize: 7.7,
      cellPadding: 1.8,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 38 },
      1: { cellWidth: 23, halign: 'right' },
      2: { cellWidth: 22, halign: 'right' },
      3: { cellWidth: 24, halign: 'right' },
      4: { cellWidth: 24, halign: 'right' },
      5: { cellWidth: 13, halign: 'right' },
      6: { cellWidth: 38 },
    },
  });

  y = getLastY(doc, y) + 4;
  y = drawParagraph(
    doc,
    y,
    `Costo total óptimo certificado (MODI): $${fmt(optimal.totalCost)} MXN. Frente a Costo Mínimo: ahorro de $${fmt(summary.savingsVsLeastCost)} MXN (${fmtPct(summary.savingsPctVsLeastCost)} sobre el costo inicial; brecha de ${fmtPct(summary.gapPctVsLeastCost)} respecto al óptimo). Frente a Vogel: ahorro de $${fmt(summary.savingsVsVogel)} MXN (${fmtPct(summary.savingsPctVsVogel)} sobre el costo inicial; brecha de ${fmtPct(summary.gapPctVsVogel)} respecto al óptimo).`,
    { bold: true, fontSize: 8.5, color: [15, 23, 42] }
  );
  y = drawParagraph(
    doc,
    y,
    'Nota metodológica: la brecha porcentual respecto al óptimo mide el exceso porcentual de la solución inicial frente al mínimo global mediante (Costo inicial - Costo óptimo) / Costo óptimo x 100. Por su parte, el porcentaje de ahorro respecto al costo inicial mide la reducción lograda sobre la solución de partida mediante (Costo inicial - Costo óptimo) / Costo inicial x 100.',
    { fontSize: 8.1, color: [71, 85, 105] }
  );
  y += 2;

  // 5. Matriz de asignaciones óptimas
  y = drawSectionHeading(doc, y, '5. Matriz de asignaciones óptimas (MODI)', 45);

  const optColCount = balanced.destinations.length + 3;
  const optFontSize = optColCount > 9 ? 6.5 : optColCount > 7 ? 7.2 : 8;

  const optHead = [
    'Origen \\ Destino',
    ...balanced.destinations.map((d, j) => `${pdfSafeText(d)}\n(Dem: ${fmt(balanced.demand[j])} u)`),
    'Oferta (u)',
    'u_i',
  ];

  const optBody = balanced.origins.map((orig, i) => [
    `${pdfSafeText(orig)}\n(Of: ${fmt(balanced.supply[i])} u)`,
    ...balanced.destinations.map((_, j) => {
      const qty = optimal.allocations[i][j];
      const cost = balanced.costs[i][j];
      const isBasic = optimal.basicMask[i][j];
      const rc = optimal.finalReducedCosts[i][j];
      if (qty > EPSILON) {
        return `${fmt(qty)} u\n($${fmt(cost)}/u | Sub: $${fmt(qty * cost)})`;
      }
      if (isBasic) {
        return `0 u (Básica)\n($${fmt(cost)}/u)`;
      }
      return `0 u\n($${fmt(cost)}/u | Delta=${rc !== null ? fmt(rc) : '-'})`;
    }),
    fmt(balanced.supply[i]),
    fmt(optimal.finalU[i]),
  ]);

  const optFoot = [
    'v_j (MODI)',
    ...optimal.finalV.map((vj) => fmt(vj)),
    fmt(balanced.supply.reduce((a, b) => a + b, 0)),
    '-',
  ];

  autoTable(doc, {
    startY: y,
    margin: PAGE_MARGIN,
    theme: 'grid',
    head: [optHead],
    body: optBody,
    foot: [optFoot],
    showHead: 'everyPage',
    showFoot: 'lastPage',
    rowPageBreak: 'avoid',
    horizontalPageBreak: true,
    horizontalPageBreakRepeat: 0,
    styles: {
      font: 'helvetica',
      fontSize: optFontSize,
      cellPadding: 2,
      halign: 'center',
      valign: 'middle',
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [29, 78, 216],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { halign: 'left', fontStyle: 'bold' },
    },
  });

  y = getLastY(doc, y) + 4.5;

  // 5.1 Análisis de Holguras y Saturación de Restricciones
  const slackAnalysis = buildSlackSaturationAnalysis(balanced, optimal);
  y = ensureSpace(doc, y, 42);
  y = drawParagraph(
    doc,
    y,
    '5.1 Análisis de Holguras y Saturación de Restricciones',
    { fontSize: 10, bold: true, color: [15, 23, 42] }
  );
  y = drawParagraph(
    doc,
    y,
    'Detalle del cumplimiento de las restricciones de oferta (almacenes) y demanda (sucursales) en la solución óptima MODI. Las holguras indican inventario no asignado (Destino Ficticio) o demanda insatisfecha (Origen Ficticio) cuando existe desbalanceo.',
    { fontSize: 8.2, color: [71, 85, 105] }
  );

  autoTable(doc, {
    startY: y,
    margin: PAGE_MARGIN,
    tableWidth: CONTENT_WIDTH,
    theme: 'grid',
    head: [
      [
        'Almacén (Oferta)',
        'Oferta disp.',
        'Enviado real',
        'Holgura / Sin asignar',
        'Estado de restricción',
      ],
    ],
    body: slackAnalysis.supplyRows.map((row) => [
      pdfSafeText(row.originName),
      `${fmt(row.supplyAvailable)} u`,
      `${fmt(row.realShipped)} u`,
      `${fmt(row.slackUnassigned)} u`,
      pdfSafeText(row.statusLabel),
    ]),
    foot: [
      [
        'Total oferta',
        `${fmt(slackAnalysis.totalSupplyAvailable)} u`,
        `${fmt(slackAnalysis.totalRealShipped)} u`,
        `${fmt(slackAnalysis.totalSlackUnassigned)} u`,
        slackAnalysis.totalSlackUnassigned > EPSILON
          ? 'Excedente en Destino Ficticio'
          : 'Oferta 100 % saturada',
      ],
    ],
    showHead: 'everyPage',
    showFoot: 'lastPage',
    rowPageBreak: 'avoid',
    styles: {
      font: 'helvetica',
      fontSize: 7.4,
      cellPadding: 1.7,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 42, fontStyle: 'bold' },
      1: { cellWidth: 26, halign: 'right' },
      2: { cellWidth: 26, halign: 'right' },
      3: { cellWidth: 34, halign: 'right' },
      4: { cellWidth: 54 },
    },
  });

  y = getLastY(doc, y) + 3;

  autoTable(doc, {
    startY: y,
    margin: PAGE_MARGIN,
    tableWidth: CONTENT_WIDTH,
    theme: 'grid',
    head: [
      [
        'Sucursal (Demanda)',
        'Demanda req.',
        'Recibido real',
        'Holgura / Insatisfecha',
        'Estado de restricción',
      ],
    ],
    body: slackAnalysis.demandRows.map((row) => [
      pdfSafeText(row.destinationName),
      `${fmt(row.demandRequired)} u`,
      `${fmt(row.realReceived)} u`,
      `${fmt(row.unmetDemand)} u`,
      pdfSafeText(row.statusLabel),
    ]),
    foot: [
      [
        'Total demanda',
        `${fmt(slackAnalysis.totalDemandRequired)} u`,
        `${fmt(slackAnalysis.totalRealReceived)} u`,
        `${fmt(slackAnalysis.totalUnmetDemand)} u`,
        slackAnalysis.totalUnmetDemand > EPSILON
          ? 'Déficit en Origen Ficticio'
          : 'Demanda 100 % saturada',
      ],
    ],
    showHead: 'everyPage',
    showFoot: 'lastPage',
    rowPageBreak: 'avoid',
    styles: {
      font: 'helvetica',
      fontSize: 7.4,
      cellPadding: 1.7,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [29, 78, 216],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 42, fontStyle: 'bold' },
      1: { cellWidth: 26, halign: 'right' },
      2: { cellWidth: 26, halign: 'right' },
      3: { cellWidth: 34, halign: 'right' },
      4: { cellWidth: 54 },
    },
  });

  y = getLastY(doc, y) + 4.5;

  // =========================================================================
  // 6. DESARROLLO MATEMÁTICO PASO A PASO
  // =========================================================================
  y = drawSectionHeading(doc, y, '6. Desarrollo matemático paso a paso (registros reales)', 42);

  // 6.1 Costo Mínimo
  y = ensureSpace(doc, y, 36);
  y = drawParagraph(doc, y, '6.1 Método de Costo Mínimo', {
    fontSize: 10,
    bold: true,
    color: [15, 23, 42],
  });

  autoTable(doc, {
    startY: y,
    margin: PAGE_MARGIN,
    theme: 'grid',
    head: [['Paso', 'Celda elegida', 'Costo u.', 'Asignación', 'Restante (Of. / Dem.)', 'Acumulado', 'Cierre']],
    body: leastCost.steps.map((s) => [
      `#${s.stepNumber}`,
      pdfSafeText(`${s.originName} -> ${s.destinationName}`),
      `$${fmt(s.unitCost)}`,
      s.quantity <= EPSILON ? '0 u (Básica degenerada)' : `${fmt(s.quantity)} u`,
      pdfSafeText(`${s.originName}: ${fmt(s.cellSupplyAfter)} u | ${s.destinationName}: ${fmt(s.cellDemandAfter)} u`),
      `$${fmt(s.cumulativeCostAfter)}`,
      pdfSafeText(s.crossedOut.description),
    ]),
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    styles: {
      font: 'helvetica',
      fontSize: 7.3,
      cellPadding: 1.8,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      5: { halign: 'right' },
    },
  });

  y = getLastY(doc, y) + 3.5;
  if (summary.leastCostHasDegeneracy) {
    const degSteps = leastCost.steps
      .filter((s) => s.quantity <= EPSILON)
      .map((s) => `Paso #${s.stepNumber} (${s.originName} -> ${s.destinationName})`)
      .join(', ');
    y = drawParagraph(
      doc,
      y,
      `Nota sobre asignación de 0 unidades (${degSteps}): se trata de una asignación básica degenerada utilizada para mantener la estructura matemática de la solución (m + n - 1 celdas básicas y conectividad del árbol base para calcular potenciales en MODI); no representa un envío real ni una ruta activa.`,
      { fontSize: 8.1, color: [71, 85, 105], gapAfter: 2.5 }
    );
  }
  y += 1.5;

  // 6.2 Aproximación de Vogel
  y = ensureSpace(doc, y, 38);
  y = drawParagraph(doc, y, '6.2 Método de Aproximación de Vogel (VAM)', {
    fontSize: 10,
    bold: true,
    color: [15, 23, 42],
  });

  autoTable(doc, {
    startY: y,
    margin: PAGE_MARGIN,
    theme: 'grid',
    head: [['Paso', 'Penalizaciones (Filas / Cols)', 'Selección', 'Celda elegida', 'Asignado', 'Restante', 'Acumulado']],
    body: vogel.steps.map((s) => {
      const rowPen = s.rowPenalties
        ? s.rowPenalties.map((p, idx) => `${balanced.origins[idx]}:${p === null ? 'x' : fmt(p)}`).join(', ')
        : '-';
      const colPen = s.colPenalties
        ? s.colPenalties.map((p, idx) => `${balanced.destinations[idx]}:${p === null ? 'x' : fmt(p)}`).join(', ')
        : '-';
      const selText =
        s.selectedPenalty?.kind === 'single_line'
          ? `Línea única (${s.selectedPenalty.lineName})`
          : s.selectedPenalty
          ? `${s.selectedPenalty.kind === 'row' ? 'Fila' : 'Col'} ${s.selectedPenalty.lineName} (P=${fmt(s.selectedPenalty.penalty ?? 0)})`
          : '-';

      return [
        `#${s.stepNumber}`,
        pdfSafeText(`F: [${rowPen}]\nC: [${colPen}]`),
        pdfSafeText(selText),
        pdfSafeText(`${s.originName} -> ${s.destinationName} ($${fmt(s.unitCost)})`),
        s.quantity <= EPSILON ? '0 u (Básica degenerada)' : `${fmt(s.quantity)} u`,
        pdfSafeText(`Of:${fmt(s.cellSupplyAfter)} / Dem:${fmt(s.cellDemandAfter)}`),
        `$${fmt(s.cumulativeCostAfter)}`,
      ];
    }),
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    styles: {
      font: 'helvetica',
      fontSize: 7.1,
      cellPadding: 1.8,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      4: { halign: 'right' },
      6: { halign: 'right' },
    },
  });

  y = getLastY(doc, y) + 3.5;
  if (summary.vogelHasDegeneracy) {
    const degSteps = vogel.steps
      .filter((s) => s.quantity <= EPSILON)
      .map((s) => `Paso #${s.stepNumber} (${s.originName} -> ${s.destinationName})`)
      .join(', ');
    y = drawParagraph(
      doc,
      y,
      `Nota sobre asignación de 0 unidades (${degSteps}): se trata de una asignación básica degenerada utilizada para mantener la estructura matemática de la solución (m + n - 1 celdas básicas y conectividad del árbol base para calcular potenciales en MODI); no representa un envío real ni una ruta activa.`,
      { fontSize: 8.1, color: [71, 85, 105], gapAfter: 2.5 }
    );
  }
  y += 1.5;

  // 6.3 Método MODI
  y = ensureSpace(doc, y, 42);
  y = drawParagraph(doc, y, '6.3 Método MODI (Multiplicadores u_i, v_j y ciclos Stepping-Stone)', {
    fontSize: 10,
    bold: true,
    color: [15, 23, 42],
  });

  if (summary.modiVerifiedWithoutPivots) {
    const bothOptimal =
      leastCost.totalCost <= optimal.totalCost + EPSILON &&
      vogel.totalCost <= optimal.totalCost + EPSILON;

    const modiDirectText = bothOptimal
      ? `En el escenario actual, los métodos Costo Mínimo y Aproximación de Vogel ya alcanzaron una solución óptima ($${fmt(optimal.totalCost)} MXN), por lo que el método MODI únicamente verifica la condición de optimalidad (Delta_ij >= 0 en todas las celdas no básicas) y no necesita realizar ciclos de mejora.`
      : `En el escenario actual, la heurística inicial seleccionada ya alcanzó la solución óptima ($${fmt(optimal.totalCost)} MXN), por lo que MODI únicamente verifica la optimalidad y no necesita realizar ciclos de mejora.`;

    y = drawParagraph(doc, y, modiDirectText, { fontSize: 8.8, color: [51, 65, 85], gapAfter: 2.5 });
  } else {
    y = drawParagraph(
      doc,
      y,
      `La solución inicial presentaba al menos un costo reducido negativo (Delta_ij < 0), por lo que MODI ejecuta ${optimal.iterations.length - 1} ${optimal.iterations.length - 1 === 1 ? 'ciclo de mejora' : 'ciclos de mejora'} hasta verificar optimalidad global.`,
      { fontSize: 8.8, color: [51, 65, 85], gapAfter: 2.5 }
    );
  }

  for (const iter of optimal.iterations) {
    const iterTableHeight = 14 + (balanced.origins.length + 2) * 6.5;
    y = ensureSpace(doc, y, Math.min(iterTableHeight + 12, 52));

    const isFinal = iter.enteringCell === null;
    y = drawParagraph(
      doc,
      y,
      `Iteración #${iter.iteration} - ${isFinal ? 'Verificación final de optimalidad' : 'Pivote de mejora'} (Costo: $${fmt(iter.totalCostBefore)}${isFinal ? '' : ` -> $${fmt(iter.totalCostAfter)}`} MXN)`,
      { fontSize: 9.2, bold: true, color: [29, 78, 216] }
    );

    const iterHead = [
      'Origen \\ Destino',
      ...balanced.destinations.map((d) => pdfSafeText(d)),
      'u_i',
    ];
    const iterBody = balanced.origins.map((orig, i) => [
      pdfSafeText(orig),
      ...balanced.destinations.map((_, j) => {
        if (iter.basicMaskBefore[i][j]) {
          return `Básica: ${fmt(iter.allocationsBefore[i][j])} u\n(c=$${fmt(balanced.costs[i][j])})`;
        }
        const delta = iter.reducedCosts[i][j];
        return `Delta=${delta === null ? '-' : fmt(delta)}\n(c=$${fmt(balanced.costs[i][j])})`;
      }),
      fmt(iter.u[i]),
    ]);
    const iterFoot = ['v_j', ...iter.v.map((vj) => fmt(vj)), '-'];

    const iterFontSize = balanced.destinations.length + 2 > 8 ? 6.5 : 7.5;

    autoTable(doc, {
      startY: y,
      margin: PAGE_MARGIN,
      theme: 'grid',
      head: [iterHead],
      body: iterBody,
      foot: [iterFoot],
      showHead: 'everyPage',
      showFoot: 'lastPage',
      rowPageBreak: 'avoid',
      horizontalPageBreak: true,
      horizontalPageBreakRepeat: 0,
      styles: {
        font: 'helvetica',
        fontSize: iterFontSize,
        cellPadding: 1.7,
        halign: 'center',
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
      },
      footStyles: {
        fillColor: [248, 250, 252],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { halign: 'left', fontStyle: 'bold' },
      },
    });

    y = getLastY(doc, y) + 3.5;
    y = drawParagraph(doc, y, iter.summary, { fontSize: 8.3 });

    if (iter.enteringCell && iter.cycle.length > 0) {
      const cycleText = iter.cycle
        .map(
          (n) =>
            `${n.sign}(${balanced.origins[n.row]}->${balanced.destinations[n.col]}:${fmt(n.currentAllocation)}u)`
        )
        .join(' -> ');
      y = drawParagraph(doc, y, `Ciclo: ${cycleText} | theta = ${fmt(iter.theta)} u`, {
        fontSize: 7.8,
        color: [71, 85, 105],
      });
    }
    y += 1.5;
  }

  // =========================================================================
  // 7. INTERPRETACIÓN DE RESULTADOS Y CONCLUSIÓN
  // =========================================================================
  const section7Needed = Math.min(95, 58 + explanation.routeExplanations.length * 8);
  y = drawSectionHeading(doc, y, '7. Interpretación de resultados y conclusión', section7Needed);
  y = drawParagraph(doc, y, explanation.headlineSummary, { bold: true, color: [15, 23, 42] });
  y = drawParagraph(doc, y, explanation.methodComparisonSummary);

  autoTable(doc, {
    startY: y,
    margin: PAGE_MARGIN,
    theme: 'grid',
    head: [['Origen', 'Destino', 'Unidades', 'Costo Unitario', 'Subtotal', 'Detalle operativo']],
    body: explanation.routeExplanations.map((r) => [
      pdfSafeText(r.originName),
      pdfSafeText(r.destinationName),
      `${fmt(r.quantity)} u`,
      `$${fmt(r.unitCost)}`,
      `$${fmt(r.subtotalCost)}`,
      pdfSafeText(r.summary),
    ]),
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    styles: {
      font: 'helvetica',
      fontSize: 7.8,
      cellPadding: 1.9,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
    },
  });

  y = getLastY(doc, y) + 4.5;

  // Mantener conclusión y nota de óptimos alternativos juntas
  y = ensureSpace(doc, y, 20);
  y = drawParagraph(
    doc,
    y,
    'Conclusión matemática: Como todos los costos reducidos Delta_ij = c_ij - (u_i + v_j) son mayores o iguales a cero en las celdas no básicas, ninguna ruta inactiva permite reducir el costo total de $' +
      fmt(optimal.totalCost) +
      ' MXN.',
    { fontSize: 8.8, color: [15, 23, 42] }
  );

  if (explanation.alternativeOptimaNote) {
    y = drawParagraph(doc, y, explanation.alternativeOptimaNote, {
      fontSize: 8.8,
      color: [29, 78, 216],
    });
  } else {
    y = drawParagraph(
      doc,
      y,
      'Dado que todas las celdas no básicas presentan Delta_ij > 0, la solución óptima obtenida es única.',
      { fontSize: 8.8, color: [71, 85, 105] }
    );
  }
  y += 3;

  // =========================================================================
  // 8. ANÁLISIS DE SENSIBILIDAD DE COSTOS UNITARIOS (ETAPA 1)
  // =========================================================================
  y = drawSectionHeading(
    doc,
    y,
    '8. Análisis de sensibilidad de costos unitarios (Etapa 1)',
    46
  );

  y = drawParagraph(
    doc,
    y,
    `Base óptima analizada: ${costSensitivity.optimalBasisSize} de ${costSensitivity.expectedBasisSize} celdas requeridas (m + n - 1). ${
      costSensitivity.basisIsValidTree
        ? 'La base constituye un árbol generador válido para calcular rangos tarifarios mediante corte dual.'
        : 'Advertencia: la base no forma un árbol generador válido; los rangos tarifarios se marcan como no confiables.'
    }`,
    { fontSize: 8.6, color: [51, 65, 85] }
  );

  // 8.1 Rutas básicas (rangos admisibles)
  y = ensureSpace(doc, y, 28);
  y = drawParagraph(doc, y, '8.1 Rutas básicas: intervalos admisibles de tarifa c_ij', {
    fontSize: 9.5,
    bold: true,
    color: [15, 23, 42],
  });

  autoTable(doc, {
    startY: y,
    margin: PAGE_MARGIN,
    tableWidth: CONTENT_WIDTH,
    theme: 'grid',
    head: [
      [
        'Ruta básica',
        'Asignación',
        'Costo c_ij',
        'Rango admisible',
        'Variación [d_min, d_max]',
        'Celdas limitantes',
      ],
    ],
    body: costSensitivity.basicRoutes.map((b) => {
      const routeLabel = b.isDummy
        ? `${b.originName} -> ${b.destinationName} (Fict.)`
        : `${b.originName} -> ${b.destinationName}`;
      const allocLabel = b.isDegenerateBasic
        ? '0 u (Básica deg.)'
        : `${fmt(b.allocation)} u`;
      const rangeStr = !b.reliable
        ? 'No confiable'
        : `[$${fmt(b.minCostNonNegative)}, ${b.maxCost === null ? '+inf)' : `$${fmt(b.maxCost)}]`}`;
      const deltaStr = !b.reliable
        ? '-'
        : `[${b.deltaMin === null ? '-inf' : fmt(b.deltaMin)}, ${b.deltaMax === null ? '+inf)' : `+${fmt(b.deltaMax)}]`}`;
      const limParts: string[] = [];
      if (b.limitingLowerCells.length > 0) {
        limParts.push(`Inf: ${b.limitingLowerCells.join(', ')}`);
      }
      if (b.limitingUpperCells.length > 0) {
        limParts.push(`Sup: ${b.limitingUpperCells.join(', ')}`);
      }
      const limStr = !b.reliable
        ? b.unreliableReason ?? 'Base inválida'
        : limParts.length > 0
        ? limParts.join(' | ')
        : 'Sin cota restrictiva';

      return [
        pdfSafeText(routeLabel),
        allocLabel,
        `$${fmt(b.currentCost)}`,
        pdfSafeText(rangeStr),
        pdfSafeText(deltaStr),
        pdfSafeText(limStr),
      ];
    }),
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    styles: {
      font: 'helvetica',
      fontSize: 7.1,
      cellPadding: 1.6,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 40, fontStyle: 'bold' },
      1: { cellWidth: 24, halign: 'right' },
      2: { cellWidth: 20, halign: 'right' },
      3: { cellWidth: 36, halign: 'center' },
      4: { cellWidth: 30, halign: 'center' },
      5: { cellWidth: 32 },
    },
  });

  y = getLastY(doc, y) + 3.5;

  // 8.2 Rutas no básicas y costos reducidos
  y = ensureSpace(doc, y, 28);
  y = drawParagraph(
    doc,
    y,
    '8.2 Rutas no básicas: costos reducidos (Delta_ij) y umbral competitivo',
    { fontSize: 9.5, bold: true, color: [15, 23, 42] }
  );

  if (costSensitivity.nonBasicRoutes.length === 0) {
    y = drawParagraph(
      doc,
      y,
      'No existen rutas no básicas en esta matriz; todas las celdas forman parte de la base óptima.',
      { fontSize: 8.4, color: [71, 85, 105] }
    );
  } else {
    autoTable(doc, {
      startY: y,
      margin: PAGE_MARGIN,
      tableWidth: CONTENT_WIDTH,
      theme: 'grid',
      head: [
        [
          'Ruta no básica',
          'Costo c_ij',
          'u_i + v_j',
          'Delta_ij',
          'Reducción req.',
          'Umbral máx.',
          'Óptimo alt.',
        ],
      ],
      body: costSensitivity.nonBasicRoutes.map((nb) => [
        pdfSafeText(
          nb.isDummy
            ? `${nb.originName} -> ${nb.destinationName} (Fict.)`
            : `${nb.originName} -> ${nb.destinationName}`
        ),
        `$${fmt(nb.currentCost)}`,
        `$${fmt(nb.impliedDualSum)}`,
        `$${fmt(nb.reducedCost)}`,
        nb.canBecomeCompetitiveWithNonNegativeCost
          ? `$${fmt(nb.requiredReduction)}`
          : 'No aplica',
        nb.canBecomeCompetitiveWithNonNegativeCost
          ? `<=$${fmt(nb.minNonNegativeCostToKeepBasis)}`
          : 'c_ij < 0 req.',
        nb.alreadyAlternativeOptimum
          ? nb.changesAllocationAtTie
            ? pdfSafeText(`Sí (theta=${fmt(nb.cycleTheta)} u)`)
            : 'Sí (theta=0 u)'
          : 'No',
      ]),
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      styles: {
        font: 'helvetica',
        fontSize: 7.1,
        cellPadding: 1.6,
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [29, 78, 216],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 38, fontStyle: 'bold' },
        1: { cellWidth: 20, halign: 'right' },
        2: { cellWidth: 20, halign: 'right' },
        3: { cellWidth: 20, halign: 'right' },
        4: { cellWidth: 24, halign: 'right' },
        5: { cellWidth: 26, halign: 'center' },
        6: { cellWidth: 34, halign: 'center' },
      },
    });
    y = getLastY(doc, y) + 3;
  }

  const altOptRealCells = costSensitivity.nonBasicRoutes.filter(
    (r) => !r.isDummy && r.alreadyAlternativeOptimum
  );
  const altCostNote = costSensitivity.hasAlternativeOptima
    ? altOptRealCells.length > 0
      ? `Óptimos alternativos vigentes: ${altOptRealCells
          .map(
            (r) =>
              `${r.originName} -> ${r.destinationName} (Delta_ij = 0, pivote theta = ${fmt(r.cycleTheta)} u)`
          )
          .join('; ')}. Permiten redistribuir unidades sin alterar Z* = $${fmt(optimal.totalCost)} MXN.`
      : 'Existe empate dual (Delta_ij = 0) vinculado al nodo ficticio; las rutas reales tienen costo único.'
    : 'No existen soluciones óptimas alternativas (todas las rutas no básicas tienen Delta_ij > 0).';
  y = drawParagraph(doc, y, altCostNote, { fontSize: 8.4, color: [29, 78, 216] });

  if (costSensitivity.limitationsNote.length > 0) {
    y = drawParagraph(
      doc,
      y,
      `Condiciones de validez (costos): ${costSensitivity.limitationsNote.join(' ')}`,
      { fontSize: 7.9, color: [71, 85, 105], gapAfter: 2.5 }
    );
  }

  // =========================================================================
  // 9. SENSIBILIDAD DE OFERTA Y DEMANDA (ETAPA 2)
  // =========================================================================
  y = drawSectionHeading(
    doc,
    y,
    '9. Sensibilidad de oferta y demanda (Etapa 2)',
    46
  );

  y = drawParagraph(
    doc,
    y,
    'Las variaciones de oferta (a_i) y demanda (b_j) que conservan la misma base óptima requieren cambios balanceados conjuntos (a_i + delta, b_j + delta) para mantener Sum a_i = Sum b_j y factibilidad primal (x_rc >= 0). Un cambio aislado en un solo almacén o sucursal desbalancea el modelo e introduce un nodo ficticio.',
    { fontSize: 8.4, color: [51, 65, 85] }
  );

  autoTable(doc, {
    startY: y,
    margin: PAGE_MARGIN,
    tableWidth: CONTENT_WIDTH,
    theme: 'grid',
    head: [
      [
        'Par (O_i, D_j)',
        'Actual (Of / Dem)',
        'Intervalo delta',
        'Rango Oferta',
        'Rango Demanda',
        'u_i + v_j',
        'Z* en extremos',
      ],
    ],
    body: rhsSensitivity.balancedPairs.map((pair) => {
      if (!pair.reliable) {
        return [
          pdfSafeText(`${pair.originName} / ${pair.destinationName}`),
          `${fmt(pair.currentSupply)} / ${fmt(pair.currentDemand)}`,
          'No confiable',
          '-',
          '-',
          '-',
          pdfSafeText(pair.unreliableReason ?? 'Base inválida'),
        ];
      }
      const dMinStr = pair.deltaMin === null ? '-inf' : fmt(pair.deltaMin);
      const dMaxStr = pair.deltaMax === null ? '+inf)' : `+${fmt(pair.deltaMax)}]`;
      const sRange = `[${pair.minSupply === null ? '-inf' : fmt(pair.minSupply)}, ${
        pair.maxSupply === null ? '+inf)' : `${fmt(pair.maxSupply)}]`
      }`;
      const dRange = `[${pair.minDemand === null ? '-inf' : fmt(pair.minDemand)}, ${
        pair.maxDemand === null ? '+inf)' : `${fmt(pair.maxDemand)}]`
      }`;
      const zRange = `$${fmt(pair.optimalCostAtMin ?? optimal.totalCost)} a ${
        pair.optimalCostAtMax === null ? '+inf' : `$${fmt(pair.optimalCostAtMax)}`
      }`;

      return [
        pdfSafeText(
          `${pair.originName} / ${pair.destinationName}${pair.isBasicPair ? ' (B)' : ''}`
        ),
        `${fmt(pair.currentSupply)} / ${fmt(pair.currentDemand)} u`,
        pdfSafeText(`[${dMinStr}, ${dMaxStr}`),
        pdfSafeText(sRange),
        pdfSafeText(dRange),
        `$${fmt(pair.marginalCostPerUnit ?? 0)}/u`,
        pdfSafeText(zRange),
      ];
    }),
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    styles: {
      font: 'helvetica',
      fontSize: 6.9,
      cellPadding: 1.5,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 36, fontStyle: 'bold' },
      1: { cellWidth: 26, halign: 'center' },
      2: { cellWidth: 28, halign: 'center' },
      3: { cellWidth: 28, halign: 'center' },
      4: { cellWidth: 28, halign: 'center' },
      5: { cellWidth: 16, halign: 'right' },
      6: { cellWidth: 20, halign: 'right' },
    },
  });

  y = getLastY(doc, y) + 3;

  if (balanced.balanceStatus !== 'balanced') {
    y = drawParagraph(
      doc,
      y,
      `Advertencia sobre nodo ficticio activo (${fmt(balanced.dummyAmount)} u): en los pares cuya trayectoria incluye el nodo ficticio, la tarifa matemática asociada es $0 MXN/u y NO refleja costos reales de almacenamiento por superávit ni penalizaciones por demanda insatisfecha.`,
      { fontSize: 8.2, color: [146, 64, 14] }
    );
  }

  if (rhsSensitivity.limitationsNote.length > 0) {
    y = drawParagraph(
      doc,
      y,
      `Condiciones y limitaciones (RHS): ${rhsSensitivity.limitationsNote.join(' ')}`,
      { fontSize: 7.9, color: [71, 85, 105], gapAfter: 2.5 }
    );
  }

  // =========================================================================
  // 10. INTERPRETACIÓN ECONÓMICA DE PRECIOS SOMBRA (ETAPA 3)
  // =========================================================================
  y = drawSectionHeading(
    doc,
    y,
    '10. Interpretación económica de precios sombra y potenciales duales (Etapa 3)',
    46
  );

  const uListStr = optimal.finalU
    .map((val, i) => `u_${i + 1} (${balanced.origins[i]}) = ${fmt(val)}`)
    .join('; ');
  const vListStr = optimal.finalV
    .map((val, j) => `v_${j + 1} (${balanced.destinations[j]}) = ${fmt(val)}`)
    .join('; ');

  y = drawParagraph(
    doc,
    y,
    `Potenciales duales calculados por MODI: ${uListStr} | ${vListStr}.`,
    { fontSize: 8.5, bold: true, color: [15, 23, 42] }
  );
  y = drawParagraph(
    doc,
    y,
    `${dualShadowPrices.normalizationNote} ${dualShadowPrices.normalizationInvarianceNote}`,
    { fontSize: 8.1, color: [51, 65, 85] }
  );
  y = drawParagraph(doc, y, dualShadowPrices.isolatedChangeWarning, {
    fontSize: 8.1,
    color: [146, 64, 14],
  });

  // 10.1 Ecuaciones duales básicas
  autoTable(doc, {
    startY: y,
    margin: PAGE_MARGIN,
    tableWidth: CONTENT_WIDTH,
    theme: 'grid',
    head: [['Celda básica', 'u_i', 'v_j', 'c_ij', 'Ecuación dual (u_i + v_j = c_ij)']],
    body: dualShadowPrices.basicEquations.map((eq) => [
      pdfSafeText(
        eq.isDummy
          ? `${eq.originName} -> ${eq.destinationName} (Fict.)`
          : `${eq.originName} -> ${eq.destinationName}`
      ),
      fmt(eq.uValue),
      fmt(eq.vValue),
      `$${fmt(eq.unitCost)}`,
      pdfSafeText(eq.formulaText),
    ]),
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    styles: {
      font: 'helvetica',
      fontSize: 7.2,
      cellPadding: 1.5,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 48, fontStyle: 'bold' },
      1: { cellWidth: 20, halign: 'right' },
      2: { cellWidth: 20, halign: 'right' },
      3: { cellWidth: 20, halign: 'right' },
      4: { cellWidth: 74 },
    },
  });

  y = getLastY(doc, y) + 3.5;

  // 10.2 Transferencias balanceadas y ejemplos numéricos verificados
  const allTransfers = [
    ...dualShadowPrices.supplyTransfers,
    ...dualShadowPrices.demandTransfers,
  ];
  if (allTransfers.length > 0) {
    y = ensureSpace(doc, y, 26);
    y = drawParagraph(
      doc,
      y,
      '10.1 Efectos marginales invariantes por transferencia balanceada (u_i - u_r y v_j - v_l)',
      { fontSize: 9.2, bold: true, color: [15, 23, 42] }
    );

    autoTable(doc, {
      startY: y,
      margin: PAGE_MARGIN,
      tableWidth: CONTENT_WIDTH,
      theme: 'grid',
      head: [
        [
          'Tipo',
          'Traslado (+delta / -delta)',
          'Intervalo delta',
          'Tasa marginal',
          'Interpretación económica',
        ],
      ],
      body: allTransfers.map((tr) => [
        tr.kind === 'supply_transfer' ? 'Oferta' : 'Demanda',
        pdfSafeText(`${tr.toName} (+d) / ${tr.fromName} (-d)`),
        pdfSafeText(`[${fmt(tr.deltaMin)}, +${fmt(tr.deltaMax)}] u`),
        tr.marginalCostPerUnit >= 0
          ? `+$${fmt(tr.marginalCostPerUnit)}/u`
          : `-$${fmt(Math.abs(tr.marginalCostPerUnit))}/u`,
        pdfSafeText(tr.interpretation),
      ]),
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      styles: {
        font: 'helvetica',
        fontSize: 7.0,
        cellPadding: 1.5,
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [29, 78, 216],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 20, halign: 'center' },
        1: { cellWidth: 42, fontStyle: 'bold' },
        2: { cellWidth: 26, halign: 'center' },
        3: { cellWidth: 22, halign: 'right' },
        4: { cellWidth: 72 },
      },
    });
    y = getLastY(doc, y) + 3.5;
  }

  if (dualShadowPrices.workedExamples.length > 0) {
    y = ensureSpace(doc, y, 26);
    y = drawParagraph(
      doc,
      y,
      '10.2 Ejemplos numéricos verificados con reoptimización real MODI',
      { fontSize: 9.2, bold: true, color: [15, 23, 42] }
    );

    autoTable(doc, {
      startY: y,
      margin: PAGE_MARGIN,
      tableWidth: CONTENT_WIDTH,
      theme: 'grid',
      head: [
        [
          'Caso evaluado',
          'Fórmula dual y variación',
          'Esperado',
          'MODI real',
          'Verificación',
        ],
      ],
      body: dualShadowPrices.workedExamples.map((ex) => [
        pdfSafeText(`${ex.title}\n${ex.interpretation}`),
        pdfSafeText(`${ex.potentialsUsed}\n${ex.formulaApplied}`),
        `$${fmt(ex.expectedNewCost)} MXN`,
        `$${fmt(ex.verifiedModiCost)} MXN`,
        ex.verifiedWithModi ? 'Coincide con MODI' : 'Requiere revisión',
      ]),
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      styles: {
        font: 'helvetica',
        fontSize: 6.9,
        cellPadding: 1.5,
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 48 },
        1: { cellWidth: 66 },
        2: { cellWidth: 22, halign: 'right' },
        3: { cellWidth: 22, halign: 'right' },
        4: { cellWidth: 24, halign: 'center' },
      },
    });
    y = getLastY(doc, y) + 4;
  }

  // =========================================================================
  // 11. COMPARACIÓN DE ESCENARIOS (ETAPA 4) - SOLO SI HAY COMPARACIÓN VÁLIDA
  // =========================================================================
  let nextSectionNum = 11;
  if (validComparison && validComparison.alternativeOptimalCost !== null) {
    y = drawSectionHeading(
      doc,
      y,
      `${nextSectionNum}. Comparación de escenarios: original vs. alternativo (Etapa 4)`,
      48
    );
    nextSectionNum++;

    y = drawParagraph(
      doc,
      y,
      `${validComparison.dynamicExplanation.costSummary} ${validComparison.dynamicExplanation.driverSummary}`,
      { fontSize: 8.5, color: [15, 23, 42] }
    );

    // 11.1 Cambios realizados
    autoTable(doc, {
      startY: y,
      margin: PAGE_MARGIN,
      tableWidth: CONTENT_WIDTH,
      theme: 'grid',
      head: [['Parámetro modificado', 'Valor original', 'Valor alternativo', 'Variación']],
      body: validComparison.inputChanges.map((ch) => [
        pdfSafeText(ch.label),
        ch.kind === 'cost' ? `$${fmt(ch.originalValue)} MXN` : `${fmt(ch.originalValue)} u`,
        ch.kind === 'cost' ? `$${fmt(ch.alternativeValue)} MXN` : `${fmt(ch.alternativeValue)} u`,
        ch.kind === 'cost'
          ? `${ch.delta >= 0 ? '+' : '-'}$${fmt(Math.abs(ch.delta))} MXN`
          : `${ch.delta >= 0 ? '+' : ''}${fmt(ch.delta)} u`,
      ]),
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      styles: {
        font: 'helvetica',
        fontSize: 7.3,
        cellPadding: 1.5,
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 66, fontStyle: 'bold' },
        1: { cellWidth: 38, halign: 'right' },
        2: { cellWidth: 38, halign: 'right' },
        3: { cellWidth: 40, halign: 'right' },
      },
    });
    y = getLastY(doc, y) + 3;

    // 11.2 Resumen de costos, oferta, demanda y balance
    const costDiff = validComparison.costDifference ?? 0;
    const costDiffPct = validComparison.costDifferencePct ?? 0;
    const statusText = (st: typeof balanced.balanceStatus | null) =>
      st === 'balanced'
        ? 'Balanceado'
        : st === 'dummy_destination'
        ? 'Exceso oferta (Fict.)'
        : st === 'dummy_origin'
        ? 'Exceso demanda (Fict.)'
        : '-';

    autoTable(doc, {
      startY: y,
      margin: PAGE_MARGIN,
      tableWidth: CONTENT_WIDTH,
      theme: 'grid',
      head: [['Indicador comparado', 'Escenario Original', 'Escenario Alternativo', 'Diferencia']],
      body: [
        [
          'Costo óptimo MODI (Z*)',
          `$${fmt(validComparison.originalOptimalCost)} MXN`,
          `$${fmt(validComparison.alternativeOptimalCost)} MXN`,
          `${costDiff >= 0 ? '+' : '-'}$${fmt(Math.abs(costDiff))} MXN (${costDiffPct >= 0 ? '+' : ''}${costDiffPct.toFixed(2)}%)`,
        ],
        [
          'Oferta total disponible',
          `${fmt(validComparison.originalSupplyTotal)} u`,
          `${fmt(validComparison.alternativeSupplyTotal)} u`,
          `${validComparison.supplyTotalDelta >= 0 ? '+' : ''}${fmt(validComparison.supplyTotalDelta)} u`,
        ],
        [
          'Demanda total requerida',
          `${fmt(validComparison.originalDemandTotal)} u`,
          `${fmt(validComparison.alternativeDemandTotal)} u`,
          `${validComparison.demandTotalDelta >= 0 ? '+' : ''}${fmt(validComparison.demandTotalDelta)} u`,
        ],
        [
          'Envío físico real',
          `${fmt(validComparison.originalRealShippedUnits)} u`,
          `${fmt(validComparison.alternativeRealShippedUnits)} u`,
          `${
            validComparison.alternativeRealShippedUnits - validComparison.originalRealShippedUnits >= 0
              ? '+'
              : ''
          }${fmt(validComparison.alternativeRealShippedUnits - validComparison.originalRealShippedUnits)} u`,
        ],
        [
          'Balance y nodo ficticio',
          `${statusText(validComparison.originalBalanceStatus)} (${fmt(validComparison.originalDummyAmount)} u)`,
          `${statusText(validComparison.alternativeBalanceStatus)} (${fmt(validComparison.alternativeDummyAmount)} u)`,
          `${
            validComparison.alternativeDummyAmount - validComparison.originalDummyAmount >= 0
              ? '+'
              : ''
          }${fmt(validComparison.alternativeDummyAmount - validComparison.originalDummyAmount)} u fict.`,
        ],
      ],
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      styles: {
        font: 'helvetica',
        fontSize: 7.2,
        cellPadding: 1.6,
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 50, fontStyle: 'bold' },
        1: { cellWidth: 42, halign: 'right' },
        2: { cellWidth: 42, halign: 'right' },
        3: { cellWidth: 48, halign: 'right' },
      },
    });
    y = getLastY(doc, y) + 2.5;

    y = drawParagraph(
      doc,
      y,
      `Cálculo porcentual: ${validComparison.costFormulaText}`,
      { fontSize: 7.8, color: [71, 85, 105] }
    );

    // 11.3 Rutas agregadas, eliminadas o modificadas
    const allRouteDiffs = [
      ...validComparison.routeDiffs,
      ...validComparison.dummyRouteDiffs,
    ];
    autoTable(doc, {
      startY: y,
      margin: PAGE_MARGIN,
      tableWidth: CONTENT_WIDTH,
      theme: 'grid',
      head: [['Ruta', 'Estado', 'Orig. (u)', 'Alt. (u)', 'Delta u', 'Tarifa c_ij', 'Delta Subtotal']],
      body: allRouteDiffs.map((d) => {
        const st = d.isDummy
          ? 'Ficticio ($0/u)'
          : d.status === 'added'
          ? 'Agregada'
          : d.status === 'removed'
          ? 'Eliminada'
          : d.status === 'increased'
          ? 'Aumentó'
          : d.status === 'decreased'
          ? 'Disminuyó'
          : 'Sin cambio';
        return [
          pdfSafeText(
            d.isDummy
              ? `${d.originName} -> ${d.destinationName} (Fict.)`
              : `${d.originName} -> ${d.destinationName}`
          ),
          st,
          `${fmt(d.originalQuantity)} u`,
          `${fmt(d.alternativeQuantity)} u`,
          `${d.quantityDelta >= 0 ? '+' : ''}${fmt(d.quantityDelta)} u`,
          d.isDummy
            ? '$0 -> $0'
            : `$${fmt(d.originalUnitCost ?? 0)} -> $${fmt(d.alternativeUnitCost ?? 0)}`,
          d.isDummy
            ? '$0'
            : `${d.subtotalDelta >= 0 ? '+' : '-'}$${fmt(Math.abs(d.subtotalDelta))}`,
        ];
      }),
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      styles: {
        font: 'helvetica',
        fontSize: 7.0,
        cellPadding: 1.5,
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [29, 78, 216],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 42, fontStyle: 'bold' },
        1: { cellWidth: 24 },
        2: { cellWidth: 20, halign: 'right' },
        3: { cellWidth: 20, halign: 'right' },
        4: { cellWidth: 20, halign: 'right' },
        5: { cellWidth: 28, halign: 'right' },
        6: { cellWidth: 28, halign: 'right' },
      },
    });
    y = getLastY(doc, y) + 3;

    if (validComparison.dynamicExplanation.dummyLimitationNote) {
      y = drawParagraph(doc, y, validComparison.dynamicExplanation.dummyLimitationNote, {
        fontSize: 8.1,
        color: [146, 64, 14],
      });
    }
    if (managerialAnalysis.scenarioComparisonAnalysis.comparabilityWarning) {
      y = drawParagraph(
        doc,
        y,
        managerialAnalysis.scenarioComparisonAnalysis.comparabilityWarning,
        { fontSize: 8.1, bold: true, color: [146, 64, 14] }
      );
    }
    y += 1.5;
  }

  // =========================================================================
  // 11/12. INTERPRETACIÓN GERENCIAL Y RECOMENDACIONES (ETAPA 5)
  // =========================================================================
  y = drawSectionHeading(
    doc,
    y,
    `${nextSectionNum}. Interpretación gerencial y recomendaciones (Etapa 5)`,
    48
  );

  const diag = managerialAnalysis.diagnosis;
  y = drawParagraph(
    doc,
    y,
    `Diagnóstico operativo: Costo mínimo total Z* = $${fmt(diag.totalOptimalCost)} MXN | Unidades realmente distribuidas = ${fmt(diag.realDistributedUnits)} u (${diag.activeRoutes.length} ruta(s) activa(s) y ${diag.unusedRoutes.length} ruta(s) inactiva(s)) | ${diag.balanceLabel}. ${diag.alternativeOptimaSummary}`,
    { fontSize: 8.5, bold: true, color: [15, 23, 42] }
  );

  if (diag.dummyLimitationWarning) {
    y = drawParagraph(doc, y, diag.dummyLimitationWarning, {
      fontSize: 8.1,
      color: [146, 64, 14],
    });
  }
  if (diag.degeneracyWarning) {
    y = drawParagraph(doc, y, diag.degeneracyWarning, {
      fontSize: 8.1,
      color: [71, 85, 105],
    });
  }

  autoTable(doc, {
    startY: y,
    margin: PAGE_MARGIN,
    tableWidth: CONTENT_WIDTH,
    theme: 'grid',
    head: [['Dimensión gerencial', 'Recomendación y riesgos operativos', 'Respaldo matemático y criterio']],
    body: managerialAnalysis.recommendations.map((rec) => [
      pdfSafeText(rec.title),
      pdfSafeText(
        rec.cautionNote
          ? `${rec.recommendation}\nPrecaución: ${rec.cautionNote}`
          : rec.recommendation
      ),
      pdfSafeText(rec.mathematicalBasis),
    ]),
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    styles: {
      font: 'helvetica',
      fontSize: 7.1,
      cellPadding: 1.7,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 38, fontStyle: 'bold' },
      1: { cellWidth: 86 },
      2: { cellWidth: 58 },
    },
  });

  y = getLastY(doc, y) + 3.5;

  // Condiciones para considerar un ahorro real + síntesis económica
  y = ensureSpace(doc, y, 24);
  if (validComparison) {
    y = drawParagraph(
      doc,
      y,
      `Condiciones de decisión y ahorro real (comparación): ${managerialAnalysis.scenarioComparisonAnalysis.lowestMathematicalCostLabel}. ${managerialAnalysis.scenarioComparisonAnalysis.selectionCriteria.join(' ')}`,
      { fontSize: 8.3, color: [15, 23, 42] }
    );
  } else {
    y = drawParagraph(
      doc,
      y,
      'Condición para ahorro empresarial real: cualquier comparación futura frente a este escenario base solo representa un ahorro logístico genuino cuando ambos escenarios entregan el mismo volumen físico real sin recurrir a unidades ficticias ($0/u por desabasto o excedente sin costo de almacenaje).',
      { fontSize: 8.2, color: [15, 23, 42] }
    );
  }

  autoTable(doc, {
    startY: y,
    margin: PAGE_MARGIN,
    tableWidth: CONTENT_WIDTH,
    theme: 'grid',
    head: [['Concepto económico', 'Interpretación gerencial', 'Evidencia en el escenario actual']],
    body: managerialAnalysis.economicInterpretation.map((item) => [
      pdfSafeText(item.title),
      pdfSafeText(item.plainExplanation),
      pdfSafeText(item.currentModelEvidence),
    ]),
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    styles: {
      font: 'helvetica',
      fontSize: 6.9,
      cellPadding: 1.5,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [29, 78, 216],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 40, fontStyle: 'bold' },
      1: { cellWidth: 72 },
      2: { cellWidth: 70 },
    },
  });

  y = getLastY(doc, y) + 4;

  // =========================================================================
  // ENCABEZADOS Y PAGINACIÓN GLOBAL (PÁGINA 2 EN ADELANTE)
  // =========================================================================
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    if (p > 1) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text(pdfSafeText('OptiRoute – Zeli Distribuciones'), PAGE_MARGIN.left, 11.5);

      doc.setFont('helvetica', 'normal');
      doc.text('Investigación de Operaciones', PAGE_MARGIN.left + CONTENT_WIDTH, 11.5, {
        align: 'right',
      });

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.25);
      doc.line(PAGE_MARGIN.left, 14.5, PAGE_MARGIN.left + CONTENT_WIDTH, 14.5);
    }

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.25);
    doc.line(PAGE_MARGIN.left, 283, PAGE_MARGIN.left + CONTENT_WIDTH, 283);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(pdfSafeText(`Generado el ${summary.generatedAtText}`), PAGE_MARGIN.left, 288);
    doc.text(`Página ${p} de ${totalPages}`, PAGE_MARGIN.left + CONTENT_WIDTH, 288, {
      align: 'right',
    });
  }

  return { doc, summary, finalCursorY: y };
}

export function downloadAcademicPdfReport(
  problem: TransportationProblem,
  result: SolveResponse,
  options?: PdfReportOptions
): void {
  const { doc } = buildAcademicPdfReport(problem, result, new Date(), options);
  doc.save('reporte-optiroute-zeli.pdf');
}
