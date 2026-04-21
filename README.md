# Artifacte — RWA Tokenization on Solana

Institutional-grade real world asset tokenization platform built on Solana. Mint NFTs representing real-world assets and auction them on-chain.

**Built for the Solana Graveyard Hackathon 2026**

## Live Demo
Dark luxury UI with wallet integration, live auction bidding, and portfolio management.

## Architecture

### Smart Contracts (Anchor/Rust)
Anchor program in `/programs/`:

1. **auction** — Marketplace and auction logic with escrow via PDAs and fixed-price support for the current Artifacte flows.

### Frontend (Next.js 16)
- **Homepage**: Portfolio grid, live auctions carousel, recent listings
- **`/auctions`**: All live auctions grid
- **`/auctions/[slug]`**: Bid history, price chart, countdown timer, place bid (on-chain)
- Wallet connect (Phantom/Solflare) via `@solana/wallet-adapter`
- Dark navy/black + gold accent luxury UI with shadcn/ui primitives
- Responsive/mobile friendly

## Quick Start

### Frontend
```bash
pnpm install
pnpm dev
# Open http://localhost:3000
```

Requirements:
- Node.js 20.9+
- pnpm 10+

Useful commands:
```bash
pnpm build
pnpm lint
pnpm typecheck
```

### Smart Contracts (requires Rust + Anchor CLI)
```bash
# Install Anchor: https://www.anchor-lang.com/docs/installation
anchor build
anchor test
anchor deploy --provider.cluster devnet
```

## Tech Stack
- **Frontend**: Next.js 16, React 19, Tailwind CSS, TypeScript, shadcn/ui
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
├── app/                    # Next.js 16 app router
│   ├── page.tsx           # Homepage
│   ├── auctions/
│   │   ├── page.tsx       # Auctions grid
│   │   └── [slug]/page.tsx # Auction detail + bidding
│   ├── layout.tsx
│   └── globals.css
├── components/            # React components
│   ├── ui/                # shadcn/ui primitives
│   ├── WalletProvider.tsx
│   ├── Navbar.tsx
│   ├── Footer.tsx
│   ├── AuctionCard.tsx
│   └── Countdown.tsx
├── lib/
│   └── data.ts           # Seed data + types
├── programs/              # Anchor smart contracts
│   └── auction/
├── Anchor.toml
└── README.md
```
