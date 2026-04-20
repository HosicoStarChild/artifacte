---
description: "Use when changing Anchor programs, Solana transaction builders, program clients, on-chain tests, or upgrade scripts. Covers the current Artifacte program layout, test entrypoints, cluster assumptions, and upgrade-specific cautions."
applyTo:
  - "programs/**"
  - "tests/**"
  - "Anchor.toml"
  - "lib/auction-program.ts"
  - "lib/auction-idl.ts"
  - "lib/auction-idl.json"
  - "scripts/**"
---
# Solana Runtime Guidance

- Treat `../../Anchor.toml`, `../../programs/auction/src/lib.rs`, `../../lib/auction-program.ts`, and the current tests as the source of truth for build, test, and runtime behavior. Older build-summary docs in the repo can be stale.
- The active test entrypoint is `anchor test`, which shells out through the script in `../../Anchor.toml` and runs the TypeScript tests under `../../tests/`.
- Read [../../docs/UPGRADE_INSTRUCTIONS.md](../../docs/UPGRADE_INSTRUCTIONS.md) before changing deployment, upgrade, treasury, or release logic. It includes the current program IDs, upgrade flow, and the warning not to run `cargo update` casually before building.
- Keep the current program-client split intact unless the task explicitly restructures it: Rust program code in `../../programs/auction/`, TypeScript client and IDL consumers under `../../lib/`, integration tests under `../../tests/`.
- Verify cluster and RPC assumptions before changing them. `Anchor.toml` and the server proxies currently assume mainnet-backed runtime paths in many places, even though older docs still mention devnet-first flows.
- If a Solana task also touches oracle or marketplace networking, preserve the server-routed patterns in `../../app/api/rpc/route.ts`, `../../app/api/helius-das/route.ts`, and `../../lib/server/oracle-env.ts` instead of hardcoding direct client endpoints.