---
description: "Use when changing listing pages, buy flows, marketplace transaction builders, or routing between Artifacte native listings, Metaplex Core listings, Magic Eden, Tensor, and external marketplace feeds. Covers the routing rules that are easy to break."
applyTo:
  - "app/list/**"
  - "app/my-listings/**"
  - "app/digital-art/**"
  - "app/api/me-buy/route.ts"
  - "app/api/digital-art/**"
  - "components/HomeTCGSection.tsx"
  - "lib/auction-program.ts"
  - "lib/tensor-buy-client.ts"
  - "lib/m2-buy.ts"
---
# Marketplace Routing Guidance

- Preserve the current split between Artifacte native listings, Artifacte Core listings, Magic Eden flows, Tensor flows, and external data feeds. Do not collapse them into a single route unless the task explicitly redesigns that behavior.
- Do not infer routing from `currency === "USDC"` alone. Collector Crypt cards can still route through the internal Magic Eden buy flow, while Tensor and explicit external listings stay on their own paths.
- Treat Artifacte Core assets as a separate fixed-price path. They are not standard SPL or Token-2022 escrow listings, and they should keep using the dedicated Core listing and buy logic in `../../app/list/page.tsx` and `../../lib/auction-program.ts`.
- Preserve server-side ownership checks, fee injection, and transaction-shape validation in `../../app/api/me-buy/route.ts` and related builders. These are part of the marketplace safety model, not optional refactors.
- In wallet UX code, a user rejection is terminal. Do not fall back to a second signing flow after a rejection, especially in `../../lib/tensor-buy-client.ts`.
- If you need broader context before changing behavior, start with `../../app/list/page.tsx`, `../../app/api/me-buy/route.ts`, `../../lib/tensor-buy-client.ts`, and `../../lib/auction-program.ts`.
