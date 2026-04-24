import assert from "node:assert";

import { shouldUseTensorWalletSendTransaction } from "../lib/tensor-buy-strategy.ts";

describe("shouldUseTensorWalletSendTransaction", () => {
  it("uses wallet sendTransaction for Solflare away from localhost", () => {
    assert.equal(shouldUseTensorWalletSendTransaction("Solflare", "artifacte.com"), true);
  });

  it("skips wallet sendTransaction for Solflare on localhost", () => {
    assert.equal(shouldUseTensorWalletSendTransaction("Solflare", "localhost"), false);
    assert.equal(shouldUseTensorWalletSendTransaction("Solflare", "127.0.0.1"), false);
    assert.equal(shouldUseTensorWalletSendTransaction("Solflare", "::1"), false);
  });

  it("skips wallet sendTransaction for non-Solflare wallets", () => {
    assert.equal(shouldUseTensorWalletSendTransaction("Phantom", "artifacte.com"), false);
  });
});