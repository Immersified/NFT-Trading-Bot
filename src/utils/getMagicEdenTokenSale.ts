import axiosInstance from "../axios/axiosInstance";
import limiter from "../bottleneck";
import config from "../config";

export async function getMagicEdenLastSale(contract: string, tokenId: string | number) {
  const headers = {
    "X-NFT-API-Key": config.apiKey,
  };

  const url = `https://nfttools.pro/magiceden/v3/rtp/ethereum/tokens/${contract}:${tokenId}/activity/v5`;
  const params = {
    sortBy: 'eventTimestamp',
    types: 'sale'
  };

  try {
    const { data } = await limiter.schedule(() => axiosInstance.get<ActivitiesData>(url, { params, headers: headers }))

    console.log({ data: JSON.stringify(data.activities[0], null) });

    return { date: data.activities[0].createdAt, price: data.activities[0].price.amount.decimal }


  } catch (error: any) {
    console.log(error.response.data);
    return { date: null, price: 0 }

  }
}

interface Activity {
  type: string;
  fromAddress: string;
  toAddress: string;
  price: {
    currency: {
      contract: string;
      name: string;
      symbol: string;
      decimals: number;
    };
    amount: {
      raw: string;
      decimal: number;
      usd: number;
      native: number;
    };
  };
  amount: number;
  timestamp: number;
  createdAt: string;
  contract: string;
  token: {
    tokenId: string;
    isSpam: boolean;
    isNsfw: boolean;
    tokenName: string;
    tokenImage: string;
    rarityScore: number;
    rarityRank: number;
  };
  collection: {
    collectionId: string;
    isSpam: boolean;
    isNsfw: boolean;
    collectionName: string;
    collectionImage: string;
  };
  txHash: string;
  logIndex: number;
  batchIndex: number;
  fillSource: {
    domain: string;
    name: string;
    icon: string;
  };
  order: {
    id: string;
    side: string;
    source: {
      domain: string;
      name: string;
      icon: string;
    };
    criteria?: {
      kind: string;
      data: {
        collection: {
          id: string;
          name: string;
          image: string;
          isSpam: boolean;
          isNsfw: boolean;
        };
        token?: {
          tokenId: string;
          name: string | null;
          image: string | null;
          isSpam: boolean;
          isNsfw: boolean;
        };
      };
    };
  };
}

interface ActivitiesData {
  activities: Activity[];
}
