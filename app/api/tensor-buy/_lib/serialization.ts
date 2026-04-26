export const MAX_SOLANA_TRANSACTION_BYTES = 1232;
export const MAX_LOOKUP_TABLE_EXTEND_ADDRESSES = 20;
export const LOOKUP_TABLE_ACTIVATION_DELAY_MS = 800;

export function isUint8EncodingOverrun(error: unknown): error is RangeError {
  return error instanceof RangeError && /encoding overruns Uint8Array/i.test(error.message);
}

export function toBase64SizedSerializedTransaction(
  serialize: () => Buffer | Uint8Array,
  errorMessage: string,
): string {
  try {
    const serialized = serialize();
    if (serialized.length > MAX_SOLANA_TRANSACTION_BYTES) {
      throw new RangeError(`${errorMessage}: ${serialized.length} bytes`);
    }

    return Buffer.from(serialized).toString('base64');
  } catch (error) {
    if (isUint8EncodingOverrun(error) || error instanceof RangeError) {
      throw new Error(errorMessage);
    }

    throw error;
  }
}

export async function planLookupTableSetupBatchSizes(input: {
  addressCount: number;
  fitsWithinLimit: (batchSize: number, includeCreateInstruction: boolean) => Promise<boolean>;
  maxBatchSize?: number;
}): Promise<number[]> {
  if (input.addressCount <= 0) {
    return [];
  }

  const batches: number[] = [];
  let nextOffset = 0;
  let includeCreateInstruction = true;

  while (includeCreateInstruction || nextOffset < input.addressCount) {
    let batchSize = Math.min(
      input.maxBatchSize ?? MAX_LOOKUP_TABLE_EXTEND_ADDRESSES,
      input.addressCount - nextOffset,
    );

    while (!(await input.fitsWithinLimit(batchSize, includeCreateInstruction))) {
      if (batchSize <= 1) {
        throw new Error('Tensor proof lookup table setup exceeds Solana size limits');
      }

      batchSize = Math.max(1, Math.floor(batchSize / 2));
    }

    batches.push(batchSize);
    nextOffset += batchSize;
    includeCreateInstruction = false;
  }

  return batches;
}