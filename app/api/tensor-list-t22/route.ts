import { NextRequest, NextResponse } from 'next/server';

import {
  createBase64VersionedTransaction,
  createTensorPseudoSigner,
  ensureHeliusRpcUrl,
  parseTensorBuildRequest,
  type TensorBuildRequestBody,
  type TensorInstructionLike,
} from '@/app/api/_lib/list-route-utils';

interface TensorT22InstructionInput {
  amount: bigint;
  currency?: string;
  mint: string;
  owner: ReturnType<typeof createTensorPseudoSigner>;
  transferHookAccounts: [];
}

export async function POST(request: NextRequest) {
  try {
    const { amount, currency, mint, owner } = parseTensorBuildRequest(
      (await request.json()) as Partial<TensorBuildRequestBody>
    );

    const heliusRpc = ensureHeliusRpcUrl();
    const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

    const { getListT22InstructionAsync } = (await import('@tensor-foundation/marketplace')) as {
      getListT22InstructionAsync: (input: TensorT22InstructionInput) => Promise<TensorInstructionLike>;
    };
    const { address } = await import('@solana/kit');

    const ownerAddress = `${address(owner)}`;
    const fakeSigner = createTensorPseudoSigner(ownerAddress);

    const listIx = await getListT22InstructionAsync({
      owner: fakeSigner,
      mint: address(mint),
      amount: BigInt(amount),
      currency: currency === 'USDC' ? address(USDC_MINT) : undefined,
      transferHookAccounts: [],
    });

    const { Connection: SolConnection } = await import('@solana/web3.js');
    const conn = new SolConnection(heliusRpc, 'confirmed');
    const tx = await createBase64VersionedTransaction({
      connection: conn,
      instruction: listIx,
      payer: owner,
    });
    console.log(`[tensor-list-t22] built v0 tx, mint: ${mint}`);

    return NextResponse.json({
      tx,
      mint,
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to build Tensor list tx';
    console.error('[tensor-list-t22] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const maxDuration = 30;
