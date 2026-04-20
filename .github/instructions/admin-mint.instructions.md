---
description: "Use when changing the admin mint flow, Metaplex Core metadata generation, collection validation, or admin-side NFT submission storage. Covers byte limits, collection authority checks, and current Core-only assumptions."
applyTo:
  - "app/admin/mint/**"
  - "app/api/submissions/route.ts"
  - "lib/nft-metadata.ts"
  - "lib/admin.ts"
  - "docs/ADMIN_MINT_PROCESS.md"
  - "docs/METADATA_STANDARD.md"
---
# Admin Mint Guidance

- Treat the admin mint path as Metaplex Core only. Do not apply Token Metadata or pNFT assumptions unless the task explicitly targets a legacy listing or buy flow outside the admin dashboard.
- Use `../../app/admin/mint/content.tsx` and `../../lib/nft-metadata.ts` as the implementation source of truth. The detailed walkthrough lives in [../../docs/ADMIN_MINT_PROCESS.md](../../docs/ADMIN_MINT_PROCESS.md).
- Preserve the current UTF-8 byte limits enforced by code: name <= 32 bytes, symbol <= 10 bytes, uri <= 200 bytes. If you change metadata behavior, update the helper constants and the docs together.
- Keep the current upload order: image upload first, metadata JSON upload second, on-chain Core `createV1` call last. Do not reintroduce inline image payloads or bypass the metadata helpers.
- Separate admin UI access from collection authority. A wallet can be allowed into the admin UI and still be blocked from minting into a collection it does not control. Preserve the collection authority validation flow and the standalone-mint fallback.
- When docs and code diverge, keep the code aligned with `../../app/admin/mint/content.tsx` and `../../lib/nft-metadata.ts`, then update the linked docs if the task requires documentation changes.
