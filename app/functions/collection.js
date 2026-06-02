const fetch = require('node-fetch');
const config = require('../config');
const { formatUnits } = require('ethers/lib/utils');
const { axiosInstance } = require('../axios/axiosInstance');
const limiter = require('../bottleneck');

async function getCollectionSchema(address) {
  try {
    const url = `https://nfttools.pro/opensea/api/v2/chain/ethereum/contract/${address}`;
    const options = {
      method: 'GET',
      url: url,
      headers: {
        'X-NFT-API-Key': config.apiKey
      }
    };

    const { data } = await limiter.schedule(() =>
      axiosInstance.request(options)
    );

    return data.contract_standard.toUpperCase();
  } catch (error) {
    console.log('getCollectionSchema error: ', error);
  }
}

async function getFloorPriceFromOpensea(collectionSlug) {
  try {
    const config = {
      headers: {
        'X-API-KEY': config.openseaApiKey
      }
    };
    const { data } = await limiter.schedule(() =>
      axiosInstance.get(
        `https://api.opensea.io/api/v2/collections/${collectionSlug}/stats`,
        config
      )
    );

    return data?.total?.floor_price;
  } catch (error) {
    console.log(error);
  }
}

// Function to get the collection data and return relevant information to make the trade.
// We return the address of the creator, floor price, contract address, seller fee and royalty address
const getCollectionInfo = async (collectionSlug) => {
  const collection = await limiter
    .schedule(() =>
      axiosInstance.get(
        `https://api.opensea.io/api/v2/collections/${collectionSlug}`,
        {
          headers: {
            'X-API-KEY': config.openseaApiKey
          }
        }
      )
    )
    .then((res) => res.json());

  if (collection?.success == false) {
    new Error(collection?.errors);
  }

  let creator_fees;

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
const getCollectionInfoWithRapidApi = async (collectionSlug) => {
  try {
    const collection = await limiter
      .schedule(() =>
        axiosInstance.get(
          `https://nfttools.pro/opensea/api/v2/collections/${collectionSlug}`,
          {
            headers: {
              'X-NFT-API-Key': config.apiKey
            }
          }
        )
      )
      .then((res) => {
        return res.data;
      });

    let creator_fees;

    const floor_price = await getFloorPriceFromOpensea(collectionSlug);

    // Check if creator fees enforced. If so, calculate total fee from seller fee. Else, set it to 0.5%
    // Check if the seller fees are empty. If empty then we assign 0 as the seller fee amount

    console.log(
      '-------------------------------------------------------------'
    );
    console.log('COLLECTION FEES');
    console.table(collection.fees);
    console.log(
      '-------------------------------------------------------------'
    );
    let enforceCreatorFee = false;

    if (collection.fees.length > 1) {
      creator_fees = {
        [collection.fees[1].recipient]: collection.fees[1].fee * 100
      };
      enforceCreatorFee = collection.fees[1].required;
    } else {
      creator_fees = 0;
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
  } catch (error) {
    console.log('🌵💜🐢 error', error);
  }
};

// get opensea floor price

// Function to get the collection data and returns relevant information to make the trade.
// We return the address of the creator, floor price, contract address, seller fee and royalty address
const getFloorPriceFromBlur = async (
  contractAddress,
  accessToken,
  walletAddress
) => {
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

  const response = await limiter
    .schedule(() => axiosInstance.request(options))
    .then((res) => res.data)
    .catch((err) => console.log('getFloorPriceFromBlur', err?.response?.data));

  return response?.collection?.floorPrice?.amount ?? null;
};

const getFiveLowestListingsFromOpensea = async (collectionSlug) => {
  const options = {
    method: 'GET',
    url: `${config.openseaRapidEndpoint.replace(
      'v1',
      'v2'
    )}listings/collection/${collectionSlug}/all`,
    params: { limit: '100' },
    headers: {
      'X-NFT-API-Key': config.apiKey
    }
  };

  let results = [];
  let response;
  do {
    if (response?.next) {
      options.params.next = response?.next;
    }

    response = await limiter
      .schedule(() => axiosInstance.request(options))
      .then((res) => res.data);

    results = [...results, ...response.listings];
  } while (response?.next);

  return results
    .map((listing) => parseFloat(formatUnits(listing.price.current.value)))
    .sort((a, b) => a - b)
    .slice(0, 5);
};

const getListingsFromBlur = async (
  collectionAddress,
  authToken,
  walletAddress
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

    const response = await limiter
      .schedule(() => axiosInstance.request(options))
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
      .sort((a, b) => a - b);
  } catch (err) {
    // console.log(err);
    return [];
  }
};

module.exports = {
  getCollectionInfo,
  getCollectionInfoWithRapidApi,
  getFloorPriceFromBlur,
  getFiveLowestListingsFromOpensea,
  getListingsFromBlur,
  getFloorPriceFromOpensea
};
