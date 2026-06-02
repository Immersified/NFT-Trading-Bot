const { formatEther, parseEther } = require('ethers/lib/utils');
const templatePayload = require('../utils/payload');
const { constants, BigNumber, Contract, providers } = require('ethers');
const config = require('../config');
const { default: axios } = require('axios');

const divider = 10000;
const openseaFee = 250;

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

const approveAbi = [
  {
    inputs: [
      {
        internalType: 'address',
        name: 'account',
        type: 'address'
      },
      {
        internalType: 'address',
        name: 'operator',
        type: 'address'
      }
    ],
    name: 'isApprovedForAll',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'operator',
        type: 'address'
      },
      {
        internalType: 'bool',
        name: 'approved',
        type: 'bool'
      }
    ],
    name: 'setApprovalForAll',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  }
];

const provider = new providers.JsonRpcProvider(config.network);
const seaportContractAddress = '0x00000000000001ad428e4906aE43D8F9852d0dD6';
const seaportContract = new Contract(seaportContractAddress, minABI, provider);

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
  version: '1.5',
  chainId: '1',
  verifyingContract: '0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC'
};

const approveNFT = async (nftAddress, wallet, marketContractAddress) => {
  const nftContract = new Contract(nftAddress, approveAbi, wallet);

  try {
    const approved = await nftContract.isApprovedForAll(
      wallet.address,
      marketContractAddress
    );
    console.log({ approved });
    if (!approved) {
      console.log('Approve nft to', marketContractAddress);
      const tx = await nftContract.setApprovalForAll(
        marketContractAddress,
        true
      );
      await tx.wait();
      console.log('Nft approved successfully');
    }
  } catch (err) {
    console.log(err?.reason ?? err?.message);
  }
};

const listToOpenseaWithRapid = async (
  nftAddress,
  tokenId,
  price,
  wallet,
  creatorFees,
  schema
) => {
  let approval;

  try {
    approval = await approveNFT(
      nftAddress,
      wallet,
      '0x1E0049783F008A0085193E00003D00cd54003c71'
    );
  } catch (error) {
    console.log(error);
  }
  const offerPrice = BigNumber.from(parseEther(price + ''));
  const listingPayload = { ...templatePayload.listingPayload };
  // Payload data
  listingPayload.parameters.startTime = BigInt(
    Math.floor(Date.now() / 1000)
  ).toString();
  listingPayload.parameters.endTime = BigInt(
    Math.floor(Date.now() / 1000 + 880)
  ).toString();
  const itemType = schema == 'ERC1155' ? 3 : 2;
  listingPayload.parameters.offerer = wallet.address;
  listingPayload.parameters.offer[0].itemType = itemType;
  listingPayload.parameters.offer[0].token = nftAddress;
  listingPayload.parameters.offer[0].identifierOrCriteria = tokenId;
  listingPayload.parameters.offer[0].startAmount = 1;
  listingPayload.parameters.offer[0].endAmount = 1;

  let totalCreatorFee = 0;
  const creatorFeeConsideration = [];
  // This is the seller fee consideration item
  // Loop through creator fees and add relevant fees to the payload
  listingPayload.parameters.totalOriginalConsiderationItems = 2;
  for (address in creatorFees) {
    let fee = creatorFees[address];
    // If there are creator fees, loop through and add them all as consideration items
    if (address !== 'null') {
      const consideration_item = {
        itemType: 0,
        token: constants.AddressZero,
        identifierOrCriteria: 0,
        startAmount: offerPrice.mul(fee).div(divider).toString(),
        endAmount: offerPrice.mul(fee).div(divider).toString(),
        recipient: address
      };

      // push consideration item to the payload
      creatorFeeConsideration.push(consideration_item);

      // Add 1 to the consideration items for each fee
      listingPayload.parameters.totalOriginalConsiderationItems += 1;
      totalCreatorFee += fee;
    }
  }

  // assign first consideration item
  const ownerConsideration = {
    itemType: 0,
    token: constants.AddressZero,
    identifierOrCriteria: 0,
    startAmount: offerPrice
      .mul(divider - totalCreatorFee - openseaFee)
      .div(divider)
      .toString(),
    endAmount: offerPrice
      .mul(divider - totalCreatorFee - openseaFee)
      .div(divider)
      .toString(),
    recipient: wallet.address
  };

  // build second consideration item
  // This is the opensea fee
  // console.log(offerPrice.mul(openseaFee).div(divider).toString());
  const openseaConsideration = {
    itemType: 0,
    token: constants.AddressZero,
    identifierOrCriteria: 0,
    startAmount: offerPrice.mul(openseaFee).div(divider).toString(),
    endAmount: offerPrice.mul(openseaFee).div(divider).toString(),
    recipient: '0x0000a26b00c1F0DF003000390027140000fAa719'
  };

  listingPayload.parameters.consideration = [
    ownerConsideration,
    openseaConsideration,
    ...creatorFeeConsideration
  ];

  listingPayload.parameters.salt = Math.floor(
    Math.random() * 100_000
  ).toString();

  // request the value for the counter from the seaport contract and set it in payload
  const counter = await seaportContract.getCounter(wallet.address);
  listingPayload.parameters.counter = counter.toString();

  console.log(listingPayload.parameters);

  // sign the offer
  const sigObj = await wallet._signTypedData(
    domain,
    types,
    listingPayload.parameters
  );

  listingPayload.signature = sigObj;

  // const listings = await axios
  //   .request({
  //     method: 'POST',
  //     url: `${config.openseaRapidEndpoint.replace(
  //       'v1',
  //       'v2'
  //     )}orders/ethereum/seaport/listings`,
  //     headers: {
  //       'content-type': 'application/json',
  //       'X-NFT-API-Key': config.apiKey
  //     },
  //     data: JSON.stringify(listingPayload)
  //   })
  //   .then((res) => res.data)
  //   .catch((err) => {
  //     return { errors: err?.response?.data ?? err };
  //   });

  // if (listings.errors) {
  //   console.log('Error: ', JSON.stringify(listings.errors));
  // } else {
  //   console.log('NFT listed successfully on opensea');
  // }
};

const getFeeRate = async (address, walletAddress, authToken) => {
  const options = {
    method: 'GET',
    url: `${config.blurRapidEndpoint}collections/${address}/fees`,
    headers: {
      authToken: authToken,
      walletAddress: walletAddress,
      'X-NFT-API-Key': config.apiKey
    }
  };

  try {
    const response = await axios.request(options);

    return response?.data?.fees?.byMarketplace?.BLUR.minimumRoyaltyBips;
  } catch (error) {
    console.error(error?.response?.data);
  }
};

const listToBlurWithRapid = async (
  nftAddress,
  tokenId,
  price,
  wallet,
  authToken,
  feeRate
) => {
  await approveNFT(
    nftAddress,
    wallet,
    '0x2f18f339620a63e43f0839eeb18d7de1e1be4dfb'
  );

  const options = {
    method: 'POST',
    url: `${config.blurRapidEndpoint}orders/format`,
    headers: {
      'content-type': 'application/json',
      authToken: authToken,
      walletAddress: wallet.address,
      'X-NFT-API-Key': config.apiKey
    },
    data: {
      marketplace: 'BLUR',
      orders: [
        {
          price: {
            amount: price + '',
            unit: 'ETH'
          },
          tokenId: tokenId,
          feeRate: feeRate,
          contractAddress: nftAddress,
          expirationTime: new Date(Date.now() + 1000000).toISOString()
        }
      ]
    }
  };

  const data = await axios
    .request(options)
    .then((res) => res.data)
    .catch((err) => {
      return { errors: err?.response?.data ?? err };
    });

  if (data?.errors) {
    console.log(data.errors);
    return;
  }
  // sign the offer
  const signObj = await wallet._signTypedData(
    data?.signatures?.[0]?.signData?.domain,
    data?.signatures?.[0]?.signData?.types,
    data?.signatures?.[0]?.signData?.value
  );

  const payload = {
    signature: signObj,
    marketplace: 'BLUR',
    marketplaceData: data?.signatures?.[0]?.marketplaceData
  };

  console.log(payload);

  const submitOptions = {
    method: 'POST',
    url: `${config.blurRapidEndpoint}orders/submit`,
    headers: {
      'content-type': 'application/json',
      authToken: authToken,
      walletAddress: wallet.address,
      'X-NFT-API-Key': config.apiKey
    },
    data: JSON.stringify(payload)
  };

  listings = await axios
    .request(submitOptions)
    .then((res) => res.data)
    .catch((err) => {
      return { errors: err?.response?.data ?? err };
    });

  if (listings.errors) {
    console.log('Error: ', JSON.stringify(listings.errors));
  } else {
    console.log('NFT listed successfully on blur');
  }
};

module.exports = {
  listToOpenseaWithRapid,
  listToBlurWithRapid,
  getFeeRate,
  approveNFT
};
