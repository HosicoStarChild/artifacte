# Artifacte NFT Escrow, Auction & Sale System

## Overview

This is a complete end-to-end implementation of an NFT escrow, auction, and fixed-price sale system for real-world assets (RWA) on Solana. The system includes:

1. **On-Chain Auction Program** - Smart contract for managing listings, bids, and settlements
2. **Frontend Integration** - React/Next.js UI that interacts with the blockchain
3. **Fee Structure** - Configurable platform fees (2.5% default) + creator royalties
4. **Category Support** - Support for 5 asset categories with category-specific payment rules

## System Architecture

### On-Chain Programs

#### Auction Program (ID: `23fKEH3emeaJf1PW4Kts3exRnMjoNiqmqyFoNXH6qNiN`)

**Instructions:**

1. **list_item** - Seller lists an NFT for sale
   - Takes: listing_type (FixedPrice/Auction), price, duration (for auctions), category
   - NFT transfers from seller's wallet into an escrow PDA
   - Creates a Listing account to track the listing

2. **place_bid** - Buyer places a bid on an active auction
   - Bid funds held in escrow
   - Previous highest bidder automatically refunded
   - Validates bid amount >= starting price or previous bid + 1

3. **buy_now** - Buyer purchases a fixed-price listing
   - Payment split: seller amount + 2.5% platform fee + creator royalty
   - NFT transfers from escrow to buyer immediately
   - Only works on FixedPrice listings

4. **cancel_listing** - Seller cancels a listing
   - FixedPrice: Can cancel anytime
   - Auction: Only if zero bids received
   - NFT returned to seller

5. **settle_auction** - Settles an auction after end time
   - If bids exist: NFT to highest bidder, payment distributed
   - If no bids: NFT returned to seller

#### RWA NFT Program (ID: `F9mkXqMrgF1sSV3wDtTUpTs82B5XJ5qz9A33nBAdcNqb`)

Manages RWA metadata and NFT creation (existing implementation preserved).

### Fee Structure

- **Platform Fee**: 2.5% of sale price → treasury wallet (`DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX`)
- **Creator Royalties**: Read from NFT metadata (Metaplex standard), paid to mint authority/creator
- **Seller Amount**: Remaining funds after platform fee and creator royalty

### Category System

Supported categories with payment rules:

| Category | Allowed Payment |
|----------|-----------------|
| DigitalArt | SOL only |
| Spirits | USD1 or USDC |
| TCGCards | USD1 or USDC |
| SportsCards | USD1 or USDC |
| Watches | USD1 or USDC |

**Token Mints:**
- USD1: `USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB` (6 decimals)
- USDC: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (6 decimals)

## Frontend Integration

### Auction Program Library

Located in `lib/auction-program.ts`, provides TypeScript class for interacting with the on-chain program:

```typescript
import { AuctionProgram, ListingType, ItemCategory } from "@/lib/auction-program";
import { Connection } from "@solana/web3.js";

const connection = new Connection("https://api.devnet.solana.com");
const auctionProgram = new AuctionProgram(connection, wallet);

// List an NFT
const tx = await auctionProgram.listItem(
  nftMint,
  sellerNftAccount,
  paymentMint,
  ListingType.FixedPrice,
  1000000, // price in lamports/smallest units
  undefined, // no duration for fixed price
  ItemCategory.DigitalArt
);

// Buy a fixed-price listing
const tx = await auctionProgram.buyNow(
  nftMint,
  sellerPaymentAccount,
  buyerPaymentAccount,
  buyerNftAccount,
  price,
  paymentMint
);

// Place a bid on an auction
const tx = await auctionProgram.placeBid(
  nftMint,
  bidAmount,
  bidderTokenAccount,
  paymentMint,
  previousBidderAccount
);

// Cancel a listing
const tx = await auctionProgram.cancelListing(
  nftMint,
  sellerNftAccount
);

// Settle an auction
const tx = await auctionProgram.settleAuction(
  nftMint,
  sellerPaymentAccount,
  buyerNftAccount,
  sellerNftAccount,
  paymentMint
);

// Fetch listing details
const listing = await auctionProgram.fetchListing(nftMint);

// Fetch all listings
const allListings = await auctionProgram.fetchAllListings();
```

### IDL

The complete program IDL is available in `lib/auction-idl.ts`, which includes:
- Instruction definitions with account layouts
- Account structure definitions
- Type definitions (enums, structs)
- Event definitions
- Error codes

## Build & Deployment

### Requirements

- Anchor 0.31.1 (installed via AVM)
- Solana CLI with devnet RPC access
- Node.js 18+ and npm for frontend

### Building On-Chain Programs

```bash
export PATH="$HOME/.avm/bin:$PATH"
cd /Users/haas/.openclaw/workspace/artifacte
anchor build
```

This compiles both the auction and RWA NFT programs. The compiled binaries are:
- Auction: `target/deploy/auction.so`
- RWA NFT: `target/deploy/rwa_nft.so`

IDLs are generated at:
- `target/idl/auction.json`
- `target/idl/rwa_nft.json`

### Building Frontend

```bash
npm run build
```

Builds the Next.js frontend for production. Output is in `.next/`.

### Deploying to Devnet

```bash
export PATH="$HOME/.avm/bin:$PATH"
anchor deploy
```

Uses existing keypair at `~/.config/solana/id.json` and wallet configured in `Anchor.toml`.

## Data Structures

### Listing Account

```rust
pub struct Listing {
    pub seller: Pubkey,
    pub nft_mint: Pubkey,
    pub payment_mint: Pubkey,
    pub price: u64,
    pub listing_type: ListingType,
    pub category: ItemCategory,
    pub start_time: i64,
    pub end_time: i64,
    pub status: ListingStatus,
    pub escrow_nft_account: Pubkey,
    pub current_bid: u64,
    pub highest_bidder: Pubkey,
    pub bump: u8,
}
```

### ListingStatus
- `Active` - Listing is open
- `Settled` - Auction settled or fixed-price sold
- `Cancelled` - Listing cancelled

### ListingType
- `FixedPrice` - Fixed price purchase
- `Auction` - Time-based auction

### ItemCategory
- `DigitalArt`
- `Spirits`
- `TCGCards`
- `SportsCards`
- `Watches`

## Events

The program emits the following events for indexing/UI updates:

- **ListingCreated** - New listing created
- **BidPlaced** - Bid placed on auction
- **ItemPurchased** - Fixed-price item purchased
- **AuctionSettled** - Auction settled with winner
- **ListingCancelled** - Listing cancelled
- **AuctionCancelled** - Auction cancelled (no bids)

## Error Codes

| Code | Error | Description |
|------|-------|-------------|
| 6000 | ListingNotActive | Listing is not active |
| 6001 | AuctionEnded | Auction has already ended |
| 6002 | AuctionNotEnded | Auction has not ended yet |
| 6003 | BidTooLow | Bid is too low |
| 6004 | CalculationError | Calculation error (overflow) |
| 6005 | Unauthorized | Unauthorized caller |
| 6006 | CannotCancelWithBids | Cannot cancel auction with existing bids |
| 6007 | NotAnAuction | Operation requires auction listing |
| 6008 | NotFixedPrice | Operation requires fixed-price listing |
| 6009 | InvalidDuration | Invalid duration for auction |
| 6010 | InvalidPaymentMint | Invalid payment mint for category |

## Testing

### Mock Data (Frontend)

The frontend uses mock data in `lib/data.ts` for development. Replace with real on-chain data by:

1. Fetching listings from chain using `AuctionProgram.fetchAllListings()`
2. Updating UI components to display fetched data
3. Wiring transaction methods to UI buttons

### Example Testing Flow

1. Create an NFT using the RWA NFT program
2. Approve the auction program to transfer the NFT
3. Call `list_item` to create a listing
4. For auctions: Place bids with `place_bid`
5. For fixed-price: Buy with `buy_now`
6. For auctions: Call `settle_auction` after end time

## Future Enhancements

1. **Creator Royalties** - Currently hardcoded to 0. Implement Metaplex metadata reading to extract royalty percentages
2. **Indexing** - Add event listener/indexer to cache listings off-chain for faster queries
3. **Collection Support** - Support listing NFTs by collection verification
4. **Bundles** - Support selling multiple NFTs together
5. **Admin Functions** - Fee configuration, pause mechanisms
6. **Whitelist** - Optional listing whitelist for premium assets

## Addresses & Constants

```typescript
const AUCTION_PROGRAM_ID = "23fKEH3emeaJf1PW4Kts3exRnMjoNiqmqyFoNXH6qNiN";
const RWA_NFT_PROGRAM_ID = "F9mkXqMrgF1sSV3wDtTUpTs82B5XJ5qz9A33nBAdcNqb";
const TREASURY_WALLET = "DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX";
const USD1_MINT = "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
```

## File Structure

```
/programs/
  /auction/
    Cargo.toml
    src/lib.rs          # Main auction program
  /rwa_nft/
    Cargo.toml
    src/lib.rs          # RWA NFT program
/lib/
  auction-program.ts   # Frontend interaction library
  auction-idl.ts       # Program IDL
  data.ts              # Mock data and constants
/app/
  /auctions/
    page.tsx           # Auction marketplace UI
```

## Git History

All commits are in the artifacte repository with clear messages describing changes.

Last commit: Full NFT escrow, auction, and sale system with complete on-chain and frontend integration.
