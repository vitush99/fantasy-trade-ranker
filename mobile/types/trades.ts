// types/trades.ts
export type QBFormat = 'SF' | '1QB';
export type TEPremium = 'none' | 'TE+' | 'TE++' | 'TE+++';
export type PPR = 0 | 0.5 | 1;
export type PassTD = 4 | 5 | 6;
export type TeamCount = 8 | 10 | 12 | 14 | 16;

export interface TradeSettings {
  passTD: PassTD;
  ppr: PPR;
  qb: QBFormat;
  start: number;       // starters
  te: TEPremium;
  teams: TeamCount;
}

export interface Trade {
  id: string;
  submittedBy?: string;          // <-- add this
  isUserSubmission?: boolean;
  settings: TradeSettings;
  sideA: string[];               // or your structured player objects
  sideB: string[];
  createdAt?: any;               // Timestamp (if you use it)
  lastVote?: any;                // Timestamp (if you use it)
  timestamp?: any;               // <-- you have this in Firestore screenshot
  tradeIdHash: string;
}

export interface TradeFilters {
  qb?: QBFormat[];               // ['SF','1QB'] or []
  te?: TEPremium[];              // ['none','TE+'] or []
  passTD?: PassTD[];             // [4,6] or []
  ppr?: PPR[];                   // [0, 0.5, 1] or []
  teams?: TeamCount[];           // [10,12,14] or []
  start?: number[];              // [8,9,10] or []
}
