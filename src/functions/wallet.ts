import Web3 from 'web3';
import { AbiItem } from 'web3-utils';
import { Account } from 'web3-core';
import config from '../config';

const web3 = new Web3(config.network);

const minABI: AbiItem[] = [
  // balanceOf
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    type: 'function'
  }
];

const wethAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

const contract = new web3.eth.Contract(minABI, wethAddress);

export const getWallet = async (account: Account): Promise<Account> => {
  const wallet = await web3.eth.accounts.wallet.add(account);
  return wallet;
};

export const getBalance = async (wallet: Account): Promise<string> => {
  const balance = await contract.methods.balanceOf(wallet.address).call();
  return balance;
};

export const getAccount = (privateKey: string): Account => {
  const account = web3.eth.accounts.privateKeyToAccount('0x' + privateKey);
  return account;
};

