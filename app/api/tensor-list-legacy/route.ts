import { NextRequest, NextResponse } from 'next/server';

import {
  createBase64VersionedTransaction,
  createTensorPseudoSigner,
  ensureHeliusRpcUrl,
  parseTensorBuildRequest,
  type TensorBuildRequestBody,
  type TensorInstructionLike,
} from '@/app/api/_lib/list-route-utils';

interface TensorLegacyInstructionInput {
  amount: bigint;
  authorizationRules?: string;
  currency?: string;
  mint: string;
  owner: ReturnType<typeof createTensorPseudoSigner>;
  tokenStandard?: number;
}

export async function POST(request: NextRequest) {
  try {
    const { amount, currency, mint, owner } = parseTensorBuildRequest(
      (await request.json()) as Partial<TensorBuildRequestBody>
    );

    const heliusRpc = ensureHeliusRpcUrl();
    const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const TOKEN_METADATA_PROGRAM_ID = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';

    const { getListLegacyInstructionAsync } = (await import('@tensor-foundation/marketplace')) as {
      getListLegacyInstructionAsync: (input: TensorLegacyInstructionInput) => Promise<TensorInstructionLike>;
    };
    const { address } = await import('@solana/kit');

    const ownerAddress = `${address(owner)}`;
    const fakeSigner = createTensorPseudoSigner(ownerAddress);

    // Read on-chain metadata account to detect pNFT + extract authorization rules
    const { PublicKey: PK, Connection: SolConn } = await import('@solana/web3.js');
    const tmpConn = new SolConn(heliusRpc, 'confirmed');
    const mintPk = new PK(mint);
    const metaProgramPk = new PK(TOKEN_METADATA_PROGRAM_ID);
    const [metaPda] = PK.findProgramAddressSync(
      [Buffer.from('metadata'), metaProgramPk.toBuffer(), mintPk.toBuffer()],
      metaProgramPk,
    );
    const metaAccount = await tmpConn.getAccountInfo(metaPda);
    let isPnft = false;
    let ruleSet: string | null = null;

    if (metaAccount?.data) {
      const d = metaAccount.data;
      let o = 1 + 32 + 32; // key + update_authority + mint
      o += 4 + 32; // name (borsh string padded to 32)
      o += 4 + 10; // symbol (padded to 10)
      o += 4 + 200; // uri (padded to 200)
      o += 2; // seller_fee_basis_points
      const hasCreators = d[o]; o += 1;
      if (hasCreators === 1) { const n = d.readUInt32LE(o); o += 4; o += n * 34; }
      o += 1; // primary_sale_happened
      o += 1; // is_mutable
      const hasEdNonce = d[o]; o += 1; if (hasEdNonce === 1) o += 1;
      const hasTokenStd = d[o]; o += 1;
      let tokenStandard = -1;
      if (hasTokenStd === 1) { tokenStandard = d[o]; o += 1; }
      isPnft = tokenStandard === 4; // ProgrammableNonFungible
      const hasColl = d[o]; o += 1; if (hasColl === 1) o += 33;
      const hasUses = d[o]; o += 1; if (hasUses === 1) o += 17;
      const hasCollDetails = d[o]; o += 1;
      if (hasCollDetails === 1) { const v = d[o]; o += 1; if (v === 0) o += 8; else if (v === 1) o += 16; }
      if (o < d.length && d[o] === 1) { // programmable_config: Some
        o += 1; // Some marker
        o += 1; // ProgrammableConfig::V1 enum
        if (d[o] === 1) { // rule_set: Some
          o += 1;
          ruleSet = new PK(d.slice(o, o + 32)).toBase58();
        }
      }
      console.log(`[tensor-list-legacy] tokenStandard=${tokenStandard} isPnft=${isPnft} ruleSet=${ruleSet}`);
    }

    const listInput: TensorLegacyInstructionInput = {
      owner: fakeSigner,
      mint: address(mint),
      amount: BigInt(amount),
      currency: currency === 'USDC' ? address(USDC_MINT) : undefined,
    };

    if (isPnft && ruleSet) {
      listInput.authorizationRules = address(ruleSet);
      console.log(`[tensor-list-legacy] pNFT with rule set: ${ruleSet}`);
    }

    if (!isPnft) {
      listInput.tokenStandard = 0; // TokenStandard.NonFungible
      console.log(`[tensor-list-legacy] Standard NFT (non-pNFT)`);
    }

    const listIx = await getListLegacyInstructionAsync(listInput);

    const { Connection: SolConnection } = await import('@solana/web3.js');
    const conn = new SolConnection(heliusRpc, 'confirmed');
    const tx = await createBase64VersionedTransaction({
      connection: conn,
      instruction: listIx,
      payer: owner,
    });
    console.log(`[tensor-list-legacy] built v0 tx, mint: ${mint}`);

    return NextResponse.json({
      tx,
      mint,
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to build Tensor list tx';
    console.error('[tensor-list-legacy] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const maxDuration = 30;
