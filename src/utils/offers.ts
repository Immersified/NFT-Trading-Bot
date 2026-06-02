import axios from "axios";
import config from "../config";
import axiosInstance from "../axios/axiosInstance";
import limiter from "../bottleneck";

export const getOffersWithRapid = async (slug: string) => {
  const url = `https://nfttools.pro/opensea/api/v2/offers/collection/${slug}`;

  let offers;
  try {
    const { data: result } = await limiter.schedule(() => axiosInstance
      .get(url, {
        headers: {
          'X-NFT-API-Key': config.apiKey
        }
      }))

    offers = result
  } catch (error: any) {
    console.log(error);
    return { errors: error?.response?.data ?? error };
  }
  return offers;
};