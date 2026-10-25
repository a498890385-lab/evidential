// 核心数据模型。与设计规格 §4 一一对应。
export type ID = string;
export type ISO = string;

export type Tier = 'almost-certain' | 'likely' | 'neutral' | 'unlikely' | 'almost-impossible';
export type GroupStrength = 'strong' | 'medium' | 'weak';
export type Reliability = 'high' | 'medium' | 'low';
export type EvidenceKind = 'observation' | 'statistic' | 'testimony' | 'document' | 'inference';
export type SourceType = 'user' | 'ai_search' | 'link' | 'paste';
export type EvidenceStatus = 'adopted' | 'rejected';
export type Verdict = 'below' | 'borderline' | 'above';
export type PriorMode = 'reference-class' | 'direct' | 'uniform';

export interface Hypothesis {
  id: ID;
  label: string;
  statement: string;
  /** 归一化后的先验，和为 1 */
  prior: number;
  /** 似然比矩阵的基准假设（默认第一个） */
  isBaseline?: boolean;
}

export interface ReferenceLayer {
  id: ID;
  description: string;
  /** 该层下各假设的基准率（层内和为 1） */
  baseRate?: Record<ID, number>;
  source?: string;
}

export interface PriorSource {
  mode: PriorMode;
  layers: ReferenceLayer[];
  chosenLayerId?: ID;
  direct?: Record<ID, number>;
  note?: string;
}

export interface Provenance {
  url?: string;
  title?: string;
  site?: string;
  /** 原文引文，AI 来源时强制校验 */
  quote?: string;
  retrievedAt?: ISO;
  searchQuery?: string;
}

export interface Evidence {
  id: ID;
  seq: number;
  claim: string;
  detail?: string;
  kind: EvidenceKind;
  sourceType: SourceType;
  provenance?: Provenance;
  /** 相对基准假设的似然比；基准假设恒为 1 */
  lr: Record<ID, number>;
  lrInput: { mode: 'tier' | 'frequency' | 'direct'; raw?: unknown };
  reliability: Reliability;
  groupId?: ID;
  status: EvidenceStatus;
  createdAt: ISO;
  tags?: string[];
}

export interface CorrelationGroup {
  id: ID;
  label: string;
  strength: GroupStrength;
  note?: string;
}

export interface Candidate {
  id: ID;
  createdAt: ISO;
  claim: string;
  detail?: string;
  kind: EvidenceKind;
  provenance: Provenance;
  suggestedLr: Record<ID, number>;
  reason: string;
  reliability: Reliability;
  reliabilityReason?: string;
  provenanceCheck: 'verified' | 'unverified' | 'missing';
  direction: 'support' | 'oppose' | 'neutral';
  state: 'pending' | 'adopted' | 'rejected';
}

export interface Assessment {
  id: ID;
  at: ISO;
  posterior: Record<ID, number>;
  verdict: Verdict;
  sufficiency: {
    stability: boolean;
    noSinglePoint: boolean;
    bothSides: boolean;
    correlation: boolean;
  };
  userConclusion: string;
  nextStep?: string;
}

export interface DecisionConfig {
  actionCost?: number;
  inactionCost?: number;
  /** 0..1；缺省时由 actionCost/(actionCost+inactionCost) 推出 */
  threshold?: number;
  actionLabel?: string;
}

export interface AiRun {
  id: ID;
  at: ISO;
  kind:
    | 'queries'
    | 'search'
    | 'extract'
    | 'parse-link'
    | 'parse-paste'
    | 'alt-hypotheses'
    | 'open-questions';
  model?: string;
  query?: string;
  url?: string;
  ok: boolean;
  error?: string;
  tokens?: { in: number; out: number };
  resultCount?: number;
}

export interface Session {
  id: ID;
  schemaVersion: 1;
  title: string;
  question: string;
  status: 'active' | 'concluded';
  createdAt: ISO;
  updatedAt: ISO;
  hypotheses: Hypothesis[];
  priorSource: PriorSource;
  evidence: Evidence[];
  groups: CorrelationGroup[];
  candidates: Candidate[];
  assessments: Assessment[];
  decision: DecisionConfig;
  aiLog: AiRun[];
  /** 用户确认"已检索反对方向，未找到反证" */
  opposeChecked?: boolean;
  notes?: string;
}

export interface Settings {
  llm: { baseUrl: string; model: string; hasKey: boolean };
  search: { provider: 'deepseek' | 'bocha'; count: number; hasKey: boolean };
  ui: { theme: 'light' | 'dark' };
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
