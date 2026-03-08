#!/usr/bin/env node

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, '../data/baxus-bottles.json');

const API_URL = 'https://services.baxus.co/api/search/assets';
const PAGE_SIZE = 100;
const MAX_ASSETS = 11177;

// Deduplicate and clean bottles
const seenReleases = new Set();
const bottles = [];

async function fetchAssets(from) {
  const payload = {
    size: PAGE_SIZE,
    from: from
  };

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    console.error(`Error fetching from offset ${from}:`, err.message);
    return null;
  }
}

function cleanBottle(asset) {
  // Extract bottle_release from the source
  const release = asset._source?.bottle_release;
  const source = asset._source;

  if (!release) return null;

  // Only include bottles with market_price > 0 and image_url
  if (!release.market_price || release.market_price <= 0 || !release.image_url) {
    return null;
  }

  // Deduplicate by bottle_release_id
  if (seenReleases.has(release.bottle_release_id)) {
    return null;
  }

  seenReleases.add(release.bottle_release_id);

  // Build bottle object
  const bottle = {
    id: release.bottle_release_id,
    name: release.name || 'Unknown Bottle',
    brand: release.brand_name || 'Unknown Brand',
    spirit_type: release.spirit_type || 'Unknown Spirit',
    market_price: release.market_price,
    image_url: release.image_url,
    abv: release.abv || null,
    age: release.age || null,
    country: release.country || null,
    region: release.region || null,
    volume_ml: release.volume_ml || null,
    description: release.description || '',
    bottle_release_id: release.bottle_release_id,
    baxusUrl: `https://baxus.co/asset/${source.token_asset_address}`
  };

  return bottle;
}

async function main() {
  console.log('🍃 BAXUS Bottle Sync Started');
  console.log(`📍 Target: ${OUTPUT_PATH}`);
  console.log(`🎯 Expected assets: ~${MAX_ASSETS}`);
  console.log('');

  let totalAssets = 0;
  let from = 0;
  let hasMore = true;

  while (hasMore && from < MAX_ASSETS) {
    const remaining = Math.min(PAGE_SIZE, MAX_ASSETS - from);
    const data = await fetchAssets(from);

    if (!data || !data.assets || data.assets.length === 0) {
      hasMore = false;
      console.log(`⏹️  No more assets found at offset ${from}`);
      break;
    }

    for (const asset of data.assets) {
      totalAssets++;
      const bottle = cleanBottle(asset);

      if (bottle) {
        bottles.push(bottle);
        const progress = Math.round((from / MAX_ASSETS) * 100);
        if (bottles.length % 50 === 0) {
          console.log(`✅ Processed ${totalAssets} assets → ${bottles.length} unique bottles (${progress}%)`);
        }
      }
    }

    from += PAGE_SIZE;

    // Avoid hammering the API
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Sort by market price (descending)
  bottles.sort((a, b) => b.market_price - a.market_price);

  // Write output
  const output = {
    total: bottles.length,
    timestamp: new Date().toISOString(),
    bottles: bottles
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

  console.log('');
  console.log(`✨ Complete!`);
  console.log(`📦 Total unique bottles: ${bottles.length}`);
  console.log(`💾 Saved to: ${OUTPUT_PATH}`);
  console.log(`🔝 Top 3 bottles by price:`);
  bottles.slice(0, 3).forEach((b, i) => {
    console.log(`   ${i + 1}. ${b.brand} ${b.name} - $${b.market_price.toLocaleString()}`);
  });
}

main().catch(console.error);
