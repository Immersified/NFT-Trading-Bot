import { BigNumber, constants, Contract, ethers, providers } from "ethers";
import { approveNFT } from "../utils/listOnMagicEden";
import config from "../config";
import { parseEther } from "ethers/lib/utils";
import limiter from "../bottleneck";
import axiosInstance from "../axios/axiosInstance";
import {
  ITEM_VIEW_MODAL_QUERY,
  LISTING_FLOW_QUERY,
  LISTING_FLOW_TIMELINE_QUERY,
  CREATE_ORDER_MUTATION
} from '../queries/query';

const minABI = [
  {
    inputs: [{ internalType: 'address', name: 'offerer', type: 'address' }],
    name: 'getCounter',
    outputs: [{ internalType: 'uint256', name: 'counter', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
];

const provider = new providers.JsonRpcProvider(config.network);
const seaportContractAddress = '0x00000000000001ad428e4906aE43D8F9852d0dD6';
const seaportContract = new Contract(seaportContractAddress, minABI, provider);
const OPENSEA_FEE = process.env.OPENSEA_FEE as string

const listingPayload: any = {
  parameters: {
    offerer: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    zone: '0x004C00500000aD104D7DBd00e3ae0A5C00560C00',
    zoneHash:
      '0x0000000000000000000000000000000000000000000000000000000000000000',
    startTime: '0',
    endTime: '1656044994000',
    // orderType: "FULL_OPEN",
    offer: [
      {
        itemType: 2,
        token: '0x0165878A594ca255338adfa4d48449f69242Eb8F',
        identifierOrCriteria: '1',
        startAmount: '1',
        endAmount: '1'
      }
    ],
    consideration: [],
    totalOriginalConsiderationItems: 2,
    salt: 12686911856931635052326433555881236148,
    conduitKey:
      '0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000',
    nonce: 0
  },
  signature: '0x',
  protocol_address: '0x0000000000000068f116a894984e2db1123eb395'
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

const domain = {
  name: 'Seaport',
  version: '1.6',
  chainId: '1',
  verifyingContract: '0x0000000000000068f116a894984e2db1123eb395'
};


export const listOnOpensea = async (
  nftAddress: string,
  tokenId: string,
  price: number,
  wallet: ethers.Wallet,
  creatorFees: IFee | undefined,
  enforceCreatorFee: boolean,
  schema: string
) => {

  try {
    await approveNFT(
      nftAddress,
      wallet,
      '0x1E0049783F008A0085193E00003D00cd54003c71'
    );
  } catch (error) {
    console.log(error);
  }

  const listingPayload: any = {
  parameters: {
    offerer: wallet.address,
    offer: [
      {
        itemType: schema == 'ERC1155' ? 3 : 2,
        token: nftAddress,
        identifierOrCriteria: tokenId,
        startAmount: '1',
        endAmount: '1'
      }
    ],
    consideration: [],
    startTime: BigInt(Math.floor(Date.now() / 1000)).toString(),
    endTime: BigInt(Math.floor(Date.now() / 1000 + 960)).toString(),
    orderType: 2,
    zone: '0x000056f7000000ece9003ca63978907a00ffd100',
    zoneHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
    conduitKey: '0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000',
    totalOriginalConsiderationItems: 2,
    salt: Math.floor(Math.random() * 100_000).toString(),
    counter: '0'
  },
  signature: '0x0',
  protocol_address: '0x0000000000000068f116a894984e2db1123eb395' // ✅ top-level, not inside parameters
};

  const offerPrice = BigNumber.from(parseEther(price + ''));

  let totalCreatorFee = 0;
  const creatorFeeConsideration = [];

  for (const address in creatorFees) {
    let feeString = creatorFees[address].toString().split('.')[0];
    let fee = Number(feeString);

    if (address !== 'null') {
      const consideration_item = {
        itemType: 0,
        token: constants.AddressZero,
        identifierOrCriteria: 0,
        startAmount: offerPrice.mul(fee).div(divider).toString(),
        endAmount: offerPrice.mul(fee).div(divider).toString(),
        recipient: address
      };

      creatorFeeConsideration.push(consideration_item);

      if (enforceCreatorFee) {
        listingPayload.parameters.totalOriginalConsiderationItems += 1;
        totalCreatorFee += fee;
      }
    }
  }

  const ownerConsideration = {
    itemType: 0,
    token: constants.AddressZero,
    identifierOrCriteria: 0,
    startAmount: offerPrice
      .mul(divider - totalCreatorFee - parseFloat(OPENSEA_FEE) * 100)
      .div(divider)
      .toString(),
    endAmount: offerPrice
      .mul(divider - totalCreatorFee - parseFloat(OPENSEA_FEE) * 100)
      .div(divider)
      .toString(),
    recipient: wallet.address
  };

  const openseaConsideration = {
    itemType: 0,
    token: constants.AddressZero,
    identifierOrCriteria: 0,
    startAmount: offerPrice.mul(parseFloat(OPENSEA_FEE) * 100).div(divider).toString(),
    endAmount: offerPrice.mul(parseFloat(OPENSEA_FEE) * 100).div(divider).toString(),
    recipient: '0x0000a26b00c1F0DF003000390027140000fAa719'
  };

  listingPayload.parameters.consideration = enforceCreatorFee
    ? [ownerConsideration, openseaConsideration, ...creatorFeeConsideration]
    : [ownerConsideration, openseaConsideration];

  // Request counter from seaport contract and set it in payload
  const counter = await seaportContract.getCounter(wallet.address);
  listingPayload.parameters.counter = counter.toString();

  // Sign the order
  const sigObj = await wallet._signTypedData(domain, types, listingPayload.parameters);
  listingPayload.signature = sigObj;

  const listings = await limiter
    .schedule(() =>
      axiosInstance.request({
        method: 'POST',
        url: `${config.openseaRapidEndpoint.replace('v1', 'v2')}orders/ethereum/seaport/listings`,
        headers: {
          'content-type': 'application/json',
          'X-NFT-API-Key': config.apiKey
        },
        data: JSON.stringify(listingPayload)
      })
    )
    .then((res) => res.data)
    .catch((err) => {
      return { errors: err?.response?.data ?? err };
    });

  if (listings.errors) {
    console.log('Error: ', JSON.stringify(listings.errors));
  } else {
    console.log('NFT listed successfully on opensea');
  }
};

export interface IFee {
  [key: string]: number
}

export async function listOnOpenseaBeta(ethersSigner: ethers.Wallet, priceInETH: number, contractAddress: string, tokenId: string) {
  try {

    try {
      await approveNFT(
        contractAddress,
        ethersSigner,
        '0x1E0049783F008A0085193E00003D00cd54003c71'
      );
    } catch (error) {
      console.log(error);
    }
    const data = await fetchListingFlowData(ethersSigner, contractAddress, tokenId);

    const price = Number(priceInETH.toFixed(4))
    const useCreatorFee = data.data.itemsByIdentifiers[0].collection.fees.totalCreatorFee.isRequired;
    const duration = 15

    await createOpenseaListing(ethersSigner, contractAddress, tokenId, price, useCreatorFee, duration);
  } catch (error) {
    console.log(error);
  }
}

export async function fetchListingFlowData(ethersSigner: ethers.Wallet, contractAddress: string, tokenId: string): Promise<ListingFlowResponse> {
  const payload = {
    operationName: "ListingFlowQuery",
    query: LISTING_FLOW_QUERY,
    variables: {
      address: ethersSigner.address,
      identifiers: [
        {
          chain: "ethereum",
          contractAddress: contractAddress,
          tokenId: tokenId
        }
      ]
    }
  };

  const NFT_TOOLS_API = 'https://nfttools.pro/opensea/graphql';

  const { data } = await limiter.schedule(() => axiosInstance.post<ListingFlowResponse>(
    NFT_TOOLS_API,
    payload,
    {
      headers: {
        // cookie: cookie,
        'x-nft-api-key': config.apiKey,
        'x-auth-address': ethersSigner.address.toLowerCase(),
      },
    }
  ));

  return data;
}

interface ListingFlowResponse {
  data: {
    itemsByIdentifiers: Array<{
      id: string;
      tokenId: string;
      contractAddress: string;
      chain: {
        identifier: string;
        listingCurrency: {
          symbol: string;
          address: string;
        };
      };
      isTradingDisabled: boolean;
      imageUrl: string;
      collection: {
        id: string;
        fees: {
          totalCreatorFee: {
            feeBasisPoints: number;
            isRequired: boolean;
          };
          openseaFee: {
            feeBasisPoints: number;
            isRequired: boolean;
          };
        };
        floorPrice: {
          id: string;
          pricePerItem: {
            token: {
              unit: number;
              symbol: string;
            };
            usd: number;
          };
        };
        chain: {
          identifier: string;
          nativeCurrency: {
            address: string;
          };
          listingCurrency: {
            address: string;
            symbol: string;
          };
        };
        name: string;
        slug: string;
      };
      isFungible: boolean;
      ownership: {
        quantity: string;
      };
      lowestListingForOwner: {
        pricePerItem: {
          token: {
            unit: number;
          };
        };
      };
      name: string;
      lastSale: {
        token: {
          unit: number;
          symbol: string;
        };
      };
      bestOffer: null | {
        id: string;
        pricePerItem: {
          token: {
            unit: number;
            symbol: string;
          };
        };
      };
      rarity: {
        category: string;
        rank: number;
        totalSupply: number;
      };
      attributes: Array<{
        floorPrice: {
          token: {
            unit: number;
            symbol: string;
          };
        };
      }>;
    }>;
  }
}

/**
 * Creates a listing on OpenSea using the ListingFlowTimelineQuery
 * @param ethersSigner The wallet to use for signing and listing
 * @param contractAddress The NFT contract address
 * @param tokenId The NFT token ID
 * @param priceInETH The listing price in ETH
 * @param useCreatorFee Whether to include creator fees (optional, defaults to false)
 * @param durationInDays How long the listing should last (optional, defaults to 1 day)
 * @returns The response from the OpenSea API
 */
export async function createOpenseaListing(
  ethersSigner: ethers.Wallet,
  contractAddress: string,
  tokenId: string,
  priceInETH: number,
  useCreatorFee: boolean = false,
  duration: number = 15
) {
  // Calculate start and end times
  const startTime = new Date();
  const endTime = new Date();
  endTime.setMinutes(startTime.getMinutes() + duration);

  const payload = {
    operationName: "ListingFlowTimelineQuery",
    query: LISTING_FLOW_TIMELINE_QUERY,
    variables: {
      address: ethersSigner.address,
      listings: [
        {
          endTime: endTime.toISOString(),
          item: {
            chain: "ethereum",
            contractAddress: contractAddress,
            tokenId: tokenId
          },
          pricePerItem: {
            contractAddress: "0x0000000000000000000000000000000000000000", // ETH address
            unit: priceInETH.toString()
          },
          quantity: 1,
          startTime: startTime.toISOString()
        }
      ],
      useCreatorFee: useCreatorFee
    }
  };

  const NFT_TOOLS_API = 'https://nfttools.pro/opensea/graphql';

  try {
    const { data } = await limiter.schedule(() => axiosInstance.post<ListingFlowTimelineResponse>(
      NFT_TOOLS_API,
      payload,
      {
        headers: {
          // cookie: cookie,
          'x-nft-api-key': config.apiKey,
          'x-auth-address': ethersSigner.address.toLowerCase(),
        },
      }
    ));



    // Extract the signature request from the response
    const signatureRequest = extractSignatureRequest(data);

    if (signatureRequest) {
      // Sign the order with the wallet
      const { signature, message } = await signSeaportOrder(ethersSigner, signatureRequest);

      // Now we need to submit the signed order back to OpenSea
      // This would be another API call to complete the listing process
      const listingResult = await submitSignedListing(message, signature, ethersSigner);

      console.log(`NFT listed successfully on OpenSea: ${contractAddress}/${tokenId} for ${priceInETH} ETH`);
      return listingResult;
    } else {
      throw new Error("No signature request found in the response");
    }
  } catch (error) {
    console.error("Error creating OpenSea listing:", error);
    throw error;
  }
}

/**
 * Extracts the signature request from the listing flow response
 */
function extractSignatureRequest(response: ListingFlowTimelineResponse): any {
  // Navigate through the response to find the signature request
  const actions = response.data?.createListings?.actions || [];

  for (const action of actions) {
    if (action.signatureRequest) {
      return action.signatureRequest;
    }
  }

  return null;
}

/**
 * Signs a Seaport order using the provided wallet
 */
async function signSeaportOrder(wallet: ethers.Wallet, signatureRequest: any) {
  // This is a simplified implementation - you'll need to adapt based on the actual signature request format
  if (signatureRequest.__typename === 'SignTypedDataRequest') {
    const { domain, types, message } = JSON.parse(signatureRequest.message);

    const signature = await wallet._signTypedData(
      domain,
      {
        OrderComponents: types.OrderComponents,
        OfferItem: types.OfferItem,
        ConsiderationItem: types.ConsiderationItem
      },
      message
    );

    // Sign the typed data
    return { signature, message };
  } else {
    // Handle other signature request types if needed
    throw new Error(`Unsupported signature request type: ${signatureRequest.__typename}`);
  }
}
/**
 * Submits the signed listing to OpenSea
 */
async function submitSignedListing(message: any, signature: string, wallet: ethers.Wallet): Promise<any> {
  const NFT_TOOLS_API = 'https://nfttools.pro/opensea/graphql';

  // Convert numeric item types to enum string values
  const processedMessage = {
    ...message,
    offer: message.offer.map((item: any) => ({
      ...item,
      itemType: convertItemTypeToEnum(item.itemType)
    })),
    consideration: message.consideration.map((item: any) => ({
      ...item,
      itemType: convertItemTypeToEnum(item.itemType)
    }))
  };

  // Make sure we're using the correct operation name
  const payload = {
    operationName: "ListingsFlowTimelineMutation", // This must match the operation name in the GraphQL query
    query: CREATE_ORDER_MUTATION,
    variables: {
      "chain": "ETHEREUM", // Ensure chain is uppercase
      "orders": [{
        "conduitKey": processedMessage.conduitKey,
        "consideration": processedMessage.consideration,
        "counter": processedMessage.counter,
        "endTime": processedMessage.endTime,
        "offer": processedMessage.offer,
        "offerer": processedMessage.offerer,
        "orderType": convertOrderTypeToEnum(processedMessage.orderType),
        "salt": processedMessage.salt,
        "startTime": processedMessage.startTime,
        "zone": processedMessage.zone,
        "zoneHash": processedMessage.zoneHash
      }],
      "signature": signature
    }
  };

  console.log(JSON.stringify(payload));


  try {
    const { data } = await limiter.schedule(() => axiosInstance.post(
      NFT_TOOLS_API,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-nft-api-key': config.apiKey,
          'x-auth-address': wallet.address.toLowerCase(),
        },
      }
    ));

    console.log("submitSignedListing response: ", JSON.stringify(data));
    return data;
  } catch (error: any) {
    console.error("Error submitting signed listing:", error);
    if (error.response) {
      console.error("Response data:", error.response.data);
      console.error("Response status:", error.response.status);
      console.error("Response headers:", error.response.headers);
    }
    throw error;
  }
}

// Helper function to convert numeric item types to enum strings
function convertItemTypeToEnum(itemType: number): string {
  switch (itemType) {
    case 0: return "NATIVE";
    case 1: return "ERC20";
    case 2: return "ERC721";
    case 3: return "ERC1155";
    default: throw new Error(`Unknown item type: ${itemType}`);
  }
}

// Add this new helper function to convert order type to enum string
function convertOrderTypeToEnum(orderType: number): string {
  switch (orderType) {
    case 0: return "FULL_OPEN";
    case 1: return "PARTIAL_OPEN";
    case 2: return "FULL_RESTRICTED";
    case 3: return "PARTIAL_RESTRICTED";
    case 4: return "CONTRACT";
    default: throw new Error(`Unknown order type: ${orderType}`);
  }
}

// Define the interface for the response
interface ListingFlowTimelineResponse {
  data?: {
    createListings?: {
      actions: Array<{
        __typename: string;
        items?: Array<{
          chain?: {
            identifier: string;
            __typename: string;
          };
          id?: string;
          __typename: string;
        }>;
        orders?: Array<SeaportOrderComponents>;
        signatureRequest?: {
          __typename: string;
          message: string;
          chain?: {
            networkId: string;
            __typename: string;
          };
        };
        transactionSubmissionData?: {
          chain: {
            networkId: string;
            identifier: string;
            blockExplorer?: {
              name: string;
              transactionUrlTemplate: string;
              __typename: string;
            };
            __typename: string;
          };
          to: string;
          data: string;
          value: string;
          __typename: string;
        };
      }>;
      __typename: string;
    };
  };
}

interface SeaportOrderComponents {
  offerer: string;
  zone: string;
  offer: Array<{
    itemType: number;
    token: string;
    identifierOrCriteria: string;
    startAmount: string;
    endAmount: string;
    __typename: string;
  }>;
  consideration: Array<{
    itemType: number;
    token: string;
    identifierOrCriteria: string;
    startAmount: string;
    endAmount: string;
    recipient: string;
    __typename: string;
  }>;
  orderType: number;
  startTime: string;
  endTime: string;
  zoneHash: string;
  salt: string;
  conduitKey: string;
  counter: string;
  __typename: string;
}

// Constants
const divider = 10000;
const openseaFee = 50;

interface CreatorFees {
  [key: string]: number;
}

const listToOpenseaWithRapid = async (
  nftAddress: string,
  tokenId: string,
  price: number,
  wallet: ethers.Wallet,
  creatorFees: CreatorFees,
  schema: string
): Promise<void> => {
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
  const creatorFeeConsideration: any[] = [];
  // This is the seller fee consideration item
  // Loop through creator fees and add relevant fees to the payload
  listingPayload.parameters.totalOriginalConsiderationItems = 2;
  for (const address in creatorFees) {
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

  const listings = await limiter
    .schedule(() =>
      axiosInstance.request({
        method: 'POST',
        url: `${config.openseaRapidEndpoint.replace(
          'v1',
          'v2'
        )}orders/ethereum/seaport/listings`,
        headers: {
          'content-type': 'application/json',
          'X-NFT-API-Key': config.apiKey
        },
        data: JSON.stringify(listingPayload)
      })
    )
    .then((res) => res.data)
    .catch((err) => {
      return { errors: err?.response?.data ?? err };
    });

  if (listings.errors) {
    console.log('Error: ', JSON.stringify(listings.errors));
  } else {
    console.log('NFT listed successfully on opensea');
  }
};