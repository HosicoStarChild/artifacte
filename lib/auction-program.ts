import { Connection, PublicKey, Transaction, SystemProgram, TransactionInstruction, ComputeBudgetProgram } from "@solana/web3.js";
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import { approvePluginAuthority } from "@metaplex-foundation/mpl-core";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters";
import { fromWeb3JsPublicKey, toWeb3JsInstruction } from "@metaplex-foundation/umi-web3js-adapters";
import { IDL } from "./auction-idl";

// Program IDs and constants
const AUCTION_PROGRAM_ID = new PublicKey("81s1tEx4MPdVvqS6X84Mok5K4N5fMbRLzcsT5eo2K8J3");
const TREASURY_WALLET = new PublicKey("6drXw31FjHch4ixXa4ngTyUD2cySUs3mpcB2YYGA9g7P");

// Treasury config PDA — initialized on-chain, allows treasury rotation
const [TREASURY_CONFIG_PDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("treasury_config")],
  AUCTION_PROGRAM_ID
);
const USD1_MINT = new PublicKey("USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB");
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const ARTIFACTE_CORE_COLLECTION = new PublicKey("jzkJTGAuDcWthM91S1ch7wPcfMUQB5CdYH6hA25K4CS");
const MPL_CORE_PROGRAM_ID = new PublicKey("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d");
const CORE_LISTING_ACCOUNT_SIZE = 189;
const CORE_LISTING_ACCOUNT_DISCRIMINATOR = Buffer.from([205, 178, 162, 169, 199, 166, 133, 157]);
const LIST_CORE_ITEM_DISCRIMINATOR = Buffer.from([249, 213, 18, 100, 230, 110, 232, 59]);
const BUY_NOW_CORE_DISCRIMINATOR = Buffer.from([107, 235, 190, 104, 232, 171, 241, 145]);
const CANCEL_LISTING_CORE_DISCRIMINATOR = Buffer.from([121, 19, 72, 243, 73, 39, 91, 219]);

// WNS Program IDs
const WNS_PROGRAM_ID = new PublicKey("wns1gDLt8fgLcGhWi5MqAqgXpwEP1JftKE9eZnXS1HM");
const WNS_DISTRIBUTION_PROGRAM_ID = new PublicKey("diste3nXmK7ddDTs1zb6uday6j4etCa9RChD8fJ1xay");

export enum ListingType {
  FixedPrice = 0,
  Auction = 1,
}

export enum ItemCategory {
  DigitalArt = 0,
  Spirits = 1,
  TCGCards = 2,
  SportsCards = 3,
  Watches = 4,
}

/**
 * Confirm a transaction with blockhash strategy, with fallback signature status check.
 * Prevents false-positive errors when tx lands but blockheight expires before confirmation.
 */
async function confirmTx(
  connection: Connection,
  sig: string,
  blockhash: string,
  lastValidBlockHeight: number
): Promise<void> {
  // Poll signature status directly — more reliable than confirmTransaction
  const start = Date.now();
  const timeout = 60_000; // 60s max
  while (Date.now() - start < timeout) {
    const status = await connection.getSignatureStatus(sig, { searchTransactionHistory: true });
    const val = status?.value;
    if (val) {
      if (val.err) throw new Error(`Transaction failed: ${JSON.stringify(val.err)}`);
      if (val.confirmationStatus === "confirmed" || val.confirmationStatus === "finalized") return;
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  // Last resort: if we timed out, check once more
  const final = await connection.getSignatureStatus(sig, { searchTransactionHistory: true });
  if (final?.value?.confirmationStatus === "confirmed" || final?.value?.confirmationStatus === "finalized") {
    if (final.value.err) throw new Error(`Transaction failed: ${JSON.stringify(final.value.err)}`);
    return;
  }
  throw new Error("Transaction confirmation timeout — check explorer for status");
}

/**
 * Detect if an NFT mint is Token-2022 by checking its owner program
 */
async function detectTokenProgram(connection: Connection, mintAddress: PublicKey): Promise<PublicKey> {
  const accountInfo = await connection.getAccountInfo(mintAddress);
  if (!accountInfo) throw new Error("Mint account not found");
  return accountInfo.owner;
}

/**
 * Check if a mint has a WNS transfer hook
 */
async function isWNSNft(connection: Connection, mintAddress: PublicKey): Promise<boolean> {
  const tokenProgram = await detectTokenProgram(connection, mintAddress);
  if (!tokenProgram.equals(TOKEN_2022_PROGRAM_ID)) return false;
  
  // Check if ExtraAccountMetaList PDA exists (indicates transfer hook is set)
  const [extraMetasPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("extra-account-metas"), mintAddress.toBuffer()],
    WNS_PROGRAM_ID
  );
  const accountInfo = await connection.getAccountInfo(extraMetasPda);
  return accountInfo !== null;
}

/**
 * Build WNS approve_transfer instruction (amount=0, just to set slot for hook)
 */
function buildWNSApproveInstruction(
  payer: PublicKey,
  authority: PublicKey,
  mint: PublicKey,
  groupMint: PublicKey,
  amount: number = 0
): TransactionInstruction {
  const [approveAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from("approve-account"), mint.toBuffer()],
    WNS_PROGRAM_ID
  );

  // Distribution account PDA: seeds = [group_mint, payment_mint]
  // payment_mint = SystemProgram (SOL) for amount=0 transfers
  const [distributionAccount] = PublicKey.findProgramAddressSync(
    [groupMint.toBuffer(), SystemProgram.programId.toBuffer()],
    WNS_DISTRIBUTION_PROGRAM_ID
  );

  // Anchor discriminator for "approve_transfer": sha256("global:approve_transfer")[..8]
  // Hardcoded to avoid require("crypto") which doesn't work in browser
  const discriminator = Buffer.from([198, 217, 247, 150, 208, 60, 169, 244]);

  // Instruction data: discriminator + amount (u64 LE)
  const data = Buffer.alloc(16);
  discriminator.copy(data, 0);
  data.writeBigUInt64LE(BigInt(amount), 8);

  const accounts = [
    { pubkey: payer, isSigner: true, isWritable: true },             // payer
    { pubkey: authority, isSigner: true, isWritable: false },         // authority
    { pubkey: mint, isSigner: false, isWritable: false },             // mint
    { pubkey: approveAccount, isSigner: false, isWritable: true },    // approve_account
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // payment_mint (dummy for amount=0)
    { pubkey: WNS_PROGRAM_ID, isSigner: false, isWritable: false },   // distribution_token_account = None
    { pubkey: WNS_PROGRAM_ID, isSigner: false, isWritable: false },   // authority_token_account = None
    { pubkey: distributionAccount, isSigner: false, isWritable: true }, // distribution_account (real PDA)
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
    { pubkey: WNS_DISTRIBUTION_PROGRAM_ID, isSigner: false, isWritable: false }, // distribution_program
    { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
    { pubkey: WNS_PROGRAM_ID, isSigner: false, isWritable: false },   // payment_token_program = None
  ];

  return new TransactionInstruction({
    keys: accounts,
    programId: WNS_PROGRAM_ID,
    data,
  });
}

/**
 * Get WNS remaining accounts for transfer_checked hook
 */
function getWNSRemainingAccounts(nftMint: PublicKey): { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] {
  const [extraMetasPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("extra-account-metas"), nftMint.toBuffer()],
    WNS_PROGRAM_ID
  );
  const [approveAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from("approve-account"), nftMint.toBuffer()],
    WNS_PROGRAM_ID
  );

  // Order must match Token-2022 CPI hook resolution:
  // hook_program, extra_account_metas_pda, then resolved metas (approve_account)
  return [
    { pubkey: WNS_PROGRAM_ID, isSigner: false, isWritable: false },   // [0] hook program
    { pubkey: extraMetasPda, isSigner: false, isWritable: false },    // [1] extra_account_metas PDA
    { pubkey: approveAccount, isSigner: false, isWritable: true },    // [2] approve_account (resolved from meta list)
  ];
}

function decodeItemCategory(category: number) {
  if (category === 0) return { digitalArt: {} };
  if (category === 1) return { spirits: {} };
  if (category === 2) return { tcgCards: {} };
  if (category === 3) return { sportsCards: {} };
  return { watches: {} };
}

function decodeListingStatus(status: number) {
  if (status === 0) return { active: {} };
  if (status === 1) return { settled: {} };
  return { cancelled: {} };
}

function decodeCoreListingAccount(data: Buffer | Uint8Array) {
  const buffer = Buffer.from(data);
  if (buffer.length !== CORE_LISTING_ACCOUNT_SIZE) return null;
  if (!buffer.subarray(0, 8).equals(CORE_LISTING_ACCOUNT_DISCRIMINATOR)) return null;

  const seller = new PublicKey(buffer.subarray(8, 40));
  const assetId = new PublicKey(buffer.subarray(40, 72));
  const collection = new PublicKey(buffer.subarray(72, 104));
  const paymentMint = new PublicKey(buffer.subarray(104, 136));
  const price = new anchor.BN(buffer.readBigUInt64LE(136).toString());
  const category = buffer[144];
  const status = buffer[145];
  const royaltyBasisPoints = buffer.readUInt16LE(146);
  const creatorAddress = new PublicKey(buffer.subarray(148, 180));
  const createdAt = new anchor.BN(buffer.readBigInt64LE(180).toString());
  const bump = buffer[188];

  return {
    seller,
    nftMint: assetId,
    assetId,
    collection,
    paymentMint,
    price,
    listingType: { fixedPrice: {} },
    category: decodeItemCategory(category),
    status: decodeListingStatus(status),
    startTime: createdAt,
    endTime: new anchor.BN(0),
    escrowNftAccount: PublicKey.default,
    currentBid: new anchor.BN(0),
    highestBidder: PublicKey.default,
    baxusFee: false,
    isToken2022: false,
    isPnft: false,
    isCore: true,
    royaltyBasisPoints,
    creatorAddress,
    bump,
  };
}

// WNS authority → group mint mapping for distribution PDA derivation
// Distribution PDA seeds: [group_mint, payment_mint] under distribution program
// The group_mint is the Token-2022 collection NFT mint, NOT the authority address
const WNS_GROUP_MINT_MAP: Record<string, string> = {
  // Quekz WNS: authority → group mint
  "2hwTMM3uWRvNny8YxSEKQkHZ8NHB5BRv7f35ccMWg1ay": "98AmC3VCiJvrntZqR4Uv8fzoESdsSGrrshZ3e2WqiYgf",
};

/**
 * Get the WNS group mint for a Token-2022 NFT.
 * Uses the authority from Helius DAS to look up the group mint.
 */
async function getWNSGroupMint(nftMint: PublicKey): Promise<PublicKey> {
  try {
    const resp = await fetch(`/api/nft?mint=${nftMint.toBase58()}`);
    const data = await resp.json();
    const asset = data.nft || data;
    const authority = asset.authorities?.[0]?.address;
    if (authority && WNS_GROUP_MINT_MAP[authority]) {
      return new PublicKey(WNS_GROUP_MINT_MAP[authority]);
    }
    // If not in map, try authority as group mint (may work for some collections)
    if (authority) {
      return new PublicKey(authority);
    }
  } catch (err) {
    console.error("Failed to fetch WNS group mint:", err);
  }
  // Fallback: Quekz group mint
  return new PublicKey("98AmC3VCiJvrntZqR4Uv8fzoESdsSGrrshZ3e2WqiYgf");
}

export class AuctionProgram {
  private program: any;
  private connection: Connection;
  private wallet: any;
  private sendTx: ((tx: Transaction, connection: Connection) => Promise<string>) | null;

  constructor(connection: Connection, wallet: any, sendTransaction?: (tx: Transaction, connection: Connection) => Promise<string>) {
    this.connection = connection;
    this.wallet = wallet;
    this.sendTx = sendTransaction || null;
    const provider = new anchor.AnchorProvider(connection, wallet, {});
    const idl = { ...IDL, address: AUCTION_PROGRAM_ID.toBase58() } as any;
    this.program = new (anchor.Program as any)(idl, provider);
  }

  private createUmi() {
    return createUmi(this.connection).use(walletAdapterIdentity(this.wallet));
  }

  private getCoreListingPda(assetId: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("core_listing"), assetId.toBuffer()],
      AUCTION_PROGRAM_ID
    )[0];
  }

  private async buildCoreDelegateApprovalInstructions(
    assetId: PublicKey,
    collection: PublicKey,
    delegate: PublicKey
  ): Promise<TransactionInstruction[]> {
    const umi = this.createUmi();
    const builder = approvePluginAuthority(umi, {
      asset: fromWeb3JsPublicKey(assetId),
      collection: fromWeb3JsPublicKey(collection),
      authority: umi.payer,
      plugin: { type: "TransferDelegate" },
      newAuthority: { type: "Address", address: fromWeb3JsPublicKey(delegate) } as any,
    });

    return builder.getInstructions().map((instruction) => toWeb3JsInstruction(instruction));
  }

  private buildCoreListInstruction(
    assetId: PublicKey,
    collection: PublicKey,
    paymentMint: PublicKey,
    price: number,
    category: ItemCategory,
    royaltyBps: number,
    creatorAddress: PublicKey
  ): TransactionInstruction {
    const listing = this.getCoreListingPda(assetId);
    const data = Buffer.alloc(51);
    LIST_CORE_ITEM_DISCRIMINATOR.copy(data, 0);
    data.writeBigUInt64LE(BigInt(price), 8);
    data.writeUInt8(category, 16);
    data.writeUInt16LE(royaltyBps, 17);
    Buffer.from(creatorAddress.toBytes()).copy(data, 19);

    return new TransactionInstruction({
      programId: AUCTION_PROGRAM_ID,
      keys: [
        { pubkey: listing, isSigner: false, isWritable: true },
        { pubkey: assetId, isSigner: false, isWritable: false },
        { pubkey: collection, isSigner: false, isWritable: false },
        { pubkey: paymentMint, isSigner: false, isWritable: false },
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  private buildCoreBuyInstruction(
    assetId: PublicKey,
    collection: PublicKey,
    buyerPaymentAccount: PublicKey,
    sellerPaymentAccount: PublicKey,
    treasuryPaymentAccount: PublicKey,
    creatorPaymentAccount: PublicKey
  ): TransactionInstruction {
    const listing = this.getCoreListingPda(assetId);

    return new TransactionInstruction({
      programId: AUCTION_PROGRAM_ID,
      keys: [
        { pubkey: listing, isSigner: false, isWritable: true },
        { pubkey: assetId, isSigner: false, isWritable: true },
        { pubkey: collection, isSigner: false, isWritable: true },
        { pubkey: buyerPaymentAccount, isSigner: false, isWritable: true },
        { pubkey: sellerPaymentAccount, isSigner: false, isWritable: true },
        { pubkey: treasuryPaymentAccount, isSigner: false, isWritable: true },
        { pubkey: creatorPaymentAccount, isSigner: false, isWritable: true },
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: TREASURY_WALLET, isSigner: false, isWritable: true },
        { pubkey: TREASURY_CONFIG_PDA, isSigner: false, isWritable: false },
        { pubkey: MPL_CORE_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: BUY_NOW_CORE_DISCRIMINATOR,
    });
  }

  private buildCoreCancelInstruction(
    assetId: PublicKey,
    collection: PublicKey
  ): TransactionInstruction {
    const listing = this.getCoreListingPda(assetId);

    return new TransactionInstruction({
      programId: AUCTION_PROGRAM_ID,
      keys: [
        { pubkey: listing, isSigner: false, isWritable: true },
        { pubkey: assetId, isSigner: false, isWritable: true },
        { pubkey: collection, isSigner: false, isWritable: true },
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: MPL_CORE_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: CANCEL_LISTING_CORE_DISCRIMINATOR,
    });
  }

  private async fetchCoreListingAccount(assetId: PublicKey): Promise<any | null> {
    const listing = this.getCoreListingPda(assetId);
    const info = await this.connection.getAccountInfo(listing);
    if (!info || !info.owner.equals(AUCTION_PROGRAM_ID)) return null;

    const decoded = decodeCoreListingAccount(info.data);
    if (!decoded) return null;
    return decoded;
  }

  private async sendAndConfirm(tx: Transaction): Promise<string> {
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = this.wallet.publicKey;

    // Pre-simulate to capture detailed program logs on failure
    try {
      const sim = await this.connection.simulateTransaction(tx);
      if (sim.value.err) {
        console.error('[sendAndConfirm] Simulation failed:', sim.value.err);
        console.error('[sendAndConfirm] Logs:', sim.value.logs);
        const logs = sim.value.logs || [];
        const err = new Error(`Transaction simulation failed: ${JSON.stringify(sim.value.err)}\nLogs:\n${logs.join('\n')}`);
        (err as any).logs = logs;
        throw err;
      }
    } catch (simErr: any) {
      if (simErr.logs) throw simErr; // re-throw our formatted error
      console.error('[sendAndConfirm] Simulation error:', simErr);
      // Don't block on simulation errors (e.g. unsigned tx sim issues), let wallet handle it
    }

    let sig: string;
    if (this.sendTx) {
      try {
        // Use wallet adapter's sendTransaction — goes through Phantom's native flow
        sig = await this.sendTx(tx, this.connection);
      } catch (walletErr: any) {
        // Try to extract simulation logs from wallet error
        console.error('[sendAndConfirm] Wallet sendTransaction failed:', walletErr?.message || walletErr);
        if (walletErr?.logs) console.error('[sendAndConfirm] Wallet error logs:', walletErr.logs);
        // Fallback: sign separately and send raw (bypasses wallet simulation)
        console.log('[sendAndConfirm] Retrying with signTransaction + sendRawTransaction...');
        const signed = await this.wallet.signTransaction(tx);
        sig = await this.connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
      }
    } else {
      const signed = await this.wallet.signTransaction(tx);
      sig = await this.connection.sendRawTransaction(signed.serialize());
    }
    await confirmTx(this.connection, sig, blockhash, lastValidBlockHeight);
    return sig;
  }

  /**
   * Fetch royalty info from NFT metadata via Helius DAS API.
   * For WNS/Token-2022: reads from mint_extensions.metadata.additional_metadata
   * For Metaplex: reads from creators[] array + royalty.basis_points
   * Returns the primary creator (highest share) and basis points.
   */
  private async fetchRoyaltyInfo(
    nftMint: PublicKey,
    isToken2022: boolean
  ): Promise<{ royaltyBps: number; creatorAddress: PublicKey }> {
    try {
      const resp = await fetch('/api/nft?mint=' + nftMint.toBase58());
      const data = await resp.json();
      const asset = data.nft || data;

      if (isToken2022) {
        // WNS: royalty info in mint_extensions.metadata.additional_metadata
        const addlMeta = asset.mint_extensions?.metadata?.additional_metadata || [];
        let bps = 0;
        let bestAddr = '';
        let bestShare = 0;

        for (const [key, value] of addlMeta) {
          if (key === 'royalty_basis_points') {
            bps = parseInt(value) || 0;
          } else {
            // Creator address entries: address → share percentage
            const share = parseInt(value);
            if (!isNaN(share) && share > bestShare) {
              bestShare = share;
              bestAddr = key;
            }
          }
        }

        if (bps > 0 && bestAddr) {
          return { royaltyBps: bps, creatorAddress: new PublicKey(bestAddr) };
        }
      }

      // Metaplex standard: creators[] + royalty.basis_points
      const bps = asset.royalty?.basis_points || 0;
      const creators = asset.creators || [];
      // Find primary creator (highest share)
      let primaryCreator = TREASURY_WALLET; // fallback to treasury (safe ATA exists)
      let maxShare = 0;
      for (const c of creators) {
        if (c.share > maxShare) {
          maxShare = c.share;
          primaryCreator = new PublicKey(c.address);
        }
      }

      return { royaltyBps: bps, creatorAddress: primaryCreator };
    } catch (err) {
      console.error('Failed to fetch royalty info:', err);
      // Default: 2% to treasury (our own minted NFTs)
      return { royaltyBps: 200, creatorAddress: TREASURY_WALLET };
    }
  }

  /**
   * Close a stale listing where the NFT has already been returned (escrow empty).
   * This allows re-listing the same NFT after a cancelled listing.
   */
  async closeStaleListing(nftMint: PublicKey): Promise<string> {
    const nftTokenProgram = await detectTokenProgram(this.connection, nftMint);

    const listing = PublicKey.findProgramAddressSync(
      [Buffer.from("listing"), nftMint.toBuffer()],
      AUCTION_PROGRAM_ID
    )[0];

    const escrowNft = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow_nft"), nftMint.toBuffer()],
      AUCTION_PROGRAM_ID
    )[0];

    const staleIx = await this.program.methods
      .closeStaleListing()
      .accounts({
        listing,
        nftMint,
        escrowNft,
        seller: this.wallet.publicKey,
        nftTokenProgram,
      })
      .instruction();
    const staleTx = new Transaction().add(staleIx);
    const staleSig = await this.sendAndConfirm(staleTx);
    return staleSig;
  }

  /**
   * List an NFT for sale (fixed price or auction)
   * Supports both standard SPL Token and Token-2022/WNS NFTs
   */
  async listItem(
    nftMint: PublicKey,
    sellerNftAccount: PublicKey,
    paymentMint: PublicKey,
    listingType: ListingType,
    price: number,
    durationSeconds?: number,
    category: ItemCategory = ItemCategory.DigitalArt
  ): Promise<string> {
    const nftTokenProgram = await detectTokenProgram(this.connection, nftMint);
    const isT22 = nftTokenProgram.equals(TOKEN_2022_PROGRAM_ID);
    const isWNS = isT22 ? await isWNSNft(this.connection, nftMint) : false;

    // Fetch royalty info from NFT metadata via Helius DAS
    const { royaltyBps, creatorAddress } = await this.fetchRoyaltyInfo(nftMint, isT22);

    const listing = PublicKey.findProgramAddressSync(
      [Buffer.from("listing"), nftMint.toBuffer()],
      AUCTION_PROGRAM_ID
    )[0];

    const escrowNft = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow_nft"), nftMint.toBuffer()],
      AUCTION_PROGRAM_ID
    )[0];

    let builder = this.program.methods
      .listItem(
        listingType === ListingType.FixedPrice ? { fixedPrice: {} } : { auction: {} },
        new anchor.BN(price),
        durationSeconds ? new anchor.BN(durationSeconds) : null,
        category === ItemCategory.DigitalArt ? { digitalArt: {} } :
        category === ItemCategory.Spirits ? { spirits: {} } :
        category === ItemCategory.TCGCards ? { tcgCards: {} } :
        category === ItemCategory.SportsCards ? { sportsCards: {} } :
        { watches: {} },
        royaltyBps,
        creatorAddress
      )
      .accounts({
        listing,
        nftMint,
        paymentMint,
        escrowNft,
        sellerNftAccount,
        seller: this.wallet.publicKey,
        nftTokenProgram,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      });

    // Add WNS remaining accounts if Token-2022 with hook
    if (isWNS) {
      builder = builder.remainingAccounts(getWNSRemainingAccounts(nftMint));
    }

    if (isWNS) {
      const wnsGroupMint = await getWNSGroupMint(nftMint);
      const approveIx = buildWNSApproveInstruction(
        this.wallet.publicKey,
        this.wallet.publicKey, // seller is authority
        nftMint,
        wnsGroupMint,
        0
      );
      const listIx = await builder.instruction();
      const tx = new Transaction()
        .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }))
        .add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }))
        .add(approveIx).add(listIx);
      return await this.sendAndConfirm(tx);
    } else {
      const listIx = await builder.instruction();
      const tx = new Transaction().add(listIx);
      return await this.sendAndConfirm(tx);
    }
  }

  /**
   * List a Metaplex Core asset for fixed-price sale.
   * The seller approves the program's listing PDA as TransferDelegate first.
   */
  async listCoreItem(
    assetId: PublicKey,
    collection: PublicKey,
    paymentMint: PublicKey,
    price: number,
    category: ItemCategory,
    royaltyBps: number,
    creatorAddress: PublicKey
  ): Promise<string> {
    const listing = this.getCoreListingPda(assetId);
    const approveInstructions = await this.buildCoreDelegateApprovalInstructions(assetId, collection, listing);
    const listIx = this.buildCoreListInstruction(
      assetId,
      collection,
      paymentMint,
      price,
      category,
      royaltyBps,
      creatorAddress
    );

    const tx = new Transaction()
      .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }))
      .add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }))
      .add(...approveInstructions, listIx);

    return await this.sendAndConfirm(tx);
  }

  /**
   * Buy a fixed-price listing
   * Supports both standard SPL Token and Token-2022/WNS NFTs
   */
  async buyNow(
    nftMint: PublicKey,
    sellerPaymentAccount: PublicKey,
    buyerPaymentAccount: PublicKey,
    buyerNftAccount: PublicKey,
    price: number,
    paymentMint: PublicKey
  ): Promise<string> {
    const nftTokenProgram = await detectTokenProgram(this.connection, nftMint);
    const isT22 = nftTokenProgram.equals(TOKEN_2022_PROGRAM_ID);
    const isWNS = isT22 ? await isWNSNft(this.connection, nftMint) : false;

    const listing = PublicKey.findProgramAddressSync(
      [Buffer.from("listing"), nftMint.toBuffer()],
      AUCTION_PROGRAM_ID
    )[0];

    const escrowNft = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow_nft"), nftMint.toBuffer()],
      AUCTION_PROGRAM_ID
    )[0];

    const treasuryPaymentAccount = await getAssociatedTokenAddress(
      paymentMint,
      TREASURY_WALLET
    );

    // Fetch listing to get creator_address for royalty payment
    const listingData = await this.program.account.listing.fetch(listing);
    const creatorAddr = listingData.creatorAddress as PublicKey;
    const creatorPaymentAccount = listingData.royaltyBasisPoints > 0
      ? await getAssociatedTokenAddress(paymentMint, creatorAddr, true)
      : SystemProgram.programId;

    let builder = this.program.methods
      .buyNow()
      .accounts({
        listing,
        nftMint,
        escrowNft,
        buyerPaymentAccount,
        sellerPaymentAccount,
        treasuryPaymentAccount,
        creatorPaymentAccount,
        buyerNftAccount,
        buyer: this.wallet.publicKey,
        treasury: TREASURY_WALLET,
        nftTokenProgram,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      });

    if (isWNS) {
      builder = builder.remainingAccounts(getWNSRemainingAccounts(nftMint));
    }

    // Build pre-instructions for wSOL wrapping + missing ATAs
    const preInstructions: TransactionInstruction[] = [];
    const postInstructions: TransactionInstruction[] = [];
    const SOL_MINT_ADDR = new PublicKey("So11111111111111111111111111111111111111112");

    if (paymentMint.equals(SOL_MINT_ADDR)) {
      // Check if buyer wSOL ATA exists
      const buyerAtaInfo = await this.connection.getAccountInfo(buyerPaymentAccount);
      if (!buyerAtaInfo) {
        preInstructions.push(
          createAssociatedTokenAccountInstruction(
            this.wallet.publicKey,
            buyerPaymentAccount,
            this.wallet.publicKey,
            SOL_MINT_ADDR
          )
        );
      }
      // Transfer SOL → wSOL ATA
      preInstructions.push(
        SystemProgram.transfer({
          fromPubkey: this.wallet.publicKey,
          toPubkey: buyerPaymentAccount,
          lamports: price,
        })
      );
      // Sync native
      const { createSyncNativeInstruction } = await import("@solana/spl-token");
      preInstructions.push(createSyncNativeInstruction(buyerPaymentAccount));
    }

    // Check seller payment ATA
    const sellerAtaInfo = await this.connection.getAccountInfo(sellerPaymentAccount);
    if (!sellerAtaInfo) {
      const sellerAddr = listingData.seller as PublicKey;
      preInstructions.push(
        createAssociatedTokenAccountInstruction(
          this.wallet.publicKey,
          sellerPaymentAccount,
          sellerAddr,
          paymentMint
        )
      );
    }

    // Check treasury payment ATA
    const treasuryAtaInfo = await this.connection.getAccountInfo(treasuryPaymentAccount);
    if (!treasuryAtaInfo) {
      preInstructions.push(
        createAssociatedTokenAccountInstruction(
          this.wallet.publicKey,
          treasuryPaymentAccount,
          TREASURY_WALLET,
          paymentMint
        )
      );
    }

    // Only create creator ATA if royalty > 0 (avoids suspicious-looking ATA creation on zero-royalty buys)
    if (listingData.royaltyBasisPoints > 0) {
      const creatorAtaInfo = await this.connection.getAccountInfo(creatorPaymentAccount);
      if (!creatorAtaInfo) {
        preInstructions.push(
          createAssociatedTokenAccountInstruction(
            this.wallet.publicKey,
            creatorPaymentAccount,
            creatorAddr,
            paymentMint
          )
        );
      }
    }

    // Check buyer NFT ATA
    const buyerNftAtaInfo = await this.connection.getAccountInfo(buyerNftAccount);
    if (!buyerNftAtaInfo) {
      preInstructions.push(
        createAssociatedTokenAccountInstruction(
          this.wallet.publicKey,
          buyerNftAccount,
          this.wallet.publicKey,
          nftMint,
          nftTokenProgram
        )
      );
    }

    // Build final transaction with compute budget
    const buyIx = await builder.instruction();
    const tx = new Transaction()
      .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }))
      .add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }));

    if (isWNS) {
      const wnsGroupMint = await getWNSGroupMint(nftMint);
      const approveIx = buildWNSApproveInstruction(
        this.wallet.publicKey,
        this.wallet.publicKey,
        nftMint,
        wnsGroupMint,
        0
      );
      tx.add(...preInstructions, approveIx, buyIx);
    } else {
      tx.add(...preInstructions, buyIx);
    }

    return await this.sendAndConfirm(tx);
  }

  /**
   * Buy a fixed-price Metaplex Core listing.
   */
  async buyNowCore(
    assetId: PublicKey,
    collection: PublicKey = ARTIFACTE_CORE_COLLECTION
  ): Promise<string> {
    const listingData = await this.fetchCoreListingAccount(assetId);
    if (!listingData) throw new Error("Core listing not found");

    const paymentMint = listingData.paymentMint as PublicKey;
    const seller = listingData.seller as PublicKey;
    const creatorAddress = listingData.creatorAddress as PublicKey;
    const price = listingData.price.toNumber();
    const buyerPaymentAccount = await getAssociatedTokenAddress(paymentMint, this.wallet.publicKey);
    const sellerPaymentAccount = await getAssociatedTokenAddress(paymentMint, seller);
    const treasuryPaymentAccount = await getAssociatedTokenAddress(paymentMint, TREASURY_WALLET);
    const creatorPaymentAccount = listingData.royaltyBasisPoints > 0
      ? await getAssociatedTokenAddress(paymentMint, creatorAddress, true)
      : SystemProgram.programId;

    const preInstructions: TransactionInstruction[] = [];
    const SOL_MINT_ADDR = new PublicKey("So11111111111111111111111111111111111111112");

    if (paymentMint.equals(SOL_MINT_ADDR)) {
      const buyerAtaInfo = await this.connection.getAccountInfo(buyerPaymentAccount);
      if (!buyerAtaInfo) {
        preInstructions.push(
          createAssociatedTokenAccountInstruction(
            this.wallet.publicKey,
            buyerPaymentAccount,
            this.wallet.publicKey,
            SOL_MINT_ADDR
          )
        );
      }
      preInstructions.push(
        SystemProgram.transfer({
          fromPubkey: this.wallet.publicKey,
          toPubkey: buyerPaymentAccount,
          lamports: price,
        })
      );
      const { createSyncNativeInstruction } = await import("@solana/spl-token");
      preInstructions.push(createSyncNativeInstruction(buyerPaymentAccount));
    }

    const sellerAtaInfo = await this.connection.getAccountInfo(sellerPaymentAccount);
    if (!sellerAtaInfo) {
      preInstructions.push(
        createAssociatedTokenAccountInstruction(
          this.wallet.publicKey,
          sellerPaymentAccount,
          seller,
          paymentMint
        )
      );
    }

    const treasuryAtaInfo = await this.connection.getAccountInfo(treasuryPaymentAccount);
    if (!treasuryAtaInfo) {
      preInstructions.push(
        createAssociatedTokenAccountInstruction(
          this.wallet.publicKey,
          treasuryPaymentAccount,
          TREASURY_WALLET,
          paymentMint
        )
      );
    }

    if (listingData.royaltyBasisPoints > 0) {
      const creatorAtaInfo = await this.connection.getAccountInfo(creatorPaymentAccount);
      if (!creatorAtaInfo) {
        preInstructions.push(
          createAssociatedTokenAccountInstruction(
            this.wallet.publicKey,
            creatorPaymentAccount,
            creatorAddress,
            paymentMint
          )
        );
      }
    }

    const buyIx = this.buildCoreBuyInstruction(
      assetId,
      collection,
      buyerPaymentAccount,
      sellerPaymentAccount,
      treasuryPaymentAccount,
      creatorPaymentAccount
    );

    const tx = new Transaction()
      .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }))
      .add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }))
      .add(...preInstructions, buyIx);

    return await this.sendAndConfirm(tx);
  }

  /**
   * Place a bid on an active auction (payment only, no NFT transfer)
   */
  async placeBid(
    nftMint: PublicKey,
    bidAmount: number,
    bidderTokenAccount: PublicKey,
    paymentMint: PublicKey,
    previousBidderAccount: PublicKey
  ): Promise<string> {
    const listing = PublicKey.findProgramAddressSync(
      [Buffer.from("listing"), nftMint.toBuffer()],
      AUCTION_PROGRAM_ID
    )[0];

    const bidEscrow = PublicKey.findProgramAddressSync(
      [Buffer.from("bid_escrow"), nftMint.toBuffer()],
      AUCTION_PROGRAM_ID
    )[0];

    // For wSOL bids: create ATA + wrap SOL if needed
    const preInstructions: TransactionInstruction[] = [];
    const SOL_MINT_ADDR = new PublicKey("So11111111111111111111111111111111111111112");
    if (paymentMint.equals(SOL_MINT_ADDR)) {
      const { createAssociatedTokenAccountInstruction } = await import("@solana/spl-token");
      // Check if bidder wSOL ATA exists
      const ataInfo = await this.program.provider.connection.getAccountInfo(bidderTokenAccount);
      if (!ataInfo) {
        preInstructions.push(
          createAssociatedTokenAccountInstruction(
            this.wallet.publicKey,
            bidderTokenAccount,
            this.wallet.publicKey,
            SOL_MINT_ADDR
          )
        );
      }
      // Transfer native SOL into wSOL ATA
      preInstructions.push(
        SystemProgram.transfer({
          fromPubkey: this.wallet.publicKey,
          toPubkey: bidderTokenAccount,
          lamports: bidAmount,
        })
      );
      // Sync native balance
      const { createSyncNativeInstruction } = await import("@solana/spl-token");
      preInstructions.push(createSyncNativeInstruction(bidderTokenAccount));
    }

    const bidBuilder = this.program.methods
      .placeBid(new anchor.BN(bidAmount))
      .accounts({
        listing,
        paymentMint,
        bidEscrow,
        bidderTokenAccount,
        previousBidderAccount,
        bidder: this.wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      });
    const bidIx = await bidBuilder.instruction();
    const bidTx = new Transaction().add(...preInstructions, bidIx);
    const tx = await this.sendAndConfirm(bidTx);

    return tx;
  }

  /**
   * Cancel a listing (seller only)
   * Supports both standard SPL Token and Token-2022/WNS NFTs
   */
  async cancelListing(
    nftMint: PublicKey,
    sellerNftAccount: PublicKey
  ): Promise<string> {
    const nftTokenProgram = await detectTokenProgram(this.connection, nftMint);
    const isT22 = nftTokenProgram.equals(TOKEN_2022_PROGRAM_ID);
    const isWNS = isT22 ? await isWNSNft(this.connection, nftMint) : false;

    const listing = PublicKey.findProgramAddressSync(
      [Buffer.from("listing"), nftMint.toBuffer()],
      AUCTION_PROGRAM_ID
    )[0];

    const escrowNft = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow_nft"), nftMint.toBuffer()],
      AUCTION_PROGRAM_ID
    )[0];

    let builder = this.program.methods
      .cancelListing()
      .accounts({
        listing,
        nftMint,
        escrowNft,
        sellerNftAccount,
        seller: this.wallet.publicKey,
        nftTokenProgram,
      });

    if (isWNS) {
      builder = builder.remainingAccounts(getWNSRemainingAccounts(nftMint));
    }

    if (isWNS) {
      const wnsGroupMint = await getWNSGroupMint(nftMint);
      const approveIx = buildWNSApproveInstruction(
        this.wallet.publicKey,
        this.wallet.publicKey,
        nftMint,
        wnsGroupMint,
        0
      );
      const cancelIx = await builder.instruction();
      const tx = new Transaction().add(approveIx).add(cancelIx);
      return await this.sendAndConfirm(tx);
    } else {
      const cancelIx2 = await builder.instruction();
      const cancelTx = new Transaction().add(cancelIx2);
      const cancelSig = await this.sendAndConfirm(cancelTx);
      return cancelSig;
    }
  }

  /**
   * Cancel a Metaplex Core listing.
   */
  async cancelListingCore(
    assetId: PublicKey,
    collection: PublicKey = ARTIFACTE_CORE_COLLECTION
  ): Promise<string> {
    const cancelIx = this.buildCoreCancelInstruction(assetId, collection);
    const tx = new Transaction()
      .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 250_000 }))
      .add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }))
      .add(cancelIx);

    return await this.sendAndConfirm(tx);
  }

  /**
   * Cancel a pNFT listing — return NFT to seller via Metaplex TransferV1
   */
  async cancelListingPnft(nftMint: PublicKey): Promise<string> {
    const MPL_TOKEN_METADATA_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
    const MPL_AUTH_RULES_ID = new PublicKey('auth9SigNpDKz4sJJ1DfCTuZrZNSAgh9sFD3rboVmgg');
    const ATA_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
    const SYSVAR_INSTRUCTIONS_ID = new PublicKey('Sysvar1nstructions1111111111111111111111111');

    const listing = PublicKey.findProgramAddressSync(
      [Buffer.from("listing"), nftMint.toBuffer()],
      AUCTION_PROGRAM_ID
    )[0];

    const escrowAuthority = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow_authority"), nftMint.toBuffer()],
      AUCTION_PROGRAM_ID
    )[0];

    const nftMetadata = PublicKey.findProgramAddressSync(
      [Buffer.from('metadata'), MPL_TOKEN_METADATA_ID.toBuffer(), nftMint.toBuffer()],
      MPL_TOKEN_METADATA_ID
    )[0];

    const nftEdition = PublicKey.findProgramAddressSync(
      [Buffer.from('metadata'), MPL_TOKEN_METADATA_ID.toBuffer(), nftMint.toBuffer(), Buffer.from('edition')],
      MPL_TOKEN_METADATA_ID
    )[0];

    const sellerNftToken = await getAssociatedTokenAddress(nftMint, this.wallet.publicKey);
    const escrowNftToken = await getAssociatedTokenAddress(nftMint, escrowAuthority, true);

    const sellerTokenRecord = PublicKey.findProgramAddressSync(
      [Buffer.from('metadata'), MPL_TOKEN_METADATA_ID.toBuffer(), nftMint.toBuffer(), Buffer.from('token_record'), sellerNftToken.toBuffer()],
      MPL_TOKEN_METADATA_ID
    )[0];

    const escrowTokenRecord = PublicKey.findProgramAddressSync(
      [Buffer.from('metadata'), MPL_TOKEN_METADATA_ID.toBuffer(), nftMint.toBuffer(), Buffer.from('token_record'), escrowNftToken.toBuffer()],
      MPL_TOKEN_METADATA_ID
    )[0];

    // Read rule set from on-chain metadata
    let authRuleSet: PublicKey | null = null;
    try {
      const { Metadata } = await import('@metaplex-foundation/mpl-token-metadata');
      const metaAccount = await this.connection.getAccountInfo(nftMetadata);
      if (metaAccount) {
        const [metadata] = Metadata.fromAccountInfo(metaAccount);
        const progConfig = metadata.programmableConfig;
        if (progConfig && (progConfig as any).__kind === 'V1') {
          const rs = (progConfig as any).ruleSet;
          if (rs) authRuleSet = new PublicKey(rs);
        }
      }
    } catch (err) {
      console.warn('[cancelListingPnft] failed to parse metadata for rule set:', err);
    }

    const ix = await this.program.methods
      .cancelListingPnft()
      .accounts({
        listing,
        nftMint,
        nftMetadata,
        nftEdition,
        escrowAuthority,
        escrowNftToken,
        escrowTokenRecord,
        sellerNftToken,
        sellerTokenRecord,
        seller: this.wallet.publicKey,
        tokenMetadataProgram: MPL_TOKEN_METADATA_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        ataProgram: ATA_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        sysvarInstructions: SYSVAR_INSTRUCTIONS_ID,
        authorizationRulesProgram: authRuleSet ? MPL_AUTH_RULES_ID : null,
        authorizationRules: authRuleSet || null,
      })
      .instruction();

    const tx = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
      ix
    );
    return await this.sendAndConfirm(tx);
  }

  /**
   * Settle an auction after the end time
   * Supports both standard SPL Token and Token-2022/WNS NFTs
   */
  async settleAuction(
    nftMint: PublicKey,
    sellerPaymentAccount: PublicKey,
    buyerNftAccount: PublicKey,
    sellerNftAccount: PublicKey,
    paymentMint: PublicKey
  ): Promise<string> {
    const nftTokenProgram = await detectTokenProgram(this.connection, nftMint);
    const isT22 = nftTokenProgram.equals(TOKEN_2022_PROGRAM_ID);
    const isWNS = isT22 ? await isWNSNft(this.connection, nftMint) : false;

    const listing = PublicKey.findProgramAddressSync(
      [Buffer.from("listing"), nftMint.toBuffer()],
      AUCTION_PROGRAM_ID
    )[0];

    const bidEscrow = PublicKey.findProgramAddressSync(
      [Buffer.from("bid_escrow"), nftMint.toBuffer()],
      AUCTION_PROGRAM_ID
    )[0];

    const escrowNft = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow_nft"), nftMint.toBuffer()],
      AUCTION_PROGRAM_ID
    )[0];

    const treasuryPaymentAccount = await getAssociatedTokenAddress(
      paymentMint,
      TREASURY_WALLET
    );

    // Fetch listing to get creator_address for royalty payment
    const listingData = await this.program.account.listing.fetch(listing);
    const creatorAddr = listingData.creatorAddress as PublicKey;
    // Always derive the correct ATA — program now always validates it
    const creatorPaymentAccount = await getAssociatedTokenAddress(paymentMint, creatorAddr, true);

    const sellerAddress = listingData.seller as PublicKey;
    const highestBidder = listingData.highestBidder as PublicKey;

    let builder = this.program.methods
      .settleAuction()
      .accounts({
        listing,
        nftMint,
        bidEscrow,
        escrowNft,
        sellerPaymentAccount,
        treasuryPaymentAccount,
        creatorPaymentAccount,
        buyerNftAccount,
        sellerNftAccount,
        seller: sellerAddress,
        treasury: TREASURY_WALLET,
        nftTokenProgram,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      });

    if (isWNS) {
      builder = builder.remainingAccounts(getWNSRemainingAccounts(nftMint));
    }

    // Build pre-instructions to create missing ATAs
    const preIxs: TransactionInstruction[] = [];

    // Seller wSOL ATA (to receive payment)
    const sellerPaymentInfo = await this.connection.getAccountInfo(sellerPaymentAccount);
    if (!sellerPaymentInfo) {
      preIxs.push(createAssociatedTokenAccountInstruction(
        this.wallet.publicKey, sellerPaymentAccount, sellerAddress, paymentMint
      ));
    }

    // Treasury wSOL ATA (for platform fee)
    const treasuryInfo = await this.connection.getAccountInfo(treasuryPaymentAccount);
    if (!treasuryInfo) {
      preIxs.push(createAssociatedTokenAccountInstruction(
        this.wallet.publicKey, treasuryPaymentAccount, TREASURY_WALLET, paymentMint
      ));
    }

    // Creator payment ATA (for royalties) — skip if no royalties
    // Create creator ATA if missing and royalty > 0
    if (listingData.royaltyBasisPoints > 0) {
      const creatorInfo = await this.connection.getAccountInfo(creatorPaymentAccount);
      if (!creatorInfo) {
        preIxs.push(createAssociatedTokenAccountInstruction(
          this.wallet.publicKey, creatorPaymentAccount, creatorAddr, paymentMint
        ));
      }
    }

    // Buyer NFT ATA (to receive the NFT)
    const buyerNftInfo = await this.connection.getAccountInfo(buyerNftAccount);
    if (!buyerNftInfo) {
      preIxs.push(createAssociatedTokenAccountInstruction(
        this.wallet.publicKey, buyerNftAccount, highestBidder, nftMint, nftTokenProgram, ASSOCIATED_TOKEN_PROGRAM_ID
      ));
    }

    // Always use Transaction path to include pre-instructions
    const settleIx = await builder.instruction();
    const tx = new Transaction();

    // Add pre-instructions for missing ATAs
    for (const ix of preIxs) {
      tx.add(ix);
    }

    // Add WNS approve if needed
    if (isWNS) {
      const wnsGroupMint = await getWNSGroupMint(nftMint);
      const approveIx = buildWNSApproveInstruction(
        this.wallet.publicKey,
        this.wallet.publicKey,
        nftMint,
        wnsGroupMint,
        0
      );
      tx.add(approveIx);
    }

    tx.add(settleIx);
    return await this.sendAndConfirm(tx);
  }

  /**
   * Fetch a listing from on-chain
   */
  async fetchListing(nftMint: PublicKey): Promise<any> {
    const listing = PublicKey.findProgramAddressSync(
      [Buffer.from("listing"), nftMint.toBuffer()],
      AUCTION_PROGRAM_ID
    )[0];

    try {
      const account = await this.program.account.listing.fetch(listing);
      return account;
    } catch (e) {
      return await this.fetchCoreListingAccount(nftMint);
    }
  }

  /**
   * List a pNFT (Metaplex programmable NFT) for sale.
   * Used for CC cards and Phygitals which are pNFTs.
   */
  async listItemPnft(
    nftMint: PublicKey,
    paymentMint: PublicKey,
    listingType: ListingType,
    price: number,
    durationSeconds: number | undefined,
    category: ItemCategory,
    royaltyBps: number,
    creatorAddress: PublicKey,
    ruleSet: PublicKey | null = null,
  ): Promise<string> {
    console.log('[listItemPnft] nftMint:', nftMint.toBase58());
    console.log('[listItemPnft] paymentMint:', paymentMint.toBase58());
    console.log('[listItemPnft] royaltyBps:', royaltyBps, 'type:', typeof royaltyBps);
    console.log('[listItemPnft] creatorAddress:', creatorAddress.toBase58());
    // Ensure royaltyBps is a valid u16
    const validatedRoyaltyBps = Math.max(0, Math.min(1000, Math.floor(royaltyBps || 0)));

    const MPL_TOKEN_METADATA_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
    const MPL_AUTH_RULES_ID = new PublicKey('auth9SigNpDKz4sJJ1DfCTuZrZNSAgh9sFD3rboVmgg');
    const ATA_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
    const SYSVAR_INSTRUCTIONS_ID = new PublicKey('Sysvar1nstructions1111111111111111111111111');

    console.log('[listItemPnft] deriving PDAs...');
    const listing = PublicKey.findProgramAddressSync([Buffer.from('listing'), nftMint.toBuffer()], AUCTION_PROGRAM_ID)[0];
    console.log('[listItemPnft] listing:', listing.toBase58());
    const escrowAuthority = PublicKey.findProgramAddressSync([Buffer.from('escrow_authority'), nftMint.toBuffer()], AUCTION_PROGRAM_ID)[0];
    console.log('[listItemPnft] escrowAuthority:', escrowAuthority.toBase58());

    const nftMetadata = PublicKey.findProgramAddressSync(
      [Buffer.from('metadata'), MPL_TOKEN_METADATA_ID.toBuffer(), nftMint.toBuffer()],
      MPL_TOKEN_METADATA_ID
    )[0];
    console.log('[listItemPnft] nftMetadata:', nftMetadata.toBase58());
    const nftEdition = PublicKey.findProgramAddressSync(
      [Buffer.from('metadata'), MPL_TOKEN_METADATA_ID.toBuffer(), nftMint.toBuffer(), Buffer.from('edition')],
      MPL_TOKEN_METADATA_ID
    )[0];
    console.log('[listItemPnft] nftEdition:', nftEdition.toBase58());

    const sellerNftToken = await getAssociatedTokenAddress(nftMint, this.wallet.publicKey);
    console.log('[listItemPnft] sellerNftToken:', sellerNftToken.toBase58());
    const escrowNftToken = await getAssociatedTokenAddress(nftMint, escrowAuthority, true);
    console.log('[listItemPnft] escrowNftToken:', escrowNftToken.toBase58());

    const sellerTokenRecord = PublicKey.findProgramAddressSync(
      [Buffer.from('metadata'), MPL_TOKEN_METADATA_ID.toBuffer(), nftMint.toBuffer(), Buffer.from('token_record'), sellerNftToken.toBuffer()],
      MPL_TOKEN_METADATA_ID
    )[0];
    console.log('[listItemPnft] sellerTokenRecord:', sellerTokenRecord.toBase58());
    const escrowTokenRecord = PublicKey.findProgramAddressSync(
      [Buffer.from('metadata'), MPL_TOKEN_METADATA_ID.toBuffer(), nftMint.toBuffer(), Buffer.from('token_record'), escrowNftToken.toBuffer()],
      MPL_TOKEN_METADATA_ID
    )[0];
    console.log('[listItemPnft] escrowTokenRecord:', escrowTokenRecord.toBase58());

    // Token Metadata's transferV1 CPI handles ATA creation for pNFTs via init_if_needed
    // Do NOT pre-create the escrow ATA with standard ATA program — pNFTs need token records
    const preIxs: any[] = [];

    // Read rule set from on-chain metadata using Metaplex deserializer
    let authRuleSet: PublicKey | null = ruleSet;
    if (!authRuleSet) {
      try {
        const { Metadata } = await import('@metaplex-foundation/mpl-token-metadata');
        const metaAccount = await this.connection.getAccountInfo(nftMetadata);
        if (metaAccount) {
          const [metadata] = Metadata.fromAccountInfo(metaAccount);
          const progConfig = metadata.programmableConfig;
          if (progConfig && (progConfig as any).__kind === 'V1') {
            const rs = (progConfig as any).ruleSet;
            if (rs) {
              authRuleSet = new PublicKey(rs);
              console.log('[listItemPnft] found ruleSet from metadata:', authRuleSet.toBase58());
            }
          }
        }
      } catch (err) {
        console.error('[listItemPnft] failed to parse metadata for rule set:', err);
      }
    }
    console.log('[listItemPnft] ruleSet:', authRuleSet?.toBase58() || 'none');

    const ix = await this.program.methods
      .listItemPnft(
        listingType === ListingType.FixedPrice ? { fixedPrice: {} } : { auction: {} },
        new anchor.BN(price),
        durationSeconds ? new anchor.BN(durationSeconds) : null,
        category === ItemCategory.DigitalArt ? { digitalArt: {} } :
        category === ItemCategory.Spirits ? { spirits: {} } :
        category === ItemCategory.TCGCards ? { tcgCards: {} } :
        category === ItemCategory.SportsCards ? { sportsCards: {} } :
        { watches: {} },
        validatedRoyaltyBps,
        creatorAddress,
      )
      .accounts({
        listing,
        nftMint,
        nftMetadata,
        nftEdition,
        sellerNftToken,
        sellerTokenRecord,
        escrowAuthority,
        escrowNftToken,
        escrowTokenRecord,
        paymentMint,
        seller: this.wallet.publicKey,
        tokenMetadataProgram: MPL_TOKEN_METADATA_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        ataProgram: ATA_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        sysvarInstructions: SYSVAR_INSTRUCTIONS_ID,
        authorizationRulesProgram: authRuleSet ? MPL_AUTH_RULES_ID : null,
        authorizationRules: authRuleSet || null,
      })
      .instruction();

    const tx = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
      ...preIxs,
      ix
    );
    return await this.sendAndConfirm(tx);
  }

  /**
   * Fetch all listings (skips accounts that fail to decode)
   */
  async fetchAllListings(): Promise<any[]> {
    let legacyListings: any[] = [];
    try {
      legacyListings = await this.program.account.listing.all();
    } catch (e) {
      // If bulk decode fails (e.g. corrupted/closed accounts), fetch raw and decode individually
      console.warn("Bulk listing fetch failed, trying individual decode:", (e as any)?.message);
      try {
        const rawAccounts = await this.connection.getProgramAccounts(
          new PublicKey("81s1tEx4MPdVvqS6X84Mok5K4N5fMbRLzcsT5eo2K8J3"),
          { filters: [{ dataSize: this.program.account.listing.size }] }
        );
        const decoded: any[] = [];
        for (const raw of rawAccounts) {
          try {
            const account = this.program.account.listing.coder.accounts.decode("listing", raw.account.data);
            decoded.push({ publicKey: raw.pubkey, account });
          } catch {
            // Skip accounts that can't be decoded (closed/corrupted)
          }
        }
        legacyListings = decoded;
      } catch (e2) {
        console.error("Error fetching listings:", e2);
        legacyListings = [];
      }
    }

    try {
      const coreAccounts = await this.connection.getProgramAccounts(AUCTION_PROGRAM_ID, {
        filters: [
          { dataSize: CORE_LISTING_ACCOUNT_SIZE },
          { memcmp: { offset: 0, bytes: anchor.utils.bytes.bs58.encode(CORE_LISTING_ACCOUNT_DISCRIMINATOR) } },
        ],
      });

      const decodedCore = coreAccounts
        .map((raw) => {
          const account = decodeCoreListingAccount(raw.account.data);
          if (!account) return null;
          return { publicKey: raw.pubkey, account };
        })
        .filter(Boolean);

      return [...legacyListings, ...decodedCore];
    } catch (coreError) {
      console.error("Error fetching core listings:", coreError);
      return legacyListings;
    }
  }
}
