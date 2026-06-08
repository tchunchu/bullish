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

export interface UploadedHtmlReport {
  id?: string;
  userId: string;
  reportType: "current" | "status";
  reportDate: string;
  title: string;
  htmlContent: string;
  plainText: string;
  timestamp: any; // Firestore Timestamp
  reportTimestamp?: string;
  generatedUtc?: string;
}

export interface PromptTemplate {
  id?: string;
  userId: string;
  title: string;
  content: string;
  timestamp: any;
}

export interface DailyNewsLog {
  id?: string;
  userId: string;
  reportDate: string;
  title: string;
  macroRegime?: string;
  macroLede?: string;
  macroEvents?: any[];
  macroHtml?: string;
  macroFullText?: string;
  macroTextLines?: string[];
  actionSummary?: {
    title: string;
    cols: {
      title: string;
      isWin: boolean;
      isLose: boolean;
      items: string[];
    }[];
  } | null;
  insiderStats?: string[];
  insiderTables?: any[];
  newsDetailedAnalyses?: {
    title: string;
    source: string;
    subject: string;
    implicationLine: string;
    level1Implication: string;
    level2Implication: string;
    beneficiaryTickers: {
      ticker: string;
      name: string;
      rationale: string;
    }[];
    detrimentalTickers: {
      ticker: string;
      name: string;
      rationale: string;
    }[];
  }[];
  timestamp: any;
  reportTimestamp?: string;
  generatedUtc?: string;
}


