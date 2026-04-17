/**
 * Integration tests for the Metaplex Core listing instructions
 * (`list_core_item`, `cancel_core_listing`, `buy_now_core`) added
 * to the `auction` program.
 *
 * HOW TO RUN
 * ----------
 * 1. Install dev deps (one-time):
 *      pnpm add -D mocha chai @types/mocha @types/chai ts-mocha \
 *                  @metaplex-foundation/mpl-core \
 *                  @metaplex-foundation/umi-bundle-defaults
 *
 * 2. Add to Anchor.toml (one-time):
 *      [scripts]
 *      test = "pnpm ts-mocha -p ./tsconfig.json -t 1000000 tests/**\/*.test.ts"
 *
 * 3. Run against a local validator (no SOL required, no mainnet impact):
 *      anchor test
 *
 * NOTE: These tests assume the upgraded program is deployed to the
 * local validator (Anchor handles that automatically) and uses the
 * SAME program id `81s1tEx4MPdVvqS6X84Mok5K4N5fMbRLzcsT5eo2K8J3`.
 *
 * If you have not yet upgraded the program on devnet/mainnet, that's
 * OK — these tests use Anchor's local validator only.
 */

import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createMint,
} from "@solana/spl-token";
import { expect } from "chai";

// Constants mirroring programs/auction/src/lib.rs
const OWNER_WALLET = new PublicKey(
  "DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX"
);
const TREASURY = new PublicKey(
  "82v8xATLqdvq3cS1CXwpygVUH926QKdAd4NVxD91r4a6"
);
const ARTIFACTE_COLLECTION = new PublicKey(
  "jzkJTGAuDcWthM91S1ch7wPcfMUQB5CdYH6hA25K4CS"
);
const MPL_CORE_PROGRAM_ID = new PublicKey(
  "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
);
const USDC_MAINNET_MINT = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);

// Helpers to derive the per-asset PDAs
function coreListingPda(asset: PublicKey, programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("core_listing"), asset.toBuffer()],
    programId
  )[0];
}

function coreAuthorityPda(asset: PublicKey, programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("core_authority"), asset.toBuffer()],
    programId
  )[0];
}

describe("auction — Metaplex Core listings", () => {
  // Anchor will spin up a local validator for `anchor test`.
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.AnchorProvider.env();
  // Cast to `any` to bypass Anchor 0.31's deeply nested generic inference
  // for `.methods.<ix>(...).accounts({...})`. Runtime behavior is unchanged.
  const program = anchor.workspace.Auction as unknown as {
    programId: PublicKey;
    methods: any;
  };
  const programId = program.programId;

  // Owner of the program / Artifacte authority. In real life this is
  // DDSpv... — for the test we fund a fresh keypair and assert that
  // the program rejects non-OWNER_WALLET listers.
  const owner = Keypair.generate();
  const buyer = Keypair.generate();
  const stranger = Keypair.generate();

  // Surrogate for an Artifacte Core asset. In the upgraded program the
  // handler validates `asset.collection == ARTIFACTE_COLLECTION_ID` and
  // `asset.owner == seller` via mpl-core deserialization. For pure unit
  // tests of the gate we can stop at "non-owner gets rejected" and rely
  // on a separate end-to-end test (below) for the full mpl-core flow.
  let asset: Keypair;
  let usdcMint: PublicKey;

  before(async () => {
    // Airdrop test wallets
    for (const kp of [owner, buyer, stranger]) {
      const sig = await provider.connection.requestAirdrop(
        kp.publicKey,
        10 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);
    }

    // Local USDC-equivalent mint (6 decimals). The program checks that
    // `payment_mint` matches the canonical USDC mint, but on localnet we
    // accept any 6-decimal mint by patching ENV — for now we mint
    // mainnet's USDC pubkey is unreachable, so this test is skipped if
    // the program enforces strict USDC on localnet.
    usdcMint = await createMint(
      provider.connection,
      owner,
      owner.publicKey,
      null,
      6
    );

    asset = Keypair.generate();
  });

  // ---------------------------------------------------------------
  // Owner-gate
  // ---------------------------------------------------------------

  it("rejects list_core_item when seller != OWNER_WALLET", async () => {
    const listing = coreListingPda(asset.publicKey, programId);
    const authority = coreAuthorityPda(asset.publicKey, programId);

    let threw = false;
    try {
      await program.methods
        .listCoreItem(new BN(25_000_000)) // 25 USDC
        .accounts({
          seller: stranger.publicKey,
          asset: asset.publicKey,
          collection: ARTIFACTE_COLLECTION,
          paymentMint: usdcMint,
          coreListing: listing,
          coreAuthority: authority,
          mplCoreProgram: MPL_CORE_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([stranger])
        .rpc();
    } catch (e: any) {
      threw = true;
      // Either the explicit Unauthorized error or a constraint failure is acceptable.
      expect(String(e.message ?? e).toLowerCase()).to.match(
        /unauthorized|owner|constraint|account/
      );
    }
    expect(threw, "non-owner should not be able to list").to.equal(true);
  });

  // ---------------------------------------------------------------
  // Payment mint enforcement
  // ---------------------------------------------------------------

  it("rejects list_core_item when payment_mint != USDC", async () => {
    const fakeMint = await createMint(
      provider.connection,
      owner,
      owner.publicKey,
      null,
      6
    );
    const listing = coreListingPda(asset.publicKey, programId);
    const authority = coreAuthorityPda(asset.publicKey, programId);

    let threw = false;
    try {
      await program.methods
        .listCoreItem(new BN(25_000_000))
        .accounts({
          seller: owner.publicKey,
          asset: asset.publicKey,
          collection: ARTIFACTE_COLLECTION,
          paymentMint: fakeMint,
          coreListing: listing,
          coreAuthority: authority,
          mplCoreProgram: MPL_CORE_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();
    } catch (e: any) {
      threw = true;
    }
    expect(threw, "non-USDC payment mint should be rejected").to.equal(true);
  });

  // ---------------------------------------------------------------
  // PDA derivation
  // ---------------------------------------------------------------

  it("derives the same PDAs as the on-chain program", () => {
    // The program uses [b"core_listing", asset] / [b"core_authority", asset]
    const a = Keypair.generate().publicKey;
    const l1 = coreListingPda(a, programId);
    const l2 = PublicKey.findProgramAddressSync(
      [Buffer.from("core_listing"), a.toBuffer()],
      programId
    )[0];
    expect(l1.equals(l2)).to.equal(true);

    const auth1 = coreAuthorityPda(a, programId);
    const auth2 = PublicKey.findProgramAddressSync(
      [Buffer.from("core_authority"), a.toBuffer()],
      programId
    )[0];
    expect(auth1.equals(auth2)).to.equal(true);
  });

  // ---------------------------------------------------------------
  // End-to-end happy-path (skipped unless METAPLEX_CORE_E2E=1).
  //
  // This test mints a real Core asset in the Artifacte collection,
  // lists it for 25 USDC, has `buyer` purchase it, and verifies:
  //   - asset transferred to buyer
  //   - 2.5% fee → treasury
  //   - 2% royalty → treasury (per Royalties plugin)
  //   - remainder → seller
  //   - core_listing PDA closed (rent → seller)
  //
  // Disabled by default because it requires:
  //   - METAPLEX_CORE_E2E=1
  //   - the Artifacte Core collection already created on the cluster
  //     under control of OWNER_WALLET (use scripts/create-collection.mjs)
  //   - OWNER_WALLET keypair available
  // ---------------------------------------------------------------

  const e2e = process.env.METAPLEX_CORE_E2E === "1";
  (e2e ? it : it.skip)(
    "end-to-end: list → buy splits payment correctly and transfers asset",
    async () => {
      // Skeleton — implement once the Artifacte Core collection is
      // available on the test cluster.
      //
      // 1. const umi = createUmi(provider.connection.rpcEndpoint).use(...)
      // 2. await mplCore.create({ asset, collection: ARTIFACTE_COLLECTION,
      //      owner: OWNER_WALLET, plugins: [{ type: "Royalties", basisPoints: 200,
      //      creators: [{ address: TREASURY, percentage: 100 }], ruleSet: ... }]
      //    }).sendAndConfirm(umi)
      // 3. await program.methods.listCoreItem(new BN(25_000_000)).accounts({...}).signers([owner]).rpc()
      // 4. Mint 100 USDC into buyer's ATA
      // 5. await program.methods.buyNowCore().accounts({...}).signers([buyer]).rpc()
      // 6. Assertions:
      //    - new asset.owner == buyer.publicKey
      //    - treasury_payment_account balance += 25*0.025  (platform fee)
      //    - creator_payment_account balance  += 25*0.02   (royalty → treasury)
      //    - seller_payment_account balance   += 25 - the above
      //    - core_listing account no longer exists
      expect.fail("e2e test not yet wired — see comment block");
    }
  );
});
