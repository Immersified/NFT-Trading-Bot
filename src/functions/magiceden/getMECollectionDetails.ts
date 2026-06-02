import { config } from "dotenv";
import axiosInstance from "../../axios/axiosInstance";

config()

const API_KEY = process.env.API_KEY as string;

const headers = {
  'Content-Type': 'application/json',
  'X-NFT-API-Key': API_KEY,
}


export async function fetchCollectionDetails(contractAddress: string) {
  const url = 'https://nfttools.pro/magiceden/v3/rtp/ethereum/collections/v7';
  const params = {
    id: contractAddress,
    limit: 1,
    includeSalesCount: true,
    excludeSpam: true,
  };


  try {
    const { data } = await axiosInstance.get<FetchCollectionDetailsResponse>(url, { params, headers });
    return data
  } catch (error: any) {
    console.log(error.response.data);
  }
}

interface Collection {
  chainId: number;
  id: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  symbol: string;
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
  royalties: {
    recipient: string;
    breakdown: { bps: number; recipient: string }[];
    bps: number;
  };
  allRoyalties: {
    onchain: { bps: number; recipient: string }[];
    opensea: { bps: number; required: boolean; recipient: string }[];
  };
  floorAsk: {
    id: string;
    sourceDomain: string;
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
    maker: string;
    validFrom: number;
    validUntil: number;
    token: {
      contract: string;
      tokenId: string;
      name: string;
      image: string;
    };
  };
  topBid: {
    id: string;
    sourceDomain: string;
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
      netAmount: {
        raw: string;
        decimal: number;
        usd: number;
        native: number;
      };
    };
    maker: string;
    validFrom: number;
    validUntil: number;
  };
  rank: {
    '"1day"': number;
    '"7day"': number;
    '"30day"': number;
    allTime: number;
  };
  volume: {
    '"1day"': number;
    '"7day"': number;
    '"30day"': number;
    allTime: number;
  };
  volumeChange: {
    '"1day"': number;
    '"7day"': number;
    '"30day"': number;
  };
  floorSale: {
    '"1day"': number;
    '"7day"': number;
    '"30day"': number;
  };
  floorSaleChange: {
    '"1day"': number;
    '"7day"': number;
    '"30day"': number;
  };
  salesCount: {
    '"1day"': string;
    '"7day"': string;
    '"30day"': string;
    allTime: string;
  };
  collectionBidSupported: boolean;
  ownerCount: number;
  contractKind: string;
  mintedTimestamp: string | null;
  mintStages: any[];
}

export interface FetchCollectionDetailsResponse {
  collections: Collection[];
  continuation: string;
}