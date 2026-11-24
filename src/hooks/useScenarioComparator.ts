import { useEffect, useMemo, useState } from 'react';
import {
  cloneTransportationProblem,
  compareTransportationScenarios,
} from '../math/sensitivity';
import { SolveResponse, TransportationProblem } from '../math/types';

export interface AltScenarioDraft {
  supply: string[];
  demand: string[];
  costs: string[][];
}

function problemToAltDraft(p: TransportationProblem): AltScenarioDraft {
  return {
    supply: p.supply.map((v) => String(v)),
    demand: p.demand.map((v) => String(v)),
    costs: p.costs.map((row) => row.map((v) => String(v))),
  };
}

function problemsEqual(a: TransportationProblem, b: TransportationProblem): boolean {
  if (
    a.origins.length !== b.origins.length ||
    a.destinations.length !== b.destinations.length
  ) {
    return false;
  }
  for (let i = 0; i < a.origins.length; i++) {
    if (a.origins[i] !== b.origins[i] || a.supply[i] !== b.supply[i]) return false;
    for (let j = 0; j < a.destinations.length; j++) {
      if (a.costs[i][j] !== b.costs[i][j]) return false;
    }
  }
  for (let j = 0; j < a.destinations.length; j++) {
    if (a.destinations[j] !== b.destinations[j] || a.demand[j] !== b.demand[j]) {
      return false;
    }
  }
  return true;
}

export function useScenarioComparator(
  problem: TransportationProblem,
  result: SolveResponse
) {
  const [originalSnapshot, setOriginalSnapshot] = useState<TransportationProblem>(() =>
    cloneTransportationProblem(problem)
  );
  const [altDraft, setAltDraft] = useState<AltScenarioDraft>(() =>
    problemToAltDraft(problem)
  );
  const [hasAltEdits, setHasAltEdits] = useState<boolean>(false);
  const [undoAltDraft, setUndoAltDraft] = useState<AltScenarioDraft | null>(null);

  useEffect(() => {
    if (!hasAltEdits) {
      setOriginalSnapshot(cloneTransportationProblem(problem));
      setAltDraft(problemToAltDraft(problem));
      setUndoAltDraft(null);
    }
  }, [problem, hasAltEdits]);

  const mainProblemChangedSinceSnapshot = useMemo(
    () => !problemsEqual(problem, originalSnapshot),
    [problem, originalSnapshot]
  );

  const handleSyncComparatorFromMain = () => {
    setOriginalSnapshot(cloneTransportationProblem(problem));
    setAltDraft(problemToAltDraft(problem));
    setHasAltEdits(false);
    setUndoAltDraft(null);
  };

  const handleRestoreAlternativeToOriginal = () => {
    if (hasAltEdits) {
      setUndoAltDraft({
        supply: [...altDraft.supply],
        demand: [...altDraft.demand],
        costs: altDraft.costs.map((r) => [...r]),
      });
    }
    setAltDraft(problemToAltDraft(originalSnapshot));
    setHasAltEdits(false);
  };

  const handleUndoRestore = () => {
    if (!undoAltDraft) return;
    setAltDraft(undoAltDraft);
    setHasAltEdits(true);
    setUndoAltDraft(null);
  };

  const updateAltSupply = (i: number, value: string) => {
    setHasAltEdits(true);
    setUndoAltDraft(null);
    setAltDraft((prev) => ({
      ...prev,
      supply: prev.supply.map((v, idx) => (idx === i ? value : v)),
    }));
  };

  const updateAltDemand = (j: number, value: string) => {
    setHasAltEdits(true);
    setUndoAltDraft(null);
    setAltDraft((prev) => ({
      ...prev,
      demand: prev.demand.map((v, idx) => (idx === j ? value : v)),
    }));
  };

  const updateAltCost = (i: number, j: number, value: string) => {
    setHasAltEdits(true);
    setUndoAltDraft(null);
    setAltDraft((prev) => ({
      ...prev,
      costs: prev.costs.map((row, ri) =>
        ri === i ? row.map((v, ci) => (ci === j ? value : v)) : row
      ),
    }));
  };

  const { altParseErrors, invalidAltFields, scenarioComparison } = useMemo(() => {
    const parseErrors: string[] = [];
    const invalidFields = new Set<string>();
    const parsedSupply: number[] = [];
    const parsedDemand: number[] = [];
    const parsedCosts: number[][] = [];

    for (let i = 0; i < originalSnapshot.origins.length; i++) {
      const raw = (altDraft.supply[i] ?? '').trim();
      const num = raw === '' ? Number.NaN : Number(raw);
      if (!Number.isFinite(num) || num < 0) {
        invalidFields.add(`supply.${i}`);
        parseErrors.push(
          `Oferta alternativa de "${originalSnapshot.origins[i]}" debe ser un número mayor o igual a 0.`
        );
        parsedSupply.push(0);
      } else {
        parsedSupply.push(num);
      }
    }

    for (let j = 0; j < originalSnapshot.destinations.length; j++) {
      const raw = (altDraft.demand[j] ?? '').trim();
      const num = raw === '' ? Number.NaN : Number(raw);
      if (!Number.isFinite(num) || num < 0) {
        invalidFields.add(`demand.${j}`);
        parseErrors.push(
          `Demanda alternativa de "${originalSnapshot.destinations[j]}" debe ser un número mayor o igual a 0.`
        );
        parsedDemand.push(0);
      } else {
        parsedDemand.push(num);
      }
    }

    for (let i = 0; i < originalSnapshot.origins.length; i++) {
      const row: number[] = [];
      for (let j = 0; j < originalSnapshot.destinations.length; j++) {
        const raw = (altDraft.costs[i]?.[j] ?? '').trim();
        const num = raw === '' ? Number.NaN : Number(raw);
        if (!Number.isFinite(num) || num < 0) {
          invalidFields.add(`costs.${i}.${j}`);
          parseErrors.push(
            `Costo alternativo de ${originalSnapshot.origins[i]} → ${originalSnapshot.destinations[j]} debe ser un número mayor o igual a 0.`
          );
          row.push(0);
        } else {
          row.push(num);
        }
      }
      parsedCosts.push(row);
    }

    const altProblem: TransportationProblem = {
      origins: [...originalSnapshot.origins],
      destinations: [...originalSnapshot.destinations],
      supply: parsedSupply,
      demand: parsedDemand,
      costs: parsedCosts,
    };

    if (parseErrors.length > 0) {
      const fallback = compareTransportationScenarios(
        originalSnapshot,
        cloneTransportationProblem(originalSnapshot)
      );
      return {
        altParseErrors: parseErrors,
        invalidAltFields: invalidFields,
        scenarioComparison: {
          ...fallback,
          valid: false,
          errors: parseErrors,
        },
      };
    }

    const comp = compareTransportationScenarios(
      originalSnapshot,
      altProblem,
      mainProblemChangedSinceSnapshot ? undefined : result
    );
    return {
      altParseErrors: comp.valid ? [] : comp.errors,
      invalidAltFields: invalidFields,
      scenarioComparison: comp,
    };
  }, [originalSnapshot, altDraft, mainProblemChangedSinceSnapshot, result]);

  const validExportScenarioComparison =
    !mainProblemChangedSinceSnapshot &&
    scenarioComparison.valid &&
    scenarioComparison.hasInputChanges
      ? scenarioComparison
      : null;

  return {
    originalSnapshot,
    altDraft,
    hasAltEdits,
    undoAltDraft,
    mainProblemChangedSinceSnapshot,
    altParseErrors,
    invalidAltFields,
    scenarioComparison,
    validExportScenarioComparison,
    handleSyncComparatorFromMain,
    handleRestoreAlternativeToOriginal,
    handleUndoRestore,
    updateAltSupply,
    updateAltDemand,
    updateAltCost,
  };
}
