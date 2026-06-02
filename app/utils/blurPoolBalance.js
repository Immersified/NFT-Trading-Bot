const { Wallet, utils, providers, Contract } = require('ethers');
const config = require('../config');
const { BLUR_POOL_ADDRESS, BLUR_POOL_ABI } = require('../constants/blurPool');

async function getBlurPoolBalance(privateKey) {
  try {
    const jsonProvider = new providers.JsonRpcProvider(config.network);
    const wallet = new Wallet(privateKey, jsonProvider);

    const blurPoolContract = new Contract(
      BLUR_POOL_ADDRESS,
      BLUR_POOL_ABI,
      wallet
    );
    const balance = await blurPoolContract.balanceOf(wallet.address);
    const blurBalance = +utils.formatEther(balance);
    return blurBalance;
  } catch (error) {
    console.log('error getting blur balance', error);
  }
}

module.exports = { getBlurPoolBalance };
