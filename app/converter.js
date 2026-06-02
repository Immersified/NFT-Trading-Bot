const { ethers, Contract, utils } = require('ethers');
const fs = require('fs');
const csvParser = require('csv-parser');
const path = require('path');
const yargs = require('yargs');
const config = require('./config');
const { getEthBalance } = require('./utils/etherBalance');
const { getBlurPoolBalance } = require('./utils/blurPoolBalance');
const { getWETHBalance } = require('./utils/wethBalance');
const { estimateGas } = require('./utils/gasEstimate');
const { calculateBETHAdd } = require('./utils/calculateBethAdd');
const { WETH_ADDRESS, WETH_ABI } = require('./constants/weth');
const { BLUR_POOL_ADDRESS, BLUR_POOL_ABI } = require('./constants/blurPool');
const { convertToBlur } = require('./utils/convertToBlur');
const { convertToWeth } = require('./utils/convertToWeth');

const options = yargs
  .usage('Usage: -p <private_key> -f <bidding_csv_file_name>')
  .option('p', {
    alias: 'private_key',
    describe: 'Wallet Private Key',
    type: 'string',
    demandOption: true
  })
  .option('f', {
    alias: 'bidding_csv_file_name',
    describe: 'file name of bidding options csv',
    type: 'string',
    demandOption: true
  }).argv;

const { private_key } = options;
const jsonProvider = new ethers.providers.JsonRpcProvider(config.network);
const wallet = new ethers.Wallet(private_key, jsonProvider);

const { bidding_csv_file_name: bidVariableFile } = options;

let wethBalanceMax;
let blurPoolBalanceMax;
let gasFactor;
let ethBalanceMin;

fs.createReadStream(path.join(__dirname, `../Settings/${bidVariableFile}`))
  .pipe(
    csvParser({
      escape: '",',
      mapHeaders: ({ header }) => header.trim(),
      mapValues: ({ value }) => value.trim()
    })
  )
  .on('data', (data) => {
    ethBalanceMin = parseFloat(data.ethBalanceMin);
    wethBalanceMax = parseFloat(data.wethBalanceMax);
    blurPoolBalanceMax = parseFloat(data.blurPoolBalanceMax);
    gasFactor = parseFloat(data.gasFactor);

    console.log('Variables loaded from CSV:');
    console.table({
      ethBalanceMin,
      gasFactor,
      wethBalanceMax,
      blurPoolBalanceMax
    });
  });

async function run() {
  try {
    const ethBalance = await getEthBalance(private_key);
    const blurPoolBalance = await getBlurPoolBalance(private_key);
    const wethBalance = await getWETHBalance(private_key);
    const { gasPriceGwei, gasEstimate } = await estimateGas(private_key);

    const etherUse = ethBalance - ethBalanceMin;
    console.log(`Ether Balance: ${ethBalance}`);
    console.log(`Ether To Use: ${etherUse}`);
    console.log(`Blur Balance: ${blurPoolBalance}`);
    console.log(`WETH Balance: ${wethBalance}`);
    console.log(`Gas Price: ${gasPriceGwei}`);
    console.log(`Gas Estimate: ${gasEstimate}`);

    console.log('----------------------------------------------');
    console.log('----------------------------------------------');

    console.log(`Balance Max WETH: ${wethBalanceMax}`);
    console.log(`Balance Max BETH: ${blurPoolBalanceMax}`);
    console.log(`Gas Factor: ${gasFactor}`);
    console.log(`Balance Min ETH: ${ethBalanceMin}`);

    const bethAdd = await calculateBETHAdd(
      blurPoolBalanceMax,
      wethBalance,
      etherUse,
      wethBalanceMax,
      blurPoolBalance
    );

    let wethAdd = etherUse - bethAdd;

    if (wethAdd > etherUse) {
      wethAdd = etherUse;
    }

    console.log('----------------------------------------------');
    console.log('----------------------------------------------');

    console.log(`BETH add: ${bethAdd}`);
    console.log(`WETH add: ${wethAdd}`);

    if (ethBalance < ethBalanceMin) {
      console.log(
        `ETH Balance ${ethBalance} ETH is less than ${ethBalanceMin} ETH stop script`
      );

      return;
    }

    const wethContract = new Contract(WETH_ADDRESS, WETH_ABI, wallet);
    const blurPoolContract = new Contract(
      BLUR_POOL_ADDRESS,
      BLUR_POOL_ABI,
      wallet
    );

    if ((bethAdd * gasFactor) / 100 > gasEstimate) {
      console.log('----------------------------------------------');
      console.log('convert ETH to BETH');
      console.log('----------------------------------------------');

      await convertToBlur(blurPoolContract, bethAdd);
    }

    if ((wethAdd * gasFactor) / 100 > gasEstimate) {
      console.log('----------------------------------------------');
      console.log('convert ETH to WETH');
      console.log('----------------------------------------------');

      await convertToWeth(wethContract, wethAdd);
    }
  } catch (error) {
    console.log(error);
  }
}

run().catch((error) => console.log(error));
