import React from 'react';

interface HeaderProps {
  onResetZeli: () => void;
}

const NAV_LINKS = [
  { href: '#inicio', label: 'Inicio' },
  { href: '#configuracion', label: 'Configuración' },
  { href: '#resultados', label: 'Resultados' },
  { href: '#analisis', label: 'Análisis' },
  { href: '#reportes', label: 'Reportes' },
];

export const Header: React.FC<HeaderProps> = ({ onResetZeli }) => {
  return (
    <header className="sticky top-0 z-30 bg-[#0B1F3A]/95 backdrop-blur-md border-b border-slate-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        <a
          href="#inicio"
          className="text-sm sm:text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-400"
        >
          OptiRoute – Zeli Distribuciones
        </a>

        <nav
          aria-label="Navegación entre secciones"
          className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-300"
        >
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="hover:text-cyan-300 hover:underline underline-offset-4 transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-400"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onResetZeli}
            className="min-h-[38px] px-4 py-2 text-xs sm:text-sm font-semibold text-[#0B1F3A] bg-cyan-400 rounded-lg hover:bg-cyan-300 active:bg-cyan-500 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
          >
            Cargar ejemplo Zeli
          </button>
        </div>
      </div>
    </header>
  );
};
