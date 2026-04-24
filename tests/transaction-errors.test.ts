import assert from "node:assert";

import { isTransactionRequestRejected } from "../lib/client/transaction-errors.ts";

describe("isTransactionRequestRejected", () => {
  it("does not treat an empty WalletSendTransactionError as a user rejection", () => {
    const error = { name: "WalletSendTransactionError" };

    assert.equal(isTransactionRequestRejected(error), false);
  });

  it("treats an empty WalletSignTransactionError as a user rejection", () => {
    const error = { name: "WalletSignTransactionError" };

    assert.equal(isTransactionRequestRejected(error), true);
  });

  it("treats explicit rejection messages as a user rejection", () => {
    const error = new Error("User rejected the request");

    assert.equal(isTransactionRequestRejected(error), true);
  });

  it("treats code 4001 as a user rejection", () => {
    const error = { code: 4001 };

    assert.equal(isTransactionRequestRejected(error), true);
  });
});