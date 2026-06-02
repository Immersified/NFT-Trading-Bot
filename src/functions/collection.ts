import config from '../config';
import { formatUnits } from 'ethers/lib/utils';
import { AxiosResponse } from 'axios';
import axiosInstance from '../axios/axiosInstance';
import limiter from '../bottleneck';

async function getCollectionSchema(address: string): Promise<string | undefined> {
  try {
    const url = `https://nfttools.pro/opensea/api/v2/chain/ethereum/contract/${address}`;
    const options = {
      method: 'GET',
      url: url,
      headers: {
        'X-NFT-API-Key': config.apiKey
      }
    };

    const { data } = await limiter.schedule(() => axiosInstance.request<{ contract_standard: string }>(options));

    return data.contract_standard.toUpperCase();
  } catch (error: any) {
    return undefined;
  }
}

async function getFloorPriceFromOpensea(collectionSlug: string): Promise<number | undefined> {
  try {
    const config = {
      headers: {
        'X-API-KEY': config.openseaApiKey
      }
    };
    const { data } = await limiter.schedule(() => axiosInstance.get<{ total: { floor_price: number } }>(
      `https://api.opensea.io/api/v2/collections/${collectionSlug}/stats`,
      config
    ));

    return data?.total?.floor_price;
  } catch (error) {
    console.log(error);
    return undefined;
  }
}

interface CollectionInfo {
  address: string;
  floor_price: number | undefined;
  primary_asset_contracts_address: string;
  creator_fees: Record<string, number>;
  schema?: string;
  enforceCreatorFee?: boolean;
}

// Function to get the collection data and return relevant information to make the trade.
// We return the address of the creator, floor price, contract address, seller fee and royalty address
const getCollectionInfo = async (collectionSlug: string): Promise<CollectionInfo> => {
  const { data: collection } = await limiter.schedule(() => axiosInstance.get(
    `https://api.opensea.io/api/v2/collections/${collectionSlug}`,
    {
      headers: {
        'X-API-KEY': config.openseaApiKey
      }
    }
  ))



  let creator_fees: Record<string, number>;

  // Check if creator fees enforced. If so, calculate total fee from seller fee. Else, set it to 0.5%
  if (collection.fees.length > 0) {
    // Check if the seller fees are empty. If empty then we assign 0 as the seller fee amount

    if (Object.keys(collection.fees.length > 1)) {
      creator_fees = {
        [collection.fees[1].recipient]: collection.fees[1].fee * 100
      };
    } else {
      creator_fees = { null: 0 };
    }
  } else {
    creator_fees = { null: 50 };
  }

  const floor_price = await getFloorPriceFromOpensea(collectionSlug);
  console.log({
    address: collection.editors[0],
    floor_price: floor_price,
    primary_asset_contracts_address: collection.contracts[0].address,
    creator_fees: creator_fees
  });

  return {
    address: collection.editors[0],
    floor_price: floor_price,
    primary_asset_contracts_address: collection.contracts[0].address,
    creator_fees: creator_fees
  };
};

// Function to get the collection data and return relevant information to make the trade.
// We return the address of the creator, floor price, contract address, seller fee and royalty address
const getCollectionInfoWithRapidApi = async (collectionSlug: string, opensea_api_key?: string): Promise<CollectionInfo | undefined> => {
  try {
    const url = opensea_api_key ? `https://api.opensea.io/api/v2/collections/${collectionSlug}` : `https://nfttools.pro/opensea/api/v2/collections/${collectionSlug}`;
    const collection = await limiter.schedule(() => axiosInstance
      .get<any>(
        url,
        {
          headers: opensea_api_key 
            ? { 'x-api-key': opensea_api_key } 
            : { 'X-NFT-API-Key': config.apiKey }
        }
      ))
      .then((res) => {
        return res.data;
      });

    let creator_fees: Record<string, number>;

    const floor_price = await getFloorPriceFromOpensea(collectionSlug);

    // Check if creator fees enforced. If so, calculate total fee from seller fee. Else, set it to 0.5%
    // Check if the seller fees are empty. If empty then we assign 0 as the seller fee amount

    let enforceCreatorFee = false;

    if (collection.fees.length > 1) {
      creator_fees = {
        [collection.fees[1].recipient]: collection.fees[1].fee * 100
      };
      enforceCreatorFee = collection.fees[1].required;
    } else {
      creator_fees = { null: 0 };
    }

    const schema = await getCollectionSchema(collection.contracts[0]?.address);

    return {
      address: collection.editors[0],
      floor_price: floor_price,
      primary_asset_contracts_address: collection.contracts[0]?.address,
      creator_fees: creator_fees,
      schema: schema,
      enforceCreatorFee: enforceCreatorFee
    };
  } catch (error) {
    console.log('🌵💜🐢 error', error);
    return undefined;
  }
};

// Function to get the collection data and returns relevant information to make the trade.
// We return the address of the creator, floor price, contract address, seller fee and royalty address
const getFloorPriceFromBlur = async (
  contractAddress: string,
  accessToken: string,
  walletAddress: string
): Promise<number | null> => {
  const options = {
    method: 'GET',
    url: `${config.blurRapidEndpoint}collections/${contractAddress}`,
    params: { filters: '{}' },
    headers: {
      authToken: accessToken,
      walletAddress: walletAddress,
      'X-NFT-API-Key': config.apiKey
    }
  };

  const response = await limiter.schedule(() => axiosInstance
    .request<{ collection: { floorPrice: { amount: number } } }>(options))
    .then((res) => res.data)
    .catch((err) => console.log('getFloorPriceFromBlur', err?.response?.data));

  return response?.collection?.floorPrice?.amount ?? null;
};

interface ListingOptions {
  limit: string;
  next?: string;
}

const getFiveLowestListingsFromOpensea = async (collectionSlug: string): Promise<number[]> => {
  const options = {
    method: 'GET',
    url: `${config.openseaRapidEndpoint.replace(
      'v1',
      'v2'
    )}listings/collection/${collectionSlug}/all`,
    params: { limit: '100' } as ListingOptions,
    headers: {
      'X-NFT-API-Key': config.apiKey
    }
  };

  let results: any[] = [];
  let response: AxiosResponse<{ listings: any[], next: string | null }> | undefined;
  do {
    if (response?.data.next) {
      options.params.next = response.data.next;
    }

    response = await limiter.schedule(() => axiosInstance.request(options));
    if (response) {
      results = [...results, ...response.data.listings];
    }

  } while (response?.data.next);

  return results
    .map((listing) => parseFloat(formatUnits(listing.price.current.value)))
    .sort((a, b) => a - b)
    .slice(0, 5);
};

interface BlurListing {
  price: number;
  isSuspicious: boolean;
  tokenId: number;
}

const getListingsFromBlur = async (
  collectionAddress: string,
  authToken: string,
  walletAddress: string
): Promise<BlurListing[]> => {
  try {
    const options = {
      method: 'GET',
      url: `https://nfttools.pro/blur/v1/collections/${collectionAddress}/tokens`,
      params: {
        filters: ''
      },
      headers: {
        authToken: authToken,
        walletAddress: walletAddress,
        'X-NFT-API-Key': config.apiKey
      }
    };

    let filters = {
      cursor: null,
      traits: [],
      hasAsks: true
    };
    options.params.filters = JSON.stringify(filters);

    const response = await limiter.schedule(() => axiosInstance
      .request<{ tokens: TokenData[] }>(options))
      .then((res) => res.data);

    const results = response.tokens;


    return results
      .map((listing) => {
        return {
          price: parseFloat(listing.price.amount),
          isSuspicious: listing.isSuspicious,
          tokenId: parseInt(listing.tokenId)
        };
      })
      .sort((a, b) => a.price - b.price);
  } catch (err) {
    return [];
  }
};

export {
  getCollectionInfo,
  getCollectionInfoWithRapidApi,
  getFloorPriceFromBlur,
  getFiveLowestListingsFromOpensea,
  getListingsFromBlur,
  getFloorPriceFromOpensea
};

interface Trait {
  Tier: string;
  Faction: string;
}

interface Price {
  amount: string;
  unit: string;
  listedAt: string;
  marketplace: string;
}

interface LastSale {
  amount: string;
  unit: string;
  listedAt: string;
}

interface LastCostBasis {
  amount: string;
  unit: string;
  listedAt: string;
}

interface Owner {
  address: string;
  username: string | null;
}

interface TokenData {
  tokenId: string;
  name: string;
  imageUrl: string;
  traits: Trait;
  rarityScore: number;
  rarityRank: number;
  price: Price;
  highestBid: null;
  lastSale: LastSale;
  lastCostBasis: LastCostBasis;
  owner: Owner;
  numberOwnedByOwner: number;
  isSuspicious: boolean;
}