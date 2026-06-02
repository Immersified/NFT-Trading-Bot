import axiosInstance from "../axios/axiosInstance";
import limiter from "../bottleneck";
import config from "../config";

export async function getMagicEdenHighestOffer(contractAddress: string, slug: string) {
  const url = 'https://nfttools.pro/magiceden/v3/rtp/ethereum/orders/bids/v6';
  const params = {
    collection: contractAddress,
    sortBy: 'price',
    status: 'active',
    excludeEOA: 'false',
    includeCriteriaMetadata: 'true',
    includeDepth: 'true',
    normalizeRoyalties: 'false'
  };

  try {
    const headers = {
      "X-NFT-API-Key": config.apiKey,
    };

    const { data } = await limiter.schedule(() => axiosInstance.get<OrdersResponse>(url, { params, headers: headers }))

    const orders = data.orders
      .map((item) => {
        const quantity = item.quantityFilled + item.quantityRemaining
        return { createdAt: item.createdAt, maker: item.maker, amount: (+item.price.amount.raw) / 1e18, netAmount: (+item.price.netAmount.raw) / 1e18, marketPlace: item && item.source && item.source.name ? item.source.name.toUpperCase() : "N/A", quantity }
      })

    console.log('-------------------------------------------------');
    console.log(`MAGIC EDEN HIGHEST OFFERS ${slug}`);
    console.table(orders)
    console.log('-------------------------------------------------');

    return data.orders

  } catch (error) {
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

interface NetAmount {
  raw: string;
  decimal: number;
  usd: number;
  native: number;
}

interface Price {
  currency: Currency;
  amount: Amount;
  netAmount: NetAmount;
}

interface CollectionData {
  id: string;
  name: string;
  image: string;
}

interface CriteriaData {
  collection: CollectionData;
}

interface Criteria {
  kind: string;
  data: CriteriaData;
}

interface Source {
  id: string;
  domain: string;
  name: string;
  icon: string;
  url: string;
}

interface FeeBreakdown {
  kind: string;
  recipient: string;
  bps: number;
}

interface Depth {
  price: number;
  quantity: number;
}

export interface Order {
  id: string;
  kind: string;
  side: string;
  status: string;
  tokenSetId: string;
  tokenSetSchemaHash: string;
  contract: string;
  contractKind: string;
  maker: string;
  taker: string;
  price: Price;
  validFrom: number;
  validUntil: number;
  quantityFilled: number;
  quantityRemaining: number;
  criteria: Criteria;
  source: Source;
  feeBps: number;
  feeBreakdown: FeeBreakdown[];
  expiration: number;
  isReservoir: boolean | null;
  createdAt: string;
  updatedAt: string;
  originatedAt: string | null;
  depth: Depth[];
}

export interface OrdersResponse {
  orders: Order[];
}
