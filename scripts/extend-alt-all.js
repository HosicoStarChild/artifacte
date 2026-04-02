const { Connection, PublicKey, AddressLookupTableProgram, Transaction } = require('@solana/web3.js');
const fs = require('fs');
const https = require('https');

const keypairData = JSON.parse(fs.readFileSync('/Users/haas/.config/solana/id.json'));
const { Keypair } = require('@solana/web3.js');
const authority = Keypair.fromSecretKey(Uint8Array.from(keypairData));
const connection = new Connection('https://margy-w7f73z-fast-mainnet.helius-rpc.com', 'confirmed');
const ALT_KEY = new PublicKey('2tk5qN1U7kY6SJAcL5dngCV4xEUz7McVWygXQzBUEbMo'); // ALT #2
const HELIUS_RPC = 'https://margy-w7f73z-fast-mainnet.helius-rpc.com';

async function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
    const req = https.request('https://margy-w7f73z-fast-mainnet.helius-rpc.com', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': body.length }
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve(JSON.parse(data).result));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function getProofNodes(mint) {
  const result = await rpc('getAssetProof', [mint]);
  return result?.proof || [];
}

async function getCurrentALTAddresses() {
  const info = await connection.getAddressLookupTable(ALT_KEY);
  return new Set(info.value?.state?.addresses?.map(a => a.toBase58()) || []);
}

async function main() {
  const mints = fs.readFileSync('/tmp/phygital-mints.txt', 'utf8').trim().split('\n');
  console.log(`Processing ${mints.length} mints...`);
  
  const existing = await getCurrentALTAddresses();
  console.log(`ALT has ${existing.size} addresses`);
  
  const newAddresses = new Set();
  
  for (const mint of mints) {
    try {
      const proof = await getProofNodes(mint);
      for (const node of proof) {
        if (!existing.has(node) && !newAddresses.has(node)) {
          newAddresses.add(node);
        }
      }
      process.stdout.write('.');
    } catch (e) {
      process.stdout.write('x');
    }
  }
  
  console.log(`\nFound ${newAddresses.size} new addresses to add`);
  
  if (newAddresses.size === 0) {
    console.log('Nothing to add!');
    return;
  }
  
  // Extend in batches of 20 (ALT extend limit)
  const addrs = [...newAddresses].map(a => new PublicKey(a));
  const batchSize = 20;
  
  for (let i = 0; i < addrs.length; i += batchSize) {
    const batch = addrs.slice(i, i + batchSize);
    const ix = AddressLookupTableProgram.extendLookupTable({
      payer: authority.publicKey,
      authority: authority.publicKey,
      lookupTable: ALT_KEY,
      addresses: batch,
    });
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    const tx = new Transaction().add(ix);
    tx.recentBlockhash = blockhash;
    tx.feePayer = authority.publicKey;
    tx.sign(authority);
    const sig = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(sig, 'confirmed');
    console.log(`Batch ${Math.floor(i/batchSize)+1}: added ${batch.length} addresses. Sig: ${sig.slice(0,20)}...`);
  }
  
  console.log('Done!');
}

main().catch(console.error);
