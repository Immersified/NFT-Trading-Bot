import yargs from "yargs"
import fs from "fs"
import path from "path"
import config from "./config"
import { BigNumber, ethers, providers, Wallet } from "ethers"
import { getAccessToken } from "./utils/accessToken";
import { getCollectionInfoWithRapidApi, getListingsFromBlur, getOpenseaListings, getCollectionSchema} from "./utils/collection";
import csvParser from "csv-parser";
import { fetchBestOffers, retrieveOrders } from "./utils/getBestOfferOpensea"
import PQueue from "p-queue"
import { listToBlurWithRapid } from "./utils/listToBlurWithRapid"
import { acceptOpenseaOffer, estimateFulfillOfferGas, fulfillActionModalQuery, getOSCookies } from "./utils/acceptOpenseaOffer"
import { getNFT } from "./utils/getNFT"
import { collectionFees } from "./utils/fees"
import { acceptBid, retrieveBidQuoteId} from "./utils/acceptBlurOffer"
import { getMagicEdenListings } from "./utils/getMagicEdenListings"
import { listOnMagicEden } from "./utils/listOnMagicEden"
import { RATE_LIMIT } from "./bottleneck"
import { fetchCollectionDetails } from './functions/magiceden/getMECollectionDetails';
import { getMEOffers } from "./functions/magiceden/getMEHighestOffers"
import { IFee, listOnOpensea, listOnOpenseaBeta } from "./functions/list"

const OPENSEA_FEE = process.env.OPENSEA_FEE as string

const ownWallets = process.env.ownWallets 
  ? JSON.parse(process.env.ownWallets).map((wallet: string) => wallet.toLowerCase())
  : []

const options: any = yargs
  .usage(
    'Usage: -p <private_key> -a <api_key> -b(if you want to list on blur, you can remove this param)'
  )
  .option('p', {
    alias: 'private_key',
    describe: 'Wallet Private Key',
    type: 'string',
    demandOption: true
  })
  .option('a', {
    alias: 'api_key',
    describe: 'OpenSea API Key',
    type: 'string',
    demandOption: true
  })
  .option('l', {
    alias: 'list',
    describe: 'collection list',
    type: 'string',
    demandOption: true
  })
  .option('o', {
    alias: 'useOpensea',
    describe: 'use OpenSea',
    type: 'boolean',
    demandOption: false,
    default: false
  })
  .option('m', {
    alias: 'useMagicEden',
    describe: 'use MagicEden',
    type: 'boolean',
    demandOption: false,
    default: false
  })
  .option('b', {
    alias: 'useBlur',
    describe: 'use Blur',
    type: 'boolean',
    demandOption: false,
    default: false
  }).argv;

const { private_key, api_key, useBlur, useOpensea, useMagicEden }: any = options;

console.log({ useBlur, useMagicEden, useOpensea });

config.apiKey = api_key;
config.private_key = private_key;

const queue = new PQueue({
  concurrency: 1.5 * RATE_LIMIT
});

/**
 * Main function to process the CSV file and list items on selected marketplaces
 */
const main = async () => {
  const result: any[] = [];
  fs.createReadStream(path.join(__dirname, `../Listing/${options.list}`))
    .pipe(csvParser())
    .on('data', async (data) => {
      result.push(data);
    })
    .on('end', async () => {
      console.table(result);
      try {
        // Replace the existing conditional with more flexible marketplace selection
        const marketplaces = [];
        if (useOpensea) marketplaces.push(listToOpensea);
        if (useBlur) marketplaces.push(listToBlur);
        if (useMagicEden) marketplaces.push(listToMagicEden);

        // If no specific marketplace is selected, use all of them
        if (marketplaces.length === 0) {
          await listOnAllMarketplace(result);
        } else {
          // List on selected marketplaces
          for (const marketplaceFunc of marketplaces) {
            await marketplaceFunc(result);
          }
        }
      } catch (err: any) {
        console.log(err?.response?.data ?? err);
      }
    });
}

/**
 * Validates and processes common asset data
 * @param asset The asset data from CSV
 * @returns Processed asset data or null if invalid
 */
async function processAssetData(asset: any, marketplace: string) {
  let { lastsale, slug, contract, tokenid, profit, suspicious, creatorfee } = asset;

  creatorfee = asset['creatorfee ' + marketplace]

  if (!slug || !contract || !tokenid || !profit) {
    console.log(`Missing required data for asset. Skipping.`);
    return null;
  }

  contract = contract.toLowerCase()
  tokenid = tokenid.replace('t', '');

  if (!suspicious) {
    const data = await getNFT(contract, tokenid);
    suspicious = data.nft.is_suspicious ? "True" : "False";
  }

  if (marketplace === 'os') {
    if (suspicious === "True" || !lastsale) {
      console.log('Seems like spam NFT or missing last sale. Skipping.');
      return null;
    }
  }
  else if (!lastsale) {
    console.log('Seems like spam NFT or missing last sale. Skipping.');
    return null;
  }

  return { lastsale: +lastsale, slug, contract, tokenid, profit: +profit, suspicious, creatorfee };
}

/**
 * Calculates the minimum price for listing
 * @param lastsale Last sale price
 * @param profit Desired profit percentage
 * @param marketFee Marketplace fee percentage
 * @param creatorfee Creator fee percentage
 * @returns Minimum listing price
 */
function calculateMinPrice(lastsale: number, profit: number, marketFee: number, creatorfee: number) {
  return lastsale * (1 + (profit + marketFee + creatorfee) / 100);
}

/**
 * Determines the listing price based on existing listings and minimum price
 * @param listings Existing listings
 * @param priceMin Minimum listing price
 * @returns Determined listing price
 */
async function determineListingPrice(listings: any[], priceMin: number) {

  let listingPrice = priceMin;

  for (const listing of listings) {
    if (listing.price > priceMin) {
      listingPrice = listing.price - 0.00001;
      break;
    }
  }
  return listingPrice;
}



/**
 * Lists an item on OpenSea
 * @param result Array of assets to list
 */
async function listToOpensea(result: any[]) {
  const ALCHEMY_API_KEY = config.ALCHEMY_API_KEY
  const NETWORK = "mainnet"
  const provider = new ethers.providers.StaticJsonRpcProvider(
  `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`, {
    name: "homestead",
    chainId: 1
  }
  );  

  const ethersSigner = new Wallet(private_key, provider);

  await queue.addAll((result.map((asset) => async () => {
    const processedAsset = await processAssetData(asset, 'os');
    if (!processedAsset) return;

    const { lastsale, slug, contract, tokenid, profit, creatorfee: rawCreatorFee } = processedAsset;
    const marketFee = parseFloat(OPENSEA_FEE);

    const collection = await getCollectionInfoWithRapidApi(slug);
    let creatorfee = rawCreatorFee;
    if (creatorfee === "0" || (!isNaN(Number(creatorfee)) && creatorfee !== "")) {
      creatorfee = Number(creatorfee);
    } else {
      console.log("No Creator Fee, Skip Marketplace: OPENSEA");
      return
    }
    
    console.log('-------------------------------------------------');
    console.log(`OPENSEA CREATOR FEE: ${creatorfee}`);
    console.log('-------------------------------------------------');

    const priceMin = calculateMinPrice(lastsale, profit, marketFee, creatorfee);

    console.log('-------------------------------------------------');
    console.log('PRICE MIN: ', priceMin);
    console.log('-------------------------------------------------');

    const orderData = await fetchBestOffers(slug, collection?.primary_asset_contracts_address, tokenid, ownWallets)

    if (orderData && orderData.orderHash && orderData.valueInEth) {

      const gasPrice = await provider.getGasPrice();

      //const fulfilmentData = await fulfillActionModalQuery(ethersSigner, orders[0], collection?.primary_asset_contracts_address, tokenid, result.length + 1)
      //console.log(fulfilmentData)

      //let gasEstimate: BigNumber | number = await estimateFulfillOfferGas({ to: fulfilmentData?.toAddress, from: fulfilmentData?.fromAddress, value: '0', data: fulfilmentData?.calldata })

      //gasEstimate = Number(gasEstimate)
      const bestOffer = orderData.valueInEth

      const gasPriceInEther = Number(ethers.utils.formatEther(gasPrice)) * 10 ** 9;
      const acceptOfferGasFee = 0.00017 * gasPriceInEther + 0.001

      console.log('-------------------------------------------------');
      console.log('GAS DETAILS:');
      console.log({
        gasPriceInEther,
        acceptOfferGasFee
      });
      console.log('-------------------------------------------------');

      console.log('-------------------------------------------------');
      console.log('OPENSEA GAS FEE (ETH): ', acceptOfferGasFee);
      console.log('-------------------------------------------------');

      console.log('-------------------------------------------------');
      console.log('BEST OFFER: ', bestOffer);
      console.log('-------------------------------------------------');

      const priceOffer = bestOffer - acceptOfferGasFee
      console.log('-------------------------------------------------');
      console.log('PRICE OFFER: ', priceOffer);
      console.log('-------------------------------------------------');

      if (priceOffer > priceMin && gasPriceInEther > 0 && priceOffer !== null && !isNaN(priceOffer)) {
        console.log('-------------------------------------------------');
        console.log('ACCEPT OFFER');
        console.log('-------------------------------------------------');

        try {
          await acceptOpenseaOffer(ethersSigner, orderData.orderHash, collection?.primary_asset_contracts_address, tokenid, result.length + 1)
          return
        } catch(error) {
          console.log('Failed to Accept Offer')
        }  
      }
    }

    const listings: any[] = await getOpenseaListings(slug);
    const listingPrice = await determineListingPrice(listings, priceMin);

    if (listingPrice && listingPrice > 0) {
      try {
        console.log('-------------------------------------------------');
        console.log('OPENSEA LISTING PRICE: ', listingPrice);
        console.log('-------------------------------------------------');
        
        const schema = await getCollectionSchema(collection?.primary_asset_contracts_address);

        console.log(schema)

        const normalizedFees = normalizeCreatorFees(collection?.creator_fees);
        // await listOnOpensea(contract, tokenid, Number(listingPrice.toFixed(9)), ethersSigner, normalizedFees);
        // await listOnOpenseaBeta(ethersSigner, listingPrice, contract, tokenid);
        await listOnOpensea(contract, tokenid, Number(listingPrice.toFixed(9)), ethersSigner, normalizedFees, (collection?.enforceCreatorFee as boolean), schema);
      } catch (error) {
        console.log("Failed to list to OpenSea Pro:", error);
      }
    }
  })))
}

/**
 * Lists an item on Magic Eden
 * @param result Array of assets to list
 */
async function listToMagicEden(result: any[]) {
  const ALCHEMY_API_KEY = config.ALCHEMY_API_KEY
  const NETWORK = "mainnet"
  const provider = new ethers.providers.StaticJsonRpcProvider(
  `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`, {
    name: "homestead",
    chainId: 1
  }
  );
  const ethersSigner = new Wallet(private_key, provider);

  await queue.addAll((result.map((asset) => async () => {
    const processedAsset = await processAssetData(asset, 'me');
    if (!processedAsset) return;

    const { lastsale, slug, contract, tokenid, profit, creatorfee: rawCreatorFee } = processedAsset;
    const marketFee = 2;

    let creatorfee = rawCreatorFee;
    if (creatorfee === "0" || (!isNaN(Number(creatorfee)) && creatorfee !== "")) {
      creatorfee = Number(creatorfee);
    } else {
      console.log("No Creator Fee, Skip Marketplace: MAGICEDEN");
      return
    }

    console.log('-------------------------------------------------');
    console.log(`MAGIC CREATOR FEE: ${creatorfee}`);
    console.log('-------------------------------------------------');

    const priceMin = calculateMinPrice(lastsale, profit, marketFee, creatorfee);

    console.log('-------------------------------------------------');
    console.log('PRICE MIN: ', priceMin);
    console.log('-------------------------------------------------');

    const listings = await getMagicEdenListings(contract);
    const listingPrice = await determineListingPrice(listings, priceMin);

    if (listingPrice && listingPrice > 0) {
      try {
        console.log('-------------------------------------------------');
        console.log('MAGIC EDEN LISTING PRICE: ', listingPrice);
        console.log('-------------------------------------------------');

        await listOnMagicEden(ethersSigner.address, contract, tokenid, listingPrice, ethersSigner)
      } catch (error) {
        console.log("Failed to list to Magic Eden:", error);
      }
    }
  })))
}

/**
 * Lists an item on Blur
 * @param result Array of assets to list
 */
async function listToBlur(result: any[]) {
  const ALCHEMY_API_KEY = config.ALCHEMY_API_KEY
  const NETWORK = "mainnet"
  const provider = new ethers.providers.StaticJsonRpcProvider(
    `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`, {
    name: "homestead",
    chainId: 1
  }
  );

  const ethersSigner = new Wallet(private_key, provider);

  await queue.addAll((result.map((asset) => async () => {
    const processedAsset = await processAssetData(asset, 'blur');
    if (!processedAsset) return;

    const { lastsale, slug, contract, tokenid, profit, creatorfee: rawCreatorFee, suspicious } = processedAsset;
    const marketFee = 0.0;

    let creatorfee = rawCreatorFee;
    if (creatorfee === "0" || (!isNaN(Number(creatorfee)) && creatorfee !== "")) {
      creatorfee = Number(creatorfee);
    } else {
      console.log("No Creator Fee, Skip Marketplace: BLUR");
      return
    }

    console.log('-------------------------------------------------');
    console.log('BLUR CREATOR FEE: ', creatorfee);
    console.log('-------------------------------------------------');


    const priceMin = calculateMinPrice(lastsale, profit, marketFee, creatorfee);

    console.log('-------------------------------------------------');
    console.log('PRICE MIN: ', priceMin);
    console.log('-------------------------------------------------');

    const accessToken = await getAccessToken(
      'https://nfttools.pro/blur',
      private_key
    );

    const address = ethersSigner.address
    const feeRate = creatorfee * 100

    const offerData = await retrieveBidQuoteId(accessToken, address, contract, tokenid, slug, ownWallets)
    const bestOffer = offerData?.bestOffer
    const quoteId = offerData?.quoteId

    console.log('-------------------------------------------------');
    console.log('BEST OFFER: ', bestOffer);
    console.log('-------------------------------------------------');

    if (bestOffer && quoteId) {
      const gasPrice = await provider.getGasPrice();
      const gasPriceInEther = Number(ethers.utils.formatEther(gasPrice));
      const listingGasAmount = 200000
      const listingGasFee = +gasPriceInEther * listingGasAmount

      console.log('-------------------------------------------------');
      console.log('BLUR GAS FEE: ', listingGasFee);
      console.log('-------------------------------------------------');

      const priceOffer = +bestOffer * (1 - (marketFee + creatorfee) / 100) - listingGasFee

      console.log('-------------------------------------------------');
      console.log('PRICE OFFER: ', priceOffer);
      console.log('-------------------------------------------------');

      if (priceOffer > priceMin && gasPriceInEther > 0 && priceOffer !== null && !isNaN(priceOffer)) {
        console.log('-------------------------------------------------');
        console.log('ACCEPT BLUR BID');
        console.log('-------------------------------------------------');
        await acceptBid(accessToken, address, tokenid, contract, feeRate, quoteId, ethersSigner)
      }
    }

    const listings: any[] = await getListingsFromBlur(contract, accessToken, ethersSigner.address, suspicious === 'True');
    const listingPrice = await determineListingPrice(listings, priceMin);

    if (listingPrice && listingPrice > 0) {
      try {
        console.log('-------------------------------------------------');
        console.log(`BLUR LISTING PRICE: ${listingPrice}`);
        console.log('-------------------------------------------------');
        await listToBlurWithRapid(contract, tokenid, listingPrice.toFixed(9), ethersSigner, accessToken, feeRate);
      } catch (error) {
        console.log("Failed to list to Blur:", error);
      }
    }

    console.log('-------------------------------------------------');
    console.log('LISTING PRICE: ', listingPrice);
    console.log('-------------------------------------------------');
  })))
}

/**
 * Lists items on all marketplaces
 * @param result Array of assets to list
 */
async function listOnAllMarketplace(result: any[]) {
  try {
    await listToOpensea(result);
    await listToBlur(result);
    await listToMagicEden(result);
  } catch (error) {
    console.log("Error listing on all market places:", error);
  }
}

main()
  .then()
  .catch((err) => console.dir(err?.response?.data ?? err));

/**
 * Rounds a number to the nearest 0.01
 * @param number Number to round
 * @returns Rounded number
 */
export function roundToNearest0_01(number: number) {
  return Math.round(number * 100) / 100;
}

function normalizeCreatorFees(fees: any): IFee | undefined {
  if (!fees) return undefined;

  // If fees is an object with numeric keys, convert to string keys
  if (typeof fees === 'object') {
    const normalized: IFee = {};
    Object.entries(fees).forEach(([key, value]) => {
      if (key !== 'null' && value !== undefined && typeof value === 'number') {
        normalized[key] = value;
      }
    });
    return normalized;
  }

  return undefined;
}