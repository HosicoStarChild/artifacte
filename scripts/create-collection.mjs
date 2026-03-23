#!/usr/bin/env node
/**
 * One-time script: Create the Artifacte collection on Metaplex Core
 * Run from admin wallet (DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX)
 * 
 * This creates a collection NFT that all future Artifacte mints will belong to.
 * The collection address needs to be saved and used in the mint form.
 */

import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { keypairIdentity, generateSigner } from "@metaplex-foundation/umi";
import { createCollectionV1, pluginAuthorityPair, ruleSet } from "@metaplex-foundation/mpl-core";
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys";
import fs from "fs";
import path from "path";

const RPC = "https://mainnet.helius-rpc.com/?api-key=345726df-3822-42c1-86e0-1a13dc6c7a04";

// Load admin keypair
const keypairPath = path.join(process.env.HOME, ".config/solana/id.json");
if (!fs.existsSync(keypairPath)) {
  console.error("No keypair found at", keypairPath);
  console.error("Set up with: solana-keygen new or solana config set --keypair <path>");
  process.exit(1);
}

const secretKey = new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, "utf8")));

const umi = createUmi(RPC)
  .use(irysUploader());

// Set identity from keypair
const kp = umi.eddsa.createKeypairFromSecretKey(secretKey);
umi.use(keypairIdentity(kp));

console.log("Admin wallet:", kp.publicKey);

// Collection metadata
const metadata = {
  name: "Artifacte",
  symbol: "ARTF",
  description: "Artifacte — RWA tokenized collectibles on Solana. Trading cards, sealed products, and more. Each NFT represents an authenticated physical item with full provenance tracking.",
  image: "", // Will be uploaded
  external_url: "https://artifacte.io",
  properties: {
    category: "Collectibles",
    creators: [{ address: kp.publicKey.toString(), share: 100 }],
  },
};

async function main() {
  // Upload collection image (use Hosico Labs logo for now)
  const logoPath = path.join(process.cwd(), "public/hosico-labs.jpg");
  if (fs.existsSync(logoPath)) {
    console.log("Uploading collection image...");
    const imgBuffer = fs.readFileSync(logoPath);
    const [imgUri] = await umi.uploader.upload([{
      buffer: imgBuffer,
      fileName: "artifacte-collection.jpg",
      displayName: "Artifacte Collection",
      uniqueName: "artifacte-collection-v1",
      contentType: "image/jpeg",
      extension: "jpg",
      tags: [],
    }]);
    metadata.image = imgUri;
    console.log("Image URI:", imgUri);
  }

  // Upload metadata
  console.log("Uploading collection metadata...");
  const metadataUri = await umi.uploader.uploadJson(metadata);
  console.log("Metadata URI:", metadataUri);

  // Create collection
  console.log("Creating collection on-chain...");
  const collection = generateSigner(umi);
  
  await createCollectionV1(umi, {
    collection,
    name: "Artifacte",
    uri: metadataUri,
    plugins: [
      pluginAuthorityPair({
        type: "Royalties",
        data: {
          basisPoints: 500, // 5%
          creators: [{ address: umi.identity.publicKey, percentage: 100 }],
          ruleSet: ruleSet("None"),
        },
      }),
    ],
  }).sendAndConfirm(umi);

  console.log("\n✅ Collection created!");
  console.log("Collection Address:", collection.publicKey);
  console.log("\nSave this address — it goes in the mint form as the collection parameter.");
  console.log("Add to lib/data.ts: export const ARTIFACTE_COLLECTION = \"" + collection.publicKey + "\";");
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
