#!/usr/bin/env node
// End-to-end on-chain test: Initialize → Mint NFT → List → Buy
import pkg from "@coral-xyz/anchor";
const { AnchorProvider, Program, Wallet } = pkg;
import BN from "bn.js";
import { Connection, Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createMint, mintTo, getOrCreateAssociatedTokenAccount, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import fs from "fs";

const RPC = "https://api.devnet.solana.com";
const connection = new Connection(RPC, "confirmed");

// Load keypair
const rawKey = JSON.parse(fs.readFileSync(process.env.HOME + "/.config/solana/id.json", "utf-8"));
const authority = Keypair.fromSecretKey(Uint8Array.from(rawKey));
console.log("Authority:", authority.publicKey.toBase58());
console.log("Balance:", (await connection.getBalance(authority.publicKey)) / LAMPORTS_PER_SOL, "SOL\n");

const RWA_PROGRAM_ID = new PublicKey("3F9p3LxwVzPVgzJZQ59dxxBwQiobhtXdokr8iF7ZETSH");
const AUCTION_PROGRAM_ID = new PublicKey("9KfPTwprxB5teuPGCbVjwJtFcLJhiLZhJEC8hcLH3SkL");
const TREASURY = new PublicKey("DDSpvAK8DbuAdEaaBHkfLieLPSJVCWWgquFAA3pvxXoX");

// Load IDLs
const rwaIdl = JSON.parse(fs.readFileSync("./target/idl/rwa_nft.json", "utf-8"));
const auctionIdl = JSON.parse(fs.readFileSync("./target/idl/auction.json", "utf-8"));

const wallet = new Wallet(authority);
const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });

// Set address in IDLs
rwaIdl.address = RWA_PROGRAM_ID.toBase58();
auctionIdl.address = AUCTION_PROGRAM_ID.toBase58();

const rwaProgram = new Program(rwaIdl, provider);
const auctionProgram = new Program(auctionIdl, provider);

async function test() {
  // Step 1: Check if platform config exists, if not initialize
  const [platformConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("platform")],
    RWA_PROGRAM_ID
  );
  
  let configExists = false;
  try {
    const acct = await connection.getAccountInfo(platformConfig);
    configExists = acct !== null;
  } catch (e) {}

  if (!configExists) {
    console.log("1️⃣ Initializing RWA platform...");
    try {
      const tx = await rwaProgram.methods
        .initialize(TREASURY, 250) // 2.5% fee
        .accounts({
          platformConfig,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log("   ✅ Platform initialized:", tx);
    } catch (e) {
      console.log("   ⚠️ Already initialized or error:", e.message?.slice(0, 100));
    }
  } else {
    console.log("1️⃣ Platform config already exists ✅");
  }

  // Step 2: Create a test NFT mint
  console.log("\n2️⃣ Creating test NFT mint...");
  const nftMint = await createMint(
    connection,
    authority,
    authority.publicKey,
    null,
    0 // 0 decimals for NFT
  );
  console.log("   NFT Mint:", nftMint.toBase58());

  // Mint 1 NFT to authority
  const authorityNftAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    authority,
    nftMint,
    authority.publicKey
  );
  await mintTo(connection, authority, nftMint, authorityNftAccount.address, authority, 1);
  console.log("   ✅ Minted 1 NFT to:", authorityNftAccount.address.toBase58());

  // Step 3: Mint RWA metadata
  console.log("\n3️⃣ Minting RWA metadata...");
  const [rwaMetadata] = PublicKey.findProgramAddressSync(
    [Buffer.from("rwa"), nftMint.toBuffer()],
    RWA_PROGRAM_ID
  );

  try {
    const tx = await rwaProgram.methods
      .mintRwaNft(
        "Test Zoro Alt Art OP05-119",
        { tcgCards: {} },
        "https://arweave.net/test-uri",
        new BN(642_000000), // $642 in 6 decimals
        "PSA 10"
      )
      .accounts({
        platformConfig,
        rwaMetadata,
        mint: nftMint,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("   ✅ RWA metadata created:", tx);
  } catch (e) {
    console.error("   ❌ RWA mint failed:", e.message?.slice(0, 200));
  }

  // Step 4: Initialize auction platform config if needed
  const [auctionConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("platform")],
    AUCTION_PROGRAM_ID
  );

  let auctionConfigExists = false;
  try {
    const acct = await connection.getAccountInfo(auctionConfig);
    auctionConfigExists = acct !== null;
  } catch (e) {}

  if (!auctionConfigExists) {
    console.log("\n4️⃣ Initializing auction platform...");
    try {
      // Check if auction program has initialize instruction
      const methods = Object.keys(auctionProgram.methods);
      console.log("   Available methods:", methods.join(", "));
      
      if (methods.includes("initialize")) {
        const tx = await auctionProgram.methods
          .initialize(TREASURY, 250)
          .accounts({
            platformConfig: auctionConfig,
            authority: authority.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        console.log("   ✅ Auction platform initialized:", tx);
      }
    } catch (e) {
      console.log("   ⚠️ Error:", e.message?.slice(0, 200));
    }
  } else {
    console.log("\n4️⃣ Auction platform config already exists ✅");
  }

  // Step 5: List the NFT for fixed price (Digital Art = SOL)
  console.log("\n5️⃣ Listing NFT for sale (fixed price, Digital Art category = SOL)...");
  const [listing] = PublicKey.findProgramAddressSync(
    [Buffer.from("listing"), nftMint.toBuffer()],
    AUCTION_PROGRAM_ID
  );
  const [escrowNft] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow_nft"), nftMint.toBuffer()],
    AUCTION_PROGRAM_ID
  );

  try {
    const methods = Object.keys(auctionProgram.methods);
    console.log("   Auction methods:", methods.join(", "));
    
    const tx = await auctionProgram.methods
      .listItem(
        { fixedPrice: {} },
        new BN(1 * LAMPORTS_PER_SOL), // 1 SOL
        null, // no duration for fixed price
        { digitalArt: {} } // Digital Art = SOL allowed
      )
      .accounts({
        listing,
        nftMint,
        paymentMint: new PublicKey("So11111111111111111111111111111111111111112"), // SOL wrapped
        escrowNft,
        sellerNftAccount: authorityNftAccount.address,
        seller: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("   ✅ Listed successfully:", tx);
  } catch (e) {
    console.error("   ❌ Listing failed:", e.message?.slice(0, 300));
    if (e.logs) console.error("   Logs:", e.logs.slice(-5).join("\n   "));
  }

  // Step 6: Fetch listing to verify
  console.log("\n6️⃣ Fetching listing from chain...");
  try {
    const listingAccount = await auctionProgram.account.listing.fetch(listing);
    console.log("   ✅ Listing found!");
    console.log("   Seller:", listingAccount.seller?.toBase58());
    console.log("   Price:", listingAccount.price?.toString());
    console.log("   NFT Mint:", listingAccount.nftMint?.toBase58());
  } catch (e) {
    console.log("   ❌ Could not fetch listing:", e.message?.slice(0, 100));
  }

  console.log("\n✅ Test complete!");
}

test().catch(console.error);
