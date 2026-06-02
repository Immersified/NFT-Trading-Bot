const Web3 = require('web3');
const config = require('../config');

const web3 = new Web3(config.network);

const minABI = [
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
// const wethAddress = '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6';
const contract = new web3.eth.Contract(minABI, wethAddress);

const getWallet = async (account) => {
  const wallet = await web3.eth.accounts.wallet.add(account);
  return wallet;
};

const getBalance = async (wallet) => {
  const balance = await contract.methods.balanceOf(wallet.address).call();

  return balance;
};

const getAccount = (private_key) => {
  const account = web3.eth.accounts.privateKeyToAccount('0x' + private_key);
  return account;
};

module.exports = { getWallet, getBalance, getAccount };
