export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export type JsonObject = {
  [key: string]: JsonValue | undefined;
};

export type MagicEdenListingSource = 'M2' | 'M3';

export type MagicEdenPaymentCurrency = 'SOL' | 'USDC';

export type MagicEdenBuyRequest = {
  mint: string;
  buyer: string;
  source?: string;
  listingCurrency?: MagicEdenPaymentCurrency;
  collectionAddress?: string;
  collectionName?: string;
};

export type MagicEdenTransactionSnapshot = {
  kind: 'legacy' | 'v0';
  requiredSignatureCount: number;
  signatureCount: number;
  feePayer: string | null;
  lookupTableCount: number;
  hasMagicEdenProgram: boolean;
};

export type MagicEdenTransactionCompatibilityReport = {
  original: MagicEdenTransactionSnapshot | null;
  modified: MagicEdenTransactionSnapshot | null;
  feeApplied: boolean;
  changedRequiredSignatureCount: boolean;
  changedSignatureCount: boolean;
  changedFeePayer: boolean;
};

export type MagicEdenBuyResponse = {
  v0Tx: string | null;
  v0TxSigned: string | null;
  legacyTx: string | null;
  blockhash: string | null;
  lastValidBlockHeight: number | null;
  price: number;
  displayPrice: number;
  displayCurrency: MagicEdenPaymentCurrency;
  platformFee: number;
  platformFeeCurrency: MagicEdenPaymentCurrency;
  feeApplied: boolean;
  seller: string;
  mint: string;
  listingSource: MagicEdenListingSource;
  auctionHouse: string | null;
};

export const MAGIC_EDEN_M2_PROGRAM = 'M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K';
export const MAGIC_EDEN_M3_PROGRAM = 'M3mxk5W2tt27WGT7THox7PmgRDp4m6NEhL5xvxrBfS1';