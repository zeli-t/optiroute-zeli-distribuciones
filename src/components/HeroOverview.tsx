import { ArrowRight, Play, RotateCcw } from 'lucide-react';
import React from 'react';

interface HeroOverviewProps {
  onStartAnalysis: () => void;
  onLoadZeliExample: () => void;
}

const WORKFLOW_STEPS = [
  {
    href: '#configuracion',
    step: '1. Configura',
    detail: 'Ingresa almacenes, sucursales y tarifas',
  },
  {
    href: '#resultados',
    step: '2. Resultados',
    detail: 'Visualiza el plan óptimo y sus rutas',
  },
  {
    href: '#analisis',
    step: '3. Análisis avanzado',
    detail: 'Explora sensibilidad, escenarios y decisiones',
  },
  {
    href: '#reportes',
    step: '4. Reporte',
    detail: 'Descarga el documento académico en PDF',
  },
];

export const HeroOverview: React.FC<HeroOverviewProps> = ({
  onStartAnalysis,
  onLoadZeliExample,
}) => {
  return (
    <section
      id="inicio"
      aria-label="Inicio de OptiRoute – Zeli Distribuciones"
      className="bg-[#0B1F3A] text-white border-b border-slate-800 logistics-grid-bg scroll-mt-16"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-8">
            <div className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
              Planeación de transporte y distribución
            </div>

            <h1 className="mt-2.5 text-3xl sm:text-4xl font-bold tracking-tight text-white text-balance">
              OptiRoute – Zeli Distribuciones
            </h1>

            <p className="mt-3 text-base sm:text-xl font-medium text-cyan-100 leading-snug max-w-2xl">
              Descubre cómo distribuir productos entre almacenes y sucursales al menor costo posible
            </p>

            <p className="mt-3 text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl">
              Captura cuántas unidades tienes disponibles, cuánto necesita cada sucursal y cuánto cuesta cada envío. La plataforma calcula automáticamente qué rutas usar, cuánto ahorras y cómo responden tus decisiones ante cambios.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onStartAnalysis}
                className="min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-bold text-[#0B1F3A] bg-cyan-400 hover:bg-cyan-300 active:bg-cyan-500 rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
              >
                <Play className="w-4 h-4 shrink-0" />
                Comenzar análisis
              </button>

              <button
                type="button"
                onClick={onLoadZeliExample}
                className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-white/10 hover:bg-white/15 border border-white/20 rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
              >
                <RotateCcw className="w-4 h-4 text-cyan-300 shrink-0" />
                Cargar ejemplo de Zeli Distribuciones
              </button>
            </div>
          </div>

          <div className="lg:col-span-4 bg-white/5 border border-white/15 rounded-xl p-5 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
              ¿Cómo usar esta herramienta?
            </div>
            <ol className="space-y-2.5">
              {WORKFLOW_STEPS.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="group flex items-center justify-between gap-3 p-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                  >
                    <div>
                      <div className="text-xs sm:text-sm font-semibold text-white">
                        {item.step}
                      </div>
                      <div className="text-xs text-slate-300">{item.detail}</div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-cyan-300 group-hover:translate-x-0.5 transition-transform shrink-0" />
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
};
