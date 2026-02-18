/**
 * Artifacte ↔ eBay Sync Engine
 * Keeps bids in sync between eBay listings and Artifacte on-chain auctions.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getItem as ebayGetItem, placeBid as ebayPlaceBid } from './ebay-client.mjs';
import { getCurrentBid as artifacteGetBid, placeBid as artifactePlaceBid } from './artifacte-client.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUCTIONS_FILE = path.join(__dirname, 'auctions.json');
const PORT = process.env.SYNC_PORT || 4100;
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS || '10000', 10);
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// ── State ──────────────────────────────────────────────────────────────────────

function loadAuctions() {
  try {
    if (fs.existsSync(AUCTIONS_FILE)) {
      return JSON.parse(fs.readFileSync(AUCTIONS_FILE, 'utf-8'));
    }
  } catch (err) {
    log('ERROR', `Failed to load auctions.json: ${err.message}`);
  }
  return [];
}

function saveAuctions(auctions) {
  fs.writeFileSync(AUCTIONS_FILE, JSON.stringify(auctions, null, 2));
}

let auctions = loadAuctions();
let syncRunning = false;

// ── Logging ────────────────────────────────────────────────────────────────────

function log(level, msg, data) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] ${msg}`;
  console.log(data ? `${line} ${JSON.stringify(data)}` : line);
}

// ── Retry helper ───────────────────────────────────────────────────────────────

async function withRetry(fn, label, retries = MAX_RETRIES) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      log('WARN', `${label} attempt ${i + 1}/${retries} failed: ${err.message}`);
      if (i < retries - 1) await sleep(RETRY_DELAY_MS * (i + 1));
      else throw err;
    }
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Sync Loop ──────────────────────────────────────────────────────────────────

async function syncOnce() {
  if (syncRunning) return;
  syncRunning = true;

  for (const auction of auctions) {
    try {
      // 1. Check eBay
      const ebayItem = await withRetry(
        () => ebayGetItem(auction.ebayItemId),
        `eBay getItem(${auction.ebayItemId})`
      );
      const ebayBid = ebayItem.currentBid ?? ebayItem.price ?? 0;

      // 2. Check Artifacte
      let artifacteBid = auction.currentBid || 0;
      try {
        const artData = await withRetry(
          () => artifacteGetBid(auction.artifacteSlug),
          `Artifacte getBid(${auction.artifacteSlug})`
        );
        artifacteBid = artData.currentBid || 0;
      } catch (err) {
        log('WARN', `Could not fetch Artifacte bid for ${auction.artifacteSlug}: ${err.message}`);
      }

      // 3. Compare and sync
      if (ebayBid > artifacteBid && auction.lastBidPlatform !== 'sync-from-ebay') {
        log('INFO', `eBay bid higher for "${auction.title}": $${ebayBid} > $${artifacteBid}. Syncing to Artifacte.`);
        auction.currentBid = ebayBid;
        auction.lastBidPlatform = 'sync-from-ebay';
        // In production: call artifactePlaceBid with a keypair
        log('INFO', `Would place Artifacte bid of $${ebayBid} for ${auction.artifacteSlug} (requires wallet keypair)`);
      } else if (artifacteBid > ebayBid && auction.lastBidPlatform !== 'sync-from-artifacte') {
        log('INFO', `Artifacte bid higher for "${auction.title}": $${artifacteBid} > $${ebayBid}. Syncing to eBay.`);
        try {
          await withRetry(
            () => ebayPlaceBid(auction.ebayItemId, artifacteBid),
            `eBay placeBid(${auction.ebayItemId})`
          );
          auction.currentBid = artifacteBid;
          auction.lastBidPlatform = 'sync-from-artifacte';
          log('INFO', `eBay bid placed: $${artifacteBid} on ${auction.ebayItemId}`);
        } catch (err) {
          log('ERROR', `Failed to place eBay bid: ${err.message}`);
        }
      } else {
        auction.currentBid = Math.max(ebayBid, artifacteBid);
      }
    } catch (err) {
      log('ERROR', `Sync error for "${auction.title}": ${err.message}`);
    }
  }

  saveAuctions(auctions);
  syncRunning = false;
}

// ── HTTP Server ────────────────────────────────────────────────────────────────

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => (data += c));
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch { reject(new Error('Invalid JSON')); }
    });
  });
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const method = req.method;

  try {
    // GET /auctions
    if (method === 'GET' && url.pathname === '/auctions') {
      return json(res, 200, auctions);
    }

    // POST /auctions
    if (method === 'POST' && url.pathname === '/auctions') {
      const body = await parseBody(req);
      if (!body.title || !body.ebayItemId || !body.artifacteSlug) {
        return json(res, 400, { error: 'title, ebayItemId, and artifacteSlug required' });
      }
      const entry = {
        id: `sync-${Date.now()}`,
        title: body.title,
        ebayItemId: body.ebayItemId,
        artifacteSlug: body.artifacteSlug,
        currentBid: body.currentBid || 0,
        lastBidPlatform: null,
      };
      auctions.push(entry);
      saveAuctions(auctions);
      log('INFO', `Added synced auction: "${entry.title}"`, entry);
      return json(res, 201, entry);
    }

    // GET /auctions/:id/status
    const statusMatch = url.pathname.match(/^\/auctions\/([^/]+)\/status$/);
    if (method === 'GET' && statusMatch) {
      const found = auctions.find(a => a.id === statusMatch[1]);
      if (!found) return json(res, 404, { error: 'Not found' });
      return json(res, 200, { ...found, syncRunning, pollIntervalMs: POLL_INTERVAL });
    }

    json(res, 404, { error: 'Not found' });
  } catch (err) {
    log('ERROR', `HTTP error: ${err.message}`);
    json(res, 500, { error: err.message });
  }
});

// ── Start ──────────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  log('INFO', `Sync engine running on port ${PORT}`);
  log('INFO', `Polling every ${POLL_INTERVAL}ms for ${auctions.length} auctions`);
});

const pollTimer = setInterval(syncOnce, POLL_INTERVAL);

process.on('SIGINT', () => {
  log('INFO', 'Shutting down...');
  clearInterval(pollTimer);
  server.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  clearInterval(pollTimer);
  server.close();
  process.exit(0);
});
