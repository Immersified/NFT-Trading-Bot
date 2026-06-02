import { BigNumber, ethers, providers } from "ethers"
import { seaportInterface } from "./seaport"
import axiosInstance from "../axios/axiosInstance"
import limiter from "../bottleneck"
import config from "../config"
import { FulfillActionModalQuery } from "./graphql/query/FulfillActionModalQuery"
import { authLoginV2AuthSimplifiedMutation, challengeLoginMessageQuery } from "./graphql/query/ChallengeLoginMessageQuery"
import axios from "axios"
import fs from "fs"

export const SEAPORT_CONTRACT_ADDRESS = '0x0000000000000068f116a894984e2db1123eb395';
export const CONDUIT_ADDRESS = '0x1E0049783F008A0085193E00003D00cd54003c71';
const ERC1155_ABI = [
  "function setApprovalForAll(address operator, bool approved) external",
  "function isApprovedForAll(address account, address operator) external view returns (bool)"
];

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY as string
const NETWORK = "mainnet"
const provider = new ethers.providers.StaticJsonRpcProvider(
      `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      {
    name: "homestead",
    chainId: 1
  });

const GOLD = '\x1b[33m';
const RESET = '\x1b[0m';

const cookieCache: Map<string, string> = new Map();



export const acceptOpenseaOffer = async (
  ethersSigner: ethers.Wallet,
  orderHash: string,
  contractAddress: string,
  tokenId: string,
  retryAttempt: number
) => {
  try {
    const generateOfferBody = {
      offer: {
        hash: orderHash,
        chain: 'ETHEREUM',
        protocol_address: SEAPORT_CONTRACT_ADDRESS
      },
      fulfiller: {
        address: ethersSigner.address
      },
      consideration: {
        asset_contract_address: contractAddress,
        token_id: tokenId
      }
    };

    const res: any = await limiter.schedule(() =>
      axiosInstance.post(
        `https://nfttools.pro/opensea/api/v2/offers/fulfillment_data`,
        generateOfferBody,
        {
          headers: {
            'X-NFT-API-Key': config.apiKey,
            'Content-Type': 'application/json'
          }
        }
      )
    );

    const txData = res.data.fulfillment_data.transaction.input_data;

    // Use fulfillAdvancedOrder instead of matchAdvancedOrders
    const encodedCalldata = seaportInterface.encodeFunctionData("fulfillAdvancedOrder", [
      txData.advancedOrder,
      txData.criteriaResolvers,
      txData.fulfillerConduitKey,
      txData.recipient
    ]);

    const tx = await ethersSigner.sendTransaction({
      to: SEAPORT_CONTRACT_ADDRESS,
      value: 0,
      data: encodedCalldata
    });

    console.log(GOLD + 'OFFER HAS SUCCESSFULLY BEEN ACCEPTED. HASH:' + tx.hash + RESET);
  } catch (error) {
    console.log("Error Occurred: ", error);
    throw error;
  }
};




async function useCreateRequestedTransactionMutation(ethersSigner: ethers.Wallet, fulfilmentData: {
  calldata: string;
  chain: string;
  fromAddress: string;
  nonce: number;
  toAddress: string;
}, retryAttempt: number) {
  try {
    const payload = {
      "id": "useCreateRequestedTransactionMutation",
      "query": "mutation useCreateRequestedTransactionMutation(\n  $calldata: String!\n  $chain: ChainScalar!\n  $fromAddress: AddressScalar!\n  $toAddress: AddressScalar!\n  $nonce: Int!\n  $value: BigIntScalar\n) {\n  userTransaction {\n    request(nonce: $nonce, chain: $chain, fromAddress: $fromAddress, calldata: $calldata, toAddress: $toAddress, value: $value) {\n      relayId\n      id\n    }\n  }\n}\n",
      "variables": {
        "calldata": fulfilmentData.calldata,
        "chain": fulfilmentData.chain,
        "fromAddress": fulfilmentData.fromAddress,
        "toAddress": fulfilmentData.toAddress,
        "nonce": fulfilmentData.nonce,
        "value": "0"
      }
    }

    const cookies = await getOSCookies(ethersSigner, retryAttempt);

    const { data } = await limiter.schedule(() => axiosInstance.post<UserTransactionResponse>(
      "https://nfttools.pro/opensea/__api/graphql/",
      payload,
      {
        headers: {
          cookie: cookies,
          'x-nft-api-key': config.apiKey,
          'x-auth-address': ethersSigner.address.toLowerCase(),
          "x-signed-query": "dbe3940673a67aa1993cb66beb246404872fe50c37632904650f0726060ac970",
        },
      }
    ));
    return data
  } catch (error: any) {
    console.log(error.response.data);
  }
}

export async function fulfillActionModalQuery(ethersSigner: ethers.Wallet, order: { maker: string, price: number, orderId: string }, contractAddress: string, tokenId: string, retryAttempt: number) {
  try {
    const payload = {
      id: "FulfillActionModalQuery",
      variables: {
        "orderId": order.orderId,
        "itemFillAmount": "1",
        "takerAssetsForCriteria": { "assetContractAddress": contractAddress, "tokenId": tokenId, "chain": "ETHEREUM" },
        "giftRecipientAddress": null,
      }
      ,
      query: FulfillActionModalQuery
    }
    const cookies = await getOSCookies(ethersSigner, retryAttempt);
    const { data } = await limiter.schedule(() => axiosInstance.post<Order>(
      "https://nfttools.pro/opensea/__api/graphql/",
      payload,
      {
        headers: {
          cookie: cookies,
          'x-nft-api-key': config.apiKey,
          'x-auth-address': ethersSigner.address.toLowerCase(),
          "x-signed-query": "7d2dba948e25324e67187a36f5383b3aa40d68c14cd05186ddd91d0da9826741",
        },
      }
    ));
    const nonce = Math.floor(Math.random() * 1000000) + 1;

    const fulfilmentData = {
      calldata: data?.data?.order?.fulfill?.actions[0]?.method?.data,
      chain: data?.data?.order?.fulfill?.actions[0]?.method?.chain?.identifier,
      fromAddress: ethersSigner?.address?.toLowerCase(),
      nonce: nonce,
      toAddress: data?.data?.order?.fulfill?.actions[0]?.method?.destination?.value
    }
    return fulfilmentData
  } catch (error: any) {
    //console.log(error);
  }
}

function generateUUIDv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const deviceId = generateUUIDv4()

export async function getOSCookies(ethersSigner: ethers.Wallet, retryAttempt: number) {
  const cachedCookie = cookieCache.get(ethersSigner.address.toLowerCase());
  if (cachedCookie) {
    return cachedCookie;
  }

  const options: any = {
    method: 'POST',
    url: `https://nfttools.pro/opensea/__api/graphql/`,
    headers: {
      'content-type': 'application/json',
      'x-signed-query':
        'e35fa1b7ede16cf8e95a6867a739cc0002ae8bfde2a8a1926d05d2919170e33a',
      'x-nft-api-key': config.apiKey,
    },
    data: {
      id: 'challengeLoginMessageQuery',
      query: challengeLoginMessageQuery,
      variables: {
        address: ethersSigner.address.toLowerCase()
      }
    }
  };

  const baseDelay = 1000; // 1 second

  for (let attempt = 0; attempt < retryAttempt; attempt++) {
    try {
      const loginResponse = await limiter.schedule(() => axiosInstance.request(options)) as any
      const message = loginResponse.data.data.auth.loginMessage;
      const signature = await ethersSigner.signMessage(message);
      const postOptions = {
        method: 'POST',
        url: `https://nfttools.pro/opensea/__api/graphql/`,
        headers: {
          'content-type': 'application/json',
          'x-signed-query':
            'f6b83e92d7ef2ba14a46f695d07198b7eae0403f0e2164270438eff613755981',
          'X-NFT-API-Key': config.apiKey
        },
        data: {
          id: 'authLoginV2AuthSimplifiedMutation',
          query: authLoginV2AuthSimplifiedMutation,
          variables: {
            address: ethersSigner.address.toLowerCase(),
            message: message,
            deviceId: deviceId,
            signature: signature,
            chain: 'ETHEREUM'
          }
        }
      };

      const authResponse = await limiter.schedule(() => axiosInstance.request(postOptions));
      if (authResponse.data.errors) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      const cookies: any = authResponse.headers['set-cookie'];
      if (!cookies) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      const combinedCookieHeader = cookies.join('; ');
      getJWTFromCookies(combinedCookieHeader, ethersSigner);

      cookieCache.set(ethersSigner.address.toLowerCase(), combinedCookieHeader);
      return combinedCookieHeader;
    } catch (error: any) {
      const delay = baseDelay * Math.pow(2, attempt);
      if (attempt === retryAttempt - 1) {
        console.log('Max retries reached, failing...');
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return null;
}

export async function estimateFulfillOfferGas(tx: ethers.providers.TransactionRequest): Promise<BigNumber> {
  const maxRetries = 0;
  const delayFactor = 1000;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (tx) {
        const data = {
          to: tx.to,
          from: tx.from,
          value: tx.value,
          data: tx.data,
          maxPriorityFeePerGas: 0,
        }
        return await provider.estimateGas(data);
      }
      return BigNumber.from(0);
    } catch (error) {
      if (attempt < maxRetries - 1) {
        const delay = delayFactor * Math.pow(2, attempt);
        console.log(`Retrying in ${delay} ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.log('Max retries reached, stopping...');
        return BigNumber.from(0);
      }
    }
  }
  return BigNumber.from(0);
}

function getJWTFromCookies(cookies: any, ethersSigner: ethers.Wallet) {
  const tokenPrefix = ethersSigner.address.toLowerCase() + '_auth_token=';
  if (!cookies) return null
  const cookieList = cookies.split(';')
  for (const cookie of cookieList) {
    const trimmedCookie = cookie.trim();
    if (trimmedCookie.startsWith(tokenPrefix)) {
      return trimmedCookie.substring(tokenPrefix.length);
    }
  }
}

interface Order {
  data: {
    order: {
      relayId: string;
      side: string;
      fulfill: {
        actions: Array<{
          __typename: string;
          giftRecipientAddress: string | null;
          __isBlockchainActionType: string;
          orderData: {
            item: {
              __typename: string;
              asset: {
                collection: {
                  verificationStatus: string;
                  slug: string;
                  id: string;
                  name: string;
                  displayData: { cardDisplayStyle: string };
                  enabledRarities: any[];
                  logo: string;
                };
                id: string;
                chain: {
                  displayName: string;
                  identifier: string;
                };
                displayName: string;
                relayId: string;
                animationUrl: string | null;
                displayImageUrl: string;
                imageUrl: string;
                isDelisted: boolean;
                backgroundColor: string | null;
                decimals: number | null;
              };
              quantity: string;
            };
            side: string;
            recipient: string | null;
            openedAt: string;
            closedAt: string;
            perUnitPrice: { unit: string };
            price: {
              unit: string;
              symbol: string;
              usd: string;
            };
            payment: {
              symbol: string;
              usdSpotPrice: number;
              id: string;
            };
            englishAuctionReservePrice: string | null;
            isCounterOrder: boolean;
            orderCriteria: string | null;
          };
          itemFillAmount: string;
          criteriaAsset: string | null;
          method: {
            chain: { identifier: string };
            source: string | null;
            destination: { value: string };
            value: string;
            data: string;
          };
        }>;
      };
      id: string;
    };
  };
}

interface UserTransactionResponse {
  data: {
    userTransaction: {
      request: {
        relayId: string;
        id: string;
      };
    };
  };
}