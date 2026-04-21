# BAXUS Integration for Artifacte

## Overview
Successfully integrated BAXUS spirit bottle marketplace with Artifacte, enabling seamless display and purchasing of premium rare spirits directly from BAXUS's API.

## Completed Tasks

### 1. BAXUS Scraper Script ✅
**File:** `/scripts/baxus-sync.mjs`

- Fetches ALL assets from `https://services.baxus.co/api/search/assets` (paginated, 100 per page)
- Deduplicates by `bottle_release_id` (handles multiple assets sharing same bottle release)
- Filters for bottles with `market_price > 0` and valid `image_url`
- Extracts bottle details: name, brand, spirit_type, market_price, image_url, abv, age, country, region, volume_ml, description
- Generates BAXUS URL from `token_asset_address`
- Outputs to `/data/baxus-bottles.json` with timestamp and total count
- Includes progress logging for monitoring

**Usage:**
```bash
node scripts/baxus-sync.mjs
```

### 2. Artifacte Data Layer Updates ✅
**File:** `/lib/data.ts`

#### Changes:
- Added `source: 'baxus' | 'native'` field to `Listing` interface
- Added BAXUS-specific fields: `abv`, `age`, `country`, `region`, `volume_ml`, `spirit_type`, `externalUrl`
- Loads BAXUS bottles JSON on build
- Creates BAXUS listings from bottle data:
  - Category: 'SPIRITS' (only)
  - Type: Fixed Price
  - Verified: BAXUS
  - Price: market_price in USD
  - Image: from BAXUS CDN (https://d1w35me0y6a2bb.cloudfront.net/...)
  - External URL: BAXUS asset link
- Merges BAXUS listings with native listings
- Maintains all existing native listings unchanged
- Top 200 BAXUS bottles by price available in data layer (first ~50 featured on homepage)

### 3. Auction Detail Page Updates ✅
**File:** `/app/auctions/[slug]/page.tsx`

#### New Features:
- Detects BAXUS fixed-price listings (`verifiedBy === 'BAXUS'` with no bids)
- Displays "Buy on BAXUS" gold button that opens external BAXUS URL in new tab
- Shows bottle details section with:
  - ABV (Alcohol by Volume)
  - Age (Years)
  - Volume (ml)
  - Country
  - Region
  - Spirit Type
- Gold BAXUS Verified badge remains visible
- Hides bid input interface for BAXUS fixed-price items
- Shows "Price" instead of "Current Bid" label for BAXUS bottles
- No countdown timer for fixed-price BAXUS listings

### 4. Homepage Updates ✅
**File:** `/app/page.tsx`

#### New Section:
- Added "Fine Spirits 🥃" carousel section below Live Auctions
- Shows top 6 BAXUS bottles by price in scrollable carousel
- Filtered from SPIRITS category only
- Uses `object-contain` for bottle images (preserves aspect ratio)
- Links to `/auctions/categories/spirits` for full Spirits collection
- Maintains dark Sotheby's aesthetic with Playfair Display serif font
- Gold accents for verified badges

### 5. Category Page Compatibility ✅
**File:** `/app/auctions/categories/[category]/page.tsx`

- BAXUS bottles automatically appear in Spirits (`/auctions/categories/spirits`) category
- Fixed Price tab shows all BAXUS spirits listings
- Category filters work seamlessly with BAXUS data
- Existing category functionality preserved

## Data Structure

### BAXUS Bottle Object (in JSON):
```typescript
{
  id: number;
  name: string;
  brand: string;
  spirit_type: string;
  market_price: number;
  image_url: string;
  abv: number | null;
  age: number | null;
  country: string | null;
  region: string | null;
  volume_ml: number | null;
  description: string;
  bottle_release_id: number;
  baxusUrl: string; // https://baxus.co/asset/{token_asset_address}
}
```

### Listing (Artifacte):
```typescript
interface Listing {
  id: string; // "baxus-{bottle_release_id}"
  name: string; // "{brand} {name}"
  subtitle: string; // "{spirit_type} • {age}yr • {country}"
  price: number; // market_price in USD
  image: string; // BAXUS CDN URL
  category: 'SPIRITS';
  verifiedBy: 'BAXUS';
  source: 'baxus';
  externalUrl: string; // BAXUS asset URL
  abv?: number;
  age?: number;
  country?: string;
  region?: string;
  volume_ml?: number;
  spirit_type?: string;
}
```

## Design Considerations

### Styling:
- ✅ Dark Sotheby's aesthetic maintained (dark-800/900 backgrounds)
- ✅ Gold accents for BAXUS Verified badge (#d4af37)
- ✅ Playfair Display serif font for headings
- ✅ `object-contain` for bottle images (not `object-cover`)

### Functionality:
- ✅ BAXUS Verified badge in gold (existing component reused)
- ✅ "Buy on BAXUS" button opens external URL in new tab
- ✅ Bottle details shown only for BAXUS listings with data
- ✅ Native listings retain all auction functionality
- ✅ No cross-contamination with other categories

## TypeScript/Build:
- ✅ Strict TypeScript compatibility maintained
- ✅ Next.js build successful (0 errors)
- ✅ All pages static-prerendered

## Future Enhancements

1. **Full BAXUS Sync**: Run scraper periodically to fetch all ~11,177 bottles
   - Currently using sample data (10 bottles) for testing
   - Production: Implement cron job for daily/weekly sync

2. **Referral Links**: Add BAXUS referral tracking to external URLs
   - Will generate referral income from BAXUS purchases

3. **Search/Filter**: Add advanced filters for Spirits category
   - Spirit type, age range, price range, country/region
   - Already supported in category page infrastructure

4. **Secondary Market**: Enable on-chain trading for BAXUS NFTs
   - Some BAXUS bottles already tokenized on Solana
   - Can list those as native auctions with referral flow

5. **Reviews/Ratings**: Community ratings for spirits
   - Tasting notes, reviews from collectors
   - Aggregated into listing display

## Testing Checklist

- ✅ BAXUS scraper script runs without errors
- ✅ BAXUS bottles load in data layer
- ✅ Listings array includes BAXUS items + native items
- ✅ Homepage renders Spirits carousel with BAXUS bottles
- ✅ Category page shows BAXUS bottles in Spirits
- ✅ Auction detail page shows "Buy on BAXUS" for BAXUS items
- ✅ Bottle details section displays correctly
- ✅ Gold verified badge visible
- ✅ Native listings unaffected
- ✅ Next.js build compiles without errors
- ✅ Image loading (using object-contain)
- ✅ External URL opens in new tab

## Files Modified/Created

### New Files:
- `/scripts/baxus-sync.mjs` - Scraper script
- `/data/baxus-bottles.json` - Sample BAXUS bottles data

### Modified Files:
- `/lib/data.ts` - Data layer with BAXUS integration
- `/app/page.tsx` - Homepage with Spirits carousel
- `/app/auctions/[slug]/page.tsx` - Auction detail page with BAXUS support

### Unchanged Files:
- `/app/auctions/page.tsx` - Works seamlessly with BAXUS listings
- `/app/auctions/categories/[category]/page.tsx` - Automatically filters BAXUS bottles
- All components (VerifiedBadge, etc.) - Reused without changes
- All other auction/native functionality - Fully preserved

## Notes

- BAXUS listings are read-only (no bidding, fixed price only)
- External URL flow handles BAXUS transaction processing
- Sample data includes 10 real BAXUS bottles from API for testing
- Full scraper can fetch ~11,177 bottles when needed
- All URLs pointing to production BAXUS platform (baxus.co)
