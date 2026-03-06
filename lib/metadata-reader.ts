/**
 * NFT Metadata Reader - Helius DAS API integration
 * Reads NFT metadata and auto-detects verifiedBy field
 */

const HELIUS_API_KEY = "345726df-3822-42c1-86e0-1a13dc6c7a04";
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

// Known authorities for verification
const KNOWN_AUTHORITIES = {
  BAXUS: "BAXUz8YJsRtZVZuMaespnrDPMapvu83USD6PXh4GgHjg",
  PSA: [
    "PSA1111111111111111111111111111111111111111", // PSA grading
    "9epZmD7WbzZvPb9TzAtC88EhVWNJVP9yHiMEQeVWFVEX",
  ],
  CHRONO24: [
    "Chrono24Address11111111111111111111111111", // Chrono24
  ],
};

export interface NFTMetadata {
  name: string;
  image: string;
  symbol: string;
  authority: string;
  verifiedBy: "BAXUS" | "PSA" | "Chrono24" | "Metaplex" | string;
  creator?: string;
  mint: string;
}

export interface NFTAsset {
  id: string;
  content: {
    metadata: {
      name: string;
      symbol?: string;
    };
    files?: Array<{
      uri: string;
      mime: string;
    }>;
    links?: {
      image?: string;
    };
  };
  authorities?: Array<{
    address: string;
  }>;
  creators?: Array<{
    address: string;
    verified: boolean;
  }>;
}

/**
 * Fetch NFTs owned by a wallet address using Helius DAS API
 */
export async function getAssetsByOwner(walletAddress: string): Promise<NFTAsset[]> {
  try {
    const response = await fetch(HELIUS_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "helius-das",
        method: "getAssetsByOwner",
        params: {
          ownerAddress: walletAddress,
          page: 1,
          limit: 1000,
          displayOptions: {
            showFungible: false,
            showNativeBalance: false,
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Helius API error: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`Helius RPC error: ${data.error.message}`);
    }

    const items: NFTAsset[] = data.result?.items || [];
    
    // Filter out burned, compressed, and invalid NFTs
    return items.filter((item: any) => {
      // Skip burned assets
      if (item.burnt === true) return false;
      // Skip frozen/invalid
      if (item.ownership?.frozen === true) return false;
      // Skip if supply is 0 (redeemed)
      if (item.supply?.print_current_supply === 0 && item.supply?.print_max_supply === 0) {
        // Allow edition NFTs but skip truly empty ones
        if (!item.content?.metadata?.name) return false;
      }
      // Skip fungible tokens that slip through
      if (item.interface === "FungibleToken" || item.interface === "FungibleAsset") return false;
      // Must have content/metadata
      if (!item.content) return false;
      return true;
    });
  } catch (error) {
    console.error("Error fetching assets from Helius:", error);
    throw error;
  }
}

/**
 * Auto-detect verifiedBy field from symbol and authority
 */
function detectVerifiedBy(nft: NFTAsset): string {
  const symbol = nft.content?.metadata?.symbol || "";
  const authority = nft.authorities?.[0]?.address || "";

  // Check for BAXUS
  if (symbol.includes("BAXUS") || authority === KNOWN_AUTHORITIES.BAXUS) {
    return "BAXUS";
  }

  // Check for PSA grading
  if (KNOWN_AUTHORITIES.PSA.some((addr) => authority === addr) || symbol.includes("PSA")) {
    return "PSA";
  }

  // Check for Chrono24
  if (
    KNOWN_AUTHORITIES.CHRONO24.some((addr) => authority === addr) ||
    symbol.includes("Chrono24") ||
    symbol.includes("CHRONO24")
  ) {
    return "Chrono24";
  }

  // Default to symbol if available, else Metaplex
  if (symbol && symbol.length > 0) {
    return symbol;
  }

  return "Metaplex";
}

/**
 * Read NFT metadata and auto-detect verifiedBy
 */
export function readNFTMetadata(nft: NFTAsset): NFTMetadata {
  const name = nft.content?.metadata?.name || "Unnamed NFT";
  const symbol = nft.content?.metadata?.symbol || "";
  const authority = nft.authorities?.[0]?.address || "";
  const creator = nft.creators?.[0]?.address;

  // Get image URL
  let image = "";
  if (nft.content?.links?.image) {
    image = nft.content.links.image;
  } else if (nft.content?.files?.[0]) {
    image = nft.content.files[0].uri;
  }

  return {
    name,
    image,
    symbol,
    authority,
    verifiedBy: detectVerifiedBy(nft),
    creator,
    mint: nft.id,
  };
}

/**
 * Determine currency based on category and verifiedBy
 */
export function determineCurrency(
  category: string,
  verifiedBy: string
): "SOL" | "USDC" | "USD1" {
  // Digital Art uses SOL
  if (category === "DIGITAL_ART") {
    return "SOL";
  }

  // BAXUS items use USDC (USD1)
  if (verifiedBy === "BAXUS") {
    return "USD1";
  }

  // Everything else defaults to USDC
  return "USDC";
}

/**
 * Calculate seller fee if applicable
 */
export function calculateSellerFee(
  price: number,
  verifiedBy: string,
  feeEnabled: boolean
): number {
  if (verifiedBy === "BAXUS" && feeEnabled) {
    return price * 0.1; // 10% fee
  }
  return 0;
}
