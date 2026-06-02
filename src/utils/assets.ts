import axios from "axios";
import config from "../config";
import axiosInstance from "../axios/axiosInstance";
import limiter from "../bottleneck";

export const getAssets = async (address: string) => {
  const assets = await limiter.schedule(() => fetch(`${config.endpoint}assets?owner=${address}`, {
    headers: {
      'X-NFT-API-Key': config.apiKey
    }
  })).then((res) => res.json());

  return assets.assets;
};

export const getAssetsFromOpensea = async (address: string, authToken: string) => {
  const url = `https://nfttools.pro/opensea/api/v2/chain/ethereum/account/${address}/nfts`;

  const options: any = {
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
  let assets: any[] = [];
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
    const lastSale: any = await getTokenLastSale(asset.contract, asset.identifier);

    console.log('-------------------------------------------------');
    console.log(`OPENSEA LAST SALE: ${lastSale.slug} ${lastSale.date} ${lastSale.price} ETH`);
    console.log('-------------------------------------------------');


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


    console.log('-------------------------------------------------');
    console.log(`BLUR LAST SALE: ${asset.slug} ${date} ${price} ETH`);
    console.log('-------------------------------------------------');
  }

  return assets.map((item) => {
    const useBlurLastSale =
      new Date(item.blurLastSale.date).getTime() >
      new Date(item?.last_sale?.date).getTime();


    console.log('-------------------------------------------------');
    console.log(`${useBlurLastSale ? "USE BLUR LAST SALE" : "USE OPENSEA LAST SALE PRICE"}`);
    console.log('-------------------------------------------------');

    return {
      contractAddress: item?.contract,
      collectionSlug: item?.slug,
      tokenId: item?.identifier,
      lastSale: useBlurLastSale ? item.blurLastSale : item.last_sale,
      supportsWyvern: !item?.is_disabled
    };
  });
};

export async function getTokenLastSale(contractAddress: string, tokenId: number | string) {
  try {
    const config = {
      headers: {
        'X-API-KEY': config.openseaApiKey
      }
    };

    const { data } = await limiter.schedule(() => axiosInstance.get(
      `https://api.opensea.io/api/v2/events/chain/ethereum/contract/${contractAddress}/nfts/${tokenId}?event_type=sale`,
      config
    ));

    return {
      date: new Date(data?.asset_events[0]?.closing_date * 1000),
      price: data?.asset_events[0]?.payment.quantity / 10 ** 18,
      slug: data?.asset_events[0]?.nft?.collection
    };
  } catch (error) {
    console.log(error);
  }
}

export async function blurTokenLastSale(contract: string, tokendId: string | number, accessToken: string) {
  try {

    const filters: any = {
      contractAddress: contract.toLowerCase(),
      tokendId: tokendId, eventFilter: { sale: {} }
    }
    const params = {
      filters: JSON.stringify(filters)
    }
    const options: any = {
      method: 'GET',
      url: `https://nfttools.pro/blur/v1/activity/event-filter/` as string,
      params: params,
      headers: {
        "authToken": accessToken,
        "X-NFT-API-Key": config.apiKey,
        "walletAddress": "0x9adcffff1def95f7e58b587c1a6b06ac6a7ae1e5",
      }
    };

    const { data } = await limiter.schedule(() => axiosInstance.request(options));

    if (data && data.activityItems.length > 0) {
      return data.activityItems[0].price.amount
    } else {
      return 0
    }


  } catch (error) {
    console.log(error);
  }
}

const getLastSaleFromBlur = async (
  address: string,
  tokenId: number | string,
  authToken: string,
  walletAddress: string
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

    let response = await limiter.schedule(() => axios.request(options))

    return {
      price: parseFloat(response.data.token?.lastSale?.amount ?? '0'),
      date: new Date(response.data.token?.lastSale?.listedAt ?? 0)
    };
  } catch (err: any) {
    console.log(err?.reason ?? err?.message);
    return {
      price: parseFloat('0'),
      date: new Date(0)
    };
  }
};