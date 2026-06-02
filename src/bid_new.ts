import { utils, BigNumber, ethers } from 'ethers';
import path from "path"
import csvParser from "csv-parser"
import yargs, { boolean } from "yargs";
import PQueue from "p-queue"
import fs from "fs"
import { getCollectionInfoWithRapidApi} from "./utils/collection";
import { getAccount, getBalance, getWallet } from "./functions/wallet";
import { bidOnMagicEden, createOfferToBlur, createOfferWithRapid, getOffers2, getBlurData, getOSFloorPrice} from "./functions/offer";
import config from "./config";
import { getAccessToken } from "./utils/accessToken";
import { getFeeRate } from './utils/fees';
import { formatEther, parseEther } from 'ethers/lib/utils';
import { getBlurPoolBalance } from './utils/blurPoolBalance';
import { getWETHBalance } from './utils/wethBalance';
import dotenv from "dotenv"
import { fetchCollectionDetails } from './functions/magiceden/getMECollectionDetails';
import { Orders, getMEHighestOffers } from './functions/magiceden/getMEHighestOffers';
import limiter, { RATE_LIMIT } from './bottleneck';
import { PrismaClient } from '@prisma/client';
import axiosInstance from './axios/axiosInstance';
const prisma = new PrismaClient()

const OPENSEA_FEE = process.env.OPENSEA_FEE as string

const ownWallets = process.env.ownWallets 
  ? JSON.parse(process.env.ownWallets).map((wallet: string) => wallet.toLowerCase())
  : []

const result: CollectionData[] = [];
dotenv.config()

const options: any = yargs
  .usage(
    'Usage: -p <private_key> -a <api_key> -l <list> -f <bidding_csv_file_name> -r(if you want to use opensea api key, you can remove this param) -b(bid on blur)'
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
  .option('f', {
    alias: 'bidding_csv_file_name',
    describe: 'file name of bidding options csv',
    type: 'string',
    demandOption: true
  })
  .option('b', {
    alias: 'bidBlur',
    describe: 'bid on blur',
    type: 'boolean',
    demandOption: false,
    default: false
  })
  .option('m', {
    alias: 'bidMagicEden',
    describe: 'bid on blur',
    type: 'boolean',
    demandOption: false,
    default: false
  })
  .option('t', {
    alias: 'traitBidding',
    describe: 'enable trait bidding',
    type: 'boolean',
    demandOption: false,
    default: false
  })
  .option('o', {
    alias: 'bidOpensea',
    describe: 'bid on opensea',
    type: 'boolean',
    demandOption: false,
    default: false
  }).argv;

const { private_key, api_key, bidBlur, bidOpensea, bidMagicEden, traitBidding } = options;
config.apiKey = api_key;

const collectionInfo: { [key: string]: ICollectionData } = {}

// Initialize variables
let
  profit_max_ceil: number,
  outbid_margin_max: number,
  wethBalanceMax: number,
  blurPoolBalanceMax: number,
  gasFactor: number,
  ethBalanceMin: number;

const { bidding_csv_file_name: bidVariableFile } = options;

fs.createReadStream(path.join(__dirname, `../Settings/${bidVariableFile}`))
  .pipe(csvParser({
    escape: "\",",
    mapHeaders: ({ header }) => header.trim(),
    mapValues: ({ value }) => value.trim()
  }))
  .on('data', (data: any) => {
    profit_max_ceil = parseFloat(data.profit_max_ceil);
    outbid_margin_max = parseFloat(data.outbid_margin_max);
    wethBalanceMax = parseFloat(data.wethBalanceMax);
    blurPoolBalanceMax = parseFloat(data.blurPoolBalanceMax);
    gasFactor = parseFloat(data.gasFactor);
    ethBalanceMin = parseFloat(data.ethBalanceMin);

    console.log("Variables loaded from CSV:");
    console.table({
      profit_max_ceil,
      outbid_margin_max,
      wethBalanceMax,
      blurPoolBalanceMax,
      gasFactor,
      ethBalanceMin
    });
  })


const startTime = Date.now();

const queue = new PQueue({
  concurrency: 1.5 * RATE_LIMIT
});


let lastModifiedTimeOverOneHour = false

const filePath = path.join(__dirname, `../Bidding/${options.list}`);
fs.stat(filePath, (err, stats) => {
  if (err) {
    console.error('Error retrieving file stats:', err);
    return;
  }

  const timestampDate = new Date(stats.mtime);
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  console.log('---------------------------------------------------------------------------');
  console.log('Last modified date: '.toUpperCase(), stats.mtime);
  console.log('One Hour Ago: '.toUpperCase(), new Date(now.getTime() - 60 * 60 * 1000))
  console.log('---------------------------------------------------------------------------');

  lastModifiedTimeOverOneHour = oneHourAgo > timestampDate;

})
fs.createReadStream(path.join(__dirname, `../Bidding/${options.list}`))
  .pipe(csvParser({
    escape: "\",",
    mapHeaders: ({ header }) => header.trim(),
    mapValues: ({ value }) => value.trim()
  }))
  .on('data', async (data: CollectionData) => {
    result.push(data);
  })
  .on('end', async () => {
    console.table(result);

    if (lastModifiedTimeOverOneHour) {
      console.log('\x1b[31m%s\x1b[0m', '--------------------------------------------------------------------------------------------------------------');
      console.log('\x1b[31m%s\x1b[0m', '🛑 The bidding collection file has not been updated for over an hour. Bidding has been stopped 🛑'.toUpperCase());
      console.log('\x1b[31m%s\x1b[0m', '--------------------------------------------------------------------------------------------------------------');
      return
    }

    try {
      await queue.addAll(
        result.map((collection) => async () => {
          await listenToEventsWithRapid(collection);
        }))
    } catch (error) {
      console.error('Error processing collection:', error);
    }

    const endTime = Date.now();
    const elapsedTime = endTime - startTime;
    console.log(`Processing Time: ${elapsedTime / 1000} seconds`);
  });

/**
 * Parses a string to boolean, with a default value if undefined.
 * @param value - The string to parse.
 * @param defaultValue - The default boolean value.
 * @returns The parsed boolean value.
 */
function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  return value?.toLowerCase() === "true" ? true : value?.toLowerCase() === "false" ? false : defaultValue;
}

/**
 * Logs the marketplace bidding information.
 * @param marketplace - The name of the marketplace.
 * @param collectionName - The name of the collection.
 */
function logMarketplaceBidding(marketplace: string, collectionName: string) {
  console.log('--------------------------------------------------------------------');
  console.log(`Bidding on Marketplace ${marketplace} ${collectionName}`.toUpperCase());
  console.log('--------------------------------------------------------------------');
}

/**
 * Logs an insufficient balance message.
 */
function logInsufficientBalance() {
  console.log('\x1b[31m%s\x1b[0m', '-----------------------------------------------------------');
  console.log('\x1b[31m%s\x1b[0m', '🛑 MESSAGE INSUFFICIENT 🛑');
  console.log('\x1b[31m%s\x1b[0m', '-----------------------------------------------------------');
}

/**
 * Main function to process a collection and place bids on different marketplaces.
 * @param collectionSlug - The collection data.
 */
async function listenToEventsWithRapid(collectionSlug: CollectionData) {
  const slug = collectionSlug.names;

  if (!collectionInfo[slug]) {
    collectionInfo[slug] = {
      magicEdenCollectionDetails: null,
      collectionData: null
    };
  }

  try {
    if (!collectionSlug || !collectionSlug.names) {
      throw new Error('Invalid collection data');
    }

    let collectionData;
    collectionData = collectionInfo[collectionSlug.names].collectionData

    if (!collectionData) {
      collectionData = await getCollectionInfoWithRapidApi(
        collectionSlug.names
      );
      collectionInfo[collectionSlug.names] = { collectionData }
    }


    if (!collectionData) {
      console.log("Can't find such collection");
      return;
    }

    let totalCreatorFee: any = 0;
    if (collectionData.enforceCreatorFee == false) {
      totalCreatorFee = 0;
    } else {
      totalCreatorFee = Object.values(collectionData.creator_fees)[0]
    }

    const magicEdenCreatorFees = totalCreatorFee
    const account = getAccount(private_key);
    const wallet = await getWallet(account);
    const balance = +(await getBalance(wallet));
    const accessToken = await getAccessToken(
      'https://nfttools.pro/blur',
      private_key
    );


    //Determine Lowest Floor Price
    const blurPriceData = await getBlurData(collectionSlug.names);
    const blurFloorPrice = blurPriceData.floorPrice

    async function safeMin(a: number, b: number, collectionSlug: string): Promise<number> {
      const priceDiff = Math.abs(Number(((a - b) / b) * 100));

      if (priceDiff > 20 || !isFinite(priceDiff)) {
        const freshA = await getOSFloorPrice(collectionSlug);

        if (freshA !== null && !Number.isNaN(freshA)) {
          return Math.min(freshA, b);
        } else {
          throw new Error('Unable to fetch valid freshA value');
        }
      }

      return Math.min(a, b);
    }


    const floorPrice = Number(await safeMin(Number(blurFloorPrice), Number(collectionSlug.floor_price), collectionSlug.names))

    if (floorPrice === undefined) {
      console.log('Can not get floor price');
      return;
    }

    //Get Highest Offer (OpenSea and Blur)
    const blurHighestOffer = blurPriceData.highestOffer
    const openseaHighestOffer = await getOffers2(collectionSlug.names, ownWallets);
    const highestOffer = {'Opensea': openseaHighestOffer, 'Blur': blurHighestOffer, 'MagicEden': openseaHighestOffer} 

    const blurBalance = await getBlurPoolBalance(private_key);

    const marketplaces = [
      { name: 'Blur', override: parseBoolean(collectionSlug.bidOnBlur, bidBlur), balance: blurBalance },
      { name: 'Opensea', override: parseBoolean(collectionSlug.bidOnOpensea, bidOpensea), balance: balance },
      { name: 'MagicEden', override: parseBoolean(collectionSlug.bidOnMagicEden, bidMagicEden), balance: balance }
    ];

    for (const { name, override, balance } of marketplaces) {
      if (override) {
        logMarketplaceBidding(name, collectionSlug.names);
        if (name === 'Blur' && !balance) continue;
        await bidOnMarketplace(
          name as 'Blur' | 'Opensea' | 'MagicEden',
          collectionSlug,
          collectionData,
          name === 'MagicEden' ? magicEdenCreatorFees : totalCreatorFee,
          wallet,
          floorPrice,
          highestOffer,
          name === 'Blur' ? accessToken : undefined
        );
      }
    }
  } catch (err) {
    console.error('Error processing collection:', collectionSlug, err);
  }
}

/**
 * Places a bid on a specific marketplace for a collection.
 * @param marketplace - The marketplace to bid on.
 * @param collectionSlug - The collection data.
 * @param collectionData - The collection information.
 * @param totalCreatorFee - The total creator fee.
 * @param wallet - The user's wallet.
 * @param balance - The user's balance.
 * @param balance_max - The maximum balance.
 * @param floorPrice - The floor price of the collection.
 * @param highestOffer - The highest offers on different marketplaces.
 * @param accessToken - The access token for Blur marketplace.
 */
async function bidOnMarketplace(
  marketplace: 'Blur' | 'Opensea' | 'MagicEden',
  collectionSlug: CollectionData,
  collectionData: ICollection | undefined,
  totalCreatorFee: number,
  wallet: any,
  floorPrice: number,
  highestOffer: any,
  accessToken?: string
) {
  try {
    if (!collectionSlug || !collectionSlug.names) {
      throw new Error('Invalid collection data');
    }

    let profit = calculateProfitMax(Number(collectionSlug.factor));
    const royalty_fee = getRoyaltyFee(marketplace);

    if (!validateProfit(profit, collectionSlug.names)) return;

    let feeRate;
    if (marketplace === 'Blur') {
      feeRate = await getFeeRate(
        collectionData?.primary_asset_contracts_address,
        wallet.address,
        accessToken
      );
    }

    const adjustedCreatorFee = marketplace === 'Blur' ? feeRate : totalCreatorFee;
    const offerPrice = calculateOfferPrice(floorPrice, adjustedCreatorFee, profit, royalty_fee);

    if (!validateOfferPrice(offerPrice, collectionSlug.names)) return;

    await placeBid(marketplace, collectionSlug, collectionData, wallet, private_key, accessToken, offerPrice, floorPrice, profit, highestOffer);
  } catch (err) {
    console.error(
      `Error on ${marketplace} Bid for collection ${collectionSlug?.names ?? 'unknown'
      }:`,
      err
    );
  }
}


/**
 * Calculates the maximum profit, capping it at a ceiling value if necessary.
 * @param profit - The calculated profit.
 * @returns The profit value, capped at the maximum ceiling if applicable.
 */

function calculateProfitMax(profit: number): number {
  // Define the ceiling constant

  let profit_max: number;

  if (profit > profit_max_ceil) {
    profit_max = profit_max_ceil;
  } else {
    profit_max = profit;
  }

  return profit_max;
}


/**
 * Gets the royalty fee for a specific marketplace.
 * @param marketplace - The marketplace.
 * @returns The royalty fee percentage.
 */
function getRoyaltyFee(marketplace: 'Blur' | 'Opensea' | 'MagicEden'): number {
  switch (marketplace) {
    case 'Opensea': return parseFloat(OPENSEA_FEE);
    case 'MagicEden': return 2;
    default: return 0;
  }
}

/**
 * Validates the calculated profit.
 * @param profit - The calculated profit.
 * @param collectionName - The name of the collection.
 * @returns A boolean indicating if the profit is valid.
 */
function validateProfit(profit: number, collectionName: string): boolean {
  if (isNaN(profit) || profit <= 0) {
    console.log(`Profit ${profit} is less than or equal to zero for collection: ${collectionName}. Skip this collection`);
    return false;
  }
  return true;
}

/**
 * Validates the offer price.
 * @param offerPrice - The calculated offer price.
 * @param collectionName - The name of the collection.
 * @returns A boolean indicating if the offer price is valid.
 */
function validateOfferPrice(offerPrice: number, collectionName: string): boolean {
  if (offerPrice === 0 || !offerPrice) {
    console.log(`The offer price counts as zero for collection: ${collectionName}. Skip this collection`);
    return false;
  }
  return true;
}

/**
 * Calculates the offer price based on various factors.
 * @param floorPrice - The floor price of the collection.
 * @param totalCreatorFee - The total creator fee.
 * @param royalty_fee - The royalty fee.
 * @param profit - The calculated profit.
 * @returns The calculated offer price.
 */
function calculateOfferPrice(floorPrice: number, totalCreatorFee: number, profit: number, royalty_fee: number) {

  console.log('FP: ', floorPrice);
  console.log('CF: ', totalCreatorFee);
  console.log('RF: ', royalty_fee);
  console.log('Profit: ', profit)
  console.log('Offer: ', floorPrice * ((100 - totalCreatorFee / 100 - royalty_fee) / 100) * profit)

  return Math.round(
    floorPrice * ((100 - totalCreatorFee / 100 - royalty_fee) / 100) * profit * 10 ** 18
  );
}


function adjustOfferByTickPrice(offer: bigint) {
  const tickPrice = BigInt(10 ** 16);
  if (offer >= 2.5 * 10 ** 17) {
    return offer + tickPrice - (offer % tickPrice);
  } else {
    return offer - (offer % tickPrice);
  }
}

function getHighestOfferPrice(marketplace: 'Blur' | 'Opensea' | 'MagicEden', highestOffer: any) {
  return highestOffer[marketplace]
}

/**
 * Places a bid on a marketplace.
 * @param marketplace - The marketplace to bid on.
 * @param collectionSlug - The collection data.
 * @param collectionData - The collection information.
 * @param wallet - The user's wallet.
 * @param private_key - The user's private key.
 * @param accessToken - The access token for Blur marketplace.
 * @param offerPrice - The calculated offer price.
 * @param floorPrice - The floor price of the collection.
 * @param profit - The calculated profit.
 * @param highestOffer - The highest offers on different marketplaces.
 */
async function placeBid(
  marketplace: 'Blur' | 'Opensea' | 'MagicEden',
  collectionSlug: CollectionData,
  collectionData: ICollection | undefined,
  wallet: ethers.Wallet,
  private_key: string,
  accessToken: string | undefined,
  offerPrice: number | string,
  floorPrice: number,
  profit: number,
  highestOffer: any
) {

  const hightOfferPrice = getHighestOfferPrice(marketplace, highestOffer);

  console.log('\x1b[35m%s\x1b[0m', '--------------------------------------------------------------------------------------------');
  console.log('\x1b[35m%s\x1b[0m', `HIGHEST OFFER FOR ${collectionSlug.names} on ${marketplace.toUpperCase()} ${hightOfferPrice}`);
  console.log('\x1b[35m%s\x1b[0m', '--------------------------------------------------------------------------------------------');

  if (!hightOfferPrice) return;

  const bidData = prepareBidData(marketplace, collectionSlug, collectionData, offerPrice, hightOfferPrice);
  if (!bidData) return;

  const { collectionOffer, trait_bid_activate, currentHighestOffer } = bidData;

  if (!validateBidConditions(profit, floorPrice, collectionOffer, collectionSlug.names)) return;

  await createMarketplaceOffer(
    marketplace,
    wallet.address,
    private_key,
    accessToken,
    collectionSlug,
    collectionData,
    collectionOffer,
    trait_bid_activate,
    currentHighestOffer,
  );
}



/**
 * Logs a message when there are no offers on all marketplaces.
 * @param collectionName - The name of the collection.
 */
function logNoOfferSkip(collectionName: string) {
  console.log('\x1b[31m%s\x1b[0m', '-----------------------------------------------------------');
  console.log('\x1b[31m%s\x1b[0m', `🛑 ${collectionName} HAS NO OFFER ON ALL MARKETPLACE SKIP 🛑`);
  console.log('\x1b[31m%s\x1b[0m', '-----------------------------------------------------------');
}

/**
 * Prepares the bid data for a specific marketplace.
 * @param marketplace - The marketplace.
 * @param collectionSlug - The collection data.
 * @param collectionData - The collection information.
 * @param offerPrice - The calculated offer price (wei).
 * @param hightOfferPrice - The highest offer price (eth).
 * @returns The prepared bid data.
 */
function prepareBidData(
  marketplace: 'Blur' | 'Opensea' | 'MagicEden',
  collectionSlug: CollectionData,
  collectionData: ICollection | undefined,
  offerPrice: number | string,
  hightOfferPrice: number
) {
    let collectionOffer = BigInt(offerPrice);
    let trait_bid_activate = 1;
    let currentHighestOffer = Number(hightOfferPrice) * 10 ** 18;
    let highOfferInEth: any = hightOfferPrice.toString() ?? '0';
  
  
    if (marketplace === 'Blur') {
      let collectionOffer = BigInt(offerPrice);
      collectionOffer = adjustOfferByTickPrice(collectionOffer);
      let collectionOfferInEth = formatEther(collectionOffer);
  
      console.log({ collectionOfferInEth, hightOfferPrice, collectionOffer, line: 679 });
  
      if (
        (Number(collectionOfferInEth)) >
        Number(hightOfferPrice) * (outbid_margin_max + 100) / 100
      ) {
        console.log(
          `${marketplace}: Collection`,
          collectionSlug.names,
          'offer is higher than the highest offer by more than',
          outbid_margin_max,
          `%.`
        );
        return;
      }
  
  
      else if (Number(hightOfferPrice) >= Number(collectionOffer) / 10 ** 18) {
  
        collectionOfferInEth = adjustOffer(collectionOffer).toString();
        highOfferInEth = hightOfferPrice
  
        console.log(
          `${marketplace}: Collection`,
          collectionSlug.names,
          `current highest offer:`,
          Number(highOfferInEth),
          `Higher than bot offer:`,
          Number(collectionOfferInEth) / 10 ** 18
        );
  
        trait_bid_activate = 0;
  
  
      } else {
        collectionOffer = BigInt(
          Math.floor(parseInt(((hightOfferPrice * 1e18)?.toString() as string)) + 10000000000000000)
        );
        trait_bid_activate = 1;
        collectionOfferInEth = adjustOffer(collectionOffer).toString();
        highOfferInEth = hightOfferPrice
  
        console.log(
          `${marketplace}: Collection`,
          collectionSlug.names,
          `current highest offer:`,
          Number(highOfferInEth),
          `Lower than bot offer:`,
          Number(collectionOfferInEth) / 10 ** 18
        );
      }
      return { collectionOffer, trait_bid_activate, currentHighestOffer };

  } else if (marketplace === 'Opensea' || marketplace === 'MagicEden') {

    console.log(`{ hightOfferPrice: ${hightOfferPrice}, line: 900 }`);
    let collectionOfferInEth = formatEther(collectionOffer);

    let highOfferInEth: string | number = hightOfferPrice ?? '0';
    let outbid_margin


    // adjust the highest offer

    if (marketplace === 'Opensea') {
      if (Number(highOfferInEth) + 0.01 >= 1) {
        highOfferInEth = Number(highOfferInEth) + 0.01;
        outbid_margin = 0.01;
      } else if (Number(highOfferInEth) + 0.001 >= 0.1) {
        highOfferInEth = Number(highOfferInEth) + 0.001;
        outbid_margin = 0.001;
        if (Number(collectionOfferInEth) >= Number(highOfferInEth)) {
          collectionOfferInEth = highOfferInEth.toString()
        }
      } else {
        highOfferInEth = Number(highOfferInEth) + 0.0001;
        outbid_margin = 0.0001;
      }
    }

    if (
      Number(collectionOfferInEth) >
      Number(highOfferInEth) * (outbid_margin_max + 100) / 100
    ) {
      console.log(
        `${marketplace}: Collection`,
        collectionSlug.names,
        'offer is higher than the highest offer by more than',
        outbid_margin_max,
        `%.`
      );
      return;

    } else if (Number(highOfferInEth) > Number(collectionOfferInEth)) {

      collectionOffer = BigInt(Math.floor(+offerPrice));
      trait_bid_activate = 0;
      collectionOfferInEth = formatEther(collectionOffer);
      highOfferInEth = hightOfferPrice?.toString() as string;
      console.log(`${marketplace}: Collection ${collectionSlug.names} current highest offer: ${highOfferInEth} Higher than bot offer: ${collectionOfferInEth}`);
    }

    else {
      trait_bid_activate = 1;
      const opensea_traits = !collectionSlug.opensea_traits
      if (opensea_traits) {
        collectionOffer = BigInt((Number(highOfferInEth) - Number(outbid_margin)) * 10 ** 18)
        collectionOfferInEth = (Number(collectionOffer) / 10 ** 18).toFixed(9)
        highOfferInEth = hightOfferPrice
      } else {
        collectionOffer = BigInt(Number(highOfferInEth) * 10 ** 18)
        collectionOfferInEth = (Number(collectionOffer) / 10 ** 18).toFixed(9)
        highOfferInEth = hightOfferPrice
      }

      console.log(
        `${marketplace}: Collection`,
        collectionSlug.names,
        `current highest offer:`,
        Number(highOfferInEth),
        `Lower than bot offer:`,
        Number(collectionOfferInEth)
      );
    }
    return { collectionOffer, trait_bid_activate, currentHighestOffer };

  }

  console.log({ collectionOffer, trait_bid_activate, currentHighestOffer, line: 823 });

}


/**
 * Validates the bid conditions.
 * @param profit - The calculated profit.
 * @param floorPrice - The floor price of the collection.
 * @param collectionOffer - The calculated offer price.
 * @param collectionName - The name of the collection.
 * @returns A boolean indicating if the bid conditions are valid.
 */
function validateBidConditions(profit: number, floorPrice: number, collectionOffer: bigint, collectionName: string) {
  if (isNaN(profit) || profit <= 0) {
    console.log(`Profit is less than or equal to zero for collection: ${collectionName}. Skip this collection`);
    return false;
  }

  if (Number(floorPrice) < Number(collectionOffer) / 10 ** 18) {
    console.log(`Floor price is greater than collection offer for collection: ${collectionName}. Skipping`);
    return false;
  }

  return true;
}

/**
 * Creates an offer on a specific marketplace.
 * @param marketplace - The marketplace to create the offer on.
 * @param walletAddress - The user's wallet address.
 * @param privateKey - The user's private key.
 * @param accessToken - The access token for Blur marketplace.
 * @param collectionSlug - The collection data.
 * @param collectionData - The collection information.
 * @param collectionOffer - The calculated offer price.
 * @param trait_bid_activate - A flag indicating if trait bidding is activated.
 * @param currentHighestOffer - The current highest offer.
 */
async function createMarketplaceOffer(
  marketplace: 'Blur' | 'Opensea' | 'MagicEden',
  walletAddress: string,
  privateKey: string,
  accessToken: string | undefined,
  collectionSlug: CollectionData,
  collectionData: ICollection | undefined,
  collectionOffer: bigint,
  trait_bid_activate: number,
  currentHighestOffer: number,
) {
  if (!collectionData) {
    console.log('ERROR: COULD NOT FETCH COLLECTION INFORMATION');
    return;
  }

  try {
    await createOffer(
      marketplace,
      walletAddress,
      privateKey,
      accessToken,
      collectionSlug.names,
      collectionData.primary_asset_contracts_address,
      collectionOffer,
      trait_bid_activate,
      collectionData.creator_fees,
      collectionData.enforceCreatorFee,
      currentHighestOffer,
      collectionSlug.blur_traits,
      collectionSlug.opensea_traits
    );
  } catch (err) {
    console.error(`Error creating offer for collection ${collectionSlug.names} on ${marketplace}:`, err);
  }
}

/**
 * Creates an offer on a specific marketplace.
 * @param marketplace - The marketplace to create the offer on.
 * @param walletAddress - The user's wallet address.
 * @param privateKey - The user's private key.
 * @param accessToken - The access token for Blur marketplace.
 * @param collectionSlug - The name of the collection.
 * @param collectionAddress - The address of the collection.
 * @param collectionOffer - The calculated offer price.
 * @param trait_bid_activate - A flag indicating if trait bidding is activated.
 * @param creatorFees - The creator fees.
 * @param enforceCreatorFee - A flag indicating if creator fees are enforced.
 * @param highestOffer - The current highest offer.
 * @param blur_traits - The Blur traits for trait bidding.
 * @param opensea_traits - The OpenSea traits for trait bidding.
 */
async function createOffer(
  marketplace: 'Blur' | 'Opensea' | 'MagicEden',
  walletAddress: string,
  privateKey: string,
  accessToken: string | undefined,
  collectionSlug: string,
  collectionAddress: string,
  collectionOffer: bigint,
  trait_bid_activate: number,
  creatorFees: IFee,
  enforceCreatorFee: boolean = false,
  highestOffer: number,
  blur_traits?: string,
  opensea_traits?: string
) {
  console.log({ marketplace, walletAddress, collectionSlug, collectionAddress, collectionOffer, trait_bid_activate, creatorFees, enforceCreatorFee, opensea_traits, highestOffer });

  const wethBalance = await getWETHBalance(privateKey) as number;
  const blurBalance = await getBlurPoolBalance(private_key) as number;

  if ((marketplace === "MagicEden" || marketplace === "Opensea") && Number(collectionOffer) / 1e18 > wethBalance) {
    logInsufficientBalance();
    return;
  }

  if ((marketplace === "Blur") && Number(collectionOffer) / 1e18 > blurBalance) {
    logInsufficientBalance();
    return;
  }

  switch (marketplace) {
    case 'Blur':
      await handleBlurOffer(walletAddress, privateKey, accessToken, collectionAddress, collectionOffer, collectionSlug, blur_traits, trait_bid_activate);
      break;
    case 'Opensea':
      await handleOpenseaOffer(walletAddress, privateKey, collectionSlug, collectionOffer, creatorFees, enforceCreatorFee, opensea_traits, trait_bid_activate);
      break;
    case 'MagicEden':
      await handleMagicEdenOffer(walletAddress, collectionAddress, collectionOffer, privateKey);
      break;
  }
}

/**
 * Handles the Blur offer creation.
 * @param walletAddress - The user's wallet address.
 * @param privateKey - The user's private key.
 * @param accessToken - The access token for Blur marketplace.
 * @param collectionAddress - The address of the collection.
 * @param collectionOffer - The calculated offer price.
 * @param collectionSlug - The name of the collection.
 * @param blur_traits - The Blur traits for trait bidding.
 * @param trait_bid_activate - A flag indicating if trait bidding is activated.
 */
async function handleBlurOffer(walletAddress: string, privateKey: string, accessToken: string | undefined, collectionAddress: string, collectionOffer: bigint, collectionSlug: string, blur_traits?: string, trait_bid_activate?: number) {
  const blurBalance = await getBlurPoolBalance(private_key) as number;

  if (!accessToken) return;

  if (Number(collectionOffer) / 1e18 > blurBalance) {
    logInsufficientBalance();
    return;
  }

  if (Number(collectionOffer) / 1e18 < 0.01) {
    console.log('\x1b[31m%s\x1b[0m', '-----------------------------------------------------------');
    console.log('\x1b[31m%s\x1b[0m', `OFFER PRICE FOR ${collectionSlug} IS LESS THAN MINIMUM BLUR BID, SKIP`);
    console.log('\x1b[31m%s\x1b[0m', '-----------------------------------------------------------');
    return;
  }

  if (blur_traits && traitBidding && trait_bid_activate == 1) {
    console.log('Activated 1');
    const traits = blur_traits.split("|");
    for (const trait of traits) {
      await createOfferToBlur(walletAddress, privateKey, accessToken, collectionAddress, collectionOffer, trait);
    }
  } else {
    await createOfferToBlur(walletAddress, privateKey, accessToken, collectionAddress, collectionOffer);
  }
}

/**
 * Handles the OpenSea offer creation.
 * @param walletAddress - The user's wallet address.
 * @param privateKey - The user's private key.
 * @param collectionSlug - The name of the collection.
 * @param collectionOffer - The calculated offer price.
 * @param creatorFees - The creator fees.
 * @param enforceCreatorFee - A flag indicating if creator fees are enforced.
 * @param opensea_traits - The OpenSea traits for trait bidding.
 * @param trait_bid_activate - A flag indicating if trait bidding is activated.
 */
async function handleOpenseaOffer(walletAddress: string, privateKey: string, collectionSlug: string, collectionOffer: bigint, creatorFees: IFee, enforceCreatorFee: boolean, opensea_traits?: string, trait_bid_activate?: number) {
  if (opensea_traits && traitBidding && trait_bid_activate == 1) {
    const traits = opensea_traits.split("|");
    console.table(traits);
    for (const trait of traits) {
      const order_hash = await createOfferWithRapid(walletAddress, privateKey, collectionSlug, collectionOffer, creatorFees, enforceCreatorFee, trait);

      // await prisma.offer.create({
      //   data: {
      //     orderHash: order_hash,
      //     collection: collectionSlug,
      //     offerPrice: collectionOffer.toString(),
      //     expirationTime: new Date(Date.now() + 1000 * 900)
      //   }
      // })
    }
  } else {
    const order_hash = await createOfferWithRapid(walletAddress, privateKey, collectionSlug, collectionOffer, creatorFees, enforceCreatorFee);

    // await prisma.offer.create({
    //   data: {
    //     orderHash: order_hash,
    //     collection: collectionSlug,
    //     offerPrice: collectionOffer.toString(),
    //     expirationTime: new Date(Date.now() + 1000 * 900)
    //   }
    // })
  }
}

/**
 * Handles the MagicEden offer creation.
 * @param walletAddress - The user's wallet address.
 * @param collectionAddress - The address of the collection.
 * @param collectionOffer - The calculated offer price.
 * @param privateKey - The user's private key.
 */
async function handleMagicEdenOffer(walletAddress: string, collectionAddress: string, collectionOffer: bigint, privateKey: string) {
  const duration = 15; // minutes
  const currentTime = new Date().getTime();
  const expiration = Math.floor((currentTime + (duration * 60 * 1000)) / 1000);

  await bidOnMagicEden(walletAddress, collectionAddress, 1, collectionOffer.toString(), expiration.toString(), privateKey);
}

interface CollectionData {
  names: string;
  factor: string;
  floor_price: string;
  blur_traits?: string
  opensea_traits?: string
  bidOnOpensea?: string
  bidOnBlur?: string
  bidOnMagicEden?: string

}

interface ICollection {
  address: any;
  primary_asset_contracts_address: any;
  creator_fees: {
    [x: number]: number;
  } | {
    null: number;
  };
  enforceCreatorFee: boolean;
}

interface IFee {
  [key: string]: number
}

interface ICollectionData {
  collectionData?: any;
  magicEdenCollectionDetails?: any;
}

function adjustOffer(offer: bigint) {
  const offerInEth = utils.formatEther(offer);
  const offerInEthRounded = (Math.round(Number(offerInEth) * 1e4) / 1e4).toString();
  return BigNumber.from(utils.parseEther(offerInEthRounded).toString());
}

