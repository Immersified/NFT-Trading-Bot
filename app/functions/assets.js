const config = require('../config');
const { axiosInstance } = require('../axios/axiosInstance');
const limiter = require('../bottleneck');

const getAssets = async (address) => {
  const assets = await limiter
    .schedule(() =>
      axiosInstance.get(`${config.endpoint}assets?owner=${address}`, {
        headers: {
          'X-NFT-API-Key': config.apiKey
        }
      })
    )
    .then((res) => res.json());

  return assets.assets;
};

const getAsset = async (assetId, tokenId) => {
  const asset = await limiter
    .schedule(() =>
      axiosInstance.get(
        `${config.endpoint}asset/${assetId}/${tokenId}/?include_orders=true`,
        {
          headers: {
            'X-NFT-API-Key': config.apiKey
          }
        }
      )
    )
    .then((res) => res.json());

  return asset;
};

const getAssetsFromOpensea = async (address, authToken) => {
  const url = `https://nfttools.pro/opensea/api/v2/chain/ethereum/account/${address}/nfts`;

  const options = {
    method: 'GET',
    url: url,
    params: {
      owner: address,
      limit: 200
    },
    headers: {
      'X-NFT-API-Key': config.apiKey
    }
  };

  let response;
  let assets = [];
  do {
    if (response?.data?.next) {
      options.params.next = response.data.next;
    }

    try {
      response = await limiter.schedule(() => axiosInstance.request(options));
    } catch (error) {
      console.log('opensea v1 error');
    }

    assets = [...assets, ...(response?.data?.nfts ?? [])];
  } while (response?.data?.next);

  for (const asset of assets) {
    const lastSale = await getTokenLastSale(asset.contract, asset.identifier);
    const { price, date } = await getLastSaleFromBlur(
      asset.contract,
      asset.identifier,
      authToken,
      address
    );
    asset.blurLastSale = {
      price,
      date
    };
    asset.last_sale = lastSale;
    asset.slug = lastSale.slug;
  }

  return assets.map((item) => {
    const useBlurLastSale =
      new Date(item.blurLastSale.date).getTime() >
      new Date(item?.last_sale?.date).getTime();

    return {
      contractAddress: item?.contract,
      collectionSlug: item?.slug,
      tokenId: item?.identifier,
      lastSale: useBlurLastSale ? item.blurLastSale : item.last_sale,
      supportsWyvern: !item?.is_disabled
    };
  });
};

const getLastSaleFromBlur = async (
  address,
  tokenId,
  authToken,
  walletAddress
) => {
  try {
    const options = {
      method: 'GET',
      url: `${config.blurRapidEndpoint}collections/${address}/tokens/${tokenId}`,
      params: { filters: '{}' },
      headers: {
        authToken: authToken,
        walletAddress: walletAddress,
        'X-NFT-API-Key': config.apiKey
      }
    };

    let response = await limiter.schedule(() => axiosInstance.request(options));

    return {
      price: parseFloat(response.data.token?.lastSale?.amount ?? '0'),
      date: new Date(response.data.token?.lastSale?.listedAt ?? 0)
    };
  } catch (err) {
    console.log(err?.reason ?? err?.message);
    return {
      price: parseFloat('0'),
      date: new Date(0)
    };
  }
};

const getAssetListedStateFromOpensea = async (contractAddress, tokenId) => {
  const options = {
    method: 'GET',
    url: `${config.openseaRapidEndpoint.replace(
      'v1',
      'v2'
    )}orders/ethereum/seaport/listings`,
    params: {
      asset_contract_address: contractAddress,
      token_ids: tokenId
    },
    headers: {
      'X-NFT-API-Key': config.apiKey
    }
  };

  const response = await limiter.schedule(() => axiosInstance.request(options));

  const lastExpireTime = response?.data?.orders?.length
    ? response.data.orders.reduce((a, b) =>
        a.expiration_time > b.expiration_time ? a : b
      ).expiration_time
    : 0;

  return lastExpireTime > Date.now() / 1000;
};
async function getTokenLastSale(contractAddress, tokenId) {
  try {
    const config = {
      headers: {
        'X-API-KEY': config.openseaApiKey
      }
    };

    const { data } = await limiter.schedule(() =>
      axiosInstance.get(
        `https://api.opensea.io/api/v2/events/chain/ethereum/contract/${contractAddress}/nfts/${tokenId}?event_type=sale`,
        config
      )
    );

    return {
      date: new Date(data.asset_events[0].closing_date * 1000),
      price: data.asset_events[0].payment.quantity / 10 ** 18,
      slug: data.asset_events[0].nft.collection
    };
  } catch (error) {
    console.log(error);
  }
}

module.exports = {
  getAssets,
  getAsset,
  getAssetsFromOpensea,
  getAssetListedStateFromOpensea
};
