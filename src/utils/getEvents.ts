import axiosInstance from "../axios/axiosInstance";
import limiter from "../bottleneck";
import config from "../config";

export async function getEvents(contractAddress: string, tokenId: string | number) {
  const options = {
    method: 'GET',
    url: `https://nfttools.pro/opensea/api/v2/events/chain/ethereum/contract/${contractAddress}/nfts/${tokenId}?event_type=offer`,
    headers: {
      'X-NFT-API-Key': config.apiKey
    }
  };
  try {
    const { data } = await limiter.schedule(() => axiosInstance.request<Events>(options));
    return data
  } catch (error) {
    console.error(error);
  }

}

interface Events {
  asset_events: OrderEvent[]
}

interface OrderEvent {
  event_type: string;
  order_hash: string;
  order_type: string;
  chain: string;
  protocol_address: string;
  start_date: number;
  expiration_date: number;
  asset: Asset;
  quantity: number;
  maker: string;
  taker: string;
  payment: Payment;
  criteria: {};
  event_timestamp: number;
  is_private_listing: boolean;
}

interface Asset {
  identifier: string;
  collection: string;
  contract: string;
  token_standard: string;
  name: string;
  description: null;
  image_url: string;
  metadata_url: string;
  opensea_url: string;
  updated_at: string;
  is_disabled: boolean;
  is_nsfw: boolean;
}

interface Payment {
  quantity: string;
  token_address: string;
  decimals: number;
  symbol: string;
}