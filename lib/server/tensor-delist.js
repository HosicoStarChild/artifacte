import "server-only";

import {
  getCNFTArgs,
  retrieveAssetFields,
  retrieveProofFields,
} from "@tensor-foundation/common-helpers";
import {
  findListStatePda,
  getDelistCompressedInstructionAsync,
  getDelistLegacyInstructionAsync,
  getDelistT22InstructionAsync,
} from "@tensor-foundation/marketplace";
import { address, createSolanaRpc } from "@solana/kit";
import {
  AddressLookupTableProgram,
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const HELIUS_RPC = HELIUS_API_KEY
  ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
  : null;

const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const TOKEN_METADATA_PROGRAM_ID = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";
const PROGRAM_ALT = "4NYENhRXdSq1ek7mvJyzMUvdn2aN3JeAr6huzfL7869j";
const REQUEST_TIMEOUT_MS = 12_000;

function ensureHeliusRpc() {
  if (!HELIUS_RPC) {
    throw new Error("HELIUS_API_KEY is not configured");
  }

  return HELIUS_RPC;
}

function withTimeout() {
  return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
}

function toPublicKey(value) {
  return new PublicKey(value);
}

function toAddressString(value) {
  return typeof value === "string" ? value : value.address;
}

function toTransactionInstruction(instruction) {
  const keys = instruction.accounts.map((accountMeta) => ({
    isSigner: accountMeta.role >= 2,
    isWritable: accountMeta.role === 1 || accountMeta.role === 3,
    pubkey: toPublicKey(toAddressString(accountMeta.address)),
  }));

  return new TransactionInstruction({
    data: Buffer.from(instruction.data),
    keys,
    programId: toPublicKey(instruction.programAddress),
  });
}

function parseAuthorityKeypair() {
  const secret = process.env.SOLANA_AUTHORITY_SECRET;
  if (!secret) {
    throw new Error("SOLANA_AUTHORITY_SECRET not configured");
  }

  const parsed = JSON.parse(secret);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("SOLANA_AUTHORITY_SECRET is invalid");
  }

  return Keypair.fromSecretKey(Uint8Array.from(parsed));
}

async function waitForConfirmation(connection, signature) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const statuses = await connection.getSignatureStatuses([signature]);
    const status = statuses.value[0];

    if (status?.err) {
      throw new Error(`ALT setup transaction failed: ${JSON.stringify(status.err)}`);
    }

    if (
      status?.confirmationStatus === "confirmed" ||
      status?.confirmationStatus === "finalized"
    ) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error("ALT setup confirmation timed out");
}

async function detectTensorDelistKind(mint) {
  const rpcUrl = ensureHeliusRpc();
  const assetResponse = await fetch(rpcUrl, {
    body: JSON.stringify({
      id: "tensor-delist-asset",
      jsonrpc: "2.0",
      method: "getAsset",
      params: {
        id: mint,
      },
    }),
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
    signal: withTimeout(),
  });

  if (!assetResponse.ok) {
    throw new Error(`Helius DAS error: ${assetResponse.status}`);
  }

  const assetPayload = await assetResponse.json();
  if (assetPayload?.error?.message) {
    throw new Error(assetPayload.error.message);
  }

  if (assetPayload?.result?.compression?.compressed) {
    return "compressed";
  }

  const accountInfoResponse = await fetch(rpcUrl, {
    body: JSON.stringify({
      id: "tensor-delist-account-info",
      jsonrpc: "2.0",
      method: "getAccountInfo",
      params: [mint, { encoding: "base64" }],
    }),
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
    signal: withTimeout(),
  });

  if (!accountInfoResponse.ok) {
    throw new Error(`RPC getAccountInfo failed with ${accountInfoResponse.status}`);
  }

  const accountInfoPayload = await accountInfoResponse.json();
  if (accountInfoPayload?.error?.message) {
    throw new Error(accountInfoPayload.error.message);
  }

  return accountInfoPayload?.result?.value?.owner === TOKEN_2022_PROGRAM_ID
    ? "t22"
    : "legacy";
}

async function deriveProgrammableMetadata(connection, mint) {
  const mintPublicKey = toPublicKey(mint);
  const metadataProgramPublicKey = toPublicKey(TOKEN_METADATA_PROGRAM_ID);
  const [metadataPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      metadataProgramPublicKey.toBuffer(),
      mintPublicKey.toBuffer(),
    ],
    metadataProgramPublicKey,
  );

  const metadataAccount = await connection.getAccountInfo(metadataPda, "confirmed");
  if (!metadataAccount?.data) {
    return {
      isPnft: false,
      ruleSet: null,
    };
  }

  const data = metadataAccount.data;
  let offset = 1 + 32 + 32;
  offset += 4 + 32;
  offset += 4 + 10;
  offset += 4 + 200;
  offset += 2;

  const hasCreators = data[offset] ?? 0;
  offset += 1;
  if (hasCreators === 1) {
    const creatorCount = data.readUInt32LE(offset);
    offset += 4 + creatorCount * 34;
  }

  offset += 1;
  offset += 1;

  const hasEditionNonce = data[offset] ?? 0;
  offset += 1;
  if (hasEditionNonce === 1) {
    offset += 1;
  }

  const hasTokenStandard = data[offset] ?? 0;
  offset += 1;

  let tokenStandard = -1;
  if (hasTokenStandard === 1) {
    tokenStandard = data[offset] ?? -1;
    offset += 1;
  }

  const isPnft = tokenStandard === 4;

  const hasCollection = data[offset] ?? 0;
  offset += 1;
  if (hasCollection === 1) {
    offset += 33;
  }

  const hasUses = data[offset] ?? 0;
  offset += 1;
  if (hasUses === 1) {
    offset += 17;
  }

  const hasCollectionDetails = data[offset] ?? 0;
  offset += 1;
  if (hasCollectionDetails === 1) {
    const detailsVersion = data[offset] ?? 0;
    offset += 1;
    offset += detailsVersion === 0 ? 8 : 16;
  }

  if ((data[offset] ?? 0) !== 1) {
    return {
      isPnft,
      ruleSet: null,
    };
  }

  offset += 1;
  offset += 1;

  if ((data[offset] ?? 0) !== 1) {
    return {
      isPnft,
      ruleSet: null,
    };
  }

  offset += 1;

  return {
    isPnft,
    ruleSet: new PublicKey(data.subarray(offset, offset + 32)).toBase58(),
  };
}

async function buildCompressedDelistTransaction(connection, mint, owner) {
  const rpcUrl = ensureHeliusRpc();
  const rpc = createSolanaRpc(rpcUrl);
  const ownerAddress = address(owner);
  const pseudoSigner = {
    address: ownerAddress,
    signTransactions: async () => [],
  };

  const [assetFields, proofFields] = await Promise.all([
    retrieveAssetFields(rpcUrl, mint),
    retrieveProofFields(rpcUrl, mint),
  ]);

  const compressedArgs = await getCNFTArgs(rpc, mint, assetFields, proofFields);
  const proof = proofFields.proof.map((proofAddress) => address(proofAddress));
  const [listState] = await findListStatePda({
    mint: address(mint),
  });

  const instruction = await getDelistCompressedInstructionAsync({
    canopyDepth: 0,
    creatorHash: compressedArgs.creatorHash,
    dataHash: compressedArgs.dataHash,
    index: compressedArgs.index,
    listState,
    merkleTree: compressedArgs.merkleTree,
    owner: pseudoSigner,
    proof,
    rentDestination: ownerAddress,
    root: compressedArgs.root,
  });

  const authority = parseAuthorityKeypair();
  const [createLookupTableInstruction, proofLookupTableAddress] =
    AddressLookupTableProgram.createLookupTable({
      authority: authority.publicKey,
      payer: authority.publicKey,
      recentSlot: (await connection.getSlot("confirmed")) - 1,
    });

  const extendLookupTableInstruction = AddressLookupTableProgram.extendLookupTable({
    addresses: proofFields.proof.map((proofAddress) => toPublicKey(proofAddress)),
    authority: authority.publicKey,
    lookupTable: proofLookupTableAddress,
    payer: authority.publicKey,
  });

  const altTransaction = new Transaction().add(
    createLookupTableInstruction,
    extendLookupTableInstruction,
  );
  const altBlockhash = await connection.getLatestBlockhash("confirmed");
  altTransaction.feePayer = authority.publicKey;
  altTransaction.recentBlockhash = altBlockhash.blockhash;
  altTransaction.sign(authority);

  const altSignature = await connection.sendRawTransaction(altTransaction.serialize(), {
    skipPreflight: true,
  });
  await waitForConfirmation(connection, altSignature);

  const [programLookupTable, proofLookupTable, blockhash] = await Promise.all([
    connection.getAddressLookupTable(toPublicKey(PROGRAM_ALT), {
      commitment: "confirmed",
    }),
    connection.getAddressLookupTable(proofLookupTableAddress, {
      commitment: "confirmed",
    }),
    connection.getLatestBlockhash("confirmed"),
  ]);

  const lookupTables = [programLookupTable.value, proofLookupTable.value].filter(
    (value) => value !== null,
  );

  const message = new TransactionMessage({
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      toTransactionInstruction(instruction),
    ],
    payerKey: toPublicKey(owner),
    recentBlockhash: blockhash.blockhash,
  }).compileToV0Message(lookupTables);

  return Buffer.from(new VersionedTransaction(message).serialize()).toString("base64");
}

async function buildLegacyOrToken2022DelistTransaction(connection, mint, owner, kind) {
  const ownerAddress = address(owner);
  const pseudoSigner = {
    address: ownerAddress,
    signTransactions: async () => [],
  };

  const instruction = kind === "t22"
    ? await getDelistT22InstructionAsync({
        mint: address(mint),
        owner: pseudoSigner,
        rentDestination: ownerAddress,
        transferHookAccounts: [],
      })
    : await (async () => {
        const programmableMetadata = await deriveProgrammableMetadata(connection, mint);

        return getDelistLegacyInstructionAsync({
          mint: address(mint),
          owner: pseudoSigner,
          rentDestination: ownerAddress,
          tokenStandard: programmableMetadata.isPnft ? undefined : 0,
          authorizationRules: programmableMetadata.ruleSet
            ? address(programmableMetadata.ruleSet)
            : undefined,
        });
      })();

  const blockhash = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      toTransactionInstruction(instruction),
    ],
    payerKey: toPublicKey(owner),
    recentBlockhash: blockhash.blockhash,
  }).compileToV0Message();

  return Buffer.from(new VersionedTransaction(message).serialize()).toString("base64");
}

/**
 * @param {{ kind?: "auto" | "compressed" | "legacy" | "t22", mint: string, owner: string }} input
 * @returns {Promise<{ kind: "compressed" | "legacy" | "t22", mint: string, tx: string }>}
 */
export async function buildTensorDelistTransaction(input) {
  const rpcUrl = ensureHeliusRpc();
  const mint = `${address(input.mint)}`;
  const owner = `${address(input.owner)}`;
  const connection = new Connection(rpcUrl, "confirmed");
  const kind = input.kind && input.kind !== "auto"
    ? input.kind
    : await detectTensorDelistKind(mint);

  const tx = kind === "compressed"
    ? await buildCompressedDelistTransaction(connection, mint, owner)
    : await buildLegacyOrToken2022DelistTransaction(connection, mint, owner, kind);

  return {
    kind,
    mint,
    tx,
  };
}