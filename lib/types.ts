// Fund and Investment Types
export interface Fund {
  id: string;
  name: string;
  vintage: number;
}

export interface FundManager {
  fund_manager_id: string;
  fund_manager_name: string;
}

export interface InvestmentName {
  investment_name_id: string;
  investment_name: string;
  vehicle_id: string;
  full_strategy_name: string;
  vintage: number;
}

export interface PortfolioDate {
  date: string;
}

// General Page Types
export interface FundGeneral {
  name: string;
  vintage: number;
  investmentPeriod: string;
  fundLife: string;
  fees: string;
  gpCommit: string;
  fundSize: string;
  commitmentCalled: number;
  capitalDistributed: number;
  relationshipOwner: string;
  dateOfReview: string;
  lastReviewActions?: string;
  lastReviewConclusion?: string;
}

// Project and Portfolio Types
export interface Project {
  id: string;
  name: string;
  tag: string;
  subTag?: string;
  costM: number;
  realizedMVM: number;
  unrealizedMVM: number;
  moic: number;
  ownership: number;
  establishedType: 'New' | 'Follow-on' | 'Top Up';
  instrumentType: 'Equity' | 'Token' | 'SAFE' | 'SAFT';
  outcomeType?: 'Liquid' | 'Private' | 'TGE';
  liveness: 'Active' | 'Inactive' | 'Watch';
  firstEntryM: number;
  weightedValuationM: number;
  itdPercent: number;
  qtdPercent: number;
  equityCostM?: number;
  tokenCostM?: number;
  equityMV?: number;
  tokenMV?: number;
  notes?: string;
}

export interface ProjectDetail extends Project {
  description?: string;
  project_ecosystem?: string;
  project_stack?: string;
  website?: string;
  twitter_handle?: string;
  coingecko_id?: string;
  token_live?: 'Yes' | 'No';
  project_liveness_score?: number;
  project_liveness_status?: string;
  project_logo_url?: string;
  cost_by_tbv?: {
    TBV1?: number;
    TBV2?: number;
    TBV3?: number;
    TBV4?: number;
  };
  projectNotes?: ProjectNote[];
}

export interface ProjectNote {
  date: string;
  source: 'Manager Call' | 'LP Update' | 'DDQ' | 'Internal';
  author: string;
  text: string;
}

// Overview Page Types
export interface TagSummary {
  tag: string;
  projectCount: number;
  projectPercent: number;
  ownershipAvg: number;
  ownershipMedian: number;
  costM: number;
  costPercent: number;
  realizedMVM: number;
  realizedPercent: number;
  unrealizedMVM: number;
  unrealizedPercent: number;
  moic: number;
}

export interface MoicBucket {
  bucket: string;
  label: string;
  projectCount: number;
  projectPercent: number;
  costEquity: number;
  costTokens: number;
  costOthers: number;
  unrealizedMV: number;
  realizedMV: number;
  colorClass: string;
}

export interface AssetTypeBreakdown {
  assetType: string;
  projectCount: number;
  costM: number;
  unrealizedMV: number;
  realizedMV: number;
  moic: number;
}

export interface ValuationStageBreakdown {
  stage: string;
  projectCount: number;
  costM: number;
  unrealizedMV: number;
  moic: number;
}

// Historical Page Types
export interface HistoricalPeriod {
  period: string;
  deploymentM: number;
  deploymentPercent: number;
  capitalCallsM: number;
  capitalCallsPercent: number;
  distributionsM: number;
  distributionsPercent: number;
  tvpi: number;
  tvpiQuartiles: [number, number, number];
  dpi: number;
  dpiQuartiles: [number, number, number];
  notes?: string;
}

// Tab Navigation Types
export type Tab = 'general' | 'overview' | 'historical' | 'portfolio' | 'soi' | 'team' | 'fm-monitoring' | 'data-quality' | 'bas';

// Filter State Types
export interface FilterState {
  fundManager: string;
  investmentName: string;
  vehicleId: string;
  portfolioDate: string;
  tab: Tab;
}
