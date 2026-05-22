export interface Report {
  id?: string;
  userId: string;
  ticker: string;
  prompt: string;
  output: string;
  analysisType: "stock" | "macro" | "multi_stock";
  timestamp: any; // Firestore Timestamp
  config: any;
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export interface StockTrack {
  id: string;
  userId: string;
  ticker: string;
  reportId?: string;
  analysisDate: string;
  suggestion: string;
  entryPrice: number;
  tp1: number;
  tp2: number;
  price?: number;
  fairValue: number;
  bullCase: string;
  bearCase: string;
  comments: string;
  timestamp: any;
}

export interface MacroTrack {
  id: string;
  userId: string;
  reportId?: string;
  analysisDate: string;
  sentiment: string;
  indicators: string;
  bullCase: string;
  bearCase: string;
  comments: string;
  timestamp: any;
}
