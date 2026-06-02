import { Wallet, utils, providers, Contract, ethers } from 'ethers';
import { WETH_ABI, WETH_ADDRESS } from '../constants/weth';
import { config as envConfig } from 'dotenv';

const INFURIA_API_KEY = process.env.INFURIA_KEY as string;

export async function getWETHBalance(privateKey: string) {
  try {
    const jsonRpcProvider = new ethers.providers.InfuraProvider("mainnet", INFURIA_API_KEY)
    const wallet = new Wallet(privateKey, jsonRpcProvider);
    const wethContract = new Contract(WETH_ADDRESS, WETH_ABI, wallet);
    const balance = await wethContract.balanceOf(wallet.address);
    const wethBalance = +utils.formatEther(balance);
    return wethBalance;
  } catch (error) {
    console.log('error getting weth balance', error);
  }
}
