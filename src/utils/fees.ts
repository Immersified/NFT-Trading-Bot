import config from "../config";
import axiosInstance from "../axios/axiosInstance";
import limiter from "../bottleneck";

export async function getFeeRate(address: string, walletAddress: string, authToken?: string) {
  const options = {
    method: 'GET',
    url: `${config.blurRapidEndpoint}collections/${address}/fees`,
    headers: {
      authToken: authToken,
      walletAddress: walletAddress,
      'X-NFT-API-Key': config.apiKey
    }
  };

  try {
    const response = await limiter.schedule(() =>
      axiosInstance.request(options)
    );

    return response?.data?.fees?.byMarketplace?.BLUR.minimumRoyaltyBips;
  } catch (error: any) {
    console.error(error?.response?.data);
    return 0
  }
};


export async function collectionFees(slug: string) {
  const options = {
    method: 'GET',
    url: `https://nfttools.pro/blur/v1/collections/${slug}/fees`,
    headers: {
      'content-type': 'application/json',
      'X-NFT-API-Key': config.apiKey
    }
  };

  try {
    const { data } = await limiter.schedule(() => axiosInstance.request(options));
    const fees = data.fees.byMarketplace.BLUR.minimumRoyaltyBips / 100
    return fees
  } catch (error) {
    console.error(error);
    return 0
  }
}

