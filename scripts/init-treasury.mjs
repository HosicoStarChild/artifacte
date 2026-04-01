import { Connection, Keypair, PublicKey, Transaction, SystemProgram } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { readFileSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const IDL = require("../target/idl/auction.json");

const RPC = "https://margy-w7f73z-fast-mainnet.helius-rpc.com";
const PROGRAM_ID = new PublicKey("81s1tEx4MPdVvqS6X84Mok5K4N5fMbRLzcsT5eo2K8J3");
const TREASURY_WALLET = new PublicKey("6drXw31FjHch4ixXa4ngTyUD2cySUs3mpcB2YYGA9g7P");

const keypairData = JSON.parse(readFileSync("/Users/haas/.config/solana/id.json", "utf8"));
const authority = Keypair.fromSecretKey(Uint8Array.from(keypairData));

const connection = new Connection(RPC, "confirmed");
const wallet = new anchor.Wallet(authority);
const provider = new anchor.AnchorProvider(connection, wallet, {});

const program = new anchor.Program(IDL, provider);

const [treasuryConfig] = PublicKey.findProgramAddressSync(
  [Buffer.from("treasury_config")],
  PROGRAM_ID
);

console.log("Treasury config PDA:", treasuryConfig.toBase58());
console.log("Authority:", authority.publicKey.toBase58());

// Check if already initialized
const existing = await connection.getAccountInfo(treasuryConfig);
if (existing) {
  console.log("Already initialized!");
  process.exit(0);
}

console.log("Initializing treasury config...");
const sig = await program.methods.initializeTreasury()
  .accounts({
    treasuryConfig,
    authority: authority.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .rpc();

console.log("✅ Treasury initialized! Sig:", sig);

// Now update to actual treasury wallet
console.log("Updating treasury to:", TREASURY_WALLET.toBase58());
const sig2 = await program.methods.updateTreasury(TREASURY_WALLET)
  .accounts({
    treasuryConfig,
    authority: authority.publicKey,
  })
  .rpc();

console.log("✅ Treasury updated! Sig:", sig2);
