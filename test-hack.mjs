#!/usr/bin/env node
// ADVERSARIAL SECURITY TESTS — Try to break the auction program
import pkg from "@coral-xyz/anchor";
const { AnchorProvider, Program, Wallet } = pkg;
import BN from "bn.js";
import { Connection, Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createMint, mintTo, getOrCreateAssociatedTokenAccount, TOKEN_PROGRAM_ID, createAccount, getAccount } from "@solana/spl-token";
import fs from "fs";

const RPC = "https://api.devnet.solana.com";
const connection = new Connection(RPC, "confirmed");

const rawKey = JSON.parse(fs.readFileSync(process.env.HOME + "/.config/solana/id.json", "utf-8"));
const authority = Keypair.fromSecretKey(Uint8Array.from(rawKey));

// Create an attacker keypair
const attacker = Keypair.generate();

const RWA_PROGRAM_ID = new PublicKey("3F9p3LxwVzPVgzJZQ59dxxBwQiobhtXdokr8iF7ZETSH");
const AUCTION_PROGRAM_ID = new PublicKey("9KfPTwprxB5teuPGCbVjwJtFcLJhiLZhJEC8hcLH3SkL");
const TREASURY = new PublicKey("82v8xATLqdvq3cS1CXwpygVUH926QKdAd4NVxD91r4a6");

const rwaIdl = JSON.parse(fs.readFileSync("./target/idl/rwa_nft.json", "utf-8"));
const auctionIdl = JSON.parse(fs.readFileSync("./target/idl/auction.json", "utf-8"));

rwaIdl.address = RWA_PROGRAM_ID.toBase58();
auctionIdl.address = AUCTION_PROGRAM_ID.toBase58();

const wallet = new Wallet(authority);
const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
const rwaProgram = new Program(rwaIdl, provider);
const auctionProgram = new Program(auctionIdl, provider);

let passed = 0;
let failed = 0;
let vulns = [];

async function expect(name, fn, shouldFail = true) {
  try {
    await fn();
    if (shouldFail) {
      console.log(`   ❌ VULN: ${name} — SHOULD HAVE FAILED but succeeded!`);
      failed++;
      vulns.push(name);
    } else {
      console.log(`   ✅ ${name}`);
      passed++;
    }
  } catch (e) {
    if (shouldFail) {
      console.log(`   ✅ ${name} — correctly rejected: ${e.message?.slice(0, 80)}`);
      passed++;
    } else {
      console.log(`   ❌ FAIL: ${name} — ${e.message?.slice(0, 100)}`);
      failed++;
    }
  }
}

async function setup() {
  // Fund attacker
  console.log("🔧 Setup: funding attacker wallet...");
  const tx = new (await import("@solana/web3.js")).Transaction().add(
    SystemProgram.transfer({
      fromPubkey: authority.publicKey,
      toPubkey: attacker.publicKey,
      lamports: 0.5 * LAMPORTS_PER_SOL,
    })
  );
  await provider.sendAndConfirm(tx);
  console.log("   Attacker:", attacker.publicKey.toBase58());
  console.log("   Attacker balance:", (await connection.getBalance(attacker.publicKey)) / LAMPORTS_PER_SOL, "SOL\n");

  // Create a test NFT and list it
  console.log("🔧 Setup: creating listed NFT...");
  const nftMint = await createMint(connection, authority, authority.publicKey, null, 0);
  const sellerAta = await getOrCreateAssociatedTokenAccount(connection, authority, nftMint, authority.publicKey);
  await mintTo(connection, authority, nftMint, sellerAta.address, authority, 1);

  // List it
  const [listing] = PublicKey.findProgramAddressSync([Buffer.from("listing"), nftMint.toBuffer()], AUCTION_PROGRAM_ID);
  const [escrowNft] = PublicKey.findProgramAddressSync([Buffer.from("escrow_nft"), nftMint.toBuffer()], AUCTION_PROGRAM_ID);
  
  await auctionProgram.methods
    .listItem({ fixedPrice: {} }, new BN(LAMPORTS_PER_SOL), null, { digitalArt: {} }, 500, authority.publicKey)
    .accounts({
      listing, nftMint,
      paymentMint: new PublicKey("So11111111111111111111111111111111111111112"),
      escrowNft, sellerNftAccount: sellerAta.address,
      seller: authority.publicKey, nftTokenProgram: TOKEN_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    }).rpc();

  console.log("   ✅ NFT listed:", nftMint.toBase58(), "\n");
  return { nftMint, sellerAta, listing, escrowNft };
}

async function test() {
  console.log("🔴 ADVERSARIAL SECURITY TESTS\n");
  console.log("=".repeat(60));

  const { nftMint, sellerAta, listing, escrowNft } = await setup();

  // ===== ATTACK 1: Non-authority tries to mint RWA metadata =====
  console.log("\n🗡️ ATTACK 1: Non-authority minting RWA metadata");
  const attackerWallet = new Wallet(attacker);
  const attackerProvider = new AnchorProvider(connection, attackerWallet, { commitment: "confirmed" });
  const attackerRwa = new Program(rwaIdl, attackerProvider);
  
  const fakeMint = await createMint(connection, attacker, attacker.publicKey, null, 0);
  const [fakeMetadata] = PublicKey.findProgramAddressSync([Buffer.from("rwa"), fakeMint.toBuffer()], RWA_PROGRAM_ID);
  const [platformConfig] = PublicKey.findProgramAddressSync([Buffer.from("platform")], RWA_PROGRAM_ID);

  await expect("Non-authority cannot mint RWA metadata", async () => {
    await attackerRwa.methods
      .mintRwaNft("FAKE CARD", { tcgCards: {} }, "https://evil.com", new BN(999999), "PSA 10")
      .accounts({
        platformConfig, rwaMetadata: fakeMetadata, mint: fakeMint,
        authority: attacker.publicKey, systemProgram: SystemProgram.programId,
      }).rpc();
  });

  // ===== ATTACK 2: Cancel someone else's listing =====
  console.log("\n🗡️ ATTACK 2: Attacker cancels someone else's listing");
  const attackerAuction = new Program(auctionIdl, attackerProvider);
  const attackerNftAta = await getOrCreateAssociatedTokenAccount(connection, attacker, nftMint, attacker.publicKey);

  await expect("Attacker cannot cancel other's listing", async () => {
    await attackerAuction.methods
      .cancelListing()
      .accounts({
        listing, escrowNft, sellerNftAccount: attackerNftAta.address,
        seller: attacker.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
      }).rpc();
  });

  // ===== ATTACK 3: Buy with zero SOL (price manipulation) =====
  console.log("\n🗡️ ATTACK 3: Buy Now with wrong/fake accounts");
  // Try to pass attacker as both buyer and get NFT without paying
  await expect("Cannot buy with manipulated accounts", async () => {
    const fakePaymentAccount = Keypair.generate();
    await attackerAuction.methods
      .buyNow()
      .accounts({
        listing, escrowNft,
        buyerPaymentAccount: fakePaymentAccount.publicKey,
        sellerPaymentAccount: fakePaymentAccount.publicKey,
        treasuryPaymentAccount: fakePaymentAccount.publicKey,
        creatorPaymentAccount: fakePaymentAccount.publicKey,
        buyerNftAccount: attackerNftAta.address,
        buyer: attacker.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).rpc();
  });

  // ===== ATTACK 4: Double-list the same NFT =====
  console.log("\n🗡️ ATTACK 4: Double-list the same NFT");
  await expect("Cannot double-list same NFT", async () => {
    await auctionProgram.methods
      .listItem({ fixedPrice: {} }, new BN(LAMPORTS_PER_SOL * 2), null, { digitalArt: {} }, 500, authority.publicKey)
      .accounts({
        listing, nftMint,
        paymentMint: new PublicKey("So11111111111111111111111111111111111111112"),
        escrowNft, sellerNftAccount: sellerAta.address,
        seller: authority.publicKey, nftTokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).rpc();
  });

  // ===== ATTACK 5: List with wrong payment mint =====
  console.log("\n🗡️ ATTACK 5: List Digital Art with USD1 (wrong mint)");
  const nftMint2 = await createMint(connection, authority, authority.publicKey, null, 0);
  const ata2 = await getOrCreateAssociatedTokenAccount(connection, authority, nftMint2, authority.publicKey);
  await mintTo(connection, authority, nftMint2, ata2.address, authority, 1);
  const [listing2] = PublicKey.findProgramAddressSync([Buffer.from("listing"), nftMint2.toBuffer()], AUCTION_PROGRAM_ID);
  const [escrow2] = PublicKey.findProgramAddressSync([Buffer.from("escrow_nft"), nftMint2.toBuffer()], AUCTION_PROGRAM_ID);
  
  await expect("Cannot list Digital Art with USD1", async () => {
    await auctionProgram.methods
      .listItem({ fixedPrice: {} }, new BN(100_000000), null, { digitalArt: {} }, 500, authority.publicKey)
      .accounts({
        listing: listing2, nftMint: nftMint2,
        paymentMint: new PublicKey("USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB"),
        escrowNft: escrow2, sellerNftAccount: ata2.address,
        seller: authority.publicKey, nftTokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).rpc();
  });

  // ===== ATTACK 6: List TCG card with SOL (wrong mint) =====
  console.log("\n🗡️ ATTACK 6: List TCG Cards with SOL (wrong mint)");
  await expect("Cannot list TCG Cards with SOL", async () => {
    await auctionProgram.methods
      .listItem({ fixedPrice: {} }, new BN(LAMPORTS_PER_SOL), null, { tcgCards: {} }, 500, authority.publicKey)
      .accounts({
        listing: listing2, nftMint: nftMint2,
        paymentMint: new PublicKey("So11111111111111111111111111111111111111112"),
        escrowNft: escrow2, sellerNftAccount: ata2.address,
        seller: authority.publicKey, nftTokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).rpc();
  });

  // ===== ATTACK 7: Zero-price listing =====
  console.log("\n🗡️ ATTACK 7: List with zero price");
  await expect("Cannot list with zero price", async () => {
    await auctionProgram.methods
      .listItem({ fixedPrice: {} }, new BN(0), null, { digitalArt: {} }, 500, authority.publicKey)
      .accounts({
        listing: listing2, nftMint: nftMint2,
        paymentMint: new PublicKey("So11111111111111111111111111111111111111112"),
        escrowNft: escrow2, sellerNftAccount: ata2.address,
        seller: authority.publicKey, nftTokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).rpc();
  });

  // ===== ATTACK 8: Settle auction that hasn't ended =====
  console.log("\n🗡️ ATTACK 8: Settle auction before end time");
  // First create an auction listing
  const nftMint3 = await createMint(connection, authority, authority.publicKey, null, 0);
  const ata3 = await getOrCreateAssociatedTokenAccount(connection, authority, nftMint3, authority.publicKey);
  await mintTo(connection, authority, nftMint3, ata3.address, authority, 1);
  const [listing3] = PublicKey.findProgramAddressSync([Buffer.from("listing"), nftMint3.toBuffer()], AUCTION_PROGRAM_ID);
  const [escrow3] = PublicKey.findProgramAddressSync([Buffer.from("escrow_nft"), nftMint3.toBuffer()], AUCTION_PROGRAM_ID);
  
  // List as 1-hour auction
  await auctionProgram.methods
    .listItem({ auction: {} }, new BN(LAMPORTS_PER_SOL), new BN(3600), { digitalArt: {} }, 500, authority.publicKey)
    .accounts({
      listing: listing3, nftMint: nftMint3,
      paymentMint: new PublicKey("So11111111111111111111111111111111111111112"),
      escrowNft: escrow3, sellerNftAccount: ata3.address,
      seller: authority.publicKey, nftTokenProgram: TOKEN_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    }).rpc();

  const [bidEscrow3] = PublicKey.findProgramAddressSync([Buffer.from("bid_escrow"), nftMint3.toBuffer()], AUCTION_PROGRAM_ID);

  await expect("Cannot settle auction before end time", async () => {
    await auctionProgram.methods
      .settleAuction()
      .accounts({
        listing: listing3, bidEscrow: bidEscrow3, escrowNft: escrow3,
        sellerPaymentAccount: authority.publicKey,
        treasuryPaymentAccount: authority.publicKey,
        creatorPaymentAccount: authority.publicKey,
        buyerNftAccount: authority.publicKey,
        sellerNftAccount: ata3.address,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).rpc();
  });

  // ===== ATTACK 9: Bid on a fixed-price listing =====
  console.log("\n🗡️ ATTACK 9: Place bid on fixed-price listing");
  const [bidEscrow] = PublicKey.findProgramAddressSync([Buffer.from("bid_escrow"), nftMint.toBuffer()], AUCTION_PROGRAM_ID);
  
  await expect("Cannot bid on fixed-price listing", async () => {
    await attackerAuction.methods
      .placeBid(new BN(2 * LAMPORTS_PER_SOL))
      .accounts({
        listing, bidEscrow,
        bidderTokenAccount: attackerNftAta.address,
        previousBidderAccount: attacker.publicKey,
        bidder: attacker.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).rpc();
  });

  // ===== ATTACK 10: Overflow/underflow price =====
  console.log("\n🗡️ ATTACK 10: Overflow price (max u64)");
  await expect("Cannot list with overflow price", async () => {
    await auctionProgram.methods
      .listItem({ fixedPrice: {} }, new BN("18446744073709551615"), null, { digitalArt: {} })
      .accounts({
        listing: listing2, nftMint: nftMint2,
        paymentMint: new PublicKey("So11111111111111111111111111111111111111112"),
        escrowNft: escrow2, sellerNftAccount: ata2.address,
        seller: authority.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).rpc();
  });

  // ===== ATTACK 11: Re-initialize platform (overwrite authority) =====
  console.log("\n🗡️ ATTACK 11: Re-initialize platform to steal authority");
  const [auctionConfig] = PublicKey.findProgramAddressSync([Buffer.from("platform")], AUCTION_PROGRAM_ID);
  
  await expect("Cannot re-initialize platform", async () => {
    // Auction program doesn't have initialize — check if we can call RWA's
    await attackerRwa.methods
      .initialize(attacker.publicKey, 10000) // 100% fee to attacker
      .accounts({
        platformConfig, authority: attacker.publicKey,
        systemProgram: SystemProgram.programId,
      }).rpc();
  });

  // ===== ATTACK 12: Negative price bid =====
  console.log("\n🗡️ ATTACK 12: Bid with negative/zero amount on auction");
  await expect("Cannot bid zero on auction", async () => {
    const [bidEscrow3_] = PublicKey.findProgramAddressSync([Buffer.from("bid_escrow"), nftMint3.toBuffer()], AUCTION_PROGRAM_ID);
    const attackerAta3 = await getOrCreateAssociatedTokenAccount(connection, attacker, nftMint3, attacker.publicKey);
    await attackerAuction.methods
      .placeBid(new BN(0))
      .accounts({
        listing: listing3, bidEscrow: bidEscrow3_,
        bidderTokenAccount: attackerAta3.address,
        previousBidderAccount: attacker.publicKey,
        bidder: attacker.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).rpc();
  });

  // ===== ATTACK 13: Buy fixed-price listing for auction NFT =====
  console.log("\n🗡️ ATTACK 13: Buy Now on an auction listing");
  const attackerAta3b = await getOrCreateAssociatedTokenAccount(connection, attacker, nftMint3, attacker.publicKey);
  await expect("Cannot Buy Now on auction listing", async () => {
    await attackerAuction.methods
      .buyNow()
      .accounts({
        listing: listing3, escrowNft: escrow3,
        buyerPaymentAccount: attacker.publicKey,
        sellerPaymentAccount: authority.publicKey,
        treasuryPaymentAccount: authority.publicKey,
        creatorPaymentAccount: authority.publicKey,
        buyerNftAccount: attackerAta3b.address,
        buyer: attacker.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).rpc();
  });

  // ===== ATTACK 14: Cancel auction that has bids =====
  console.log("\n🗡️ ATTACK 14: Cancel auction with active bids");
  // Place a valid bid on the auction first
  const bidderAta3 = await getOrCreateAssociatedTokenAccount(connection, attacker, 
    new PublicKey("So11111111111111111111111111111111111111112"), attacker.publicKey);
  // Fund attacker with wSOL for bidding
  const wrapTx = new (await import("@solana/web3.js")).Transaction().add(
    SystemProgram.transfer({
      fromPubkey: authority.publicKey,
      toPubkey: bidderAta3.address,
      lamports: 2 * LAMPORTS_PER_SOL,
    }),
    (await import("@solana/spl-token")).createSyncNativeInstruction(bidderAta3.address),
  );
  await provider.sendAndConfirm(wrapTx);

  const [bidEscrow3b] = PublicKey.findProgramAddressSync([Buffer.from("bid_escrow"), nftMint3.toBuffer()], AUCTION_PROGRAM_ID);
  // Place bid
  await attackerAuction.methods
    .placeBid(new BN(LAMPORTS_PER_SOL))
    .accounts({
      listing: listing3, bidEscrow: bidEscrow3b,
      paymentMint: new PublicKey("So11111111111111111111111111111111111111112"),
      bidderTokenAccount: bidderAta3.address,
      previousBidderAccount: attacker.publicKey,
      bidder: attacker.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    }).rpc();

  await expect("Cannot cancel auction with active bids", async () => {
    await auctionProgram.methods
      .cancelListing()
      .accounts({
        listing: listing3, nftMint: nftMint3, escrowNft: escrow3,
        sellerNftAccount: ata3.address,
        seller: authority.publicKey, nftTokenProgram: TOKEN_PROGRAM_ID,
      }).rpc();
  });

  // ===== ATTACK 15: Bid below minimum increment =====
  console.log("\n🗡️ ATTACK 15: Bid below minimum increment (< 0.1 SOL above current)");
  await expect("Cannot bid below minimum increment", async () => {
    // Current bid is 1 SOL, minimum next = 1.1 SOL, try 1.05 SOL
    await attackerAuction.methods
      .placeBid(new BN(1.05 * LAMPORTS_PER_SOL))
      .accounts({
        listing: listing3, bidEscrow: bidEscrow3b,
        paymentMint: new PublicKey("So11111111111111111111111111111111111111112"),
        bidderTokenAccount: bidderAta3.address,
        previousBidderAccount: attacker.publicKey,
        bidder: attacker.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).rpc();
  });

  // ===== ATTACK 16: Bid after auction ended =====
  console.log("\n🗡️ ATTACK 16: Bid on expired auction");
  // Create a very short auction (1 second) and wait
  const nftMint4 = await createMint(connection, authority, authority.publicKey, null, 0);
  const ata4 = await getOrCreateAssociatedTokenAccount(connection, authority, nftMint4, authority.publicKey);
  await mintTo(connection, authority, nftMint4, ata4.address, authority, 1);
  const [listing4] = PublicKey.findProgramAddressSync([Buffer.from("listing"), nftMint4.toBuffer()], AUCTION_PROGRAM_ID);
  const [escrow4] = PublicKey.findProgramAddressSync([Buffer.from("escrow_nft"), nftMint4.toBuffer()], AUCTION_PROGRAM_ID);
  
  await auctionProgram.methods
    .listItem({ auction: {} }, new BN(LAMPORTS_PER_SOL), new BN(1), { digitalArt: {} }, 500, authority.publicKey)
    .accounts({
      listing: listing4, nftMint: nftMint4,
      paymentMint: new PublicKey("So11111111111111111111111111111111111111112"),
      escrowNft: escrow4, sellerNftAccount: ata4.address,
      seller: authority.publicKey, nftTokenProgram: TOKEN_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    }).rpc();

  // Wait for auction to expire
  console.log("   ⏳ Waiting 3s for auction to expire...");
  await new Promise(r => setTimeout(r, 3000));

  const [bidEscrow4] = PublicKey.findProgramAddressSync([Buffer.from("bid_escrow"), nftMint4.toBuffer()], AUCTION_PROGRAM_ID);
  const attackerAta4 = await getOrCreateAssociatedTokenAccount(connection, attacker, nftMint4, attacker.publicKey);
  await expect("Cannot bid on expired auction", async () => {
    await attackerAuction.methods
      .placeBid(new BN(LAMPORTS_PER_SOL))
      .accounts({
        listing: listing4, bidEscrow: bidEscrow4,
        paymentMint: new PublicKey("So11111111111111111111111111111111111111112"),
        bidderTokenAccount: bidderAta3.address,
        previousBidderAccount: attacker.publicKey,
        bidder: attacker.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).rpc();
  });

  // ===== ATTACK 17: Close stale listing by non-seller =====
  console.log("\n🗡️ ATTACK 17: Non-seller closes stale listing");
  await expect("Non-seller cannot close stale listing", async () => {
    await attackerAuction.methods
      .closeStaleListing()
      .accounts({
        listing: listing4, nftMint: nftMint4, escrowNft: escrow4,
        seller: attacker.publicKey, nftTokenProgram: TOKEN_PROGRAM_ID,
      }).rpc();
  });

  // ===== ATTACK 18: Seller bids on own auction =====
  console.log("\n🗡️ ATTACK 18: Seller bids on own auction (shill bidding)");
  // Create wSOL ATA for authority (seller)
  const sellerWsolAta = await getOrCreateAssociatedTokenAccount(connection, authority,
    new PublicKey("So11111111111111111111111111111111111111112"), authority.publicKey);
  const wrapTx2 = new (await import("@solana/web3.js")).Transaction().add(
    SystemProgram.transfer({
      fromPubkey: authority.publicKey,
      toPubkey: sellerWsolAta.address,
      lamports: 2 * LAMPORTS_PER_SOL,
    }),
    (await import("@solana/spl-token")).createSyncNativeInstruction(sellerWsolAta.address),
  );
  await provider.sendAndConfirm(wrapTx2);

  // Seller (authority) is also the listing seller for listing3
  await expect("Seller cannot bid on own auction", async () => {
    await auctionProgram.methods
      .placeBid(new BN(1.2 * LAMPORTS_PER_SOL))
      .accounts({
        listing: listing3, bidEscrow: bidEscrow3b,
        paymentMint: new PublicKey("So11111111111111111111111111111111111111112"),
        bidderTokenAccount: sellerWsolAta.address,
        previousBidderAccount: attacker.publicKey,
        bidder: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).rpc();
  });

  // ===== RESULTS =====
  console.log("\n" + "=".repeat(60));
  console.log(`\n🏁 RESULTS: ${passed} passed, ${failed} failed`);
  if (vulns.length > 0) {
    console.log("\n🚨 VULNERABILITIES FOUND:");
    vulns.forEach(v => console.log(`   🔴 ${v}`));
  } else {
    console.log("\n🛡️ NO VULNERABILITIES FOUND — all attacks blocked!");
  }
  console.log();
}

test().catch(console.error);
