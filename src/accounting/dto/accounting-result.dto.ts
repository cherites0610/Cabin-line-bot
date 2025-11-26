export interface AccountingEntry {
  item: string;
  amount: number;
  parentCategory: string;
  subCategory: string;
  payer: string;
  type: 'expense' | 'income';
}

export interface AccountingAnalysisResult {
  isAccounting: boolean;
  entries: AccountingEntry[];
}
