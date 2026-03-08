# Artifacte NFT Metadata Standard v1.0

All NFTs minted on Artifacte follow this metadata schema. Built on Metaplex Token Metadata with category-specific extensions.

## Royalty & Creator Config

All Artifacte-minted pNFTs use:
- **Seller fee basis points**: `200` (2%)
- **Creator**: `DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX` (treasury, 100% share, verified)
- **Token standard**: `ProgrammableNonFungible` (pNFT — royalties enforced on-chain)

This ensures Artifacte receives 2% royalty on ALL resales across any pNFT-compatible marketplace (Magic Eden, Tensor, etc.).

## Universal Fields (Required)

| Field | Type | Description |
|-------|------|-------------|
| `name` | string (64) | Item name |
| `symbol` | string | `Artifacte` |
| `description` | string | Item description |
| `image` | string (URI) | Primary photo |
| `category` | enum | `DigitalArt` / `Spirits` / `TCGCards` / `SportsCards` / `Watches` |
| `verifiedBy` | string | Verification source: `BAXUS` / `PSA` / `BGS` / `CGC` / `Chrono24` / `Metaplex` |
| `verificationId` | string | Cert number or authentication ID |
| `appraisedValue` | u64 | Oracle market price in USD (6 decimals) |
| `condition` | string (32) | Grade or condition |
| `mintedAt` | i64 | Unix timestamp |

## Category: TCG Cards

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `tcg` | string | Trading card game | `One Piece` / `Pokemon` / `Magic` / `Yu-Gi-Oh` |
| `setName` | string | Full set name | `Awakening of the New Era` |
| `setCode` | string | Set code | `OP05` |
| `cardNumber` | string | Card number in set | `119` |
| `rarity` | string | Card rarity | `Common` / `Rare` / `Ultra Rare` / `Secret Rare` / `Alt Art` / `Manga Alt Art` |
| `language` | string | Card language | `EN` / `JPN` |
| `grade` | string | Grading result | `PSA 10` / `BGS 9.5` / `CGC 9` |
| `gradingCompany` | string | Who graded it | `PSA` / `BGS` / `CGC` |
| `certNumber` | string | Grading cert number | `12345678` |
| `year` | u16 | Release year | `2024` |

## Category: Spirits

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `distillery` | string | Distillery name | `Blanton's` / `Macallan` |
| `bottleName` | string | Specific bottle | `1984 First Release` |
| `spiritType` | string | Type of spirit | `Bourbon` / `Scotch` / `Whisky` / `Tequila` / `Rum` |
| `year` | u16 | Vintage/release year | `1984` |
| `proof` | f32 | Proof/ABV | `93` |
| `volume` | string | Bottle volume | `750ml` |
| `region` | string | Production region | `Kentucky` / `Speyside` |
| `bottleNumber` | string | If numbered edition | `142/500` |
| `caskType` | string | Cask maturation | `Sherry Cask` / `Bourbon Barrel` |

## Category: Watches

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `brand` | string | Watch brand | `Rolex` / `Patek Philippe` / `Audemars Piguet` |
| `model` | string | Model name | `Submariner Date` |
| `reference` | string | Reference number | `126610LN` |
| `year` | u16 | Year of manufacture | `2023` |
| `material` | string | Case material | `Steel` / `Gold` / `Platinum` / `Titanium` |
| `movement` | string | Movement type | `Automatic` / `Manual` / `Quartz` |
| `diameter` | string | Case diameter | `41mm` |
| `serialNumber` | string | Serial number | `ABC12345` |
| `complication` | string | Special features | `Chronograph` / `Perpetual Calendar` / `Tourbillon` |
| `bracelet` | string | Bracelet type | `Oyster` / `Jubilee` / `Leather` |
| `box` | bool | Original box included | `true` |
| `papers` | bool | Original papers included | `true` |

## Category: Sports Cards

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `sport` | string | Sport | `Baseball` / `Basketball` / `Football` / `Soccer` |
| `player` | string | Player name | `Shohei Ohtani` |
| `year` | u16 | Card year | `2023` |
| `brand` | string | Card brand | `Topps` / `Panini` / `Upper Deck` |
| `setName` | string | Set name | `Chrome` / `Prizm` / `Select` |
| `cardNumber` | string | Card number | `1` |
| `variant` | string | Card variant | `Base` / `Refractor` / `Auto` / `Patch` / `1/1` |
| `grade` | string | Grade | `PSA 10` / `BGS 9.5` |
| `gradingCompany` | string | Grading company | `PSA` / `BGS` / `SGC` |
| `certNumber` | string | Cert number | `87654321` |
| `serial` | string | If numbered | `25/99` |

## Category: Digital Art

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `artist` | string | Artist name | `XCOPY` |
| `collection` | string | Collection name | `Right-click and Save As guy` |
| `medium` | string | Art medium | `Generative` / `Photography` / `3D` / `Pixel` / `Mixed Media` |
| `edition` | string | Edition info | `1/1` / `42/100` |
| `originalMint` | string | Original NFT mint address | `abc123...` |
| `originalChain` | string | Original blockchain | `Ethereum` / `Solana` / `Tezos` |

## On-Chain Storage

Category-specific fields are stored as JSON in the NFT's `uri` (off-chain metadata on Arweave/IPFS). Universal fields that need on-chain access (name, category, appraisedValue, condition) are stored in the `RwaMetadata` PDA.

```
URI JSON structure:
{
  "name": "...",
  "symbol": "Artifacte",
  "description": "...",
  "image": "https://arweave.net/...",
  "attributes": [
    { "trait_type": "category", "value": "TCGCards" },
    { "trait_type": "tcg", "value": "One Piece" },
    { "trait_type": "setCode", "value": "OP05" },
    { "trait_type": "cardNumber", "value": "119" },
    { "trait_type": "rarity", "value": "Alt Art" },
    { "trait_type": "language", "value": "EN" },
    { "trait_type": "grade", "value": "PSA 10" },
    { "trait_type": "certNumber", "value": "12345678" },
    { "trait_type": "year", "value": "2024" },
    { "trait_type": "verifiedBy", "value": "PSA" }
  ],
  "properties": {
    "category": "image",
    "files": [{ "uri": "https://arweave.net/...", "type": "image/png" }]
  }
}
```

## Validation Rules

1. **All NFTs must have universal fields** — no exceptions
2. **Category-specific fields are required for that category** — e.g. TCG cards MUST have `tcg`, `setCode`, `cardNumber`
3. **`verifiedBy` must match a recognized verifier** — no self-verification
4. **`appraisedValue` sourced from Artifacte Oracle** — not user-submitted
5. **`image` must be on permanent storage** — Arweave or IPFS, not HTTP URLs
6. **Language is critical for TCG** — EN and JPN are different assets, never mixed
7. **Grade must include grading company** — "PSA 10" not just "10"

## Symbol

All Artifacte NFTs use the symbol `Artifacte` for marketplace identification.
