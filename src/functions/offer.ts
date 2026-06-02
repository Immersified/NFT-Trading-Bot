import config from '../config';
import Web3 from 'web3';
import limiter from '../bottleneck';
import { Contract, providers, Wallet, BigNumber, utils, constants, ethers } from 'ethers';
import axiosInstance from '../axios/axiosInstance';
import { payload } from '../utils/payload';

const web3 = new Web3(config.network);

const minABI = [
  {
    inputs: [{ internalType: 'address', name: 'offerer', type: 'address' }],
    name: 'getCounter',
    outputs: [{ internalType: 'uint256', name: 'counter', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
] as any

const seaportContractAddress = '0x00000000000001ad428e4906aE43D8F9852d0dD6';
const seaportContract = new web3.eth.Contract(minABI, seaportContractAddress);
const OPENSEA_KEY = process.env.OPENSEA_KEY as string
const OPENSEA_FEE = process.env.OPENSEA_FEE as string
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY as string
const conduitAddress = '0x1E0049783F008A0085193E00003D00cd54003c71';

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

const domain: Domain = {
  name: 'Seaport',
  version: '1.6',
  chainId: '1',
  verifyingContract: '0x0000000000000068f116a894984e2db1123eb395'
};

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

  const getOSFloorPrice = async (collectionSlug: string): Promise<number | null> => {
    const url = `https://api.opensea.io/api/v2/collections/${collectionSlug}/stats`;
    try {
      const { data } = await limiter.schedule(() =>
        axiosInstance.get(url, {
          headers: {
            'Accept': 'application/json',
            'X-API-KEY': OPENSEA_KEY
          }
        })
      );

      const floorPrice = data?.total?.floor_price;
      if (typeof floorPrice === 'number' && !Number.isNaN(floorPrice)) {
        return floorPrice;
      } else {
        throw new Error('Invalid floor price received');
      }
    } catch (error: any) {
      console.error('Error fetching floor price:', error?.response?.data || error.message);
      throw new Error('Failed to fetch floor price');
    }
  };


const getOffers2 = async (collectionSlug: string, ownWallets: string[]): Promise<number> => {
  // GraphQL query payload
  const payload = {
    "operationName": "CollectionOffersTableQuery",
    "query": "query CollectionOffersTableQuery($collectionSlug: String!, $sort: CollectionOfferAggregateSort!, $after: Cursor, $limit: Int!) {\n  collectionOfferAggregates(\n    collectionSlug: $collectionSlug\n    sort: $sort\n    after: $after\n    limit: $limit\n  ) {\n    items {\n      id\n      totalOffers\n      offerPrice {\n        token {\n          unit\n          __typename\n        }\n        __typename\n      }\n      ...OfferAggregateTable\n      __typename\n    }\n    nextPageCursor\n    __typename\n  }\n  collectionBySlug(slug: $collectionSlug) {\n    ...OfferAggregateTable_collection\n    __typename\n  }\n}\nfragment OfferAggregateTable_collection on Collection {\n  ...useCollectionOffers\n  ...OfferAggregateTableRow_collection\n  __typename\n}\nfragment useCollectionOffers on CollectionResult {\n  __typename\n  ... on Collection {\n    slug\n    flags {\n      isOffersEnabled\n      __typename\n    }\n    traitOffersEnabled\n    chain {\n      identifier\n      arch\n      __typename\n    }\n    __typename\n  }\n}\nfragment OfferAggregateTableRow_collection on Collection {\n  ...useCollectionOffers\n  __typename\n}\nfragment OfferAggregateTable on OfferAggregate {\n  id\n  ...OfferAggregateTableRow\n  __typename\n}\nfragment OfferAggregateTableRow on OfferAggregate {\n  offerPrice {\n    token {\n      unit\n      contractAddress\n      __typename\n    }\n    ...TokenPrice\n    __typename\n  }\n  totalValue {\n    token {\n      unit\n      __typename\n    }\n    ...TokenPrice\n    __typename\n  }\n  totalOffers\n  bidders {\n    quantity\n    __typename\n  }\n  ...OfferAggregateBidders\n  __typename\n}\nfragment TokenPrice on Price {\n  usd\n  token {\n    unit\n    symbol\n    contractAddress\n    chain {\n      identifier\n      __typename\n    }\n    __typename\n  }\n  __typename\n}\nfragment OfferAggregateBidders on OfferAggregate {\n  offerPrice {\n    ...TokenPrice\n    __typename\n  }\n  totalValue {\n    ...TokenPrice\n    __typename\n  }\n  totalOffers\n  bidders {\n    quantity\n    imageUrl\n    address\n    ...AccountLockup\n    __typename\n  }\n  __typename\n}\nfragment AccountLockup on ProfileIdentifier {\n  address\n  displayName\n  imageUrl\n  ...profileUrl\n  ... on Profile {\n    profileIsVerified: isVerified\n    isCompromised\n    __typename\n  }\n  __typename\n}\nfragment profileUrl on ProfileIdentifier {\n  displayName\n  address\n  ... on Profile {\n    kind\n    __typename\n  }\n  __typename\n}",
    "variables": {
      "collectionSlug": collectionSlug,
      "filter": {},
      "limit": 50,
      "sort": {
        "by": "OFFER_PRICE",
        "direction": "DESC"
      }
    }
  };

  // Make the GraphQL request
  const { data } = await limiter.schedule(() => 
    axiosInstance.post("https://nfttools.pro/opensea/graphql", payload, {
      headers: {
          'X-NFT-API-Key': config.apiKey,
          'Content-Type': 'application/json',
          'X-Query-Signature': 'a6ff6079c72ea062a037793633b6e689b1206609d24c4ddb477484d6c672b752'
        }
    })
  );

  // Process the response data
  interface Bidder {
    address: string;
    quantity: number;
    displayName: string | null;
    imageUrl: string | null;
    __typename: string;
  }

  interface OfferAggregate {
    id: string;
    totalOffers: number;
    offerPrice: {
      token: {
        unit: number;
        contractAddress: string;
        symbol: string;
        chain: {
          identifier: string;
        }
      };
      usd: number;
    };
    totalValue: {
      token: {
        unit: number;
      };
      usd: number;
    };
    bidders: Bidder[];
  }

  // Filter out offers where all bidders are in the ownWallets list
  const validOffers: number[] = [];
  
  if (data?.data?.collectionOfferAggregates?.items) {
    const items = data.data.collectionOfferAggregates.items as OfferAggregate[];
    
    items.forEach(item => {
      // Check if at least one bidder is not in ownWallets
      const hasExternalBidder = item.bidders.some(bidder => {
        // Skip if bidder address is undefined
        if (!bidder.address) return false;
        
        const bidderAddress = bidder.address.toLowerCase();
        return !ownWallets.map(addr => addr.toLowerCase()).includes(bidderAddress);
      });
      
      if (hasExternalBidder) {
        // Get the WETH unit price for this offer
        validOffers.push(item.offerPrice.token.unit);
      }
    });
  }

  const highestOffer = validOffers.length > 0 ? Math.max(...validOffers) : 0;

  console.log('--------------------------------------------------------------------------');
  console.log(`HIGHEST OPENSEA COLLECTION OFFER FOR ${collectionSlug} (excluding own wallets): ${highestOffer} ETH`);
  console.log('--------------------------------------------------------------------------');

  return highestOffer;
};


const getOffers = async (slug: string) => {

  const { data } = await limiter.schedule(() => axiosInstance
    .get<OffersResponse>(`${config.endpoint.replace('v1', 'v2')}offers/collection/${slug}`, {
      headers: {
        'X-API-KEY': config.openseaApiKey
      }
    }))

  const offers = data.offers.map((item) => ({ order_hash: item.order_hash, chain: item.chain, price: item.price.value, protocol_address: item.protocol_address }))

  console.log('--------------------------------------------------------------------------');
  console.log(`OPENSEA OFFERS FOR ${slug}`);
  console.table(offers)
  console.log('--------------------------------------------------------------------------');

  return data;
};

const getOffersWithRapid = async (slug: string) => {
  const url = `https://nfttools.pro/opensea/api/v2/offers/collection/${slug}`;
  try {
    const { data } = await limiter.schedule(() => axiosInstance
      .get<OffersResponse>(url, {
        headers: {
          'X-NFT-API-Key': config.apiKey
        }
      }))

    const offers = data.offers.map((item) => ({ order_hash: item.order_hash, chain: item.chain, price: item.price.value, protocol_address: item.protocol_address }))

    //console.log('--------------------------------------------------------------------------');
    //console.log(`OPENSEA OFFERS FOR ${slug}`);
    //console.table(offers)
    //console.log('--------------------------------------------------------------------------');

    return data;

  } catch (error: any) {
    console.log(error.response.data);
  }
};


async function getBlurData(collectionSlug: string) {
  try {
    const url = `https://nfttools.pro/blur/v1/collections/${collectionSlug}`;
    
    const headers = {
      'accept': 'application/json',
      'X-NFT-API-Key': config.apiKey
    };

    const { data } = await limiter.schedule(() => axiosInstance.request({
      method: 'GET',
      url: url,
      headers: headers
    }));

    return {
      floorPrice: data.collection?.floorPrice?.amount ? Number(data.collection.floorPrice.amount) : null,
      highestOffer: data.collection?.bestCollectionBid?.amount ? Number(data.collection.bestCollectionBid.amount) : null
    };
  } catch (error: any) {
    console.error('Error fetching collection prices:', error?.response?.data);
    return {
      floorPrice: null,
      highestOffer: null
    }
  }
}

const getOffersFromBlur = async (
  contractAddress: string,
  authToken: string,
  walletAddress: string
) => {
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
  const { data: offers } = await limiter.schedule(() => axiosInstance.request<BlurOfferResponse>(options))

  return offers;
};


interface BuildPayload {
  price: {
    unit: string;
    amount: string;
  };
  quantity: number;
  expirationTime: string;
  contractAddress: string;
}

interface BlurBuildPayload {
  price: {
    unit: string;
    amount: string;
  };
  quantity: number;
  expirationTime: string;
  contractAddress: string;
  criteria?: {
    type: string;
    value: any;
  };
}

interface BlurBuildResponse {
  signatures?: {
    signData: {
      domain: any;
      types: any;
      value: any;
    };
    marketplaceData: any;
  }[];
}

interface BlurSubmitPayload {
  signature: string;
  marketplaceData: any;
}

interface BlurSubmitResponse {
  errors?: any;
}

const createOfferToBlur = async (
  wallet_address: string,
  private_key: string,
  accessToken: string,
  contractAddress: string,
  offer_price: BigNumber | bigint,
  traits?: string
): Promise<void> => {
  try {
    const offerPrice = BigNumber.from(offer_price.toString());
    const wallet = createWallet(private_key);
    const buildPayload = createBuildPayload(contractAddress, offerPrice, traits);

    const buildResponse = await sendBlurBuildRequest(buildPayload, accessToken, wallet_address);
    if (!buildResponse || !buildResponse.signatures || buildResponse.signatures.length === 0) {
      throw new Error('Invalid build response');
    }

    const signatureData = buildResponse.signatures[0];
    const signature = await signOrder(wallet, signatureData.signData);

    const submitPayload: BlurSubmitPayload = {
      signature,
      marketplaceData: signatureData.marketplaceData,
    };

    await sendBlurSubmitRequest(submitPayload, accessToken, wallet_address);
    console.log('Offer posted successfully to Blur');
  } catch (error) {
    console.error('Error creating offer to Blur:', error);
  }
};


const createWallet = (private_key: string): Wallet => {
  const jsonRpcProvider = new ethers.providers.StaticJsonRpcProvider(
    `https://eth-mainnet.g.alchemy.com/v2/${config.ALCHEMY_API_KEY}`,
    {
    name: "homestead",
    chainId: 1
  });

  return new Wallet(private_key, jsonRpcProvider);
};

const createBuildPayload = (contractAddress: string, offerPrice: BigNumber, traits?: string): BlurBuildPayload => {
  const OFFER_EXPIRATION_TIME = 15 * 60 * 1000
  const basePayload = {
    price: {
      unit: 'BETH',
      amount: Number(utils.formatUnits(offerPrice)).toFixed(2),
    },
    quantity: 1,
    expirationTime: new Date(Date.now() + OFFER_EXPIRATION_TIME).toISOString(),
    contractAddress: contractAddress,
  };

  if (traits) {
    console.log('\x1b[32m%s\x1b[0m', 'INITIATE BLUR TRAIT BIDDING.......');
    return {
      ...basePayload,
      criteria: {
        type: "TRAIT",
        value: JSON.parse(traits)
      }
    };
  }

  return basePayload;
};

const sendBlurBuildRequest = async (buildPayload: BlurBuildPayload, accessToken: string, wallet_address: string): Promise<BlurBuildResponse> => {
  const { data } = await limiter.schedule(() =>
    axiosInstance.request<BlurBuildResponse>({
      method: 'POST',
      url: `${config.blurRapidEndpoint}collection-bids/format`,
      headers: {
        'content-type': 'application/json',
        authToken: accessToken,
        walletAddress: wallet_address,
        'X-NFT-API-Key': config.apiKey,
      },
      data: JSON.stringify(buildPayload),
    })
  );
  return data;
};

const signOrder = async (wallet: Wallet, signData: any): Promise<string> => {
  return wallet._signTypedData(
    signData.domain,
    signData.types,
    signData.value
  );
};

const sendBlurSubmitRequest = async (submitPayload: BlurSubmitPayload, accessToken: string, wallet_address: string): Promise<void> => {
  const { data: response } = await limiter.schedule(() =>
    axiosInstance.request<BlurSubmitResponse>({
      method: 'POST',
      url: `${config.blurRapidEndpoint}collection-bids/submit`,
      headers: {
        'content-type': 'application/json',
        authToken: accessToken,
        walletAddress: wallet_address,
        'X-NFT-API-Key': config.apiKey,
      },
      data: JSON.stringify(submitPayload),
    })
  );

  if (response.errors) {
    throw new Error(`Error submitting offer: ${JSON.stringify(response.errors)}`);
  }
};

const createOfferWithRapid = async (
  wallet_address: string,
  private_key: string,
  slug: string,
  offer_price: bigint,
  creator_fees: IFee,
  enforceCreatorFee: boolean,
  opensea_traits?: string
) => {
  const divider = BigNumber.from(10000);
  const offerPriceEth = Number(offer_price) / 1e18;

  let decimals;
  if (offerPriceEth >= 1) {
    decimals = 2;
  } else if (offerPriceEth >= 0.1) {
    decimals = 3;
  } else {
    decimals = 4;
  }


  // 0.08 = 800000000000001

  const roundedPrice = offerPriceEth.toFixed(decimals);
  const roundedEth = Number(roundedPrice);
  const basis = decimals === 2 ? 1e16 : decimals === 3 ? 1e15 : 1e14
  const roundedWei = Math.round(roundedEth * 1e18 / basis) * basis

  const offerPrice = BigNumber.from(roundedWei.toString());
  const openseaFee = BigNumber.from(parseFloat(OPENSEA_FEE) * 100);

  const payload: any = {
    criteria: {
      collection: {
        slug: slug
      }
    },
    protocol_data: {
      parameters: {
        offerer: wallet_address,
        offer: [
          {
            itemType: 1,
            token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            identifierOrCriteria: 0,
            startAmount: (Date.now() / 1000).toString(),
            endAmount: (Date.now() / 1000 + 100000).toString()
          }
        ],
        consideration: [],
        startTime: '1666480886',
        endTime: '1666680886',
        orderType: 2,
        zone: '0x004C00500000aD104D7DBd00e3ae0A5C00560C00',
        zoneHash:
          '0x0000000000000000000000000000000000000000000000000000000000000000',
        conduitKey:
          '0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000',
        totalOriginalConsiderationItems: 2,
        counter: '0'
      },
      signature: '0x0'
    },
    protocol_address: '0x0000000000000068f116a894984e2db1123eb395'
  }

  const jsonRpcProvider = new ethers.providers.StaticJsonRpcProvider(
    `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`, {
    name: "homestead",
    chainId: 1
  }
  );

  const wallet = new Wallet(private_key, jsonRpcProvider);
  const wethContract = new Contract(config.weth, wethAbi, wallet);
  const allowance = await wethContract.allowance(
    wallet.address,
    conduitAddress
  );
  if (allowance.lt(offerPrice)) {
    try {
      console.log(
        'Insufficient allowance! Approving Weth to Seaport Contract...'
      );
      const tx = await wethContract.approve(
        conduitAddress,
        constants.MaxUint256
      );
      await tx.wait();
    } catch (err: any) {
      console.log(err?.reason ?? err?.message);
      return;
    }
  }
  // reset consideration list and count
  payload.protocol_data.parameters.consideration = [];
  payload.protocol_data.parameters.totalOriginalConsiderationItems = 2;

  // set correct slug for collection
  payload.criteria.collection.slug = slug;

  if (opensea_traits && typeof opensea_traits !== undefined) {
    console.log('\x1b[32m%s\x1b[0m', '--------------------------------------------------------');
    console.log('\x1b[32m%s\x1b[0m', 'INITIATE OPENSEA TRAIT BIDDING.......');
    console.log('\x1b[32m%s\x1b[0m', '--------------------------------------------------------');
    payload.criteria.trait = JSON.parse(opensea_traits)
  } else {
    delete payload.criteria.trait
  }

  const buildPayload = {
    quantity: 1,
    criteria: payload.criteria,
    offerer: wallet_address,
    protocol_address: '0x0000000000000068f116a894984e2db1123eb395'
  };

  try {
    const { data } = await limiter
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

    payload.protocol_data.parameters.startTime = BigInt(
      Math.floor(Date.now() / 1000)
    ).toString();
    payload.protocol_data.parameters.endTime = BigInt(
      Math.floor(Date.now() / 1000 + 900)
    ).toString();
    payload.protocol_data.parameters.offerer = wallet_address;
    payload.protocol_data.parameters.offer[0].startAmount = offerPrice.toString();

    payload.protocol_data.parameters.offer[0].token = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

    payload.protocol_data.parameters.offer[0].endAmount = offerPrice.toString();

    // assign first consideration item
    payload.protocol_data.parameters.consideration.push(data.partialParameters.consideration[0]);

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
    for (const address in creator_fees) {
      let fee: any = creator_fees[address];

      fee = BigNumber.from(Math.round(fee).toString());
      // If there are creator fees, loop through and add them all as consideration items
      if (enforceCreatorFee) {
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

    payload.protocol_data.parameters.zone = data.partialParameters.zone;
    payload.protocol_data.parameters.zoneHash = data.partialParameters.zoneHash;
    payload.protocol_data.parameters.salt = Math.floor(
      Math.random() * 100_000
    ).toString();

    // request the value for the counter from the seaport contract and set it in payload
    const counter = await seaportContract.methods
      .getCounter(wallet_address)
      .call();
    payload.protocol_data.parameters.counter = counter.toString();

    // sign the offer
    const signObj = await wallet._signTypedData(
      domain,
      types,
      payload.protocol_data.parameters
    );

    // attach signature
    payload.protocol_data.signature = signObj;
    payload.protocol_address = '0x0000000000000068f116a894984e2db1123eb395';


    const orderHash = await postOpenseaOffer(payload)

    return orderHash

  } catch (error: any) {
    console.log("opensea error", error);
  }
};


const bidOnOpensea = async (
  wallet_address: string,
  private_key: string,
  slug: string,
  offer_price: bigint,
  creator_fees: IFee,
  enforceCreatorFee: boolean,
  xApiKey: string,
  opensea_traits?: string,
) => {
  const divider = BigNumber.from(10000);
  const offerPriceEth = Number(offer_price) / 1e18;

  let decimals;
  if (offerPriceEth >= 1) {
    decimals = 2;
  } else if (offerPriceEth >= 0.1) {
    decimals = 3;
  } else {
    decimals = 4;
  }


  const roundedPrice = offerPriceEth.toFixed(decimals);
  const roundedEth = Number(roundedPrice);
  const basis = decimals === 2 ? 1e16 : decimals === 3 ? 1e15 : 1e14
  const roundedWei = Math.round(roundedEth * 1e18 / basis) * basis

  const offerPrice = BigNumber.from(roundedWei.toString());
  const openseaFee = BigNumber.from(100);

  const payload: any = {
    criteria: {
      collection: {
        slug: slug
      }
    },
    protocol_data: {
      parameters: {
        offerer: wallet_address,
        offer: [
          {
            itemType: 1,
            token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            identifierOrCriteria: 0,
            startAmount: (Date.now() / 1000).toString(),
            endAmount: (Date.now() / 1000 + 100000).toString()
          }
        ],
        consideration: [],
        startTime: '1666480886',
        endTime: '1666680886',
        orderType: 2,
        zone: '0x004C00500000aD104D7DBd00e3ae0A5C00560C00',
        zoneHash:
          '0x0000000000000000000000000000000000000000000000000000000000000000',
        conduitKey:
          '0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000',
        totalOriginalConsiderationItems: 2,
        counter: '0'
      },
      signature: '0x0'
    },
    protocol_address: '0x0000000000000068f116a894984e2db1123eb395'
  }

  const jsonRpcProvider = new ethers.providers.StaticJsonRpcProvider(
    `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`, {
    name: "homestead",
    chainId: 1
  }
  );
  const wallet = new Wallet(private_key, jsonRpcProvider);
  const wethContract = new Contract(config.weth, wethAbi, wallet);
  const allowance = await wethContract.allowance(
    wallet.address,
    conduitAddress
  );
  if (allowance.lt(offerPrice)) {
    try {
      console.log(
        'Insufficient allowance! Approving Weth to Seaport Contract...'
      );
      const tx = await wethContract.approve(
        conduitAddress,
        constants.MaxUint256
      );
      await tx.wait();
    } catch (err: any) {
      console.log(err?.reason ?? err?.message);
      return;
    }
  }
  // reset consideration list and count
  payload.protocol_data.parameters.consideration = [];
  payload.protocol_data.parameters.totalOriginalConsiderationItems = 2;

  // set correct slug for collection
  payload.criteria.collection.slug = slug;

  if (opensea_traits && typeof opensea_traits !== undefined) {
    console.log('\x1b[32m%s\x1b[0m', '--------------------------------------------------------');
    console.log('\x1b[32m%s\x1b[0m', 'INITIATE OPENSEA TRAIT BIDDING.......');
    console.log('\x1b[32m%s\x1b[0m', '--------------------------------------------------------');
    payload.criteria.trait = JSON.parse(opensea_traits)
  } else {
    delete payload.criteria.trait
  }

  const buildPayload = {
    quantity: 1,
    criteria: payload.criteria,
    offerer: wallet_address,
    protocol_address: '0x0000000000000068f116a894984e2db1123eb395'
  };

  try {
    const headers = {
      'content-type': 'application/json',
      'x-api-key': xApiKey
    };

    console.log({ headers });

    const { data } = await limiter
      .schedule(() =>
        axiosInstance.request({
          method: 'POST',
          url: `${config.endpoint.replace('v1', 'v2')}offers/build`,
          headers,
          data: JSON.stringify(buildPayload)
        })
      )

    payload.protocol_data.parameters.startTime = BigInt(
      Math.floor(Date.now() / 1000)
    ).toString();
    payload.protocol_data.parameters.endTime = BigInt(
      Math.floor(Date.now() / 1000 + 900)
    ).toString();
    payload.protocol_data.parameters.offerer = wallet_address;
    payload.protocol_data.parameters.offer[0].startAmount = offerPrice.toString();

    payload.protocol_data.parameters.offer[0].token = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

    payload.protocol_data.parameters.offer[0].endAmount = offerPrice.toString();

    // assign first consideration item
    payload.protocol_data.parameters.consideration.push(data.partialParameters.consideration[0]);

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
    for (const address in creator_fees) {
      let fee: any = creator_fees[address];

      fee = BigNumber.from(Math.round(fee).toString());
      // If there are creator fees, loop through and add them all as consideration items
      if (enforceCreatorFee) {
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

    payload.protocol_data.parameters.zone = data.partialParameters.zone;
    payload.protocol_data.parameters.zoneHash = data.partialParameters.zoneHash;
    payload.protocol_data.parameters.salt = Math.floor(
      Math.random() * 100_000
    ).toString();

    // request the value for the counter from the seaport contract and set it in payload
    const counter = await seaportContract.methods
      .getCounter(wallet_address)
      .call();
    payload.protocol_data.parameters.counter = counter.toString();

    // sign the offer
    const signObj = await wallet._signTypedData(
      domain,
      types,
      payload.protocol_data.parameters
    );

    // attach signature
    payload.protocol_data.signature = signObj;
    payload.protocol_address = '0x0000000000000068f116a894984e2db1123eb395';


    console.log({ headers });


    const { data: order } = await
      limiter.schedule(() => axiosInstance.request({
        method: 'POST',
        url: `${config.endpoint.replace('v1', 'v2')}offers`,
        headers,
        data: JSON.stringify(payload)
      }))

    return order.order_hash

  } catch (error: any) {
    console.log("opensea error", error?.response?.data);
  }
};

async function postOpenseaOffer(payload: any) {
  try {
    const { data } = await
      limiter.schedule(() => axiosInstance.request({
        method: 'POST',
        url: `${config.openseaRapidEndpoint.replace('v1', 'v2')}offers`,
        headers: {
          'content-type': 'application/json',
          'X-NFT-API-Key': config.apiKey
        },
        data: JSON.stringify(payload)
      }))

    return data.order_hash
  } catch (error: any) {
    console.log("opensea post offer error", error.response.data);
  }
}


const listenToEventsWithRapid = async (
  wallet_address: string,
  private_key: string,
  slug: string,
  offer_price: bigint,
  creator_fees: IFee,
  enforceCreatorFee: boolean,
  contractAddress: string,
  opensea_traits?: string
) => {
  const divider = BigNumber.from(10000);
  const roundedNumber = Math.round(Number(offer_price) / 1e14) * 1e14;
  const offerPrice = BigNumber.from(roundedNumber.toString());
  const openseaFee = BigNumber.from(250);

  const ALCHEMY_API_KEY = config.ALCHEMY_API_KEY

  const jsonRpcProvider = new ethers.providers.JsonRpcProvider(`https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`, {
    name: "homestead",
    chainId: 1
  });

  const wallet = new Wallet(private_key, jsonRpcProvider);
  const wethContract = new Contract(config.weth, wethAbi, wallet);
  const seaportContract = new Contract(seaportContractAddress, minABI, wallet);

  // Check and approve WETH allowance
  await checkAndApproveWETH(wallet, wethContract, offerPrice);

  // Prepare build payload
  const buildPayload = prepareBuildPayload(wallet_address, slug, opensea_traits);

  try {
    // Send the offer to build
    const buildResponse = await sendBuildRequest(buildPayload);

    // Prepare offer payload
    const offerPayload = await prepareOfferPayload(
      wallet_address,
      offerPrice,
      creator_fees,
      enforceCreatorFee,
      buildResponse,
      wallet,
      seaportContract
    );

    // Send the offer
    await sendOfferRequest(offerPayload);

    console.log('Offer posted successfully');
  } catch (error: any) {
    console.log("OpenSea error", error.response?.data.errors || error.message);
  }
};

const checkAndApproveWETH = async (wallet: Wallet, wethContract: Contract, offerPrice: BigNumber) => {
  const allowance = await wethContract.allowance(wallet.address, seaportContractAddress);
  if (allowance.lt(offerPrice)) {
    try {
      console.log('Insufficient allowance! Approving WETH to Seaport Contract...');
      const tx = await wethContract.approve(seaportContractAddress, constants.MaxUint256);
      await tx.wait();
    } catch (err: any) {
      console.log(err?.reason ?? err?.message);
      throw err;
    }
  }
};

const prepareBuildPayload = (wallet_address: string, slug: string, opensea_traits?: string) => {
  const buildPayload = {
    quantity: 1,
    criteria: {
      collection: { slug },
      ...(opensea_traits ? { trait: JSON.parse(opensea_traits) } : {})
    },
    offerer: wallet_address,
    protocol_address: '0x0000000000000068f116a894984e2db1123eb395'
  };
  return buildPayload;
};

const sendBuildRequest = async (buildPayload: any) => {
  const { data } = await limiter.schedule(() =>
    axiosInstance.request({
      method: 'POST',
      url: `${config.openseaRapidEndpoint.replace('v1', 'v2')}offers/build`,
      headers: {
        'content-type': 'application/json',
        'X-NFT-API-Key': config.apiKey
      },
      data: JSON.stringify(buildPayload)
    })
  );
  return data;
};

const prepareOfferPayload = async (
  wallet_address: string,
  offerPrice: BigNumber,
  creator_fees: IFee,
  enforceCreatorFee: boolean,
  buildResponse: any,
  wallet: Wallet,
  seaportContract: Contract
) => {
  const offerPayload = {
    protocol_data: {
      parameters: {
        offerer: wallet_address,
        offer: [{
          token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          itemType: 1,
          identifierOrCriteria: '0',
          startAmount: offerPrice.toString(),
          endAmount: offerPrice.toString()
        }],
        consideration: [
          buildResponse.partialParameters.consideration[0],
          {
            itemType: 1,
            token: config.weth,
            identifierOrCriteria: '0',
            startAmount: offerPrice.mul(250).div(10000).toString(),
            endAmount: offerPrice.mul(250).div(10000).toString(),
            recipient: '0x0000a26b00c1F0DF003000390027140000fAa719'
          }
        ],
        startTime: BigInt(Math.floor(Date.now() / 1000)).toString(),
        endTime: BigInt(Math.floor(Date.now() / 1000 + 900)).toString(),
        orderType: 2,
        zone: buildResponse.partialParameters.zone,
        zoneHash: buildResponse.partialParameters.zoneHash,
        salt: Math.floor(Math.random() * 100_000).toString(),
        conduitKey: '0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000',
        totalOriginalConsiderationItems: 2 + (enforceCreatorFee ? Object.keys(creator_fees).length : 0),
        counter: (await seaportContract.getCounter(wallet_address)).toString()
      },
      signature: ""
    },
    protocol_address: '0x0000000000000068f116a894984e2db1123eb395'
  };

  if (enforceCreatorFee) {
    for (const [address, fee] of Object.entries(creator_fees)) {
      offerPayload.protocol_data.parameters.consideration.push({
        itemType: 1,
        token: config.weth,
        identifierOrCriteria: '0',
        startAmount: offerPrice.mul(BigNumber.from(Math.round(fee).toString())).div(10000).toString(),
        endAmount: offerPrice.mul(BigNumber.from(Math.round(fee).toString())).div(10000).toString(),
        recipient: address
      });
    }
  }

  offerPayload.protocol_data.signature = await wallet._signTypedData(
    domain,
    types,
    offerPayload.protocol_data.parameters
  );

  return offerPayload;
};

const sendOfferRequest = async (offerPayload: any) => {
  await limiter.schedule({ priority: 2 }, () =>
    axiosInstance.request({
      method: 'POST',
      url: `${config.openseaRapidEndpoint.replace('v1', 'v2')}offers`,
      headers: {
        'content-type': 'application/json',
        'X-NFT-API-Key': config.apiKey
      },
      data: JSON.stringify(offerPayload)
    })
  );
};


export async function bidOnMagicEden(
  maker: string,
  collection: string,
  quantity: number,
  weiPrice: string,
  expirationTime: string,
  privateKey: string,
) {
  const data = {
    maker: maker,
    source: "magiceden.io",
    params: [
      {
        collection: collection,
        currency: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        quantity: quantity,
        weiPrice: weiPrice,
        expirationTime: expirationTime,
        orderKind: "payment-processor-v2",
        orderbook: "reservoir",
        options: {
          "payment-processor-v2": {
            useOffChainCancellation: true
          }
        },
        automatedRoyalties: true
      }
    ]
  };


  try {
    const { data: order } = await limiter.schedule(() => axiosInstance.post<CreateOrderData>('https://nfttools.pro/magiceden/v3/rtp/ethereum/execute/bid/v5', data, {
      headers: {
        'content-type': 'application/json',
        'X-NFT-API-Key': config.apiKey,
      }


    }))

    const NETWORK = "mainnet"

    const provider = new ethers.providers.StaticJsonRpcProvider(
      `https://eth-mainnet.g.alchemy.com/v2/${config.ALCHEMY_API_KEY}`,
      {
        name: "homestead",
        chainId: 1
      }
    );

    const wallet = new Wallet(privateKey, provider);


    if (order) {
      const res = await submitSignedOrderData(order, wallet)
      return res
    }
    return order
  } catch (error: any) {
    console.log(error.response.data);

  }
}

export async function submitSignedOrderData(order: CreateOrderData, wallet: ethers.Wallet) {

  const signData: any = order?.steps
    ?.find((step) => step.id === "order-signature")
    ?.items?.[0]?.data?.sign;

  if (signData) {
    const signature = await wallet._signTypedData(
      signData.domain,
      signData?.types,
      signData.value
    );
    const payload = signData.value;
    const { buyer, ...rest } = payload;

    const data = {
      items: [
        {
          order: {
            kind: "payment-processor-v2",
            data: {
              kind: "collection-offer-approval",
              sellerOrBuyer: buyer,
              ...rest,
              r: "0x0000000000000000000000000000000000000000000000000000000000000000",
              s: "0x0000000000000000000000000000000000000000000000000000000000000000",
              v: 0,
            },
          },
          orderbook: "reservoir",
        },
      ],
      source: "magiceden.io",
    };


    const signEndpoint =
      "https://nfttools.pro/magiceden/v3/rtp/ethereum/order/v4";


    try {
      const { data: offerResponse } = await limiter.schedule(() =>
        axiosInstance.post<OfferResponse>(
          `${signEndpoint}?signature=${encodeURIComponent(signature)}`,
          data,
          {
            headers: {
              'content-type': 'application/json',
              'X-NFT-API-Key': config.apiKey,
            }
          }
        )
      );

      console.log(JSON.stringify(offerResponse));
      return offerResponse

    } catch (error) {
      console.log(error);
    }
  }

}

export {
  getBlurData,
  getOffers,
  getOffers2,
  getOSFloorPrice,
  getOffersWithRapid,
  getOffersFromBlur,
  createOfferWithRapid,
  createOfferToBlur,
  bidOnOpensea
};

interface OfferResponse {
  errors?: any;
}
interface SubmitPayload {
  signature: string;
  marketplaceData: any;
}

interface SubmitResponse {
  errors?: any;
}

interface BuildPayload {
  quantity: number;
  criteria: {
    collection: {
      slug: string;
    };
  };
  offerer: string;
  protocol_address: string;
}

interface BuildResponse {
  errors?: any;
  partialParameters: {
    consideration: any[];
    zone: string;
    zoneHash: string;
  };
}

interface OfferPayload {
  protocol_data: {
    parameters: {
      startTime: string;
      endTime: string;
      offerer: string;
      offer: {
        startAmount: string;
        endAmount: string;
      }[];
      consideration: any[];
      totalOriginalConsiderationItems: number;
      zone: string;
      zoneHash: string;
      salt: string;
      counter: string;
    };
    signature: string;
  };
  protocol_address: string;
  criteria: {
    collection: {
      slug: string;
    };
  };
}

// Define types for ABI
interface ABI {
  inputs: { internalType: string; name: string; type: string }[];
  name: string;
  outputs: { internalType: string; name: string; type: string }[];
  stateMutability: string;
  type: string;
}

// Define domain interface
interface Domain {
  name: string;
  version: string;
  chainId: string;
  verifyingContract: string;
}

// Define payload types
interface Payload {
  OrderComponents: Array<{
    name: string;
    type: string;
  }>;
  OfferItem: Array<{
    name: string;
    type: string;
  }>;
  ConsiderationItem: Array<{
    name: string;
    type: string;
  }>;
}

interface OfferResponse {
  offer: any;
  isOffer: boolean;
}

interface CreateOfferParams {
  wallet_address: string;
  private_key: string;
  slug: string;
  offer_price: number;
  creator_fees: Record<string, number>;
}

interface CreateOfferWithRapidParams extends CreateOfferParams {
  accessToken: string;
}

interface BuildResponse {
  errors?: any;
  signatures?: {
    signData: {
      domain: any;
      types: any;
      value: any;
    };
    marketplaceData: any;
  }[];
}

interface IFee {
  [address: string]: number;
}
interface BlurOfferResponse {
  success: boolean;
  priceLevels: PriceLevel[];
}

export interface PriceLevel {
  criteriaType: string;
  criteriaValue: {};
  price: string;
  executableSize: number;
  numberBidders: number;
  bidderAddressesSample: string[];
}

export interface IOpenseaOffer {
  order_hash: string;
  chain: string;
  price: {
    currency: string;
    decimals: number;
    value: string;
  };
  criteria: {
    collection: {
      slug: string;
    };
    contract: {
      address: string;
    };
    trait: null;
    encoded_token_ids: string;
  };
  protocol_data: {
    parameters: {
      offerer: string;
      offer: {
        itemType: number;
        token: string;
        identifierOrCriteria: string;
        startAmount: string;
        endAmount: string;
      }[];
      consideration: {
        itemType: number;
        token: string;
        identifierOrCriteria: string;
        startAmount: string;
        endAmount: string;
        recipient: string;
      }[];
      startTime: string;
      endTime: string;
      orderType: number;
      zone: string;
      zoneHash: string;
      salt: string;
      conduitKey: string;
      totalOriginalConsiderationItems: number;
      counter: number;
    };
    signature: null;
  };
  protocol_address: string;
}

interface OffersResponse {
  offers: IOpenseaOffer[];
}

interface CreatorFees {
  [address: string]: string;
}

interface OpenseaConsideration {
  itemType: number;
  token: string;
  identifierOrCriteria: number;
  startAmount: string;
  endAmount: string;
  recipient: string;
}

interface Payload {
  criteria: any; // Define the type for this property accordingly
  protocol_data: {
    parameters: {
      consideration: any;
      totalOriginalConsiderationItems: number;
      startTime: string;
      endTime: string;
      offerer: string;
      offer: { startAmount: string; endAmount: string }[];
      zone: string;
      zoneHash: string;
      salt: string;
      counter: string;
    };
    signature: any; // Define the type for this property accordingly
  };
}

export const createOpenseaOffer = async (
  wallet_address: string,
  private_key: string,
  slug: string,
  offer_price: any,
  creator_fees: any
) => {
  const divider = BigNumber.from(10000);
  const offerPrice = BigNumber.from(offer_price.toString());
  const openseaFee = BigNumber.from(250);

  const jsonRpcProvider = new providers.JsonRpcProvider(config.network);
  const wallet = new Wallet(private_key, jsonRpcProvider);
  const wethContract = new Contract(config.weth, wethAbi, wallet);
  const allowance = await wethContract.allowance(
    wallet.address,
    conduitAddress
  );
  if (allowance.lt(offerPrice)) {
    try {
      console.log(
        'Insufficient allowance! Approving Weth to Seaport Contract...'
      );
      const tx = await wethContract.approve(
        conduitAddress,
        constants.MaxUint256
      );
      await tx.wait();
    } catch (err: any) {
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


  // Doesn't work without this line, why????
  payload.protocol_data.parameters.offer[0].token = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

  payload.protocol_address = '0x0000000000000068f116a894984e2db1123eb395';


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
  for (const address in creator_fees) {
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

export interface CreateOrderData {
  steps: Step[];
  errors: any[];
}
interface Step {
  id: string;
  action: string;
  description: string;
  kind: string;
  items: Item[];
}

interface Item {
  status: string;
  data: ItemData;
  orderIndexes: number[];
}

interface ItemData {
  from?: string;
  to?: string;
  data?: string;
  value?: string;
  sign?: Sign;
  post?: Post;
}

interface Sign {
  signatureKind: string;
  domain: Domain;
  types: Types;
  value: Value;
  primaryType: string;
}

interface Post {
  endpoint: string;
  method: string;
  body: PostBody;
}

interface Types {
  CollectionOfferApproval: CollectionOfferApproval[];
}

interface Value {
  protocol: number;
  cosigner: string;
  buyer: string;
  beneficiary: string;
  marketplace: string;
  fallbackRoyaltyRecipient: string;
  paymentMethod: string;
  tokenAddress: string;
  amount: string;
  itemPrice: string;
  expiration: string;
  marketplaceFeeNumerator: string;
  nonce: string;
  masterNonce: string;
}

interface PostBody {
  items: PostItem[];
  source: string;
}

interface PostItem {
  order: Order;
  collection: string;
  isNonFlagged: boolean;
  orderbook: string;
}

interface CollectionOfferApproval {
  name: string;
  type: string;
}

interface Order {
  kind: string;
  data: OrderData;
}

interface OrderData {
  kind: string;
  protocol: number;
  cosigner: string;
  sellerOrBuyer: string;
  marketplace: string;
  paymentMethod: string;
  tokenAddress: string;
  amount: string;
  itemPrice: string;
  expiration: string;
  marketplaceFeeNumerator: string;
  nonce: string;
  masterNonce: string;
  fallbackRoyaltyRecipient: string;
  beneficiary: string;
  v: number;
  r: string;
  s: string;
}