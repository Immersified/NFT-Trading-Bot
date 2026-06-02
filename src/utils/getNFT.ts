import axiosInstance from "../axios/axiosInstance";
import limiter from "../bottleneck";
import config from "../config";

export async function getNFT(contract: string, tokendId: number | string) {
  const options = {
    method: 'GET',
    url: `https://nfttools.pro/opensea/api/v2/chain/ethereum/contract/${contract}/nfts/${tokendId}`,
    headers: {
      'X-NFT-API-Key': config.apiKey
    }
  };

  try {
    const { data } = await limiter.schedule(() => axiosInstance.request(options));
    return data
  } catch (error) {
    console.error(error);
  }
}