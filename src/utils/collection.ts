import axios, { AxiosRequestConfig } from "axios";
import config from "../config";
import axiosInstance from "../axios/axiosInstance";
import limiter from "../bottleneck";
import { fetchCollectionDetails } from "../functions/magiceden/getMECollectionDetails";

export const getListingsFromBlur = async (
  collectionAddress: string,
  authToken: string,
  walletAddress: string,
  isSuspicious: boolean
) => {
  try {
    const options = {
      method: 'GET',
      url: `${config.blurRapidEndpoint}collections/${collectionAddress}/tokens`,
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

    const response = await limiter.schedule(() => axiosInstance.request(options).then((res) => res.data))

    let results: any[] = response.tokens;

    if (!isSuspicious) {
      results = results.filter((item) => item.isSuspicious !== true)
    }

    return results
      .map((listing: any) => {
        return {
          price: parseFloat(listing.price.amount),
          isSuspicious: listing.isSuspicious,
          tokenId: parseInt(listing.tokenId)
        };
      })
      .sort((a: any, b: any) => a - b);
  } catch (err) {
    return [];
  }
};

export const getOpenseaListings = async (slug: string) => {
  const options = {
    method: 'GET',
    url: `https://nfttools.pro/opensea/api/v2/listings/collection/${slug}/best`,

    headers: {
      'X-NFT-API-Key': config.apiKey
    }
  };

  try {
    const { data } = await limiter.schedule(() => axiosInstance.request(options))
    const listings = data.listings.map((item: any) => ({
      offerer: item.protocol_data.parameters.offerer,
      price: item.price.current.value / 10 ** 18
    })).sort((b: any, a: any) => b.price - a.price);

    return listings
  } catch (error) {
    console.log(error);
  }
}
export const getCollectionInfoWithRapidApi = async (collectionSlug: string) => {
  try {
    const { data: collection } = await limiter.schedule(() => axiosInstance
      .get(
        `https://nfttools.pro/opensea/api/v2/collections/${collectionSlug}`,
        {
          headers: {
            'X-NFT-API-Key': config.apiKey
          }
        }
      ))

    let creator_fees;

    console.table(collection.fees)

    let enforceCreatorFee = false;

    if (collection.fees.length > 1) {
      creator_fees = {
        [collection.fees[1].recipient]: collection.fees[1].fee * 100
      };
      enforceCreatorFee = collection.fees[1].required;
    } else {
      creator_fees = { null: 0 }
    }


    return {
      address: collection.editors[0],
      primary_asset_contracts_address: collection.contracts[0].address,
      creator_fees: creator_fees,
      enforceCreatorFee: enforceCreatorFee
    };
  } catch (error) {
    console.log('🌵💜🐢 error', error);
  }
};

export async function getCollectionInfo(collectionSlug: string) {
  try {

    const config = {
      headers: {
        'X-API-KEY': config.openseaApiKey
      }
    };
    const { data: collection } = await axiosInstance
      .get(
        `https://api.opensea.io/api/v2/collections/${collectionSlug}`,
        config
      )

    let creator_fees;

    const floor_price = await getFloorPriceFromOpensea(collectionSlug);
    console.table(collection.fees)

    let enforceCreatorFee = false;

    if (collection.fees.length > 1) {
      creator_fees = {
        [collection.fees[1].recipient]: collection.fees[1].fee * 100
      };
      enforceCreatorFee = collection.fees[1].required;
    } else {
      creator_fees = { null: 0 }
    }

    const schema = await getCollectionSchema(collection.contracts[0].address);

    return {
      address: collection.editors[0],
      floor_price: floor_price,
      primary_asset_contracts_address: collection.contracts[0].address,
      creator_fees: creator_fees,
      schema: schema,
      enforceCreatorFee: enforceCreatorFee
    };
  } catch (error: any) {
    console.log(error.response.data);
  }
}

export async function getFloorPriceFromOpensea(collectionSlug: string) {
  try {
    const config = {
      headers: {
        'X-API-KEY': config.openseaApiKey
      }
    };
    const { data } = await limiter.schedule(() => axiosInstance.get(
      `https://api.opensea.io/api/v2/collections/${collectionSlug}/stats`,
      config
    ))

    console.log({ floor_price: data?.total?.floor_price });

    return data?.total?.floor_price;
  } catch (error) {
    console.log(error);
  }
}

export async function getCollectionSchema(address: string) {
  try {
    const url = `https://nfttools.pro/opensea/api/v2/chain/ethereum/contract/${address}`;
    const options = {
      method: 'GET',
      url: url,
      headers: {
        'X-NFT-API-Key': config.apiKey
      }
    };

    const { data } = await limiter.schedule(() => axiosInstance.request(options));

    return data.contract_standard.toUpperCase();
  } catch (error: any) {
    console.log('getCollectionSchema error: ', error.response.data);
  }
}


export async function getOpenseaListing(contractAddress: string, tokenId: string | number) {
  try {
    const config = {
      headers: {
        'X-API-KEY': config.openseaApiKey
      }
    };

    const { data } = await limiter.schedule(() => axiosInstance.get(`https://api.opensea.io/api/v2/events/chain/ethereum/contract/${contractAddress}/nfts/${tokenId}?event_type=listing`,
      config
    ))

    return data
  } catch (error: any) {
    console.log(error);
    return []
  }
}


export const getFloorPriceFromBlur = async (
  contractAddress: string,
  accessToken: string,
  walletAddress: string
): Promise<number> => {
  const options: AxiosRequestConfig = {
    method: 'GET',
    url: `${config.blurRapidEndpoint}collections/${contractAddress}`,
    params: { filters: '{}' },
    headers: {
      authToken: accessToken,
      walletAddress: walletAddress,
      'X-NFT-API-Key': config.apiKey,
    },
  };

  try {
    const { data } = await limiter.schedule(() => axiosInstance.request<BlurResponse>(options))
    return data?.collection?.floorPrice?.amount ?? 0
  } catch (error: any) {
    console.log(error.response.data);
    return 0
  }

};

interface BlurResponse {
  collection?: {
    floorPrice?: {
      amount: number;
    };
  };
}