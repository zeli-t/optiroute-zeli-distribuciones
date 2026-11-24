import { SolveResponse, TransportationProblem } from './types';

export function generateMarkdownReport(
  problem: TransportationProblem,
  result: SolveResponse
): string {
  if (!result.balanced || !result.optimal || !result.explanation) {
    return '# Reporte OptiRoute – Zeli Distribuciones\n\nNo hay una solución válida calculada.';
  }

  const lines: string[] = [];
  lines.push('# Reporte de Optimización de Transporte – Zeli Distribuciones');
  lines.push('');
  lines.push(`**Fecha de generación:** ${new Date().toLocaleDateString('es-MX')}`);
  lines.push(`**Costo Mínimo Óptimo Verificado:** $${result.optimal.totalCost.toLocaleString('es-MX')} MXN`);
  lines.push('');
  lines.push('## 1. Resumen del Modelo');
  lines.push(`- ${result.explanation.balanceSummary}`);
  lines.push(`- ${result.explanation.headlineSummary}`);
  lines.push('');
  lines.push('## 2. Comparación de Métodos');
  lines.push('| Método | Costo Total (MXN) | Diferencia vs Óptimo | Rutas Activas |');
  lines.push('| :--- | ---: | ---: | ---: |');
  for (const row of result.comparison) {
    lines.push(
      `| ${row.methodName} | $${row.totalCost.toLocaleString('es-MX')} | $${row.gapFromOptimal.toLocaleString('es-MX')} (${row.gapPercentage}%) | ${row.activeRoutesCount} |`
    );
  }
  lines.push('');
  lines.push('## 3. Plan Óptimo de Envíos (MODI)');
  lines.push('| Origen | Destino | Unidades | Costo Unitario (MXN) | Subtotal (MXN) |');
  lines.push('| :--- | :--- | ---: | ---: | ---: |');
  for (const r of result.explanation.routeExplanations) {
    lines.push(
      `| ${r.originName} | ${r.destinationName} | ${r.quantity} | $${r.unitCost} | $${r.subtotalCost} |`
    );
  }
  lines.push('');
  lines.push('## 4. Variables Duales (Multiplicadores MODI)');
  lines.push(
    `- Multiplicadores de oferta (u): ${result.balanced.origins
      .map((name, i) => `${name} = ${result.optimal!.finalU[i]}`)
      .join(', ')}`
  );
  lines.push(
    `- Multiplicadores de demanda (v): ${result.balanced.destinations
      .map((name, j) => `${name} = ${result.optimal!.finalV[j]}`)
      .join(', ')}`
  );
  lines.push('');
  lines.push('## 5. Matriz de Costos Unitarios Originales (MXN)');
  lines.push(
    `| Almacén \\ Sucursal | ${problem.destinations.join(' | ')} | Oferta |`
  );
  lines.push(`| :--- | ${problem.destinations.map(() => '---:').join(' | ')} | ---: |`);
  for (let i = 0; i < problem.origins.length; i++) {
    lines.push(
      `| ${problem.origins[i]} | ${problem.costs[i].join(' | ')} | ${problem.supply[i]} |`
    );
  }
  lines.push(
    `| Demanda | ${problem.demand.join(' | ')} | ${problem.supply.reduce((a, b) => a + b, 0)} |`
  );

  return lines.join('\n');
}

export function generateAllocationsCsv(result: SolveResponse): string {
  if (!result.balanced || !result.optimal) return '';

  const rows: string[] = [];
  rows.push('Origen,Destino,Unidades_Asignadas,Costo_Unitario_MXN,Subtotal_MXN,Tipo_Nodo');

  const b = result.balanced;
  const alloc = result.optimal.allocations;

  for (let i = 0; i < b.origins.length; i++) {
    for (let j = 0; j < b.destinations.length; j++) {
      const qty = alloc[i][j];
      if (qty <= 0) continue;
      const isDummy = i === b.dummyRowIndex || j === b.dummyColIndex;
      const cost = b.costs[i][j];
      rows.push(
        `"${b.origins[i]}","${b.destinations[j]}",${qty},${cost},${qty * cost},${isDummy ? 'Ficticio' : 'Real'}`
      );
    }
  }

  return rows.join('\n');
}
