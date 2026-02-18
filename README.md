# Artifacte — RWA Tokenization on Solana

Institutional-grade real world asset tokenization platform built on Solana. Mint NFTs representing real-world assets and auction them on-chain.

**Built for the Solana Graveyard Hackathon 2026**

## Live Demo
Dark luxury UI with wallet integration, live auction bidding, and portfolio management.

## Architecture

### Smart Contracts (Anchor/Rust)
Two Anchor programs in `/programs/`:

1. **rwa_nft** — Mint full NFTs representing real-world assets with metadata (name, category, appraised value, condition grade, image URI). Supports 7 asset categories. Each asset is a single NFT — no fractionalization.

2. **auction** — Timed auction system with escrow via PDAs. Place bids with SOL (must beat current), auto-refund previous bidder, settle after end time. Winner receives the full NFT.

### Frontend (Next.js 14)
- **Homepage**: Portfolio grid, live auctions carousel, recent listings
- **`/auctions`**: All live auctions grid
- **`/auctions/[slug]`**: Bid history, price chart, countdown timer, place bid (on-chain)
- Wallet connect (Phantom/Solflare) via `@solana/wallet-adapter`
- Dark navy/black + gold accent luxury UI
- Responsive/mobile friendly

## Quick Start

### Frontend
```bash
npm install
npm run dev
# Open http://localhost:3000
```

### Smart Contracts (requires Rust + Anchor CLI)
```bash
# Install Anchor: https://www.anchor-lang.com/docs/installation
anchor build
anchor test
anchor deploy --provider.cluster devnet
```

## Tech Stack
- **Frontend**: Next.js 14, React 18, Tailwind CSS, TypeScript
- **Blockchain**: Solana (devnet), Anchor Framework
- **Wallet**: @solana/wallet-adapter (Phantom, Solflare)
- **Packages**: @coral-xyz/anchor, @solana/web3.js

## How Bidding Works
1. Connect wallet (Phantom/Solflare)
2. Navigate to an auction detail page
3. Enter bid amount (must exceed current bid)
4. Transaction sends SOL to escrow on Solana devnet
5. Bid recorded on-chain with TX confirmation

## Project Structure
```
artifacte/
├── app/                    # Next.js 14 app router
│   ├── page.tsx           # Homepage
│   ├── auctions/
│   │   ├── page.tsx       # Auctions grid
│   │   └── [slug]/page.tsx # Auction detail + bidding
│   ├── layout.tsx
│   └── globals.css
├── components/            # React components
│   ├── WalletProvider.tsx
│   ├── Navbar.tsx
│   ├── Footer.tsx
│   ├── AssetCard.tsx
│   ├── AuctionCard.tsx
│   └── Countdown.tsx
├── lib/
│   └── data.ts           # Seed data + types
├── programs/              # Anchor smart contracts
│   ├── rwa_nft/
│   └── auction/
├── Anchor.toml
└── README.md
```
