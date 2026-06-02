import axios from "axios";
import config from "../config";
import axiosInstance from "../axios/axiosInstance";
import limiter from "../bottleneck";

export async function getListing(slug: string, tokenId: string | number) {
  const options = {
    method: 'GET',
    url: `https://nfttools.pro/opensea/api/v2/listings/collection/${slug}/nfts/${tokenId}/best`,
    headers: {
      'content-type': 'application/json',
      'X-NFT-API-Key': config.apiKey
    }
  }
  let state;
  try {
    const { data } = await limiter.schedule(() => axiosInstance.request(options))

    const price = data?.price?.current?.value / 10 ** 18

    if (Object.keys(data).length === 0 && data.constructor === Object) {
      state = false;
    } else {
      state = true
    }
    return { state, price }
  } catch (error) {
    state = false
    return { state, price: null }
  }
}