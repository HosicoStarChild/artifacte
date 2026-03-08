# 8004 Solana Agent Registry Integration

This document describes the integration of the ERC-8004 Solana Agent Registry into the Artifacte platform.

## Overview

Artifacte agents are now registered on the ERC-8004 protocol, which provides:
- **Decentralized Identity**: Each agent is a Metaplex Core NFT on Solana
- **On-Chain Reputation**: ATOM reputation engine tracks feedback and builds trust scores
- **Service Discovery**: Agents declare their services (MCP, A2A, etc.) on-chain
- **Transparent Marketplace**: All agent activity is auditable on-chain

## Architecture

### Two-Layer System

```
┌─────────────────────────────────────────────────┐
│  Artifacte Layer (Commerce & Business Logic)    │
│  - Spending limits, budgets, categories         │
│  - API keys for agent authentication            │
│  - Artifacte-specific permissions & controls    │
│  (Stored in /data/agents.json)                  │
└─────────────────────────────────────────────────┘
                        ↑
              (via agentAssetAddress)
┌─────────────────────────────────────────────────┐
│  8004 Layer (Identity & Reputation)             │
│  - Agent NFT ownership and metadata             │
│  - Service endpoints (MCP, A2A, etc.)           │
│  - On-chain reputation scores (ATOM engine)     │
│  - Feedback history and trust tiers             │
│  (Stored on Solana blockchain)                  │
└─────────────────────────────────────────────────┘
```

## Core Components

### 1. useAgentRegistry Hook (`hooks/useAgentRegistry.ts`)

A React hook that wraps the 8004-solana SDK with Artifacte-specific logic.

**Key Functions:**
- `registerAgent(name, description, imageUri, services, collectionPointer)` — Register new agent on 8004
- `loadAgent(assetPubkey)` — Fetch agent data from 8004
- `setAgentWallet(assetPubkey, wallet)` — Set agent's operational wallet
- `giveFeedback(assetPubkey, score)` — Submit feedback to ATOM engine
- `getSummary(assetPubkey)` — Get reputation summary from ATOM
- `getCollectionAgents(collectionPointer)` — Fetch all agents in Artifacte collection

**Usage Example:**
```typescript
const { registerAgent, getSummary, giveFeedback } = useAgentRegistry();

// Register a new agent
const assetAddress = await registerAgent(
  'TradingBot Pro',
  'Automated trading agent',
  'ipfs://QmImage...',
  [{ type: 'MCP', value: 'https://artifacte.io/mcp' }],
  process.env.NEXT_PUBLIC_8004_COLLECTION_POINTER
);

// Give feedback
await giveFeedback(assetAddress, {
  value: '4.8',
  tag1: 'quality',
  tag2: 'feedback'
});

// Check reputation
const reputation = await getSummary(assetAddress);
console.log(`Score: ${reputation.averageScore}, Feedbacks: ${reputation.totalFeedbacks}`);
```

### 2. Collection Creation Script (`scripts/create-8004-collection.mjs`)

Creates the "Artifacte" collection on 8004 to group all Artifacte agents.

**Run once during setup:**
```bash
SOLANA_PRIVATE_KEY='[1,2,3,...,64]' node scripts/create-8004-collection.mjs
```

**Output:**
- Collection CID and Pointer saved to `.env.local`
- Use the pointer in `NEXT_PUBLIC_8004_COLLECTION_POINTER` for agent registration

### 3. Agent Pages Updated

#### `/app/agents/register/page.tsx`
- 6-step registration flow preserved (NFT → Name → Permissions → Categories → Spending Limits → Review)
- On submit: registers agent on 8004 via SDK
- Includes MCP service endpoint in registration
- Stores Artifacte-specific data (spending limits, categories, API key) in local backend

#### `/app/agents/page.tsx`
- Fetches agents from 8004 collection instead of custom program
- Shows reputation scores from ATOM engine
- Links to 8004scan.io for transparency
- Keeps Artifacte spending limit and category data from local API

#### `/app/agents/[address]/page.tsx`
- Loads agent data from 8004
- Shows reputation, feedback history, services
- Shows Artifacte-specific data (budget, categories, permissions)
- Allow giving feedback which updates ATOM reputation

### 4. API Routes (`/app/api/agents/`)

Unchanged — these handle Artifacte-specific data storage:
- Spending limits (daily/weekly/monthly)
- Categories for bidding permissions
- API key generation and rotation
- Budget tracking

The local API routes are the "commerce layer" on top of 8004 identity.

## Data Models

### AgentRecord (Local Storage)
```typescript
interface AgentRecord {
  walletAddress: string;           // Owner wallet
  agentName: string;
  apiKey: string;                  // Artifacte API key
  nftMint: string;                 // Original NFT mint
  agentAssetAddress?: string;      // 8004 asset address (KEY LINK)
  permissions: {
    Trade: boolean;
    Bid: boolean;
    Chat: boolean;
  };
  categories: string[];            // Bidding categories
  createdAt: number;
  connectionStatus: "connected" | "disconnected";
  spendingLimits?: SpendingLimits;
}
```

### Agent8004Data (From 8004 Blockchain)
```typescript
interface Agent8004Data {
  name: string;
  description: string;
  imageUri: string;
  services: Array<{ type: string; value: string }>;
  skills?: string[];
  domains?: string[];
  owner: PublicKey;                // Agent owner
  assetPubkey: PublicKey;          // 8004 asset address
}
```

The link is `agentAssetAddress` in local storage ↔ `assetPubkey` on 8004.

## Environment Configuration

### `.env.local` (Created by Collection Script)
```env
NEXT_PUBLIC_8004_COLLECTION_POINTER=<pointer>
NEXT_PUBLIC_8004_COLLECTION_CID=<cid>
NEXT_PUBLIC_SOLANA_CLUSTER=devnet
```

### `.env.example` (Template)
```env
NEXT_PUBLIC_SOLANA_CLUSTER=devnet
NEXT_PUBLIC_8004_COLLECTION_POINTER=<collection-pointer-from-script>
NEXT_PUBLIC_8004_COLLECTION_CID=<collection-cid-from-script>
NEXT_PUBLIC_MCP_ENDPOINT=https://artifacte.io/mcp
NEXT_PUBLIC_API_URL=http://localhost:3000
```

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Create Artifacte Collection (One-Time)
```bash
# On mainnet, use a funded wallet keypair
export SOLANA_PRIVATE_KEY='[...]' # JSON array of 64 bytes

# Run script
node scripts/create-8004-collection.mjs

# Script saves collection pointer to .env.local
```

### 3. Start Development Server
```bash
npm run dev
```

### 4. Register First Agent
1. Go to `/agents/register`
2. Select an NFT from your wallet
3. Fill in name, permissions, categories, spending limits
4. On submit: agent is registered on 8004 + local data stored
5. Receive API key for Artifacte commerce integration

## Mainnet vs Devnet

### Devnet (Development)
- Agent Registry: `6MuHv4dY4p9E4hSCEPr9dgbCSpMhq8x1vrUexbMVjfw1`
- ATOM Engine: `6Mu7qj6tRDrqchxJJPjr9V1H2XQjCerVKixFEEMwC1Tf`

### Mainnet (Production)
- Agent Registry: `8oo4dC4JvBLwy5tGgiH3WwK4B9PWxL9Z4XjA2jzkQMbQ`
- ATOM Engine: `AToMw53aiPQ8j7iHVb4fGt6nzUNxUhcPc3tbPBZuzVVb`

Change cluster in `.env.local`:
```bash
NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta
```

## MCP Integration

When agents are registered on 8004, they declare the Artifacte MCP service endpoint:

```typescript
const services = [
  { 
    type: 'MCP',
    value: 'https://artifacte.io/mcp'
  }
];
```

This allows agents to:
- Browse RWA listings
- Place bids and buy assets
- Monitor auctions
- Appraise assets
- Check portfolios

See [artifacte-mcp README](../artifacte-mcp/README.md#integration-with-8004-solana-agent-registry) for details.

## Reputation & Feedback

Agents earn reputation through the ATOM engine:

```typescript
// Give feedback to an agent
await giveFeedback(agentAssetAddress, {
  value: '4.8',           // Score out of 5
  tag1: 'quality',        // Category tag
  tag2: 'feedback',       // Period tag
  feedbackUri: 'ipfs://...' // Optional feedback details
});

// Check reputation
const summary = await getSummary(agentAssetAddress);
// {
//   averageScore: 4.73,
//   totalFeedbacks: 42,
//   trustTier: 3 // 0-5 (sybil-resistant)
// }
```

Trust tiers provide Sybil resistance:
- Tier 0: No feedback
- Tier 1: <5 feedbacks
- Tier 2: 5-20 feedbacks
- Tier 3: 20-100 feedbacks
- Tier 4: 100-500 feedbacks
- Tier 5: 500+ feedbacks (expert)

## Troubleshooting

### "Wallet not connected"
- Ensure wallet adapter is available and connected before calling 8004 functions

### "Collection not found"
- Run the collection creation script first
- Verify `NEXT_PUBLIC_8004_COLLECTION_POINTER` in `.env.local`

### "Failed to fetch agent from 8004"
- Check RPC endpoint is reachable
- Verify agent asset address is correct and exists on-chain
- Check cluster matches (mainnet vs devnet)

### "IPFS upload failed"
- Script uses local IPFS (no Pinata JWT by default)
- For production, add Pinata JWT to hook's SDK initialization

## Future Enhancements

1. **Multi-signature Agent Wallets** — DAO governance of agent actions
2. **Agent Composability** — Agents calling other agents via MCP
3. **Market Intelligence** — Historical reputation trends and agent rankings
4. **Dynamic Fees** — Bid/trade fees based on agent reputation tier
5. **SocialFi Integration** — Agent followers and trust networks on Solana

## References

- [8004 SDK Docs](https://8004.qnt.sh)
- [ERC-8004 Spec](https://github.com/qantas/erc-8004)
- [ATOM Reputation Engine](https://github.com/qantas/atom-engine)
- [Solana Wallet Adapter](https://github.com/solana-labs/wallet-adapter)

## Support

For issues with:
- **Artifacte Platform**: See FEATURES_COMPLETED.md
- **8004 SDK**: Check https://8004.qnt.sh
- **Solana**: Use https://solana.com/docs
