# Artifacte Claude Guide

This file mirrors the repo-wide guidance in `AGENTS.md` for Claude-compatible tooling. Keep both files aligned when repo-wide agent instructions change.

## Working Rules

- Treat current code and config as the source of truth. If markdown docs disagree with runtime behavior, trust `package.json`, `Anchor.toml`, `app/api/**`, `lib/server/oracle-env.ts`, and the current TypeScript or Rust implementation.
- Keep changes scoped. This repo contains both current production paths and older experimental docs; do not rewrite old docs unless the task explicitly requires it.

## Build And Test

- Use `pnpm install` at the repo root. The root project uses `pnpm-lock.yaml`, and `Anchor.toml` shells out through `pnpm exec`.
- Use `pnpm dev` for local Next.js development and `pnpm build` for the closest thing to a full frontend validation pass.
- Use `anchor test` for on-chain and integration tests. The active test command is defined in `Anchor.toml` and runs the TypeScript tests under `tests/`.
- The `sync-engine/` folder is a separate Node project with its own `package.json`; work there independently when a task is limited to the eBay sync service.

## Architecture

- `app/` is the Next.js App Router application. `app/layout.tsx` wires the global shell, and `components/WalletProvider.tsx` owns the wallet connection pattern.
- Client wallet and NFT flows should go through server proxies. Preserve the Helius RPC and DAS proxy pattern in `app/api/rpc/route.ts` and `app/api/helius-das/route.ts`; do not expose API keys in client code.
- The on-chain auction program lives in `programs/auction/`. The main TypeScript client is `lib/auction-program.ts`, and the closest end-to-end tests live in `tests/auction-core.test.ts`.
- Admin and marketplace state is partly file-backed. JSON under `data/` is mutated through API routes such as `app/api/admin/**`, `app/api/applications/route.ts`, and `app/api/submissions/route.ts`.
- Oracle and external pricing calls should resolve through `lib/server/oracle-env.ts`, not hardcoded environment-specific URLs in feature code.

## Repo-Specific Conventions

- The admin mint flow is Metaplex Core, not Token Metadata or pNFT. See [docs/ADMIN_MINT_PROCESS.md](docs/ADMIN_MINT_PROCESS.md) and [docs/METADATA_STANDARD.md](docs/METADATA_STANDARD.md) before changing admin mint behavior.
- Listing and buy flows are intentionally split across Artifacte native listings, Metaplex Core listings, Magic Eden, Tensor, and external feeds. Do not infer routing from currency alone; use the current logic in `app/list/page.tsx`, `app/api/me-buy/route.ts`, `lib/tensor-buy-client.ts`, and `lib/auction-program.ts`.
- Preserve method whitelists and rate limits in `app/api/rpc/route.ts`, `app/api/helius-das/route.ts`, and related server proxies unless the task explicitly expands them.
- Before changing Solana build, test, or upgrade behavior, read [docs/UPGRADE_INSTRUCTIONS.md](docs/UPGRADE_INSTRUCTIONS.md). It includes the current upgrade flow and the explicit warning not to run `cargo update` blindly before building.