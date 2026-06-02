import axiosInstance from "../axios/axiosInstance";
import limiter from "../bottleneck";
import config from "../config";

export async function getMagicEdenListings(collection: string) {
  const url = 'https://nfttools.pro/magiceden/v3/rtp/ethereum/tokens/v7';
  const params = {
    includeQuantity: true,
    includeLastSale: true,
    excludeSpam: true,
    excludeBurnt: true,
    collection: collection,
    sortBy: 'floorAskPrice',
    sortDirection: 'asc',
    includeAttributes: false,
    normalizeRoyalties: false,
    limit: '50',
    displayCurrency: '0x2170ed0880ac9a755fd29b2688956bd959f933f8'
  };

  try {
    const headers = {
      "X-NFT-API-Key": config.apiKey,
    };
    const { data } = await limiter.schedule(() => axiosInstance.get<ApiResponse>(url, { params, headers: headers }))

    console.log(data.tokens[0].token.lastSale);

    const orders = data.tokens.map((token) => ({ price: token?.market?.floorAsk?.price?.amount?.decimal, market: token?.market?.floorAsk?.source?.name, token: token?.token?.tokenId }))

    return orders

  } catch (error: any) {
    console.log(error?.response?.data);
    return []
  }
}
interface Currency {
  contract: string;
  name: string;
  symbol: string;
  decimals: number;
}

interface Amount {
  raw: string;
  decimal: number;
  usd: number;
  native: number;
}

interface FloorAskPrice {
  currency: Currency;
  amount: Amount;
}

interface Collection {
  id: string;
  name: string;
  image: string;
  slug: string;
  symbol: string;
  creator: string;
  tokenCount: number;
  metadataDisabled: boolean;
  floorAskPrice: FloorAskPrice;
}

interface LastSalePrice {
  currency: Currency;
  amount: Amount;
}

interface NetAmount {
  raw: string;
  decimal: number;
  usd: number;
  native: number;
}

interface FeeBreakdown {
  kind: string;
  bps: number;
  recipient: string;
  rawAmount: string;
}

interface LastSale {
  orderSource: string;
  fillSource: string;
  timestamp: number;
  price: LastSalePrice;
  netAmount: NetAmount;
  royaltyFeeBps: number;
  feeBreakdown: FeeBreakdown[];
}

interface FloorAsk {
  id: string;
  price: { amount: Amount, currency: Currency, quantityFilled: string, quantityRemaining: string };
  maker: string;
  validFrom: number;
  validUntil: number;
  quantityFilled: string;
  quantityRemaining: string;
  source: {
    id: string;
    domain: string;
    name: string;
    icon: string;
    url: string;
  };
}

interface Market {
  floorAsk: FloorAsk;
}

interface Media {
  image: string;
}

interface Token {
  chainId: number;
  contract: string;
  tokenId: string;
  name: string;
  description: string | null;
  image: string;
  imageSmall: string;
  imageLarge: string;
  media: Media | null;
  kind: string;
  isFlagged: boolean;
  isSpam: boolean;
  isNsfw: boolean;
  metadataDisabled: boolean;
  lastFlagUpdate: string;
  lastFlagChange: string | null;
  supply: string;
  remainingSupply: string;
  decimals: number | null;
  rarity: number;
  rarityRank: number;
  collection: Collection;
  lastSale: LastSale;
  owner: string;
  mintStages: any[];  // Specify the type if known
}

interface TokenData {
  token: Token;
  market: Market;
  updatedAt: string;
  media: Media;
}

interface ApiResponse {
  tokens: TokenData[];
}
