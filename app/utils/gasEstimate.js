const { utils, providers } = require('ethers');
const config = require('../config');
const { getWETHBalance } = require('./wethBalance');

async function estimateGas() {
  try {
    const provider = new providers.JsonRpcProvider(config.network);
    const gasPriceWei = await provider.getGasPrice();
    const gasPriceGwei = +utils.formatUnits(gasPriceWei, 'gwei');

    const gasEstimate = (21000 * gasPriceGwei * 2) / 10 ** 9;
    return { gasPriceGwei, gasEstimate };
  } catch (error) {
    console.log('error getting gas estimate', error);
  }
}
getWETHBalance;

module.exports = { estimateGas };
