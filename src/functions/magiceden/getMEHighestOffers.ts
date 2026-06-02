import { config } from "dotenv";
import axiosInstance from "../../axios/axiosInstance";
import limiter from "../../bottleneck";

config()

const ME_KEY = process.env.ME_KEY as string;

export async function getMEOffers(contract: `0x${string}`) {
  const BASE_URL = 'https://api-mainnet.magiceden.dev/v3/rtp/ethereum/orders/bids/v6';

  const headers_me = {
    "accept": "/",
    "Authorization": `Bearer ${ME_KEY}`
  };
  const url = `${BASE_URL}?collection=${contract}&status=active&sortBy=price&limit=50&displayCurrency=0x2170ed0880ac9a755fd29b2688956bd959f933f8`;

  try {
    const { data } = await limiter.schedule(() => axiosInstance.get<ApiResponse>(url, { headers: headers_me }))

    const offers = data.orders
      .sort((a, b) => b.price.amount.decimal - a.price.amount.decimal)
      .map((item) => ({
        date: item.createdAt,
        amount: item.price.amount.decimal,
        marketplace: item.source.name,
      }))


    const openseaOffers = data.orders
      .filter(item => item.source.name.toLowerCase() === "opensea")
      .sort((a, b) => b.price.amount.decimal - a.price.amount.decimal)

    const blurOffers = data.orders
      .filter(item => item.source.name.toLowerCase() === "blur")
      .sort((a, b) => b.price.amount.decimal - a.price.amount.decimal)

    const magicedenOffers = data.orders.sort((a, b) => b.price.amount.decimal - a.price.amount.decimal)

    return { openseaOffers, blurOffers, magicedenOffers }
  } catch (error: any) {
    console.error('Error fetching highest offers:', error?.response?.data);
  }

}


export async function getMEHighestOffers(contract: `0x${string}`, slug: string) {
  const BASE_URL = 'https://api-mainnet.magiceden.dev/v3/rtp/ethereum/orders/bids/v6';

  const headers_me = {
    "accept": "/",
    "Authorization": `Bearer ${ME_KEY}`
  };
  const url = `${BASE_URL}?collection=${contract}&status=active&sortBy=price&limit=50&displayCurrency=0x2170ed0880ac9a755fd29b2688956bd959f933f8`;

  try {
    const { data } = await limiter.schedule(() => axiosInstance.get<ApiResponse>(url, { headers: headers_me }))

    const offers = data.orders
      .sort((a, b) => b.price.amount.decimal - a.price.amount.decimal)
      .map((item) => ({
        date: item.createdAt,
        amount: item.price.amount.decimal,
        marketplace: item.source.name,
        maker: item.maker.toString(),
      }))

    console.log('---------------------------------------------------------------------------------');
    console.log(`OFFERS FOR ${slug}`);
    console.table(offers)
    console.log('---------------------------------------------------------------------------------');


    const opensea = data.orders
      .filter(item => item.source.name.toLowerCase() === "opensea")
      .sort((a, b) => b.price.amount.decimal - a.price.amount.decimal)
    [0]

    const blur = data.orders
      .filter(item => item.source.name.toLowerCase() === "blur")
      .sort((a, b) => b.price.amount.decimal - a.price.amount.decimal)[0]

    const magiceden = data.orders.sort((a, b) => b.price.amount.decimal - a.price.amount.decimal)[0]

    return { opensea, blur, magiceden, offers }
  } catch (error) {
    console.error('Error fetching highest offers:', error);
    throw error;
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

interface NetAmount extends Amount { }

interface Price {
  currency: Currency;
  amount: Amount;
  netAmount: NetAmount;
}

interface Collection {
  id: string;
}

interface CriteriaData {
  collection: Collection;
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

export interface Orders {
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
}

interface ApiResponse {
  orders: Orders[],
  continuation: string | null
}
