import { Wallet, utils, providers, Contract } from 'ethers';
import { BLUR_POOL_ADDRESS, BLUR_POOL_ABI } from '../constants/blurPool';
import config from '../config';

export async function getBlurPoolBalance(privateKey: string) {
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
