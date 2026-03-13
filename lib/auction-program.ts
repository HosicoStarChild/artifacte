import { Connection, PublicKey, Transaction, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import { IDL } from "./auction-idl";

// Program IDs and constants
const AUCTION_PROGRAM_ID = new PublicKey("81s1tEx4MPdVvqS6X84Mok5K4N5fMbRLzcsT5eo2K8J3");
const TREASURY_WALLET = new PublicKey("6drXw31FjHch4ixXa4ngTyUD2cySUs3mpcB2YYGA9g7P");
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
  amount: number = 0
): TransactionInstruction {
  const [approveAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from("approve-account"), mint.toBuffer()],
    WNS_PROGRAM_ID
  );

  // Anchor discriminator for "approve_transfer": sha256("global:approve_transfer")[..8]
  const crypto = require("crypto");
  const hash = crypto.createHash("sha256").update("global:approve_transfer").digest();
  const discriminator = hash.slice(0, 8);

  // Instruction data: discriminator + amount (u64 LE)
  const data = Buffer.alloc(16);
  discriminator.copy(data, 0);
  data.writeBigUInt64LE(BigInt(amount), 8);

  // Distribution account PDA (per-collection, but for amount=0 we can use a dummy)
  // For amount=0, distribution is skipped, so we pass system program as placeholder
  const accounts = [
    { pubkey: payer, isSigner: true, isWritable: true },             // payer
    { pubkey: authority, isSigner: true, isWritable: false },         // authority
    { pubkey: mint, isSigner: false, isWritable: false },             // mint
    { pubkey: approveAccount, isSigner: false, isWritable: true },    // approve_account
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // payment_mint (dummy)
    { pubkey: WNS_PROGRAM_ID, isSigner: false, isWritable: false },   // distribution_token_account = None
    { pubkey: WNS_PROGRAM_ID, isSigner: false, isWritable: false },   // authority_token_account = None
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: true }, // distribution_account (dummy)
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

  return [
    { pubkey: extraMetasPda, isSigner: false, isWritable: false },    // [0] extra_metas
    { pubkey: approveAccount, isSigner: false, isWritable: true },    // [1] approve_account
    { pubkey: WNS_PROGRAM_ID, isSigner: false, isWritable: false },   // [2] wns_program
  ];
}

export class AuctionProgram {
  private program: any;
  private connection: Connection;
  private wallet: any;

  constructor(connection: Connection, wallet: any) {
    this.connection = connection;
    this.wallet = wallet;
    const provider = new anchor.AnchorProvider(connection, wallet, {});
    const idl = { ...IDL, address: AUCTION_PROGRAM_ID.toBase58() } as any;
    this.program = new (anchor.Program as any)(idl, provider);
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
        { watches: {} }
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
      });

    // Add WNS remaining accounts if Token-2022 with hook
    if (isWNS) {
      builder = builder.remainingAccounts(getWNSRemainingAccounts(nftMint));
    }

    if (isWNS) {
      // Build transaction manually to prepend approve IX
      const approveIx = buildWNSApproveInstruction(
        this.wallet.publicKey,
        this.wallet.publicKey, // seller is authority
        nftMint,
        0
      );
      const listIx = await builder.instruction();
      const tx = new Transaction().add(approveIx).add(listIx);
      const { blockhash } = await this.connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = this.wallet.publicKey;
      const signed = await this.wallet.signTransaction(tx);
      const sig = await this.connection.sendRawTransaction(signed.serialize());
      await this.connection.confirmTransaction(sig);
      return sig;
    } else {
      return await builder.rpc();
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

    let builder = this.program.methods
      .buyNow()
      .accounts({
        listing,
        nftMint,
        escrowNft,
        buyerPaymentAccount,
        sellerPaymentAccount,
        treasuryPaymentAccount,
        creatorPaymentAccount: SystemProgram.programId,
        buyerNftAccount,
        buyer: this.wallet.publicKey,
        nftTokenProgram,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      });

    if (isWNS) {
      builder = builder.remainingAccounts(getWNSRemainingAccounts(nftMint));
    }

    if (isWNS) {
      // Prepend approve IX (amount=0 — royalties handled separately later)
      const approveIx = buildWNSApproveInstruction(
        this.wallet.publicKey,
        this.wallet.publicKey, // buyer is authority for approve
        nftMint,
        0
      );
      const buyIx = await builder.instruction();
      const tx = new Transaction().add(approveIx).add(buyIx);
      const { blockhash } = await this.connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = this.wallet.publicKey;
      const signed = await this.wallet.signTransaction(tx);
      const sig = await this.connection.sendRawTransaction(signed.serialize());
      await this.connection.confirmTransaction(sig);
      return sig;
    } else {
      return await builder.rpc();
    }
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

    const tx = await this.program.methods
      .placeBid(new anchor.BN(bidAmount))
      .accounts({
        listing,
        bidEscrow,
        bidderTokenAccount,
        previousBidderAccount,
        bidder: this.wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

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
      const approveIx = buildWNSApproveInstruction(
        this.wallet.publicKey,
        this.wallet.publicKey,
        nftMint,
        0
      );
      const cancelIx = await builder.instruction();
      const tx = new Transaction().add(approveIx).add(cancelIx);
      const { blockhash } = await this.connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = this.wallet.publicKey;
      const signed = await this.wallet.signTransaction(tx);
      const sig = await this.connection.sendRawTransaction(signed.serialize());
      await this.connection.confirmTransaction(sig);
      return sig;
    } else {
      return await builder.rpc();
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

    let builder = this.program.methods
      .settleAuction()
      .accounts({
        listing,
        nftMint,
        bidEscrow,
        escrowNft,
        sellerPaymentAccount,
        treasuryPaymentAccount,
        creatorPaymentAccount: SystemProgram.programId,
        buyerNftAccount,
        sellerNftAccount,
        nftTokenProgram,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      });

    if (isWNS) {
      builder = builder.remainingAccounts(getWNSRemainingAccounts(nftMint));
    }

    if (isWNS) {
      const approveIx = buildWNSApproveInstruction(
        this.wallet.publicKey,
        this.wallet.publicKey,
        nftMint,
        0
      );
      const settleIx = await builder.instruction();
      const tx = new Transaction().add(approveIx).add(settleIx);
      const { blockhash } = await this.connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = this.wallet.publicKey;
      const signed = await this.wallet.signTransaction(tx);
      const sig = await this.connection.sendRawTransaction(signed.serialize());
      await this.connection.confirmTransaction(sig);
      return sig;
    } else {
      return await builder.rpc();
    }
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
