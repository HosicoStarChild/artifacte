# Artifacte On-Chain Smart Contracts

This directory contains the Solana smart contracts for the Artifacte RWA/NFT platform.

## Programs

### 1. `rwa_nft`
Handles minting and managing Real World Asset NFTs on Solana.

**Program ID (devnet):** `F9mkXqMrgF1sSV3wDtTUpTs82B5XJ5qz9A33nBAdcNqb`

**Instructions:**
- `initialize` - Set up platform configuration with authority, treasury wallet, and fee basis points
- `mint_rwa_nft` - Create a new RWA NFT with metadata (name, category, URI, appraised value, condition)
- `update_appraisal` - Update the appraised value of an existing RWA NFT (authority only)
- `transfer_rwa` - Transfer an RWA NFT between token accounts

**Supported Asset Categories:**
- DigitalArt
- Spirits
- TCGCards
- SportsCards
- Watches

### 2. `auction`
Handles auctions and sales of RWA NFTs.

**Program ID (devnet):** `23fKEH3emeaJf1PW4Kts3exRnMjoNiqmqyFoNXH6qNiN`

**Instructions:**
- `create_auction` - Create a new auction with starting price, reserve price, duration, and payment mint
- `place_bid` - Place a bid on an active auction (minimum 1 lamport increment from previous bid)
- `settle_auction` - Settle an auction after end time (permissionless, acts as a crank)
  - If reserve met: Transfer NFT to winner, payment to seller (minus 2.5% fee to treasury)
  - If reserve not met: Return NFT to creator, refund all bids
- `cancel_auction` - Cancel an auction before any bids (creator only)

**Auction Statuses:**
- Active
- Settled
- Cancelled

## Configuration

### Treasury Wallet
- Address: `DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX`

### Payment Mints
- **USD1** (6 decimals): `USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB`
- **USDC** (6 decimals): `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`

### Platform Fee
- 2.5% (250 basis points) taken on all successful auction settlements

## Building

### Prerequisites
- Rust 1.93.1+
- Solana CLI 3.0.15+
- Anchor 0.32.1+

### Build Commands

```bash
# Source cargo environment
source ~/.cargo/env

# Add Solana to PATH
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

# Set Solana to devnet
solana config set --url devnet

# Build both programs
cd /Users/haas/.openclaw/workspace/artifacte
cargo build --manifest-path programs/rwa_nft/Cargo.toml --target wasm32-unknown-unknown --release
cargo build --manifest-path programs/auction/Cargo.toml --target wasm32-unknown-unknown --release
```

## Account Structures

### rwa_nft Program

**PlatformConfig (PDA: seeds=[b"platform"])**
```rust
pub struct PlatformConfig {
    pub authority: Pubkey,           // Platform admin
    pub treasury: Pubkey,            // Fee recipient
    pub fee_basis_points: u16,       // E.g., 250 = 2.5%
    pub total_minted: u32,           // Total RWA NFTs minted
    pub created_at: i64,             // Initialization timestamp
    pub bump: u8,                    // PDA bump
}
```

**RwaMetadata (PDA: seeds=[b"rwa", mint_pubkey])**
```rust
pub struct RwaMetadata {
    pub mint: Pubkey,                // SPL Token mint
    pub name: String,                // Asset name (max 64 chars)
    pub category: AssetCategory,     // Asset type
    pub uri: String,                 // Metadata URI (max 200 chars)
    pub appraised_value: u64,        // Value in USD cents
    pub condition: String,           // Condition descriptor (max 32 chars)
    pub minted_at: i64,              // Mint timestamp
    pub appraised_at: i64,           // Last appraisal timestamp
    pub bump: u8,                    // PDA bump
}
```

### auction Program

**Auction (PDA: seeds=[b"auction", mint_pubkey])**
```rust
pub struct Auction {
    pub creator: Pubkey,              // Auction creator (NFT owner)
    pub mint: Pubkey,                 // NFT mint being auctioned
    pub payment_mint: Pubkey,         // USD1 or USDC mint
    pub starting_price: u64,          // Starting bid price (in payment token units)
    pub reserve_price: u64,           // Minimum reserve price
    pub current_bid: u64,             // Current highest bid
    pub highest_bidder: Pubkey,       // Current winner's pubkey
    pub start_time: i64,              // Auction start timestamp
    pub end_time: i64,                // Auction end timestamp
    pub status: AuctionStatus,        // Active, Settled, or Cancelled
    pub escrow_token_account: Pubkey, // Token account holding the NFT
    pub bid_escrow: Pubkey,           // Token account holding bid amounts
    pub bump: u8,                     // PDA bump
}
```

## Testing

Basic test files are provided in `/tests/`:
- `rwa-nft.test.ts` - RWA NFT program tests
- `auction.test.ts` - Auction program tests

To run tests (when IDLs are generated):
```bash
anchor test
```

## Events

Both programs emit events for off-chain indexing:

**rwa_nft Events:**
- `RwaNftMinted` - Emitted when an RWA NFT is created
- `AppraisalUpdated` - Emitted when appraisal is updated
- `RwaNftTransferred` - Emitted when an RWA NFT is transferred

**auction Events:**
- `AuctionCreated` - Emitted when an auction is created
- `BidPlaced` - Emitted when a bid is placed
- `AuctionSettled` - Emitted when an auction is settled with reserve met
- `AuctionCancelled` - Emitted when an auction is cancelled

## Deployment

**DO NOT DEPLOY YET** - These programs are not yet deployed on mainnet. Follow these steps when ready:

1. Build with mainnet program IDs
2. Run full test suite on devnet
3. Audit security considerations
4. Deploy to devnet first for final testing
5. Deploy to mainnet with proper governance

## Security Considerations

- Authority-only instructions are protected with signer checks
- All token transfers are validated
- Auction settlement properly handles both success and failure cases
- No reentrancy issues (state changes before external calls)
- Proper error handling with descriptive error codes

## Development Notes

- Programs are built for `wasm32-unknown-unknown` target
- IDLs will be generated when `anchor build` is run successfully with proper SBF toolchain
- Fee calculation uses basis points (e.g., 250 bp = 2.5%)
- Timestamps use Unix epoch (seconds since Jan 1, 1970)
- All monetary values are in token smallest units (e.g., lamports for SOL, millionths for USD1/USDC)
