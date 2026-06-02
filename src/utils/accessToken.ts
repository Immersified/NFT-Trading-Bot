import axios from "axios";
import { Wallet, providers } from "ethers";
import axiosInstance from "../axios/axiosInstance";
import limiter from "../bottleneck";
import config from "../config";

export const getAccessToken = async (url: string, private_key: string) => {
  const jsonRpcProvider = new providers.JsonRpcProvider(config.network);
  const wallet = new Wallet(private_key, jsonRpcProvider);
  const options = { walletAddress: wallet.address };

  const headers = {
    'content-type': 'application/json',
    'X-NFT-API-Key': config.apiKey
  };

  try {
    let response: any = await limiter.schedule(() => axiosInstance
      .post(`${url}/auth/challenge`, options, {
        headers: headers
      }))

    const message = response.data.message;
    const signature = await wallet.signMessage(message);
    const data = {
      message: message,
      walletAddress: wallet.address,
      expiresOn: response.data.expiresOn,
      hmac: response.data.hmac,
      signature: signature
    };

    response = await limiter.schedule(() => axiosInstance
      .post(`${url}/auth/login`, data, {
        headers: headers
      }))

    const authToken = response.data.accessToken;
    return authToken;

  } catch (error: any) {
    console.log("getAccessToken Error: ", error.response);
  }
};

