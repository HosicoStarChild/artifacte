import { Connection, PublicKey, Transaction } from '@solana/web3.js';

const RPC = 'https://mainnet.helius-rpc.com/?api-key=345726df-3822-42c1-86e0-1a13dc6c7a04';
const API_URL = 'http://localhost:3000/api/me-buy';
const BUYER = 'EAKT4UuvYP5NorTWANgTatC71VFSKmGm59QsmwWS9bYV';
const TEST_MINT = 'GmpJmBqJMyu24w2YEwaVoY6dn7rvNaGNoyze1N2HbRkm';

async function main() {
  const connection = new Connection(RPC, 'confirmed');

  console.log('Building transaction...');
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mint: TEST_MINT, buyer: BUYER }),
  });
  const data = await res.json();
  if (!res.ok) { console.error(data); process.exit(1); }
  console.log(`Price: ${data.price} SOL + ${data.fee} fee`);
  
  const tx = Transaction.from(Buffer.from(data.transaction, 'base64'));

  const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
  
  console.log('Simulating...');
  const resp = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'simulateTransaction',
      params: [
        Buffer.from(serialized).toString('base64'),
        { sigVerify: false, encoding: 'base64', replaceRecentBlockhash: true }
      ]
    })
  });
  const result = await resp.json();
  const val = result.result?.value;

  if (val?.err) {
    console.log('❌ Error:', JSON.stringify(val.err));
    if (val.logs?.length) {
      console.log('\nLogs:');
      val.logs.forEach(l => console.log(' ', l));
    }
  } else {
    console.log('✅ Simulation PASSED!');
    console.log('Units consumed:', val?.unitsConsumed);
    if (val.logs?.length) {
      console.log('\nLast 10 logs:');
      val.logs.slice(-10).forEach(l => console.log(' ', l));
    }
  }
}

main().catch(console.error);
