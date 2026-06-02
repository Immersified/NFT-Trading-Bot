const { Wallet, utils, providers, Contract } = require('ethers');
const config = require('../config');
const { WETH_ADDRESS, WETH_ABI } = require('../constants/weth');

async function getWETHBalance(privateKey) {
  try {
    const jsonProvider = new providers.JsonRpcProvider(config.network);
    const wallet = new Wallet(privateKey, jsonProvider);
    const wethContract = new Contract(WETH_ADDRESS, WETH_ABI, wallet);
    const balance = await wethContract.balanceOf(wallet.address);
    const wethBalance = +utils.formatEther(balance);
    return wethBalance;
  } catch (error) {
    console.log('error getting blur balance', error);
  }
}

module.exports = { getWETHBalance };
