import { BalancedProblem, TransportationProblem, ValidationError, ValidationResult } from './types';

export const EPSILON = 1e-9;

export function roundClean(value: number): number {
  const rounded = Math.round(value * 1e8) / 1e8;
  return Math.abs(rounded) < EPSILON ? 0 : rounded;
}

export function validateProblem(problem: TransportationProblem): ValidationResult {
  const errors: ValidationError[] = [];

  if (!problem.origins || problem.origins.length === 0) {
    errors.push({
      field: 'origins',
      message: 'Debe existir al menos un almacén (origen).',
    });
  }

  if (!problem.destinations || problem.destinations.length === 0) {
    errors.push({
      field: 'destinations',
      message: 'Debe existir al menos una sucursal (destino).',
    });
  }

  const m = problem.origins.length;
  const n = problem.destinations.length;

  if (problem.supply.length !== m) {
    errors.push({
      field: 'supply',
      message: 'La cantidad de valores de oferta no coincide con el número de almacenes.',
    });
  }

  if (problem.demand.length !== n) {
    errors.push({
      field: 'demand',
      message: 'La cantidad de valores de demanda no coincide con el número de sucursales.',
    });
  }

  if (problem.costs.length !== m) {
    errors.push({
      field: 'costs',
      message: 'El número de filas en la matriz de costos no coincide con los almacenes.',
    });
  }

  let totalSupply = 0;
  for (let i = 0; i < m; i++) {
    const s = problem.supply[i];
    if (typeof s !== 'number' || !Number.isFinite(s) || s < 0) {
      errors.push({
        field: `supply.${i}`,
        message: `La oferta de "${problem.origins[i] || `Almacén ${i + 1}`}" debe ser un número mayor o igual a 0.`,
      });
    } else {
      totalSupply += s;
    }
  }

  let totalDemand = 0;
  for (let j = 0; j < n; j++) {
    const d = problem.demand[j];
    if (typeof d !== 'number' || !Number.isFinite(d) || d < 0) {
      errors.push({
        field: `demand.${j}`,
        message: `La demanda de "${problem.destinations[j] || `Sucursal ${j + 1}`}" debe ser un número mayor o igual a 0.`,
      });
    } else {
      totalDemand += d;
    }
  }

  for (let i = 0; i < m; i++) {
    const row = problem.costs[i];
    if (!row || row.length !== n) {
      errors.push({
        field: `costs.${i}`,
        message: `La fila de costos de "${problem.origins[i] || `Almacén ${i + 1}`}" está incompleta.`,
      });
      continue;
    }
    for (let j = 0; j < n; j++) {
      const c = row[j];
      if (typeof c !== 'number' || !Number.isFinite(c) || c < 0) {
        errors.push({
          field: `costs.${i}.${j}`,
          message: `El costo unitario de ${problem.origins[i]} a ${problem.destinations[j]} debe ser un número mayor o igual a 0.`,
        });
      }
    }
  }

  if (errors.length === 0 && totalSupply <= EPSILON && totalDemand <= EPSILON) {
    errors.push({
      field: 'totals',
      message: 'La oferta total y la demanda total no pueden ser ambas cero.',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function balanceProblem(problem: TransportationProblem): BalancedProblem {
  const originalSupplyTotal = roundClean(problem.supply.reduce((acc, v) => acc + v, 0));
  const originalDemandTotal = roundClean(problem.demand.reduce((acc, v) => acc + v, 0));
  const diff = roundClean(originalSupplyTotal - originalDemandTotal);

  const origins = problem.origins.map((o, i) => o.trim() || `Almacén ${i + 1}`);
  const destinations = problem.destinations.map((d, j) => d.trim() || `Sucursal ${j + 1}`);
  const supply = [...problem.supply];
  const demand = [...problem.demand];
  const costs = problem.costs.map((row) => [...row]);

  if (Math.abs(diff) <= EPSILON) {
    return {
      origins,
      destinations,
      supply,
      demand,
      costs,
      originalSupplyTotal,
      originalDemandTotal,
      balanceStatus: 'balanced',
      dummyRowIndex: null,
      dummyColIndex: null,
      dummyAmount: 0,
    };
  }

  if (diff > 0) {
    // Exceso de oferta -> agregar Destino Ficticio con costo 0
    const dummyColIndex = destinations.length;
    destinations.push('Destino Ficticio');
    demand.push(diff);
    for (let i = 0; i < costs.length; i++) {
      costs[i].push(0);
    }
    return {
      origins,
      destinations,
      supply,
      demand,
      costs,
      originalSupplyTotal,
      originalDemandTotal,
      balanceStatus: 'dummy_destination',
      dummyRowIndex: null,
      dummyColIndex,
      dummyAmount: diff,
    };
  }

  // Exceso de demanda -> agregar Origen Ficticio con costo 0
  const deficit = roundClean(-diff);
  const dummyRowIndex = origins.length;
  origins.push('Origen Ficticio');
  supply.push(deficit);
  costs.push(new Array(destinations.length).fill(0));

  return {
    origins,
    destinations,
    supply,
    demand,
    costs,
    originalSupplyTotal,
    originalDemandTotal,
    balanceStatus: 'dummy_origin',
    dummyRowIndex,
    dummyColIndex: null,
    dummyAmount: deficit,
  };
}
