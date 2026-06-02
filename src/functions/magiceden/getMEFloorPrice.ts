import { config } from "dotenv";
import axiosInstance from "../../axios/axiosInstance";

config()

const ME_KEY = process.env.ME_KEY as string;

export async function getMEFloorPrice(contract: string) {
  const headers_me = {
    "Authorization": `Bearer ${ME_KEY}`
  };

  const url = `https://api-mainnet.magiceden.dev/v3/rtp/ethereum/collections/v7?contract=${contract}&useNonFlaggedFloorAsk=true`;

  try {
    const { data } = await axiosInstance.get<ApiResponse>(url, { headers: headers_me });


    console.log(data.collections[0].topBid);
    return data;
  } catch (error: any) {
    console.error(`Error fetching floor price for contract ${contract}:`, error.message);
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

interface Price {
  currency: Currency;
  amount: Amount;
}

interface Token {
  contract: string;
  tokenId: string;
  name: string;
  image: string;
}

interface FloorAsk {
  id: string;
  sourceDomain: string;
  price: Price;
  maker: string;
  validFrom: number;
  validUntil: number;
  token: Token;
}

interface RoyaltyBreakdown {
  bps: number;
  recipient: string;
}

interface Royalties {
  recipient: string;
  breakdown: RoyaltyBreakdown[];
  bps: number;
}

interface AllRoyalties {
  eip2981: RoyaltyBreakdown[];
  onchain: RoyaltyBreakdown[];
  opensea: RoyaltyBreakdown[];
}

interface Volume {
  "1day": number;
  "7day": number | null;
  "30day": number | null;
  allTime: number;
}

interface VolumeChange {
  "1day": number;
  "7day": number | null;
  "30day": number;
}

interface FloorSale {
  "1day": number;
  "7day": number;
  "30day": number;
}

interface FloorSaleChange {
  "1day": number;
  "7day": number;
  "30day": number;
}

interface Collection {
  chainId: number;
  id: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  symbol: string | null;
  contractDeployedAt: string;
  image: string;
  banner: string;
  twitterUrl: string | null;
  discordUrl: string;
  externalUrl: string;
  twitterUsername: string;
  openseaVerificationStatus: string;
  magicedenVerificationStatus: string | null;
  description: string;
  metadataDisabled: boolean;
  isSpam: boolean;
  isNsfw: boolean;
  isMinting: boolean;
  sampleImages: string[];
  tokenCount: string;
  onSaleCount: string;
  primaryContract: string;
  tokenSetId: string;
  creator: string;
  isSharedContract: boolean;
  royalties: Royalties;
  allRoyalties: AllRoyalties;
  floorAsk: FloorAsk;
  topBid: TopBids;
  rank: {
    "1day": number;
    "7day": number | null;
    "30day": number | null;
    allTime: number;
  };
  volume: Volume;
  volumeChange: VolumeChange;
  floorSale: FloorSale;
  floorSaleChange: FloorSaleChange;
  collectionBidSupported: boolean;
  ownerCount: number;
  contractKind: string;
  mintedTimestamp: number;
  mintStages: any[]; // Adjust if you have specific structure for mintStages
}

interface ApiResponse {
  collections: Collection[];
}

interface TopBids {
  id: string;
  sourceDomain: string;
  price: Price;
  maker: string;
  validFrom: number;
  validUntil: number;
}