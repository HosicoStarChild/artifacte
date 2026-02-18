/**
 * eBay API Client
 * Handles OAuth2 auth, Browse API for reading items, and Trading API for placing bids.
 */

const EBAY_API_BASE = process.env.EBAY_SANDBOX === 'true'
  ? 'https://api.sandbox.ebay.com'
  : 'https://api.ebay.com';

const EBAY_AUTH_URL = process.env.EBAY_SANDBOX === 'true'
  ? 'https://api.sandbox.ebay.com/identity/v1/oauth2/token'
  : 'https://api.ebay.com/identity/v1/oauth2/token';

let cachedToken = null;
let tokenExpiry = 0;

/**
 * Get OAuth2 application token (client credentials flow)
 */
async function getAppToken() {
  if (cachedToken && Date.now() < tokenExpiry - 60000) return cachedToken;

  const appId = process.env.EBAY_APP_ID;
  const certId = process.env.EBAY_CERT_ID;
  if (!appId || !certId) throw new Error('EBAY_APP_ID and EBAY_CERT_ID required');

  const credentials = Buffer.from(`${appId}:${certId}`).toString('base64');

  const res = await fetch(EBAY_AUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eBay OAuth failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + data.expires_in * 1000;
  return cachedToken;
}

/**
 * Fetch item details via Browse API
 */
export async function getItem(itemId) {
  const token = await getAppToken();
  const res = await fetch(`${EBAY_API_BASE}/buy/browse/v1/item/${itemId}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eBay getItem failed (${res.status}): ${text}`);
  }

  const item = await res.json();
  return {
    itemId: item.itemId,
    title: item.title,
    currentBid: item.currentBidPrice ? parseFloat(item.currentBidPrice.value) : null,
    price: item.price ? parseFloat(item.price.value) : null,
    bidCount: item.bidCount || 0,
    endDate: item.itemEndDate,
  };
}

/**
 * Place a bid via Trading API (PlaceOffer)
 * Requires EBAY_USER_TOKEN (user auth token)
 */
export async function placeBid(itemId, amount) {
  const userToken = process.env.EBAY_USER_TOKEN;
  const devId = process.env.EBAY_DEV_ID;
  const appId = process.env.EBAY_APP_ID;
  const certId = process.env.EBAY_CERT_ID;

  if (!userToken) throw new Error('EBAY_USER_TOKEN required for placing bids');

  const xmlBody = `<?xml version="1.0" encoding="utf-8"?>
<PlaceOfferRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${userToken}</eBayAuthToken>
  </RequesterCredentials>
  <ItemID>${itemId}</ItemID>
  <Offer>
    <Action>Bid</Action>
    <MaxBid>
      <currencyID>USD</currencyID>
      <Value>${amount.toFixed(2)}</Value>
    </MaxBid>
    <Quantity>1</Quantity>
  </Offer>
</PlaceOfferRequest>`;

  const tradingUrl = process.env.EBAY_SANDBOX === 'true'
    ? 'https://api.sandbox.ebay.com/ws/api.dll'
    : 'https://api.ebay.com/ws/api.dll';

  const res = await fetch(tradingUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml',
      'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1225',
      'X-EBAY-API-CALL-NAME': 'PlaceOffer',
      'X-EBAY-API-APP-NAME': appId,
      'X-EBAY-API-DEV-NAME': devId,
      'X-EBAY-API-CERT-NAME': certId,
    },
    body: xmlBody,
  });

  const text = await res.text();
  if (text.includes('<Ack>Failure</Ack>')) {
    const errorMatch = text.match(/<ShortMessage>(.*?)<\/ShortMessage>/);
    throw new Error(`eBay PlaceOffer failed: ${errorMatch?.[1] || 'Unknown error'}`);
  }

  return { success: true, response: text };
}

/**
 * Create a new listing via Trading API (AddItem)
 */
export async function createListing(title, description, startPrice, duration = 7, images = []) {
  const userToken = process.env.EBAY_USER_TOKEN;
  const devId = process.env.EBAY_DEV_ID;
  const appId = process.env.EBAY_APP_ID;
  const certId = process.env.EBAY_CERT_ID;

  if (!userToken) throw new Error('EBAY_USER_TOKEN required for creating listings');

  const pictureXml = images.map(url => `<PictureURL>${url}</PictureURL>`).join('\n    ');

  const xmlBody = `<?xml version="1.0" encoding="utf-8"?>
<AddItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${userToken}</eBayAuthToken>
  </RequesterCredentials>
  <Item>
    <Title>${title}</Title>
    <Description><![CDATA[${description}]]></Description>
    <PrimaryCategory><CategoryID>1</CategoryID></PrimaryCategory>
    <StartPrice currencyID="USD">${startPrice.toFixed(2)}</StartPrice>
    <ListingDuration>Days_${duration}</ListingDuration>
    <ListingType>Chinese</ListingType>
    <Country>US</Country>
    <Currency>USD</Currency>
    <PictureDetails>
      ${pictureXml}
    </PictureDetails>
  </Item>
</AddItemRequest>`;

  const tradingUrl = process.env.EBAY_SANDBOX === 'true'
    ? 'https://api.sandbox.ebay.com/ws/api.dll'
    : 'https://api.ebay.com/ws/api.dll';

  const res = await fetch(tradingUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml',
      'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1225',
      'X-EBAY-API-CALL-NAME': 'AddItem',
      'X-EBAY-API-APP-NAME': appId,
      'X-EBAY-API-DEV-NAME': devId,
      'X-EBAY-API-CERT-NAME': certId,
    },
    body: xmlBody,
  });

  const text = await res.text();
  if (text.includes('<Ack>Failure</Ack>')) {
    const errorMatch = text.match(/<ShortMessage>(.*?)<\/ShortMessage>/);
    throw new Error(`eBay AddItem failed: ${errorMatch?.[1] || 'Unknown error'}`);
  }

  const itemIdMatch = text.match(/<ItemID>(.*?)<\/ItemID>/);
  return { success: true, itemId: itemIdMatch?.[1], response: text };
}
