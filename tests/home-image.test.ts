import assert from "node:assert";

import { resolveHomeImageSrc } from "../lib/home-image.ts";

describe("resolveHomeImageSrc", () => {
  it("keeps direct gateway.irys.xyz URLs instead of proxying them", () => {
    assert.equal(
      resolveHomeImageSrc("https://gateway.irys.xyz/example-image"),
      "https://gateway.irys.xyz/example-image"
    );
  });

  it("keeps direct arweave image URLs instead of proxying them", () => {
    assert.equal(
      resolveHomeImageSrc("https://arweave.net/example.png"),
      "https://arweave.net/example.png"
    );
  });

  it("preserves local image paths", () => {
    assert.equal(resolveHomeImageSrc("/placeholder.png"), "/placeholder.png");
  });
});