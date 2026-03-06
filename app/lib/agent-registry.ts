import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import IDL from "./agent-registry-idl.json";

const PROGRAM_ID = new PublicKey("4wmBjbH2YsWA49Paaigymz2sbsbDut4wzBMpapAtjKJ2");
const DEVNET_RPC = "https://api.devnet.solana.com";

export interface AgentData {
  owner: PublicKey;
  nftMint: PublicKey;
  name: string;
  canTrade: boolean;
  canBid: boolean;
  canChat: boolean;
  createdAt: number;
  bump: number;
  address: string;
}

function getProgram(wallet: WalletContextState, connection: Connection): Program {
  const provider = new AnchorProvider(connection, wallet as any, {
    commitment: "confirmed",
  });
  return new Program(IDL as any, PROGRAM_ID as any, provider as any);
}

export async function registerAgent(
  wallet: WalletContextState,
  connection: Connection,
  nftMint: PublicKey,
  name: string,
  canTrade: boolean,
  canBid: boolean,
  canChat: boolean
): Promise<string> {
  if (!wallet.publicKey) throw new Error("Wallet not connected");
  if (!wallet.signTransaction) throw new Error("Wallet does not support transactions");

  const program = getProgram(wallet, connection);

  // Derive PDA
  const [agentPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), wallet.publicKey.toBuffer()],
    PROGRAM_ID
  );

  // Build instruction
  const tx = await program.methods
    .registerAgent(nftMint, name, canTrade, canBid, canChat)
    .accounts({
      agent: agentPda,
      owner: wallet.publicKey,
      systemProgram: PublicKey.default,
    })
    .transaction();

  // Sign and send
  const signedTx = await wallet.signTransaction(tx);
  const signature = await connection.sendRawTransaction(signedTx.serialize());
  await connection.confirmTransaction(signature, "confirmed");

  return signature;
}

export async function updateAgent(
  wallet: WalletContextState,
  connection: Connection,
  nftMint: PublicKey | null,
  name: string | null,
  canTrade: boolean | null,
  canBid: boolean | null,
  canChat: boolean | null
): Promise<string> {
  if (!wallet.publicKey) throw new Error("Wallet not connected");
  if (!wallet.signTransaction) throw new Error("Wallet does not support transactions");

  const program = getProgram(wallet, connection);

  // Derive PDA
  const [agentPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), wallet.publicKey.toBuffer()],
    PROGRAM_ID
  );

  // Build instruction
  const tx = await program.methods
    .updateAgent(nftMint, name, canTrade, canBid, canChat)
    .accounts({
      agent: agentPda,
      owner: wallet.publicKey,
    })
    .transaction();

  // Sign and send
  const signedTx = await wallet.signTransaction(tx);
  const signature = await connection.sendRawTransaction(signedTx.serialize());
  await connection.confirmTransaction(signature, "confirmed");

  return signature;
}

export async function deregisterAgent(
  wallet: WalletContextState,
  connection: Connection
): Promise<string> {
  if (!wallet.publicKey) throw new Error("Wallet not connected");
  if (!wallet.signTransaction) throw new Error("Wallet does not support transactions");

  const program = getProgram(wallet, connection);

  // Derive PDA
  const [agentPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), wallet.publicKey.toBuffer()],
    PROGRAM_ID
  );

  // Build instruction
  const tx = await program.methods
    .deregisterAgent()
    .accounts({
      agent: agentPda,
      owner: wallet.publicKey,
    })
    .transaction();

  // Sign and send
  const signedTx = await wallet.signTransaction(tx);
  const signature = await connection.sendRawTransaction(signedTx.serialize());
  await connection.confirmTransaction(signature, "confirmed");

  return signature;
}

export async function fetchAgent(
  connection: Connection,
  ownerPubkey: PublicKey
): Promise<AgentData | null> {
  try {
    // Derive PDA
    const [agentPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("agent"), ownerPubkey.toBuffer()],
      PROGRAM_ID
    );

    // Fetch account
    const accountInfo = await connection.getAccountInfo(agentPda);
    if (!accountInfo) return null;

    // Parse account data
    const program = new Program(IDL as any, PROGRAM_ID);
    const agent: any = await program.account.agent.fetch(agentPda);

    return {
      owner: agent.owner as PublicKey,
      nftMint: agent.nftMint as PublicKey,
      name: agent.name as string,
      canTrade: agent.canTrade as boolean,
      canBid: agent.canBid as boolean,
      canChat: agent.canChat as boolean,
      createdAt: (agent.createdAt as any).toNumber(),
      bump: agent.bump as number,
      address: agentPda.toBase58(),
    };
  } catch (error) {
    console.error("Failed to fetch agent:", error);
    return null;
  }
}

export async function fetchAllAgents(connection: Connection): Promise<AgentData[]> {
  try {
    const program = new Program(IDL as any, PROGRAM_ID);
    const accounts = await program.account.agent.all();

    return accounts.map((acc: any) => ({
      owner: acc.account.owner as PublicKey,
      nftMint: acc.account.nftMint as PublicKey,
      name: acc.account.name as string,
      canTrade: acc.account.canTrade as boolean,
      canBid: acc.account.canBid as boolean,
      canChat: acc.account.canChat as boolean,
      createdAt: (acc.account.createdAt as any).toNumber(),
      bump: acc.account.bump as number,
      address: acc.publicKey.toBase58(),
    }));
  } catch (error) {
    console.error("Failed to fetch all agents:", error);
    return [];
  }
}
