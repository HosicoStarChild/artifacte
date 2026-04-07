import { Connection, PublicKey, Transaction, SystemProgram, TransactionInstruction, ComputeBudgetProgram } from "@solana/web3.js";
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
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
      // Use wallet adapter's sendTransaction — goes through Phantom's native flow, no Blowfish warning
      sig = await this.sendTx(tx, this.connection);
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
      return null;
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
    console.log('[listItemPnft] building instruction...');

    // Fetch NFT metadata to get auth rules (some pNFTs have programmable configs with rule sets)
    let authorizationRules: PublicKey | null = null;
    try {
      const metadataAccount = await this.connection.getAccountInfo(nftMetadata);
      if (metadataAccount) {
        // programmableConfig is at a specific offset in the metadata account
        // ruleSet option: bytes 679+ for pNFT metadata
        // Simpler: check if the metadata has a non-default ruleSet via DAS or just default to null
        // Most CC cards use no auth rules (None variant)
        authorizationRules = null;
      }
    } catch {}

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
        authorizationRulesProgram: null, // no auth rules for standard CC pNFTs
        authorizationRules: null, // no auth rules for standard CC pNFTs
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
   * Fetch all listings
   */
  async fetchAllListings(): Promise<any[]> {
    try {
      const accounts = await this.program.account.listing.all();
      return accounts;
    } catch (e) {
      console.error("Error fetching listings:", e);
      return [];
    }
  }
}
