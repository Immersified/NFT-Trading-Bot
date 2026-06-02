const { axiosInstance } = require('./axios/axiosInstance');
const config = require('./config');
const { retrieveAuthMessage } = require('./retrieveAuthMessage');
const { Wallet, providers } = require('ethers');

async function retrieveAuthToken() {
  try {
    const private_key = process.env.PRIVATE_KEY;
    const jsonRpcProvider = new providers.JsonRpcProvider(config.network);

    const wallet = new Wallet(private_key, jsonRpcProvider);
    const message = await retrieveAuthMessage();
    const signature = await wallet.signMessage(message);

    const options = {
      method: 'POST',
      url: 'https://opensea-pro.p.rapidapi.com/auth/login',
      headers: {
        'content-type': 'application/json',
        'X-RapidAPI-Key': process.env.X_RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'opensea-pro.p.rapidapi.com'
      },
      data: {
        signature: signature,
        signer: '0x1b8AfD0DE8a9368ce635Be8B9572c65d8F590B21',
        message: message
      }
    };
    const { data } = await axiosInstance.request(options);

    const token = data.token;
    console.log({ token });

    return token;
  } catch (error) {
    console.error(error);
  }
}

module.exports = { retrieveAuthToken };
