# Auction Program — Upgrade Instructions

This document explains how to upgrade the on-chain `auction` program with the
new Metaplex Core listing instructions (`list_core_item`,
`cancel_core_listing`, `buy_now_core`) and how to run the test suite.

---

## 0. Pre-flight

| Item | Value |
| --- | --- |
| Program id (mainnet) | `81s1tEx4MPdVvqS6X84Mok5K4N5fMbRLzcsT5eo2K8J3` |
| Upgrade authority | `H3s3zhbcDNrLgPbUQFZYvRd9xy58nVNRC3vdg1hK1KPt` |
| Owner wallet (mint + list authority) | `DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX` |
| Treasury (fees + royalty receiver) | `82v8xATLqdvq3cS1CXwpygVUH926QKdAd4NVxD91r4a6` |
| Artifacte Core collection | `jzkJTGAuDcWthM91S1ch7wPcfMUQB5CdYH6hA25K4CS` |

### SOL cost (mainnet)

Computed against the current build (`target/deploy/auction.so` = **768,352 bytes**) and the live ProgramData account (`94TM4XutzWNCU3P7sr2vSvGTFYvbM8m7S453DdJZoC6B`, currently 577,928 bytes / 4.02 SOL):

| Item | SOL | Notes |
| --- | --- | --- |
| Buffer account rent (one-time) | **~5.35** | Refunded after a successful upgrade, or recoverable via `solana program close --buffers` if the upgrade aborts |
| ProgramData growth (768,352 − 577,928 = 190,424 B extra) | **~1.33** | Permanent — locked in the existing ProgramData account |
| Tx fees | ~0.0001 | Negligible |
| **Hold in upgrade-authority wallet** | **~6.7** | Recommended balance before starting |
| **Net SOL actually spent** | **~1.33** | Everything else returns to your wallet |

Recompute at any time:

```bash
SO_BYTES=$(stat -c%s target/deploy/auction.so)
solana rent $((SO_BYTES + 45)) -u m   # buffer rent
solana program show 81s1tEx4MPdVvqS6X84Mok5K4N5fMbRLzcsT5eo2K8J3 -u m   # current size + balance
```

Devnet is free — always rehearse there first.

⚠️ The `Cargo.lock` file is intentionally pinned (`blake3 1.5.5`,
`rmp 0.8.14`, `rmp-serde 1.3.0`) to work around a `cargo build-sbf`
edition2024 bug. **Do not run `cargo update` before building.**

---

## 1. Build the program

```bash
# from repo root
anchor build
```

This produces:

- `target/deploy/auction.so`            — deployable program binary
- `target/idl/auction.json`             — IDL (already mirrored to
  `lib/auction-idl.json` and `lib/auction-idl.ts`)

Verify the binary exists and is the new version:

```bash
ls -lh target/deploy/auction.so
sha256sum target/deploy/auction.so
```

---

## 2. (Recommended) Test on devnet first

```bash
# Switch CLI to devnet
solana config set -u https://api.devnet.solana.com

# Make sure your upgrade-authority wallet has ≥ 6 SOL on devnet
solana airdrop 2  # repeat as needed
solana balance

# Deploy/upgrade against devnet
anchor upgrade target/deploy/auction.so \
  --program-id 81s1tEx4MPdVvqS6X84Mok5K4N5fMbRLzcsT5eo2K8J3 \
  --provider.cluster devnet \
  --provider.wallet ~/.config/solana/id.json
```

Smoke-test devnet:

1. As `DDSpv...`: mint a Core asset to the Artifacte collection.
2. Call `list_core_item(25_000_000)` (= 25 USDC).
3. From a separate wallet: call `buy_now_core`.
4. Verify on a Solana explorer:
   - asset owner → buyer
   - treasury USDC ATA → +0.625 (2.5% platform fee) +0.50 (2% royalty)
   - seller USDC ATA → +23.875
   - `core_listing` PDA closed; rent refunded to seller

---

## 3. Upgrade mainnet

```bash
solana config set -u https://api.mainnet-beta.solana.com

# Confirm the upgrade authority is the wallet you control
solana program show 81s1tEx4MPdVvqS6X84Mok5K4N5fMbRLzcsT5eo2K8J3
# expected: "Authority: H3s3zhbcDNrLgPbUQFZYvRd9xy58nVNRC3vdg1hK1KPt"

# Upgrade
anchor upgrade target/deploy/auction.so \
  --program-id 81s1tEx4MPdVvqS6X84Mok5K4N5fMbRLzcsT5eo2K8J3 \
  --provider.cluster mainnet \
  --provider.wallet ~/.config/solana/id.json
```

If the deploy fails partway (network blip, etc.), re-run with the buffer
account that the CLI prints:

```bash
solana program deploy --buffer <BUFFER_PUBKEY> \
  --program-id 81s1tEx4MPdVvqS6X84Mok5K4N5fMbRLzcsT5eo2K8J3 \
  target/deploy/auction.so
```

You can recover unused buffer rent at any time:

```bash
solana program close --buffers
```

---

## 4. Treasury rotation (one-time, only if not already set)

After the first deploy of the new program, set the on-chain treasury config
to the rotated treasury wallet:

```bash
# If TreasuryConfig PDA does not yet exist (fresh program):
#   call program.methods.initializeTreasury()...
#
# If it exists (this program already had a treasury):
#   call program.methods.updateTreasury(new PublicKey("82v8xATLqdvq3cS1CXwpygVUH926QKdAd4NVxD91r4a6"))
```

Helper script: `scripts/init-treasury.mjs` (already in repo).

The TS client also has a hard-coded fallback to
`82v8xATLqdvq3cS1CXwpygVUH926QKdAd4NVxD91r4a6` when the
`treasury_config` account is missing, so the front-end will keep working
even if you delay this step.

---

## 5. Run the test suite

The integration tests live in [tests/auction-core.test.ts](tests/auction-core.test.ts).
They run against a local validator, **not mainnet**, so they cost no SOL.

One-time setup (test runner is not yet installed):

```bash
pnpm add -D mocha chai @types/mocha @types/chai ts-mocha \
            @metaplex-foundation/mpl-core \
            @metaplex-foundation/umi-bundle-defaults
```

Add this section to [Anchor.toml](Anchor.toml):

```toml
[scripts]
test = "pnpm ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.test.ts"
```

Then:

```bash
anchor test
```

Anchor will:
1. Spin up a local `solana-test-validator`
2. Deploy the freshly built `auction.so` to it
3. Run the mocha tests in `tests/`

Tests covered:

- `list_core_item` rejects sellers other than `OWNER_WALLET`
- `list_core_item` rejects non-USDC payment mints
- PDA derivation (`core_listing`, `core_authority`) matches on-chain seeds
- End-to-end mint → list → buy → split (skipped by default; enable with
  `METAPLEX_CORE_E2E=1` once the Artifacte collection is replicated on
  the local validator)

---

## 6. Front-end deploy

After the program upgrade succeeds, redeploy the Next.js app so users
pick up the new client wiring (`buy_now_core` auto-routing, owner-gated
Core listing flow, Core listings in `/my-listings`):

```bash
pnpm build
# then push to your hosting (Vercel, etc.)
```

No env vars or feature flags need to change — the client already
auto-detects which buy path to take by probing the `core_listing` PDA.

---

## 7. Rollback

The previous program binary is preserved by the BPF loader as long as
you keep its hash. If a critical regression is found:

```bash
anchor upgrade target/deploy/auction-prev.so \
  --program-id 81s1tEx4MPdVvqS6X84Mok5K4N5fMbRLzcsT5eo2K8J3 \
  --provider.cluster mainnet
```

(Save the previous `.so` artifact before upgrading — re-build from the
prior git commit if needed.)
