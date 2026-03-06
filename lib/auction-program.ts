import { Connection, PublicKey, Transaction, SystemProgram } from "@solana/web3.js";
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferInstruction } from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import { IDL } from "./auction-idl";

// Program IDs and constants
const AUCTION_PROGRAM_ID = new PublicKey("23fKEH3emeaJf1PW4Kts3exRnMjoNiqmqyFoNXH6qNiN");
const TREASURY_WALLET = new PublicKey("DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX");
const USD1_MINT = new PublicKey("USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB");
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

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
    const listing = PublicKey.findProgramAddressSync(
      [Buffer.from("listing"), nftMint.toBuffer()],
      AUCTION_PROGRAM_ID
    )[0];

    const escrowNft = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow_nft"), nftMint.toBuffer()],
      AUCTION_PROGRAM_ID
    )[0];

    const tx = await this.program.methods
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
        tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return tx;
  }

  /**
   * Buy a fixed-price listing
   */
  async buyNow(
    nftMint: PublicKey,
    sellerPaymentAccount: PublicKey,
    buyerPaymentAccount: PublicKey,
    buyerNftAccount: PublicKey,
    price: number,
    paymentMint: PublicKey
  ): Promise<string> {
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

    const creatorPaymentAccount = await getAssociatedTokenAddress(
      paymentMint,
      new PublicKey("1111111111111111111111111111111111111111111")
    );

    const tx = await this.program.methods
      .buyNow()
      .accounts({
        listing,
        escrowNft,
        buyerPaymentAccount,
        sellerPaymentAccount,
        treasuryPaymentAccount,
        creatorPaymentAccount,
        buyerNftAccount,
        buyer: this.wallet.publicKey,
        tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return tx;
  }

  /**
   * Place a bid on an active auction
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
        tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return tx;
  }

  /**
   * Cancel a listing (seller only)
   */
  async cancelListing(
    nftMint: PublicKey,
    sellerNftAccount: PublicKey
  ): Promise<string> {
    const listing = PublicKey.findProgramAddressSync(
      [Buffer.from("listing"), nftMint.toBuffer()],
      AUCTION_PROGRAM_ID
    )[0];

    const escrowNft = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow_nft"), nftMint.toBuffer()],
      AUCTION_PROGRAM_ID
    )[0];

    const tx = await this.program.methods
      .cancelListing()
      .accounts({
        listing,
        escrowNft,
        sellerNftAccount,
        seller: this.wallet.publicKey,
        tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      })
      .rpc();

    return tx;
  }

  /**
   * Settle an auction after the end time
   */
  async settleAuction(
    nftMint: PublicKey,
    sellerPaymentAccount: PublicKey,
    buyerNftAccount: PublicKey,
    sellerNftAccount: PublicKey,
    paymentMint: PublicKey
  ): Promise<string> {
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

    const creatorPaymentAccount = await getAssociatedTokenAddress(
      paymentMint,
      new PublicKey("1111111111111111111111111111111111111111111")
    );

    const tx = await this.program.methods
      .settleAuction()
      .accounts({
        listing,
        bidEscrow,
        escrowNft,
        sellerPaymentAccount,
        treasuryPaymentAccount,
        creatorPaymentAccount,
        buyerNftAccount,
        sellerNftAccount,
        tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return tx;
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
   * Fetch all listings (requires custom RPC call or indexer)
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
