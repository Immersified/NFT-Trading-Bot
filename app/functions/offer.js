const fetch = require('node-fetch');
const config = require('../config');
const Web3 = require('web3');
const { payload } = require('../utils/payload');
const web3 = new Web3(config.network);
const { Contract, constants, providers, ethers } = require('ethers');
const { Wallet, BigNumber } = require('ethers');
const { formatUnits } = require('ethers/lib/utils');
const { axiosInstance } = require('../axios/axiosInstance');
const limiter = require('../bottleneck');

// min ABI for seaport contract
const minABI = [
  {
    inputs: [{ internalType: 'address', name: 'offerer', type: 'address' }],
    name: 'getCounter',
    outputs: [{ internalType: 'uint256', name: 'counter', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
];

const wethAbi = [
  {
    constant: true,
    inputs: [
      { name: '', type: 'address' },
      { name: '', type: 'address' }
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    payable: false,
    stateMutability: 'view',
    type: 'function'
  },
  {
    constant: false,
    inputs: [
      { name: 'guy', type: 'address' },
      { name: 'wad', type: 'uint256' }
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function'
  }
];

const seaportContractAddress = '0x00000000000001ad428e4906aE43D8F9852d0dD6';
const seaportContract = new web3.eth.Contract(minABI, seaportContractAddress);

// data for generating signature
const types = {
  OrderComponents: [
    {
      name: 'offerer',
      type: 'address'
    },
    {
      name: 'zone',
      type: 'address'
    },
    {
      name: 'offer',
      type: 'OfferItem[]'
    },
    {
      name: 'consideration',
      type: 'ConsiderationItem[]'
    },
    {
      name: 'orderType',
      type: 'uint8'
    },
    {
      name: 'startTime',
      type: 'uint256'
    },
    {
      name: 'endTime',
      type: 'uint256'
    },
    {
      name: 'zoneHash',
      type: 'bytes32'
    },
    {
      name: 'salt',
      type: 'uint256'
    },
    {
      name: 'conduitKey',
      type: 'bytes32'
    },
    {
      name: 'counter',
      type: 'uint256'
    }
  ],
  OfferItem: [
    {
      name: 'itemType',
      type: 'uint8'
    },
    {
      name: 'token',
      type: 'address'
    },
    {
      name: 'identifierOrCriteria',
      type: 'uint256'
    },
    {
      name: 'startAmount',
      type: 'uint256'
    },
    {
      name: 'endAmount',
      type: 'uint256'
    }
  ],
  ConsiderationItem: [
    {
      name: 'itemType',
      type: 'uint8'
    },
    {
      name: 'token',
      type: 'address'
    },
    {
      name: 'identifierOrCriteria',
      type: 'uint256'
    },
    {
      name: 'startAmount',
      type: 'uint256'
    },
    {
      name: 'endAmount',
      type: 'uint256'
    },
    {
      name: 'recipient',
      type: 'address'
    }
  ]
};

const domain = {
  name: 'Seaport',
  version: '1.6',
  chainId: '1',
  verifyingContract: '0x0000000000000068f116a894984e2db1123eb395'
};

const getOffer = async (contract, token) => {
  const offer = await limiter
    .schedule(() =>
      axiosInstance.get(
        `${config.endpoint.replace(
          'v1',
          'v2'
        )}orders/ethereum/seaport/offers?asset_contract_address=${contract}&token_ids=${token}&order_by=eth_price&order_direction=desc`,
        {
          headers: {
            'X-NFT-API-Key': config.apiKey
          }
        }
      )
    )
    .then((res) => res.json());
  console.log(
    '🌵💜🐢',
    `${config.endpoint.replace(
      'v1',
      'v2'
    )}orders/ethereum/seaport/offers?asset_contract_address=${contract}&token_ids=${token}&order_by=eth_price&order_direction=desc`
  );

  return {
    offer: offer,
    isOffer: offer.orders.length > 0 ? true : false
  };
};

const getOffers = async (slug) => {
  const offers = await limiter
    .schedule(() =>
      axiosInstance.get(
        `${config.endpoint.replace('v1', 'v2')}offers/collection/${slug}`,
        {
          headers: {
            'X-API-KEY': config.openseaApiKey
          }
        }
      )
    )
    .then((res) => res.json());
  console.log({ offers });
  return offers;
};

const getOffersWithRapid = async (slug) => {
  const url = `https://nfttools.pro/opensea/api/v2/offers/collection/${slug}`;

  const offers = await limiter
    .schedule(() =>
      axiosInstance.get(url, {
        headers: {
          'X-NFT-API-Key': config.apiKey
        }
      })
    )
    .then((res) => res.data)
    .catch((err) => {
      console.log(err);
      return { errors: err?.response?.data ?? err };
    });

  return offers;
};

const getOffersFromBlur = async (contractAddress, authToken, walletAddress) => {
  const options = {
    method: 'GET',
    url: `${config.blurRapidEndpoint}collections/${contractAddress}/executable-bids`,
    params: { filters: '{}' },
    headers: {
      authToken: authToken,
      walletAddress: walletAddress,
      'X-NFT-API-Key': config.apiKey
    }
  };

  const { data: offers } = await limiter.schedule(() =>
    axiosInstance.request(options)
  );

  console.log({ offers: JSON.stringify(offers) });

  return offers;
};

const createOffer = async (
  wallet_address,
  private_key,
  slug,
  offer_price,
  creator_fees
) => {
  const divider = BigNumber.from(10000);
  const offerPrice = BigNumber.from(offer_price.toString());
  const openseaFee = BigNumber.from(250);

  const jsonRpcProvider = new providers.JsonRpcProvider(config.network);
  const wallet = new Wallet(private_key, jsonRpcProvider);
  const wethContract = new Contract(config.weth, wethAbi, wallet);
  const allowance = await wethContract.allowance(
    wallet.address,
    seaportContractAddress
  );
  if (allowance.lt(offerPrice)) {
    try {
      console.log(
        'Insufficient allowance! Approving Weth to Seaport Contract...'
      );
      const tx = await wethContract.approve(
        seaportContractAddress,
        constants.MaxUint256
      );
      await tx.wait();
    } catch (err) {
      console.log(err?.reason ?? err?.message);
      return;
    }
  }

  // reset consideration list and count
  payload.protocol_data.parameters.consideration = [];
  payload.protocol_data.parameters.totalOriginalConsiderationItems = 2;

  // set correct slug for collection
  payload.criteria.collection.slug = slug;

  const buildPayload = {
    quantity: 1,
    criteria: payload.criteria,
    offerer: wallet_address,
    protocol_address: '0x0000000000000068F116a894984e2DB1123eB395'
  };

  // Send the offer off to build
  const build = await limiter
    .schedule(() =>
      fetch(`${config.endpoint.replace('v1', 'v2')}offers/build`, {
        headers: {
          'X-API-KEY': config.openseaApiKey,
          accept: 'application/json',
          'content-type': 'application/json'
        },
        method: 'post',
        body: JSON.stringify(buildPayload)
      })
    )
    .then((res) => res.json())
    .catch((err) => {
      return { errors: err?.response?.data ?? err };
    });

  console.log({ build });

  // If we get an error on building the offer, we skip this collection and log the error
  if (build.errors !== undefined) {
    console.log('Error: ', JSON.stringify(build.errors));
    return;
  }

  // Payload data
  payload.protocol_data.parameters.startTime = BigInt(
    Math.floor(Date.now() / 1000)
  ).toString();
  payload.protocol_data.parameters.endTime = BigInt(
    Math.floor(Date.now() / 1000 + 900)
  ).toString();
  payload.protocol_data.parameters.offerer = wallet_address;
  payload.protocol_data.parameters.offer[0].startAmount = offerPrice.toString();
  payload.protocol_data.parameters.offer[0].endAmount = offerPrice.toString();

  // assign first consideration item
  payload.protocol_data.parameters.consideration.push(
    build.partialParameters.consideration[0]
  );

  // build second consideration item
  // This is the opensea fee
  // console.log(offerPrice.mul(openseaFee).div(divider).toString());
  const opensea_consideration = {
    itemType: 1,
    token: config.weth,
    identifierOrCriteria: 0,
    startAmount: offerPrice.mul(openseaFee).div(divider).toString(),
    endAmount: offerPrice.mul(openseaFee).div(divider).toString(),
    recipient: '0x0000a26b00c1F0DF003000390027140000fAa719'
  };
  payload.protocol_data.parameters.consideration.push(opensea_consideration);

  // This is the seller fee consideration item
  // Loop through creator fees and add relevant fees to the payload
  for (address in creator_fees) {
    let fee = creator_fees[address];
    fee = BigNumber.from(fee);
    // If there are creator fees, loop through and add them all as consideration items
    if (address !== 'null') {
      const consideration_item = {
        itemType: 1,
        token: config.weth,
        identifierOrCriteria: 0,
        startAmount: offerPrice.mul(fee).div(divider).toString(),
        endAmount: offerPrice.mul(fee).div(divider).toString(),
        recipient: address
      };

      // push consideration item to the payload
      payload.protocol_data.parameters.consideration.push(consideration_item);

      // Add 1 to the consideration items for each fee
      payload.protocol_data.parameters.totalOriginalConsiderationItems += 1;
    }
  }

  payload.protocol_data.parameters.zone = build.partialParameters.zone;
  payload.protocol_data.parameters.zoneHash = build.partialParameters.zoneHash;
  payload.protocol_data.parameters.salt = Math.floor(
    Math.random() * 100_000
  ).toString();

  // request the value for the counter from the seaport contract and set it in payload
  const counter = await seaportContract.methods
    .getCounter(wallet_address)
    .call();
  payload.protocol_data.parameters.counter = counter.toString();

  console.log({ payload, line: 385 });

  // sign the offer
  const signObj = await wallet._signTypedData(
    domain,
    types,
    payload.protocol_data.parameters
  );

  // attach signature
  payload.protocol_data.signature = signObj;

  // console.log( payload.protocol_data.parameters.consideration[1].startAmount);
  // console.log('🌵💜🐢',(payload.protocol_data.parameters.offer[0].startAmount * 500) / 10000, payload.protocol_data.parameters.consideration[1].startAmount, payload.protocol_data.parameters.consideration[2].startAmount);

  // console.log(JSON.stringify(payload));
  // JSON.stringify(payload)
  // console.log(payload.protocol_data.parameters.totalOriginalConsiderationItems);

  const offers = await limiter
    .schedule(() =>
      fetch(`${config.endpoint.replace('v1', 'v2')}/offers`, {
        headers: {
          'X-API-KEY': config.openseaApiKey,
          accept: 'application/json',
          'content-type': 'application/json'
        },
        method: 'post',
        body: JSON.stringify(payload)
      })
    )
    .then((res) => res.json());

  if (offers.errors) {
    console.log('Error: ', JSON.stringify(offers.errors));
  } else {
    console.log('Offer posted successfully');
  }
};

const createOfferWithRapid = async (
  wallet_address,
  private_key,
  slug,
  offer_price,
  creator_fees
) => {
  const divider = BigNumber.from(10000);

  const roundedNumber = Math.round(Number(offer_price) / 1e14) * 1e14;
  const offerPrice = BigNumber.from(roundedNumber.toString());

  try {
  } catch (error) {
    console.log('offer price error: ', error);
  }
  const openseaFee = BigNumber.from(250);

  const jsonRpcProvider = new providers.JsonRpcProvider(config.network);
  const wallet = new Wallet(private_key, jsonRpcProvider);
  const wethContract = new Contract(config.weth, wethAbi, wallet);
  const allowance = await wethContract.allowance(
    wallet.address,
    seaportContractAddress
  );
  if (allowance.lt(offerPrice)) {
    try {
      console.log(
        'Insufficient allowance! Approving Weth to Seaport Contract...'
      );
      const tx = await wethContract.approve(
        seaportContractAddress,
        constants.MaxUint256
      );
      await tx.wait();
    } catch (err) {
      console.log(err?.reason ?? err?.message);
      return;
    }
  }

  // reset consideration list and count
  payload.protocol_data.parameters.consideration = [];
  payload.protocol_data.parameters.totalOriginalConsiderationItems = 2;

  // set correct slug for collection
  payload.criteria.collection.slug = slug;

  const buildPayload = {
    quantity: 1,
    criteria: payload.criteria,
    offerer: wallet_address,
    protocol_address: '0x0000000000000068f116a894984e2db1123eb395'
  };

  // Send the offer off to build
  const build = await limiter
    .schedule(() =>
      axiosInstance.request({
        method: 'POST',
        url: `${config.openseaRapidEndpoint.replace('v1', 'v2')}offers/build`,
        headers: {
          'content-type': 'application/json',
          'X-NFT-API-Key': config.apiKey
        },
        data: JSON.stringify(buildPayload)
      })
    )
    .then((res) => res.data)
    .catch((err) => {
      console.log('Send the offer off to build error');
      return { errors: err?.response?.data ?? err };
    });

  // If we get an error on building the offer, we skip this collection and log the error
  if (build.errors !== undefined) {
    console.log('Error: ', JSON.stringify(build.errors));
    return;
  }

  // Payload data
  payload.protocol_data.parameters.startTime = BigInt(
    Math.floor(Date.now() / 1000)
  ).toString();
  payload.protocol_data.parameters.endTime = BigInt(
    Math.floor(Date.now() / 1000 + 900)
  ).toString();
  payload.protocol_data.parameters.offerer = wallet_address;
  payload.protocol_data.parameters.offer[0].startAmount = offerPrice.toString();
  payload.protocol_data.parameters.offer[0].endAmount = offerPrice.toString();

  // assign first consideration item
  payload.protocol_data.parameters.consideration.push(
    build.partialParameters.consideration[0]
  );

  // build second consideration item
  // This is the opensea fee
  // console.log(offerPrice.mul(openseaFee).div(divider).toString());
  const opensea_consideration = {
    itemType: 1,
    token: config.weth,
    identifierOrCriteria: 0,
    startAmount: offerPrice.mul(openseaFee).div(divider).toString(),
    endAmount: offerPrice.mul(openseaFee).div(divider).toString(),
    recipient: '0x0000a26b00c1F0DF003000390027140000fAa719'
  };
  payload.protocol_data.parameters.consideration.push(opensea_consideration);

  // This is the seller fee consideration item
  // Loop through creator fees and add relevant fees to the payload
  for (address in creator_fees) {
    let fee = creator_fees[address];

    fee = BigNumber.from(Math.round(fee).toString());
    // If there are creator fees, loop through and add them all as consideration items
    if (address !== 'null') {
      const consideration_item = {
        itemType: 1,
        token: config.weth,
        identifierOrCriteria: 0,
        startAmount: offerPrice.mul(fee).div(divider).toString(),
        endAmount: offerPrice.mul(fee).div(divider).toString(),
        recipient: address
      };

      // push consideration item to the payload
      payload.protocol_data.parameters.consideration.push(consideration_item);

      // Add 1 to the consideration items for each fee
      payload.protocol_data.parameters.totalOriginalConsiderationItems += 1;
    }
  }

  payload.protocol_data.parameters.zone = build.partialParameters.zone;
  payload.protocol_data.parameters.zoneHash = build.partialParameters.zoneHash;
  payload.protocol_data.parameters.salt = Math.floor(
    Math.random() * 100_000
  ).toString();

  // request the value for the counter from the seaport contract and set it in payload
  const counter = await seaportContract.methods
    .getCounter(wallet_address)
    .call();
  payload.protocol_data.parameters.counter = counter.toString();

  console.log({ parameters: JSON.stringify(payload.protocol_data.parameters) });

  // sign the offer
  const signObj = await wallet._signTypedData(
    domain,
    types,
    payload.protocol_data.parameters
  );

  console.log({ signObj });

  // attach signature
  payload.protocol_data.signature = signObj;

  // console.log( payload.protocol_data.parameters.consideration[1].startAmount);
  // console.log('🌵💜🐢',(payload.protocol_data.parameters.offer[0].startAmount * 500) / 10000, payload.protocol_data.parameters.consideration[1].startAmount, payload.protocol_data.parameters.consideration[2].startAmount);

  // console.log(JSON.stringify(payload));
  // JSON.stringify(payload)
  // console.log(payload.protocol_data.parameters.totalOriginalConsiderationItems);

  payload.protocol_address = '0x0000000000000068f116a894984e2db1123eb395';
  const offers = await limiter
    .schedule(() =>
      axiosInstance.request({
        method: 'POST',
        url: `${config.openseaRapidEndpoint.replace('v1', 'v2')}offers`,
        headers: {
          'content-type': 'application/json',
          'X-NFT-API-Key': config.apiKey
        },
        data: JSON.stringify(payload)
      })
    )
    .then((res) => res.data)
    .catch((err) => {
      return { errors: err?.response?.data ?? err };
    });

  if (offers.errors) {
    console.log('POST Offer Error: ', JSON.stringify(offers.errors));
  } else {
    console.log('Offer posted successfully');
  }
};

const createOfferToBlur = async (
  wallet_address,
  private_key,
  accessToken,
  contractAddress,
  offer_price
) => {
  const offerPrice = BigNumber.from(offer_price.toString());
  console.log('Bidding on blur');

  const jsonRpcProvider = new providers.JsonRpcProvider(config.network);
  const wallet = new Wallet(private_key, jsonRpcProvider);

  let buildPayload = {
    price: {
      unit: 'BETH',
      amount: formatUnits(offerPrice)
    },
    quantity: 1,
    expirationTime: new Date(Math.floor(Date.now() + 900000)).toISOString(),
    contractAddress: contractAddress
  };

  // Send the offer off to build
  const build = await limiter
    .schedule(() =>
      axiosInstance.request({
        method: 'POST',
        url: `${config.blurRapidEndpoint}collection-bids/format`,
        headers: {
          'content-type': 'application/json',
          authToken: accessToken,
          walletAddress: wallet_address,
          'X-NFT-API-Key': config.apiKey
        },
        data: JSON.stringify(buildPayload)
      })
    )
    .then((res) => {
      console.log(res.data);
      return res.data;
    })
    .catch((err) => {
      console.dir(buildPayload);
      return { errors: err.response.data };
    });

  // If we get an error on building the offer, we skip this collection and log the error
  if (build.errors !== undefined) {
    console.log('Error: ', JSON.stringify(build.errors));
    return;
  }

  const data = build?.signatures?.[0];

  if (!data) {
    console.log('Invalid response');
    return;
  }

  // sign the offer
  const signObj = await wallet._signTypedData(
    data?.signData?.domain,
    data?.signData?.types,
    data?.signData?.value
  );

  // build payload
  buildPayload = {
    signature: signObj,
    marketplaceData: data?.marketplaceData
  };

  // console.log( payload.protocol_data.parameters.consideration[1].startAmount);
  // console.log('🌵💜🐢',(payload.protocol_data.parameters.offer[0].startAmount * 500) / 10000, payload.protocol_data.parameters.consideration[1].startAmount, payload.protocol_data.parameters.consideration[2].startAmount);

  // console.log(JSON.stringify(payload));
  // JSON.stringify(payload)
  // console.log(payload.protocol_data.parameters.totalOriginalConsiderationItems);
  console.log(buildPayload);

  const offers = await limiter
    .schedule(() =>
      axiosInstance.request({
        method: 'POST',
        url: `${config.blurRapidEndpoint}collection-bids/submit`,
        headers: {
          'content-type': 'application/json',
          authToken: accessToken,
          walletAddress: wallet_address,
          'X-NFT-API-Key': config.apiKey
        },
        data: JSON.stringify(buildPayload)
      })
    )
    .then((res) => {
      console.log(res.data);
      return res.data;
    })
    .catch((err) => {
      console.log('Error', err?.response.data);

      return { errors: 'Failed with error' };
    });

  if (offers.errors) {
    console.log('Error: ', JSON.stringify(offers.errors));
  } else {
    console.log('Offer posted successfully to blur');
  }
};

module.exports = {
  getOffer,
  getOffers,
  getOffersWithRapid,
  getOffersFromBlur,
  createOffer,
  createOfferWithRapid,
  createOfferToBlur
};
