export interface TransportationProblem {
  origins: string[];
  destinations: string[];
  supply: number[];
  demand: number[];
  costs: number[][];
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export type BalanceStatus = 'balanced' | 'dummy_destination' | 'dummy_origin';

export interface BalancedProblem {
  origins: string[];
  destinations: string[];
  supply: number[];
  demand: number[];
  costs: number[][];
  originalSupplyTotal: number;
  originalDemandTotal: number;
  balanceStatus: BalanceStatus;
  dummyRowIndex: number | null;
  dummyColIndex: number | null;
  dummyAmount: number;
}

export interface AllocationStep {
  stepNumber: number;
  row: number;
  col: number;
  originName: string;
  destinationName: string;
  quantity: number;
  unitCost: number;
  stepCost: number;
  cumulativeCostAfter: number;
  cellSupplyBefore: number;
  cellDemandBefore: number;
  cellSupplyAfter: number;
  cellDemandAfter: number;
  supplyAfter: number[];
  demandAfter: number[];
  crossedOut: {
    kind: 'row' | 'col' | 'both';
    description: string;
  };
  reason: string;
  rowPenalties?: (number | null)[];
  colPenalties?: (number | null)[];
  selectedPenalty?: {
    kind: 'row' | 'col' | 'single_line';
    lineName: string;
    penalty: number | null;
  };
}

export interface MethodResult {
  methodId: 'least_cost' | 'vogel' | 'optimal';
  methodName: string;
  allocations: number[][];
  basicMask: boolean[][];
  totalCost: number;
  steps: AllocationStep[];
}

export interface ModiIteration {
  iteration: number;
  u: number[];
  v: number[];
  reducedCosts: (number | null)[][];
  basicMaskBefore: boolean[][];
  allocationsBefore: number[][];
  allocationsAfter: number[][];
  enteringCell: { row: number; col: number; delta: number } | null;
  leavingCell: { row: number; col: number } | null;
  theta: number;
  cycle: { row: number; col: number; sign: '+' | '-'; currentAllocation: number }[];
  totalCostBefore: number;
  totalCostAfter: number;
  summary: string;
}

export interface VerificationCertificate {
  supplySatisfied: boolean;
  demandSatisfied: boolean;
  nonNegative: boolean;
  basicCellCount: number;
  expectedBasicCount: number;
  allReducedCostsNonNegative: boolean;
  costMatchesSum: boolean;
}

export interface OptimalResult extends MethodResult {
  methodId: 'optimal';
  iterations: ModiIteration[];
  finalU: number[];
  finalV: number[];
  finalReducedCosts: (number | null)[][];
  hasAlternativeOptima: boolean;
  alternativeCells: { row: number; col: number; originName: string; destinationName: string }[];
  verification: VerificationCertificate;
}

export interface RouteExplanation {
  originIndex: number;
  destinationIndex: number;
  originName: string;
  destinationName: string;
  quantity: number;
  unitCost: number;
  subtotalCost: number;
  isDummy: boolean;
  shareOfSupplyPct: number;
  shareOfDemandPct: number;
  summary: string;
}

export interface MethodComparisonRow {
  methodId: 'least_cost' | 'vogel' | 'optimal';
  methodName: string;
  totalCost: number;
  gapFromOptimal: number;
  gapPercentage: number;
  isOptimal: boolean;
  activeRoutesCount: number;
}

export interface ProblemExplanation {
  balanceSummary: string;
  headlineSummary: string;
  methodComparisonSummary: string;
  alternativeOptimaNote: string | null;
  routeExplanations: RouteExplanation[];
  unbalancedNote: string | null;
}

export interface NonBasicCostSensitivity {
  row: number;
  col: number;
  originName: string;
  destinationName: string;
  isDummy: boolean;
  currentCost: number;
  impliedDualSum: number;
  reducedCost: number;
  requiredReduction: number;
  minCostToKeepBasis: number;
  minNonNegativeCostToKeepBasis: number;
  canBecomeCompetitiveWithNonNegativeCost: boolean;
  alreadyAlternativeOptimum: boolean;
  cycleTheta: number;
  changesAllocationAtTie: boolean;
  basisVsAllocationNote: string;
}

export interface BasicCostSensitivity {
  row: number;
  col: number;
  originName: string;
  destinationName: string;
  isDummy: boolean;
  allocation: number;
  isDegenerateBasic: boolean;
  currentCost: number;
  reliable: boolean;
  unreliableReason: string | null;
  deltaMin: number | null;
  deltaMax: number | null;
  minCostMath: number | null;
  minCostNonNegative: number;
  maxCost: number | null;
  limitingLowerCells: string[];
  limitingUpperCells: string[];
  hasTightLowerBound: boolean;
  hasTightUpperBound: boolean;
  interpretation: string;
}

export interface CostSensitivityAnalysis {
  implemented: true;
  optimalBasisSize: number;
  expectedBasisSize: number;
  basisIsValidTree: boolean;
  hasDegeneracy: boolean;
  hasAlternativeOptima: boolean;
  nonBasicRoutes: NonBasicCostSensitivity[];
  basicRoutes: BasicCostSensitivity[];
  limitationsNote: string[];
}

export interface BalancedRhsPathStep {
  row: number;
  col: number;
  originName: string;
  destinationName: string;
  sign: '+' | '-';
  currentAllocation: number;
  unitCost: number;
  isDummy: boolean;
}

export interface BalancedRhsPairSensitivity {
  originIndex: number;
  destinationIndex: number;
  originName: string;
  destinationName: string;
  currentSupply: number;
  currentDemand: number;
  isBasicPair: boolean;
  reliable: boolean;
  unreliableReason: string | null;
  pathSteps: BalancedRhsPathStep[];
  usesDummyInPath: boolean;
  deltaMin: number | null;
  deltaMax: number | null;
  minSupply: number | null;
  maxSupply: number | null;
  minDemand: number | null;
  maxDemand: number | null;
  marginalCostPerUnit: number | null;
  optimalCostAtMin: number | null;
  optimalCostAtMax: number | null;
  limitingLowerCells: string[];
  limitingUpperCells: string[];
  hasTightLowerBound: boolean;
  hasTightUpperBound: boolean;
  interpretation: string;
}

export interface RhsSensitivityAnalysis {
  implemented: true;
  basisIsValidTree: boolean;
  hasDegeneracy: boolean;
  initialBalanceStatus: BalanceStatus;
  balancedPairs: BalancedRhsPairSensitivity[];
  limitationsNote: string[];
}

export interface UnbalancedDummyAllocation {
  originName: string;
  destinationName: string;
  quantity: number;
}

export interface UnbalancedRhsEvaluation {
  valid: boolean;
  error: string | null;
  targetKind: 'supply' | 'demand';
  targetIndex: number;
  targetName: string;
  previousValue: number;
  newValue: number;
  deltaValue: number;
  originalSupplyTotal: number;
  originalDemandTotal: number;
  newSupplyTotal: number;
  newDemandTotal: number;
  balanceStatus: BalanceStatus | null;
  dummyAmount: number;
  originalOptimalCost: number;
  newOptimalCost: number | null;
  costDifference: number | null;
  costDifferencePct: number | null;
  realAssignedUnits: number;
  dummyDestinationUnits: number;
  dummyOriginUnits: number;
  dummyAllocations: UnbalancedDummyAllocation[];
  realAllocationsSummary: {
    originName: string;
    destinationName: string;
    quantity: number;
    unitCost: number;
    subtotalCost: number;
  }[];
  dummyCostAssumptionNote: string;
  interpretation: string;
}

export interface DualEquationRow {
  row: number;
  col: number;
  originName: string;
  destinationName: string;
  unitCost: number;
  uValue: number;
  vValue: number;
  formulaText: string;
  isDummy: boolean;
}

export interface BalancedTransferSensitivity {
  kind: 'supply_transfer' | 'demand_transfer';
  fromIndex: number;
  toIndex: number;
  fromName: string;
  toName: string;
  fromPotential: number;
  toPotential: number;
  marginalCostPerUnit: number;
  signCategory: 'positive' | 'zero' | 'negative';
  deltaMin: number;
  deltaMax: number;
  hasTightBound: boolean;
  pathSteps: BalancedRhsPathStep[];
  usesDummyInPath: boolean;
  interpretation: string;
}

export interface ShadowPriceWorkedExample {
  id: string;
  kind: 'joint_pair' | 'supply_transfer' | 'demand_transfer';
  title: string;
  involvedOrigin: string;
  involvedDestination: string;
  deltaUnits: number;
  potentialsUsed: string;
  formulaApplied: string;
  originalOptimalCost: number;
  expectedNewCost: number;
  verifiedModiCost: number;
  verifiedWithModi: boolean;
  conditions: string[];
  interpretation: string;
}

export interface DualShadowPriceAnalysis {
  implemented: true;
  basisIsValidTree: boolean;
  normalizationNote: string;
  normalizationInvarianceNote: string;
  isolatedChangeWarning: string;
  basicEquations: DualEquationRow[];
  dualFeasibilityVerified: boolean;
  supplyTransfers: BalancedTransferSensitivity[];
  demandTransfers: BalancedTransferSensitivity[];
  workedExamples: ShadowPriceWorkedExample[];
  limitationsNote: string[];
}

export interface ScenarioInputChange {
  kind: 'cost' | 'supply' | 'demand';
  label: string;
  originalValue: number;
  alternativeValue: number;
  delta: number;
}

export interface ScenarioRouteDiff {
  originName: string;
  destinationName: string;
  isDummy: boolean;
  status: 'added' | 'removed' | 'increased' | 'decreased' | 'unchanged';
  originalQuantity: number;
  alternativeQuantity: number;
  quantityDelta: number;
  originalUnitCost: number | null;
  alternativeUnitCost: number | null;
  originalSubtotal: number;
  alternativeSubtotal: number;
  subtotalDelta: number;
}

export interface ScenarioComparisonResult {
  valid: boolean;
  errors: string[];
  hasInputChanges: boolean;
  inputChanges: ScenarioInputChange[];
  originalOptimalCost: number;
  alternativeOptimalCost: number | null;
  alternativeLeastCost: number | null;
  alternativeVogelCost: number | null;
  costDifference: number | null;
  costDifferencePct: number | null;
  costFormulaText: string;
  originalSupplyTotal: number;
  alternativeSupplyTotal: number;
  supplyTotalDelta: number;
  originalDemandTotal: number;
  alternativeDemandTotal: number;
  demandTotalDelta: number;
  originalBalanceStatus: BalanceStatus | null;
  alternativeBalanceStatus: BalanceStatus | null;
  originalDummyAmount: number;
  alternativeDummyAmount: number;
  originalRealShippedUnits: number;
  alternativeRealShippedUnits: number;
  originalHasDegeneracy: boolean;
  alternativeHasDegeneracy: boolean;
  originalHasAlternativeOptima: boolean;
  alternativeHasAlternativeOptima: boolean;
  routeDiffs: ScenarioRouteDiff[];
  dummyRouteDiffs: ScenarioRouteDiff[];
  addedRoutesCount: number;
  removedRoutesCount: number;
  changedQuantityRoutesCount: number;
  unchangedRoutesCount: number;
  structuralAlerts: string[];
  dynamicExplanation: {
    costSummary: string;
    routeSummary: string;
    driverSummary: string;
    dummyLimitationNote: string | null;
    validityPrincipleNote: string;
  };
}

export interface ManagerialActiveRouteItem {
  originName: string;
  destinationName: string;
  quantity: number;
  unitCost: number;
  subtotalCost: number;
  shareOfRealUnitsPct: number;
  isDegenerateBasic: boolean;
}

export interface ManagerialUnusedRouteItem {
  originName: string;
  destinationName: string;
  currentCost: number;
  reducedCost: number;
  requiredReduction: number;
  alreadyAlternativeOptimum: boolean;
  cycleTheta: number;
  conditionalNote: string;
}

export interface ManagerialDiagnosis {
  totalOptimalCost: number;
  realDistributedUnits: number;
  totalSupplyReal: number;
  totalDemandReal: number;
  balanceStatus: BalanceStatus;
  balanceLabel: string;
  dummyAmount: number;
  dummyLimitationWarning: string | null;
  activeRoutes: ManagerialActiveRouteItem[];
  degenerateBasicRoutesCount: number;
  unusedRoutes: ManagerialUnusedRouteItem[];
  hasAlternativeOptima: boolean;
  alternativeOptimaSummary: string;
  degeneracyWarning: string | null;
}

export interface ManagerialRecommendation {
  id: string;
  category:
    | 'distribution'
    | 'keep_routes'
    | 'alternative_routes'
    | 'tariff_changes'
    | 'capacity_adjustments'
    | 'inventory_risks';
  title: string;
  recommendation: string;
  mathematicalBasis: string;
  cautionNote: string | null;
}

export interface ManagerialScenarioComparisonAnalysis {
  hasChanges: boolean;
  valid: boolean;
  errorMessage: string | null;
  lowestMathematicalCostLabel: string;
  costDeltaSummary: string;
  routesDeltaSummary: string;
  selectionCriteria: string[];
  comparabilityWarning: string | null;
  isTrueEfficiencyComparison: boolean;
}

export interface ManagerialEconomicConcept {
  id:
    | 'reduced_costs'
    | 'shadow_prices'
    | 'sensitivity_ranges'
    | 'feasibility_constraints'
    | 'parameter_impact';
  title: string;
  plainExplanation: string;
  currentModelEvidence: string;
}

export interface ManagerialDecisionAnalysis {
  implemented: true;
  diagnosis: ManagerialDiagnosis;
  recommendations: ManagerialRecommendation[];
  scenarioComparisonAnalysis: ManagerialScenarioComparisonAnalysis;
  economicInterpretation: ManagerialEconomicConcept[];
}

export interface SensitivityScaffold {
  status: 'scaffold' | 'partial' | 'complete';
  phaseLabel: string;
  computedDuals: {
    u: { label: string; value: number }[];
    v: { label: string; value: number }[];
    nonBasicOpportunityCosts: {
      originName: string;
      destinationName: string;
      unitCost: number;
      reducedCost: number;
      interpretation: string;
    }[];
  };
  costSensitivity: CostSensitivityAnalysis;
  rhsSensitivity: RhsSensitivityAnalysis;
  dualShadowPrices: DualShadowPriceAnalysis;
  managerialAnalysis: ManagerialDecisionAnalysis;
  plannedExtensions: {
    id: string;
    title: string;
    description: string;
    mathematicalBasis: string;
    implemented: boolean;
  }[];
}

export interface SlackSupplyRow {
  originIndex: number;
  originName: string;
  supplyAvailable: number;
  realShipped: number;
  slackUnassigned: number;
  utilizationPct: number;
  statusLabel: string;
}

export interface SlackDemandRow {
  destinationIndex: number;
  destinationName: string;
  demandRequired: number;
  realReceived: number;
  unmetDemand: number;
  coveragePct: number;
  statusLabel: string;
}

export interface SlackSaturationAnalysis {
  balanceStatus: BalanceStatus;
  totalSupplyAvailable: number;
  totalRealShipped: number;
  totalSlackUnassigned: number;
  totalDemandRequired: number;
  totalRealReceived: number;
  totalUnmetDemand: number;
  supplyRows: SlackSupplyRow[];
  demandRows: SlackDemandRow[];
}

export interface SolveResponse {
  validation: ValidationResult;
  balanced: BalancedProblem | null;
  leastCost: MethodResult | null;
  vogel: MethodResult | null;
  optimal: OptimalResult | null;
  comparison: MethodComparisonRow[];
  explanation: ProblemExplanation | null;
  sensitivity: SensitivityScaffold | null;
}
