const { Wallet, utils, providers } = require('ethers');
const config = require('../config');

async function getEthBalance(privateKey) {
  try {
    const jsonProvider = new providers.JsonRpcProvider(config.network);
    const wallet = new Wallet(privateKey, jsonProvider);
    const balance = await wallet.getBalance();
    const ethBalance = +utils.formatEther(balance);
    return ethBalance;
  } catch (error) {
    console.log('error getting ether balance', error);
  }
}

module.exports = { getEthBalance };
