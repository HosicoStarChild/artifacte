# Artifacte ↔ eBay Sync Engine

Bidirectional bid synchronization between eBay auctions and Artifacte on-chain USD1 auctions.

## Setup

```bash
cd sync-engine
npm install
```

### Environment Variables

Create a `.env` file or export these:

| Variable | Required | Description |
|----------|----------|-------------|
| `EBAY_APP_ID` | ✅ | eBay application ID (client ID) |
| `EBAY_CERT_ID` | ✅ | eBay cert ID (client secret) |
| `EBAY_DEV_ID` | ✅ | eBay developer ID |
| `EBAY_USER_TOKEN` | ✅ | eBay user auth token (for placing bids) |
| `EBAY_SANDBOX` | ❌ | Set to `true` for sandbox environment |
| `SOLANA_RPC_URL` | ❌ | Solana RPC (default: mainnet-beta) |
| `ARTIFACTE_API_URL` | ❌ | Artifacte API base URL (default: http://localhost:3000) |
| `SYNC_PORT` | ❌ | HTTP server port (default: 4100) |
| `POLL_INTERVAL_MS` | ❌ | Polling interval in ms (default: 10000) |

## Running

```bash
node server.mjs
```

## API Endpoints

### `GET /auctions`
List all synced auction pairs.

### `POST /auctions`
Add a new synced auction pair.

```json
{
  "title": "Vintage Porsche 911",
  "ebayItemId": "v1|123456789|0",
  "artifacteSlug": "vintage-porsche-911",
  "currentBid": 245000
}
```

### `GET /auctions/:id/status`
Get sync status for a specific auction.

## How It Works

1. Every 10 seconds, the engine polls eBay for current bid prices
2. Compares with Artifacte's on-chain bid state
3. If eBay bid is higher → syncs to Artifacte (USD1 transfer on Solana)
4. If Artifacte bid is higher → places bid on eBay (Trading API)
5. Tags each sync bid with `lastBidPlatform` to prevent infinite loops

All amounts are in USD1 (USD-denominated stablecoin).
