/**
 * Script to create an Artifacte collection on 8004
 * Usage: SOLANA_PRIVATE_KEY='[...]' node scripts/create-8004-collection.mjs
 */

import { SolanaSDK, IPFSClient, ServiceType } from '8004-solana';
import { Keypair, Connection, clusterApiUrl } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';

async function createArtifacteCollection() {
  try {
    // Get private key from environment or use devnet default
    const privateKeyStr = process.env.SOLANA_PRIVATE_KEY;
    if (!privateKeyStr) {
      console.error('Error: SOLANA_PRIVATE_KEY environment variable not set');
      console.log('Usage: SOLANA_PRIVATE_KEY="[1,2,3,...]" node scripts/create-8004-collection.mjs');
      process.exit(1);
    }

    const signer = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(privateKeyStr))
    );

    console.log('Signer:', signer.publicKey.toBase58());

    // Determine cluster from environment or default to devnet
    const cluster = process.env.SOLANA_CLUSTER || 'devnet';
    const connection = new Connection(clusterApiUrl(cluster), 'confirmed');

    // Initialize IPFS client
    const ipfs = new IPFSClient({
      pinataEnabled: false, // Set to true and add JWT for production
    });

    // Create SDK with signer
    const sdk = new SolanaSDK({
      signer,
      connection,
      ipfsClient: ipfs,
    });

    console.log(`Creating Artifacte collection on ${cluster}...`);

    // Create collection
    const collection = await sdk.createCollection({
      name: 'Artifacte',
      symbol: 'ARTF',
      description: 'AI agents for the Artifacte RWA marketplace',
      image: 'ipfs://QmArtifacte', // This would be a real IPFS hash in production
      socials: {
        website: 'https://artifacte.io',
        x: 'https://x.com/artifacte',
      },
    });

    console.log('✓ Collection created successfully!');
    console.log('  Collection CID:', collection.cid);
    console.log('  Collection Pointer:', collection.pointer);

    // Save collection info to a file for later use
    const configFile = path.join(process.cwd(), '.env.local');
    const collectionConfig = `# 8004 Artifacte Collection
NEXT_PUBLIC_8004_COLLECTION_POINTER=${collection.pointer}
NEXT_PUBLIC_8004_COLLECTION_CID=${collection.cid}
NEXT_PUBLIC_SOLANA_CLUSTER=${cluster}
`;

    // Only append if not already present
    if (!fs.existsSync(configFile) || !fs.readFileSync(configFile, 'utf-8').includes('8004_COLLECTION_POINTER')) {
      fs.appendFileSync(configFile, collectionConfig);
      console.log(`\n✓ Configuration saved to ${configFile}`);
    } else {
      console.log('\n✓ Collection configuration already exists in .env.local');
    }

    console.log('\nNext steps:');
    console.log('1. The collection pointer has been saved to .env.local');
    console.log('2. Use NEXT_PUBLIC_8004_COLLECTION_POINTER in your app to register agents');
    console.log('3. Run: npm run dev');

  } catch (error) {
    console.error('Error creating collection:', error);
    process.exit(1);
  }
}

createArtifacteCollection();
