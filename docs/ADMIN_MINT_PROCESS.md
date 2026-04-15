# Admin Mint Process

This document explains how the admin mint flow currently works in Artifacte.

It is based on the live implementation in [app/admin/mint/content.tsx](app/admin/mint/content.tsx), the metadata helpers in [lib/nft-metadata.ts](lib/nft-metadata.ts), the admin wallet definitions in [lib/admin.ts](lib/admin.ts), and the RPC proxy in [app/api/rpc/route.ts](app/api/rpc/route.ts).

## Overview

The admin mint flow creates a **Metaplex Core** asset, not a Token Metadata NFT or pNFT.

At a high level, the process is:

1. An admin wallet opens `/admin` and uses the embedded mint form.
2. The UI generates a compliant on-chain name from the form fields.
3. The UI validates whether the selected collection can actually be used by the connected wallet.
4. The UI uploads the image to Arweave using Irys.
5. The UI builds and uploads the off-chain metadata JSON.
6. The UI calls `createV1` from Metaplex Core to create the asset.
7. If a collection is selected, the asset is created into that collection only if the signer is authorized for that collection.

## Entry Point

The active mint UI lives in [app/admin/mint/content.tsx](app/admin/mint/content.tsx).

The admin page imports and renders `MintFormContent`, which returns `MintFormInner`. That inner component owns:

- form state
- collection authority checks
- metadata generation
- image upload
- metadata upload
- Core mint transaction submission

## Access Model

The UI checks wallet access using `hasAdminAccess()` from [lib/admin.ts](lib/admin.ts).

Current admin-related wallet sets are:

- `ADMIN_WALLET`: the primary admin wallet
- `ADMIN_WALLETS`: wallets allowed to perform admin-only actions
- `ADMIN_ACCESS_WALLETS`: broader access list used for admin visibility

Important distinction:

- Being an admin wallet lets you access the admin mint interface.
- It does **not** automatically mean you can mint into every Metaplex Core collection.

Collection mint permission is controlled separately by the collection's **update authority** or **update delegate**.

## RPC Path

The wallet connection uses the app RPC proxy instead of exposing a public API key in the client.

The proxy lives in [app/api/rpc/route.ts](app/api/rpc/route.ts) and forwards allowed methods to Helius mainnet:

- `getLatestBlockhash`
- `simulateTransaction`
- `sendTransaction`
- `getAccountInfo`
- `getMultipleAccounts`
- other read methods

This means the admin mint flow is operating against a mainnet-backed RPC path unless you explicitly change the proxy.

## Mint Form State

The form captures two asset types:

- `Card`
- `Sealed Product`

The form collects fields such as:

- card name
- set
- card number
- year
- language
- variant
- condition
- grading company and grade
- sealed product name and set
- image files
- recipient wallet
- collection address

It also supports a price-source lookup using:

- `Alt.xyz`
- `TCGplayer`

These price-source values are written into off-chain metadata as attributes if selected.

## Name Generation And Byte Limits

The mint name is not arbitrary text typed directly into the on-chain instruction.

Instead, the UI builds a canonical mint name from the form fields using [lib/nft-metadata.ts](lib/nft-metadata.ts).

### Why this exists

Metaplex Core enforces strict on-chain size limits. The current admin flow uses:

- name: `32 UTF-8 bytes`
- symbol: `10 UTF-8 bytes`
- uri: `200 UTF-8 bytes`

This matters because JavaScript string length is not the same as UTF-8 byte length.

Examples:

- ASCII letters usually cost 1 byte each
- accented characters can cost multiple bytes
- emoji can cost 4 bytes each

### Helper functions used

The main helpers are in [lib/nft-metadata.ts](lib/nft-metadata.ts):

- `getUtf8ByteLength()`
- `truncateUtf8ByBytes()`
- `getMetadataFieldStatus()`
- `buildCanonicalMintName()`

### How name shortening works

For cards, the source name is assembled from fields like:

- year
- card name
- variant
- card number
- grade or condition
- language
- set
- TCG

If that source name exceeds 32 bytes, the helper builds a compact version by abbreviating lower-priority fields first.

Examples of abbreviation rules:

- `English` -> `EN`
- `Japanese` -> `JP`
- `Near Mint` -> `NM`
- `Lightly Played` -> `LP`
- `One Piece` -> `OP`
- `Yu-Gi-Oh` -> `YGO`
- `Alternate Art` -> `Alt`

The form always displays the **actual canonical on-chain name** that will be sent.

## Symbol Handling

The admin mint flow uses the default symbol:

- `Artifacte`

This is validated against the `10 UTF-8 byte` compatibility target in [lib/nft-metadata.ts](lib/nft-metadata.ts).

In this Core flow, the symbol is part of the off-chain metadata JSON, not a direct field in the `createV1` call.

## Collection Handling

The collection behavior is one of the most important parts of the current implementation.

### Default collection

The form currently prefills the collection field with the `ARTIFACTE_COLLECTION` constant from [lib/data.ts](lib/data.ts).

### Preflight collection validation

Before minting, the UI runs `validateCollectionAccess()` inside [app/admin/mint/content.tsx](app/admin/mint/content.tsx).

That function:

1. Fetches the collection account using `fetchCollection()` from Metaplex Core.
2. Reads the collection's update authority.
3. Calls `hasCollectionUpdateAuthority(walletAddress, collection)`.
4. Returns a structured result telling the UI whether the connected wallet can mint into that collection.

### Authority badge

The collection panel shows:

- the selected collection address
- the resolved collection authority
- the connected wallet
- a status badge: `Standalone Mint`, `Checking`, `Authorized`, or `Blocked`

This is there to prevent opaque transaction failures.

### Why collection minting can fail

In Metaplex Core, creating an asset inside a collection requires the signer to be the collection's:

- update authority, or
- update delegate

If the selected collection is controlled by another wallet, `createV1` will fail with a Core error such as:

- `0x1a`
- `NoApprovals`
- `Neither the asset or any plugins have approved this operation`

The current UI now catches this before minting whenever possible.

### Standalone mint fallback

If the collection is not usable by the current wallet, the user can clear the collection field and mint a standalone Core asset instead.

## Collection Creation Flow

If no collection is selected, the form allows creating one with `handleCreateCollection()`.

That flow does this:

1. Create a Umi client using the current RPC endpoint.
2. Build collection metadata JSON.
3. Upload collection metadata via Irys.
4. Validate the returned metadata URI against the 200-byte limit.
5. Generate a new signer for the collection asset.
6. Call `createCollectionV1()` with a royalties plugin.
7. Put the new collection address back into the form.

Current collection settings:

- name: `Artifacte`
- symbol: `ARTF`
- royalties basis points: `200`

## Off-Chain Metadata Generation

The off-chain metadata is built by `generateMetadata()` in [app/admin/mint/content.tsx](app/admin/mint/content.tsx), which delegates final JSON shaping to `buildMetaplexCompatibleMetadata()` in [lib/nft-metadata.ts](lib/nft-metadata.ts).

### Metadata structure

The JSON includes:

- `name`
- `symbol`
- `description`
- `image`
- `external_url`
- `seller_fee_basis_points`
- `attributes`
- `properties.category`
- `properties.files`
- `properties.creators`

### Attribute population

For cards, attributes include fields like:

- Type
- TCG
- Card Name
- Set
- Card Number
- Year
- Language
- Variant
- Condition
- grading fields when applicable

For sealed products, attributes include:

- Type
- Product Name
- Set
- Year
- Language
- TCG

If a price source is selected, these are appended:

- Price Source
- Price Source ID

## Image Upload Flow

The mint requires a front image.

The UI uploads the front image first using the Irys uploader attached to Umi.

Steps:

1. Read the selected file into an ArrayBuffer.
2. Convert it into an upload payload.
3. Upload it via `umi.uploader.upload()`.
4. Validate that the returned image URI is a usable HTTP URL.

If image upload fails, minting stops immediately.

## Metadata Upload Flow

After the image upload succeeds:

1. The image URI is injected into the metadata JSON.
2. The JSON is serialized and measured in bytes.
3. The UI rejects metadata larger than 50 KB.
4. The metadata JSON is uploaded with `umi.uploader.uploadJson()`.
5. The returned metadata URI is validated against the 200-byte limit.

Only after all of that succeeds does the app proceed to the on-chain mint instruction.

## On-Chain Mint Transaction

The actual mint happens in `handleMint()` in [app/admin/mint/content.tsx](app/admin/mint/content.tsx).

### What gets sent to Core

The code builds a `createArgs` object containing:

- `asset`: a generated signer for the new asset
- `name`: the canonical 32-byte-safe name
- `uri`: the uploaded metadata URI
- `owner`: the recipient wallet or the connected wallet
- `plugins`: royalties plugin
- `collection`: only if the selected collection passed authorization checks

### Royalties plugin

The asset currently uses a royalties plugin configured with:

- `basisPoints: 200`
- one creator at 100%
- `ruleSet("None")`

### Recipient behavior

If a recipient wallet is supplied, that wallet becomes the owner of the new Core asset.

If no recipient is supplied, ownership defaults to the connected wallet identity.

## Error Handling

The mint flow explicitly handles a few classes of failure.

### Input validation failures

Examples:

- invalid recipient address
- name too large in UTF-8 bytes
- symbol too large in UTF-8 bytes
- missing front image
- metadata too large
- metadata URI too large

### Collection authority failures

If the transaction fails with the Core `NoApprovals` pattern, the UI converts the low-level program error into a clearer explanation that the selected collection rejected the mint.

### `SendTransactionError`

If the wallet adapter throws `SendTransactionError`, the code tries to fetch logs using `getLogs(connection)` and appends the latest logs to the error output shown in the admin panel.

This makes debugging much easier than relying on the raw RPC error string alone.

## Common Failure Modes

### 1. Connected wallet is admin, but collection mint still fails

Cause:

- Admin access and collection authority are separate permissions.

Effect:

- The admin page opens normally.
- The mint can still fail if the collection belongs to another authority.

Fix:

- Clear the collection field and mint standalone.
- Or switch to the collection authority wallet.
- Or use a collection where the connected wallet is update authority or update delegate.

### 2. Name appears short enough, but mint fails

Cause:

- UTF-8 byte length, not visible character count, controls the limit.

Fix:

- Use the displayed on-chain name in the form as the source of truth.

### 3. Metadata upload succeeds, but on-chain mint fails

Possible causes:

- collection authority mismatch
- wallet signing issue
- RPC simulation failure
- Core plugin or authority restrictions

### 4. Collection shows as set, but not actually usable

The current UI now distinguishes:

- selected collection present
- collection authorized for the connected wallet

This is why the badge and authority text exist.

## Practical Sequence For A Successful Mint

This is the real success path in order:

1. Connect an admin wallet.
2. Open the admin mint tab.
3. Confirm the collection badge is either:
   - `Authorized`, or
   - clear the collection so it becomes `Standalone Mint`.
4. Fill out the card or sealed product form.
5. Confirm the generated on-chain name fits within 32 bytes.
6. Add a valid recipient wallet.
7. Upload a front image.
8. Click `Mint NFT`.
9. Wait for:
   - image upload
   - metadata upload
   - Core transaction confirmation
10. Use the returned asset address, metadata URI, image URI, and transaction signature for downstream workflows.

## Files Involved

Main implementation files:

- [app/admin/mint/content.tsx](app/admin/mint/content.tsx)
- [lib/nft-metadata.ts](lib/nft-metadata.ts)
- [lib/admin.ts](lib/admin.ts)
- [app/api/rpc/route.ts](app/api/rpc/route.ts)

Supporting documentation:

- [docs/METADATA_STANDARD.md](docs/METADATA_STANDARD.md)

## Important Current Constraints

The current admin mint flow should be understood with these exact assumptions:

- It mints **Metaplex Core** assets.
- It uses **mainnet-backed RPC** through `/api/rpc`.
- It uploads media and metadata using **Irys**.
- It enforces **UTF-8 byte limits** for name, symbol, and URI.
- It does **not** bypass collection authority checks.
- It can mint standalone if the selected collection is not usable by the current wallet.

## If You Want To Change This Flow Later

The most common future improvements would be:

1. Add explicit disablement of the mint button when collection state is `Blocked`.
2. Add automated tests for the name-shortening helper.
3. Add explicit support for update delegates so multiple admin wallets can mint into the same shared collection cleanly.
4. Persist mint receipts and asset addresses into a more structured admin backend.
