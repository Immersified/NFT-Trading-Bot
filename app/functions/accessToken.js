const { Wallet, providers } = require('ethers');
const config = require('../config');
const { axiosInstance } = require('../axios/axiosInstance');
const limiter = require('../bottleneck');

const getAccessToken = async (url, private_key) => {
  const jsonRpcProvider = new providers.JsonRpcProvider(config.network);
  const wallet = new Wallet(private_key, jsonRpcProvider);
  let data = { walletAddress: wallet.address };

  const headers = {
    'content-type': 'application/json',
    'X-NFT-API-Key': config.apiKey
  };

  try {
    let response = await limiter.schedule(() =>
      axiosInstance.post(`${url}/auth/challenge`, data, {
        headers: headers
      })
    );
    const message = response.data.message;

    const signature = await wallet.signMessage(message);

    data = {
      message: message,
      walletAddress: wallet.address,
      expiresOn: response.data.expiresOn,
      hmac: response.data.hmac,
      signature: signature
    };

    response = await limiter.schedule(() =>
      axiosInstance.post(`${url}/auth/login`, data, {
        headers: headers
      })
    );

    const authToken = response.data.accessToken;
    return authToken;
  } catch (error) {
    console.log(error);
    console.log(error.response.data);
    return;
  }
};

module.exports = { getAccessToken };
