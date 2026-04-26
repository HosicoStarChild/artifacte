import assert from 'node:assert';

import {
  isUint8EncodingOverrun,
  planLookupTableSetupBatchSizes,
  toBase64SizedSerializedTransaction,
} from '../app/api/tensor-buy/_lib/serialization.ts';

describe('tensor-buy route helpers', () => {
  it('detects Uint8Array encoding overrun errors', () => {
    assert.equal(
      isUint8EncodingOverrun(new RangeError('encoding overruns Uint8Array')),
      true,
    );
    assert.equal(isUint8EncodingOverrun(new Error('different failure')), false);
  });

  it('encodes sized transactions as base64', () => {
    const encoded = toBase64SizedSerializedTransaction(
      () => Uint8Array.from([1, 2, 3, 4]),
      'should not fail',
    );

    assert.equal(encoded, 'AQIDBA==');
  });

  it('throws a deterministic error when serialization overruns Uint8Array', () => {
    assert.throws(
      () => toBase64SizedSerializedTransaction(
        () => {
          throw new RangeError('encoding overruns Uint8Array');
        },
        'Tensor buy transaction exceeds Solana size limits after fee injection',
      ),
      (error: unknown) => (
        error instanceof Error
        && error.message === 'Tensor buy transaction exceeds Solana size limits after fee injection'
      ),
    );
  });

  it('throws a deterministic error when a serialized transaction exceeds the Solana limit', () => {
    assert.throws(
      () => toBase64SizedSerializedTransaction(
        () => new Uint8Array(1233),
        'Tensor buy transaction exceeds Solana size limits after fee injection',
      ),
      /Tensor buy transaction exceeds Solana size limits after fee injection/,
    );
  });

  it('plans proof ALT batches by shrinking oversized chunks', async () => {
    const attempts: Array<{ batchSize: number; includeCreateInstruction: boolean }> = [];

    const batches = await planLookupTableSetupBatchSizes({
      addressCount: 25,
      maxBatchSize: 20,
      fitsWithinLimit: async (batchSize, includeCreateInstruction) => {
        attempts.push({ batchSize, includeCreateInstruction });
        return includeCreateInstruction ? batchSize <= 10 : batchSize <= 8;
      },
    });

    assert.deepEqual(batches, [10, 7, 8]);
    assert.deepEqual(attempts, [
      { batchSize: 20, includeCreateInstruction: true },
      { batchSize: 10, includeCreateInstruction: true },
      { batchSize: 15, includeCreateInstruction: false },
      { batchSize: 7, includeCreateInstruction: false },
      { batchSize: 8, includeCreateInstruction: false },
    ]);
  });

  it('fails when even one proof address cannot fit in setup', async () => {
    await assert.rejects(
      () => planLookupTableSetupBatchSizes({
        addressCount: 1,
        fitsWithinLimit: async () => false,
      }),
      /Tensor proof lookup table setup exceeds Solana size limits/,
    );
  });
});