#!/usr/bin/env node
/**
 * Collector Crypt → Artifacte Sync
 * Scrapes all listed items from CC's open API and saves to data/cc-listings.json
 */

import { writeFileSync, existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const OUTPUT = join(DATA_DIR, 'cc-listings.json');

const CC_API = 'https://api.collectorcrypt.com/marketplace';

// Markup percentage on top of CC price
const MARKUP_PCT = 0.05; // 5%

async function fetchAllListings() {
  console.log('Fetching Collector Crypt marketplace...');
  const res = await fetch(CC_API);
  if (!res.ok) throw new Error(`CC API returned ${res.status}`);
  const data = await res.json();
  
  const allItems = data.filterNFtCard || [];
  const listed = allItems.filter(i => i.listing);
  
  console.log(`Total items: ${data.findTotal}, Listed: ${listed.length}`);
  return listed;
}

function transformListing(item) {
  const l = item.listing;
  const basePrice = l.price;
  const markedUpPrice = Math.ceil(basePrice * (1 + MARKUP_PCT) * 100) / 100;
  
  return {
    // CC identifiers
    ccId: item.id,
    nftAddress: item.nftAddress,
    receiptId: l.receiptId,
    sellerId: l.sellerId,
    sellerWallet: item.owner?.wallet,
    
    // Display info
    name: item.itemName,
    category: mapCategory(item.category),
    ccCategory: item.category,
    year: item.year,
    set: item.set,
    serial: item.serial,
    
    // Grading
    grade: item.grade,
    gradeNum: item.gradeNum,
    gradingCompany: item.gradingCompany,
    gradingId: item.gradingID,
    
    // Vault/custody
    vault: item.vault,
    vaultId: item.vaultId,
    location: item.location,
    
    // Pricing
    ccPrice: basePrice,
    price: markedUpPrice,
    currency: l.currency, // SOL or USDC
    markup: MARKUP_PCT,
    
    // Images
    image: item.images?.front || item.frontImage,
    imageBack: item.images?.back || item.backImage,
    imageMedium: item.images?.frontM,
    imageSmall: item.images?.frontS,
    
    // Metadata
    source: 'collector-crypt',
    marketplace: l.marketplace, // ME = Magic Eden
    ccUrl: `https://collectorcrypt.com/marketplace/${item.nftAddress}`,
    listedAt: l.createdAt,
    updatedAt: l.updatedAt,
    syncedAt: new Date().toISOString(),
  };
}

function mapCategory(ccCat) {
  const map = {
    'Pokemon': 'TCG Cards',
    'One Piece': 'TCG Cards',
    'Yu-Gi-Oh!': 'TCG Cards',
    'Yu-gi-oh!': 'TCG Cards',
    'Magic The Gathering': 'TCG Cards',
    'Magic the Gathering': 'TCG Cards',
    'Dragon Ball': 'TCG Cards',
    'Lorcana': 'TCG Cards',
    'Collectible Card Game': 'TCG Cards',
    'Collectible Card Games': 'TCG Cards',
    'Collectable Card Games': 'TCG Cards',
    'Baseball': 'Sports Cards',
    'Basketball': 'Sports Cards',
    'Football': 'Sports Cards',
    'Soccer': 'Sports Cards',
    'Hockey': 'Sports Cards',
    'Boxing & MMA': 'Sports Cards',
    'Boxing': 'Sports Cards',
    'Racing': 'Sports Cards',
    'Misc Sports': 'Sports Cards',
    'Sports': 'Sports Cards',
    'Golf': 'Sports Cards',
  };
  return map[ccCat] || 'Other';
}

async function main() {
  try {
    const raw = await fetchAllListings();
    const listings = raw.map(transformListing);
    
    // Stats
    const byCat = {};
    const byCur = {};
    for (const l of listings) {
      byCat[l.category] = (byCat[l.category] || 0) + 1;
      byCur[l.currency] = (byCur[l.currency] || 0) + 1;
    }
    
    console.log(`\nTransformed ${listings.length} listings`);
    console.log('By Artifacte category:', JSON.stringify(byCat));
    console.log('By currency:', JSON.stringify(byCur));
    
    // Price stats
    const solPrices = listings.filter(l => l.currency === 'SOL').map(l => l.price);
    const usdcPrices = listings.filter(l => l.currency === 'USDC').map(l => l.price);
    if (solPrices.length) {
      const reasonable = solPrices.filter(p => p < 1000);
      console.log(`SOL: ${solPrices.length} items, median ${median(reasonable).toFixed(2)} SOL (excluding >1000 SOL)`);
    }
    if (usdcPrices.length) {
      const reasonable = usdcPrices.filter(p => p < 100000);
      console.log(`USDC: ${usdcPrices.length} items, median $${median(reasonable).toFixed(2)} (excluding >$100K)`);
    }
    
    writeFileSync(OUTPUT, JSON.stringify(listings, null, 2));
    console.log(`\nSaved to ${OUTPUT}`);
    
  } catch (err) {
    console.error('Sync failed:', err.message);
    process.exit(1);
  }
}

function median(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

main();
