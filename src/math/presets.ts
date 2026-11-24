import { TransportationProblem } from './types';

export interface ProblemPreset {
  id: string;
  name: string;
  description: string;
  problem: TransportationProblem;
}

export const ZELI_DEFAULT_CASE: TransportationProblem = {
  origins: ['Almacén A', 'Almacén B'],
  destinations: ['Sucursal 1', 'Sucursal 2', 'Sucursal 3'],
  supply: [100, 150],
  demand: [80, 90, 80],
  costs: [
    [8, 6, 10],
    [9, 7, 4],
  ],
};

export const ACADEMIC_PRESETS: ProblemPreset[] = [
  {
    id: 'zeli_base',
    name: 'Caso Zeli Distribuciones (Base)',
    description: '2 almacenes, 3 sucursales, modelo balanceado en 250 unidades.',
    problem: ZELI_DEFAULT_CASE,
  },
  {
    id: 'zeli_surplus',
    name: 'Zeli con Exceso de Oferta',
    description: 'Oferta mayor que la demanda; activa un Destino Ficticio automático.',
    problem: {
      origins: ['Almacén A', 'Almacén B'],
      destinations: ['Sucursal 1', 'Sucursal 2', 'Sucursal 3'],
      supply: [140, 160],
      demand: [80, 90, 80],
      costs: [
        [8, 6, 10],
        [9, 7, 4],
      ],
    },
  },
  {
    id: 'zeli_deficit',
    name: 'Zeli con Exceso de Demanda',
    description: 'Demanda mayor que la oferta; activa un Origen Ficticio automático.',
    problem: {
      origins: ['Almacén A', 'Almacén B'],
      destinations: ['Sucursal 1', 'Sucursal 2', 'Sucursal 3'],
      supply: [100, 120],
      demand: [80, 100, 90],
      costs: [
        [8, 6, 10],
        [9, 7, 4],
      ],
    },
  },
  {
    id: 'comparative_3x4',
    name: 'Caso Comparativo 3×4 (Brecha entre métodos)',
    description: 'Ejemplo clásico donde Costo Mínimo ($475) queda por encima del óptimo MODI ($435).',
    problem: {
      origins: ['Planta Norte', 'Planta Centro', 'Planta Sur'],
      destinations: ['Sucursal 1', 'Sucursal 2', 'Sucursal 3', 'Sucursal 4'],
      supply: [15, 25, 10],
      demand: [5, 15, 15, 15],
      costs: [
        [10, 2, 20, 11],
        [12, 7, 9, 20],
        [4, 14, 16, 18],
      ],
    },
  },
];
