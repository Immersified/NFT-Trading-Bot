import { ethers } from "ethers";
import axiosInstance from "../axios/axiosInstance";
import config from "../config";
import limiter from "../bottleneck";

export async function acceptBid(
  authToken: string,
  walletAddress: string,
  tokenId: string,
  contractAddress: string,
  feeRate: number,
  quoteId: string,
  ethersSigner: ethers.Wallet,
) {
  const options = {
    method: 'POST',
    url: 'https://nfttools.pro/blur/v1/bids/accept',
    headers: {
      'content-type': 'application/json',
      authToken: authToken,
      walletAddress: walletAddress,
      'X-NFT-API-Key': config.apiKey
    },
    data: {
      tokens: [{ tokenId: tokenId }],
      feeRate: feeRate,
      quoteId: quoteId,
      contractAddress: contractAddress
    }
  };

  try {
    const { data } = await limiter.schedule(() => axiosInstance.request<NFTTransaction>(options));
    const txData = data.accepts[0]

    const transaction = {
      data: txData.txnData.data,
      from: walletAddress,
      to: txData.txnData.to,
      gasLimit: txData.gasEstimate
    }
    const tx = await ethersSigner.sendTransaction(transaction)
    console.log('-------------------------------------------------');
    console.log('FUFIL TRANSACTION DATA: ', JSON.stringify(tx, null, 2))
    console.log('-------------------------------------------------');
    return data
  } catch (error) {
    console.error(error);
  }
}


export async function retrieveBidQuoteId(authToken: string, walletAddress: string, contractAddress: string, tokenId: string, slug: string, ownWallets: string[]) {

  // Request Best Item Offer
  const options = {
    method: 'POST',
    url: 'https://nfttools.pro/blur/v1/bids/quote',
    headers: {
      'content-type': 'application/json',
      authToken: authToken,
      walletAddress: walletAddress.toLowerCase(),
      'X-NFT-API-Key': config.apiKey
    },
    data: {
      tokens: [{ tokenId: tokenId }],
      contractAddress: contractAddress
    }
  };

  try {
    const { data } = await limiter.schedule(() => axiosInstance.request<NFTData>(options));

    console.log(data)

    const bestOffer = data?.nfts.find(item => +(item.tokenId) === +tokenId)?.price.amount
    const quoteId = data?.quoteId

    // Request Collection Offers
    // Define this ONCE and then update it later
    let blurOfferHigh: BlurOffer = {'price': null, 'wallet': null};

    const optionsBids = {
      method: 'GET',
      url: `https://nfttools.pro/blur/v1/collections/${slug}/executable-bids`,
      // params: { filters: '{}' },
      headers: {
        'X-NFT-API-Key': config.apiKey
      }
    }

    try {
      const { data: bidData } = await limiter.schedule(() => axiosInstance.request<BidData>(optionsBids));

      const util = require('util');
      //console.log(util.inspect(bidData, { showHidden: false, depth: null, colors: true }));

      if (bidData.success && bidData.priceLevels && bidData.priceLevels.length > 0) {
        const firstPriceLevel = bidData.priceLevels[0];
        
        // UPDATE the existing variable instead of redeclaring it
        blurOfferHigh.price = Number(firstPriceLevel.price);
        blurOfferHigh.wallet = firstPriceLevel.bidderAddressesSample.length > 0 ? firstPriceLevel.bidderAddressesSample[0] : '';
      }

    } catch (error) {
      console.error(error);
      return {'bestOffer': null, 'quoteId': null}
    }

    // Check if blurOfferHigh.price equals bestOffer (after converting to the same type)
    // And check if the wallet is not in ownWallets
    if (blurOfferHigh.price === Number(bestOffer) && (typeof blurOfferHigh.wallet === 'string' && !ownWallets.includes(blurOfferHigh.wallet))) {
      return {'bestOffer': bestOffer, 'quoteId': quoteId}
    } else {
      return {'bestOffer': null, 'quoteId': null}
    }

  } catch (error: any) {
    console.error(error.response.data);
    return {'bestOffer': null, 'quoteId': null}
  }
}

interface PriceLevel {
  criteriaType: string;
  criteriaValue: Record<string, any>;
  price: string;
  executableSize: number;
  numberBidders: number;
  bidderAddressesSample: string[];
}

interface BidData {
  success: boolean;
  priceLevels: PriceLevel[];
}

interface BlurOffer {
  price: number | null;
  wallet: string | null | string[];  // Can be string, null, or array of strings
}


interface NFTData {
  success: boolean;
  nfts: NFT[];
  tokenFailureReasons: Record<string, unknown>;
  quoteId: string;
}

interface NFT {
  tokenId: string;
  price: Price;
}

interface Price {
  amount: string;
  unit: string;
}

interface NFTTransaction {
  accepts: Accept[];
  approvals: any[];
  tokenFailureReasons: Record<string, unknown>;
  success: boolean;
}

interface Accept {
  txnData: TxnData;
  oracleSignature: string;
  gasEstimate: number;
  details: Detail[];
}

interface TxnData {
  data: string;
  to: string;
}

interface Detail {
  tokenId: string;
  price: string;
}