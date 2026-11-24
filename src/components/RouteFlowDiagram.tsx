import { ArrowRight, Building2, Store } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { EPSILON } from '../math/balance';
import { BalancedProblem, MethodResult } from '../math/types';

interface RouteFlowDiagramProps {
  balanced: BalancedProblem;
  methodResult: MethodResult;
  methodLabel: string;
}

interface ActiveRouteEdge {
  id: string;
  originIndex: number;
  destinationIndex: number;
  originName: string;
  destinationName: string;
  quantity: number;
  unitCost: number;
  subtotal: number;
  isDummy: boolean;
}

function fmt(n: number): string {
  return Number.isInteger(n)
    ? n.toLocaleString('es-MX')
    : n.toLocaleString('es-MX', { maximumFractionDigits: 2 });
}

function truncateLabel(text: string, maxLen = 17): string {
  return text.length > maxLen ? `${text.slice(0, maxLen - 1)}…` : text;
}

export const RouteFlowDiagram: React.FC<RouteFlowDiagramProps> = ({
  balanced,
  methodResult,
  methodLabel,
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const edges = useMemo<ActiveRouteEdge[]>(() => {
    const list: ActiveRouteEdge[] = [];
    for (let i = 0; i < balanced.origins.length; i++) {
      for (let j = 0; j < balanced.destinations.length; j++) {
        const qty = methodResult.allocations[i]?.[j] ?? 0;
        if (qty > EPSILON) {
          const isDummy =
            i === balanced.dummyRowIndex || j === balanced.dummyColIndex;
          const unitCost = balanced.costs[i][j];
          list.push({
            id: `${i}-${j}`,
            originIndex: i,
            destinationIndex: j,
            originName: balanced.origins[i],
            destinationName: balanced.destinations[j],
            quantity: qty,
            unitCost,
            subtotal: qty * unitCost,
            isDummy,
          });
        }
      }
    }
    return list;
  }, [balanced, methodResult]);

  const maxQty = useMemo(
    () => Math.max(...edges.map((e) => e.quantity), 1),
    [edges]
  );

  const m = balanced.origins.length;
  const n = balanced.destinations.length;
  const maxNodes = Math.max(m, n, 2);

  const svgWidth = 680;
  const rowPitch = 78;
  const paddingY = 44;
  const svgHeight = Math.max(240, maxNodes * rowPitch + paddingY);

  const leftX = 24;
  const nodeWidth = 174;
  const nodeHeight = 52;
  const rightX = svgWidth - 24 - nodeWidth;

  const getLeftY = (index: number) => {
    const totalSpan = svgHeight - paddingY;
    const step = totalSpan / Math.max(m, 1);
    return paddingY / 2 + step * (index + 0.5);
  };

  const getRightY = (index: number) => {
    const totalSpan = svgHeight - paddingY;
    const step = totalSpan / Math.max(n, 1);
    return paddingY / 2 + step * (index + 0.5);
  };

  const realEdges = edges.filter((e) => !e.isDummy);
  const dummyEdges = edges.filter((e) => e.isDummy);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
      {/* Diagrama de red logística SVG */}
      <div className="xl:col-span-7 border border-slate-200 rounded-xl bg-slate-50/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-bold text-[#0B1F3A]">
              Mapa visual de rutas ({methodLabel})
            </h3>
            <p className="text-xs text-slate-600">
              Cada línea muestra cuántas unidades viajan de un almacén a una sucursal. Pasa el cursor sobre una ruta para resaltarla.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 shrink-0">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 h-0.5 bg-[#0891b2] inline-block" />
              Envío real
            </span>
            {dummyEdges.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-4 h-0.5 border-t-2 border-dashed border-amber-600 inline-block" />
                Ajuste ficticio ($0/u)
              </span>
            )}
          </div>
        </div>

        <div className="overflow-x-auto bg-white border border-slate-200 rounded-lg">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full min-w-[540px] h-auto block"
            role="img"
            aria-label={`Diagrama de flujo de distribución para ${methodLabel}`}
          >
            {/* Encabezados de columnas */}
            <text
              x={leftX + nodeWidth / 2}
              y={20}
              textAnchor="middle"
              fill="#475569"
              fontSize="11"
              fontWeight="600"
            >
              ALMACENES (OFERTA)
            </text>
            <text
              x={rightX + nodeWidth / 2}
              y={20}
              textAnchor="middle"
              fill="#475569"
              fontSize="11"
              fontWeight="600"
            >
              SUCURSALES (DEMANDA)
            </text>

            {/* Curvas de flujo */}
            {edges.map((edge, idx) => {
              const x1 = leftX + nodeWidth;
              const y1 = getLeftY(edge.originIndex);
              const x2 = rightX;
              const y2 = getRightY(edge.destinationIndex);
              const ctrlOffset = (x2 - x1) * 0.45;
              const pathD = `M ${x1} ${y1} C ${x1 + ctrlOffset} ${y1}, ${x2 - ctrlOffset} ${y2}, ${x2} ${y2}`;

              const strokeWidth = Math.max(
                2,
                Math.min(7, (edge.quantity / maxQty) * 6 + 1.5)
              );

              const isDimmed = hoveredId !== null && hoveredId !== edge.id;
              const isHighlighted = hoveredId === edge.id;

              // Posición escalonada sobre la curva para reducir colisiones entre etiquetas
              const t = edges.length <= 3 ? 0.5 : idx % 2 === 0 ? 0.37 : 0.63;
              const mt = 1 - t;
              const cx1 = x1 + ctrlOffset;
              const cx2 = x2 - ctrlOffset;
              const lx =
                mt * mt * mt * x1 +
                3 * mt * mt * t * cx1 +
                3 * mt * t * t * cx2 +
                t * t * t * x2;
              const ly =
                mt * mt * mt * y1 +
                3 * mt * mt * t * y1 +
                3 * mt * t * t * y2 +
                t * t * t * y2;

              const strokeColor = edge.isDummy
                ? '#d97706'
                : isHighlighted
                ? '#0B1F3A'
                : '#0891b2';

              const badgeText = `${fmt(edge.quantity)} u`;
              const badgeWidth = Math.max(46, badgeText.length * 7.5 + 14);

              return (
                <g
                  key={edge.id}
                  className="cursor-pointer transition-opacity duration-150"
                  style={{ opacity: isDimmed ? 0.25 : 1 }}
                  onMouseEnter={() => setHoveredId(edge.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <path
                    d={pathD}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={16}
                  />
                  <path
                    d={pathD}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={isHighlighted ? strokeWidth + 1.5 : strokeWidth}
                    strokeDasharray={edge.isDummy ? '6 4' : undefined}
                    strokeLinecap="round"
                  />
                  <rect
                    x={lx - badgeWidth / 2}
                    y={ly - 11}
                    width={badgeWidth}
                    height={22}
                    rx={4}
                    fill={edge.isDummy ? '#fffbeb' : isHighlighted ? '#0B1F3A' : '#ffffff'}
                    stroke={edge.isDummy ? '#f59e0b' : isHighlighted ? '#0B1F3A' : '#0891b2'}
                    strokeWidth={1.25}
                  />
                  <text
                    x={lx}
                    y={ly + 4}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="700"
                    fontFamily="IBM Plex Mono, monospace"
                    fill={edge.isDummy ? '#92400e' : isHighlighted ? '#ffffff' : '#0B1F3A'}
                  >
                    {badgeText}
                  </text>
                </g>
              );
            })}

            {/* Nodos de Almacenes (izquierda) */}
            {balanced.origins.map((origin, i) => {
              const cy = getLeftY(i);
              const isDummy = i === balanced.dummyRowIndex;
              return (
                <g key={`o-${i}`}>
                  <rect
                    x={leftX}
                    y={cy - nodeHeight / 2}
                    width={nodeWidth}
                    height={nodeHeight}
                    rx={8}
                    fill={isDummy ? '#fffbeb' : '#0B1F3A'}
                    stroke={isDummy ? '#f59e0b' : '#0B1F3A'}
                    strokeDasharray={isDummy ? '4 3' : undefined}
                    strokeWidth={1.5}
                  />
                  <text
                    x={leftX + 12}
                    y={cy - 4}
                    fontSize="12"
                    fontWeight="700"
                    fill={isDummy ? '#78350f' : '#ffffff'}
                  >
                    {truncateLabel(origin)}
                  </text>
                  <text
                    x={leftX + 12}
                    y={cy + 14}
                    fontSize="11"
                    fontFamily="IBM Plex Mono, monospace"
                    fill={isDummy ? '#92400e' : '#a5f3fc'}
                  >
                    Oferta: {fmt(balanced.supply[i])} u
                  </text>
                </g>
              );
            })}

            {/* Nodos de Sucursales (derecha) */}
            {balanced.destinations.map((dest, j) => {
              const cy = getRightY(j);
              const isDummy = j === balanced.dummyColIndex;
              return (
                <g key={`d-${j}`}>
                  <rect
                    x={rightX}
                    y={cy - nodeHeight / 2}
                    width={nodeWidth}
                    height={nodeHeight}
                    rx={8}
                    fill={isDummy ? '#fffbeb' : '#ffffff'}
                    stroke={isDummy ? '#f59e0b' : '#0891b2'}
                    strokeDasharray={isDummy ? '4 3' : undefined}
                    strokeWidth={1.5}
                  />
                  <text
                    x={rightX + 12}
                    y={cy - 4}
                    fontSize="12"
                    fontWeight="700"
                    fill={isDummy ? '#78350f' : '#0B1F3A'}
                  >
                    {truncateLabel(dest)}
                  </text>
                  <text
                    x={rightX + 12}
                    y={cy + 14}
                    fontSize="11"
                    fontFamily="IBM Plex Mono, monospace"
                    fill={isDummy ? '#92400e' : '#0e7490'}
                  >
                    Demanda: {fmt(balanced.demand[j])} u
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Lista clara de envíos activos sincronizada con el mapa */}
      <div className="xl:col-span-5 border border-slate-200 rounded-xl bg-white p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-200">
          <h3 className="text-sm font-bold text-[#0B1F3A]">
            Qué enviar por cada ruta ({realEdges.length}{' '}
            {realEdges.length === 1 ? 'ruta real' : 'rutas reales'})
          </h3>
          <span className="text-xs font-mono tabular-nums font-semibold text-cyan-800">
            ${fmt(methodResult.totalCost)} MXN
          </span>
        </div>

        {realEdges.length === 0 ? (
          <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-950">
            No hay envíos físicos entre almacenes y sucursales reales (todas las unidades quedaron en ajuste ficticio).
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {realEdges.map((edge) => {
              const isHighlighted = hoveredId === edge.id;
              return (
                <li
                  key={edge.id}
                  onMouseEnter={() => setHoveredId(edge.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`py-2.5 px-2.5 rounded-lg transition-colors cursor-default ${
                    isHighlighted ? 'bg-cyan-50/80' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
                    <div className="flex items-center gap-1.5 font-semibold text-[#0B1F3A] min-w-0">
                      <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{edge.originName}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
                      <Store className="w-3.5 h-3.5 text-cyan-700 shrink-0" />
                      <span className="truncate">{edge.destinationName}</span>
                    </div>
                    <span className="font-mono tabular-nums font-bold text-[#0B1F3A] whitespace-nowrap shrink-0">
                      {fmt(edge.quantity)} u
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-600 font-mono tabular-nums">
                    <span>Tarifa: ${fmt(edge.unitCost)}/u</span>
                    <span className="font-semibold text-cyan-900">
                      Subtotal: ${fmt(edge.subtotal)} MXN
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {dummyEdges.length > 0 && (
          <div className="pt-2 border-t border-slate-200 space-y-1.5">
            <div className="text-xs font-semibold text-amber-900">
              Ajustes de balanceo ficticio ($0 MXN)
            </div>
            {dummyEdges.map((edge) => (
              <div
                key={edge.id}
                onMouseEnter={() => setHoveredId(edge.id)}
                onMouseLeave={() => setHoveredId(null)}
                className="p-2 rounded-md bg-amber-50/70 border border-amber-200 flex items-center justify-between gap-2 text-xs text-amber-950"
              >
                <span>
                  {edge.originName} → {edge.destinationName}
                </span>
                <span className="font-mono tabular-nums font-semibold">
                  {fmt(edge.quantity)} u ($0)
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
