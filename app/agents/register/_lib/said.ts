import { Buffer } from "buffer"
import { createSolanaRpc } from "@solana/kit"
import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js"

const SAID_PROGRAM_ID = new PublicKey(
  "5dpw6KEQPn248pnkkaYyWfHwu2nfb3LUMbTucb6LaA8G"
)

const textEncoder = new TextEncoder()

export interface SaidStatus {
  description?: string
  hasPassport: boolean
  isRegistered: boolean
  isVerified: boolean
  name?: string
}

export interface RegisterSaidProfileInput {
  description: string
  name: string
  walletAddress: string
}

export interface SendSaidTransactionInput {
  connection: Connection
  owner: PublicKey
  signTransaction: <T extends VersionedTransaction>(transaction: T) => Promise<T>
}

interface SaidStatusResponse {
  description?: string
  name?: string
  registered?: boolean
  verified?: boolean
}

interface SaidPassportResponse {
  passport?: {
    description?: string
    name?: string
  }
}

interface SaidWriteResponse {
  error?: string
  success?: boolean
}

async function getSaidDiscriminator(name: string): Promise<Buffer> {
  const input = Uint8Array.from(textEncoder.encode(name))
  const hash = await crypto.subtle.digest("SHA-256", input.buffer)

  return Buffer.from(hash).subarray(0, 8)
}

function getAgentPda(owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), owner.toBuffer()],
    SAID_PROGRAM_ID
  )[0]
}

function getTreasuryPda(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    SAID_PROGRAM_ID
  )[0]
}

async function getLatestConfirmedBlockhash(connection: Connection) {
  const rpc = createSolanaRpc(connection.rpcEndpoint)
  const { value } = await rpc.getLatestBlockhash().send()

  return {
    blockhash: value.blockhash,
    lastValidBlockHeight: Number(value.lastValidBlockHeight),
  }
}

async function sendInstructionTransaction(
  input: SendSaidTransactionInput,
  instruction: TransactionInstruction
): Promise<string> {
  const latestBlockhash = await getLatestConfirmedBlockhash(input.connection)
  const message = new TransactionMessage({
    instructions: [instruction],
    payerKey: input.owner,
    recentBlockhash: latestBlockhash.blockhash,
  }).compileToV0Message()

  const transaction = new VersionedTransaction(message)
  const signedTransaction = await input.signTransaction(transaction)
  const signature = await input.connection.sendTransaction(signedTransaction, {
    skipPreflight: false,
  })

  await input.connection.confirmTransaction(
    {
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      signature,
    },
    "confirmed"
  )

  return signature
}

async function fetchSaidJson<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    cache: "no-store",
  })
  const body = (await response.json()) as T & { error?: string }

  if (!response.ok) {
    throw new Error(body.error ?? "SAID request failed")
  }

  return body
}

export async function fetchSaidStatus(walletAddress: string): Promise<SaidStatus> {
  const encodedWallet = encodeURIComponent(walletAddress)
  const [statusData, passportData] = await Promise.all([
    fetchSaidJson<SaidStatusResponse>(
      `/api/agents/said?action=status&wallet=${encodedWallet}`
    ),
    fetchSaidJson<SaidPassportResponse>(
      `/api/agents/said?action=passport&wallet=${encodedWallet}`
    ),
  ])

  return {
    description:
      passportData.passport?.description?.trim() ||
      statusData.description?.trim() ||
      undefined,
    hasPassport: Boolean(passportData.passport),
    isRegistered: Boolean(statusData.registered),
    isVerified: Boolean(statusData.verified),
    name:
      passportData.passport?.name?.trim() ||
      statusData.name?.trim() ||
      undefined,
  }
}

export async function registerSaidProfile(
  input: RegisterSaidProfileInput
): Promise<void> {
  const response = await fetch("/api/agents/said", {
    body: JSON.stringify({
      action: "register",
      description: input.description,
      name: input.name,
      wallet: input.walletAddress,
    }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  })

  const body = (await response.json()) as SaidWriteResponse

  if (!response.ok || !body.success) {
    throw new Error(body.error ?? "SAID registration failed")
  }
}

export async function registerSaidOnChain(
  input: SendSaidTransactionInput
): Promise<string> {
  const metadataUri = `https://api.saidprotocol.com/api/cards/${input.owner.toBase58()}.json`
  const discriminator = await getSaidDiscriminator("global:register_agent")
  const uriBytes = Buffer.from(metadataUri, "utf8")
  const lengthBytes = Buffer.alloc(4)
  lengthBytes.writeUInt32LE(uriBytes.length, 0)

  const instruction = new TransactionInstruction({
    data: Buffer.concat([discriminator, lengthBytes, uriBytes]),
    keys: [
      { isSigner: false, isWritable: true, pubkey: getAgentPda(input.owner) },
      { isSigner: true, isWritable: true, pubkey: input.owner },
      {
        isSigner: false,
        isWritable: false,
        pubkey: SystemProgram.programId,
      },
    ],
    programId: SAID_PROGRAM_ID,
  })

  return sendInstructionTransaction(input, instruction)
}

export async function verifySaidOnChain(
  input: SendSaidTransactionInput
): Promise<string> {
  const discriminator = await getSaidDiscriminator("global:get_verified")
  const instruction = new TransactionInstruction({
    data: discriminator,
    keys: [
      { isSigner: false, isWritable: true, pubkey: getAgentPda(input.owner) },
      { isSigner: false, isWritable: true, pubkey: getTreasuryPda() },
      { isSigner: true, isWritable: true, pubkey: input.owner },
      {
        isSigner: false,
        isWritable: false,
        pubkey: SystemProgram.programId,
      },
    ],
    programId: SAID_PROGRAM_ID,
  })

  return sendInstructionTransaction(input, instruction)
}