import { utils, BigNumber, ethers } from 'ethers';
import path from "path"
import csvParser from "csv-parser"
import yargs from "yargs";
import PQueue from "p-queue"
import fs from "fs"
import { getCollectionInfoWithRapidApi, getFloorPriceFromBlur } from "./utils/collection";
import { getAccount, getBalance, getWallet } from "./functions/wallet";
import { bidOnMagicEden, createOfferToBlur, createOfferWithRapid, getOffersFromBlur } from "./functions/offer";
import config from "./config";
import { getAccessToken } from "./utils/accessToken";
import { getFeeRate } from './utils/fees';
import { formatEther, parseEther } from 'ethers/lib/utils';
import { getBlurPoolBalance } from './utils/blurPoolBalance';
import { getWETHBalance } from './utils/wethBalance';
import dotenv from "dotenv"
import { Orders, getMEHighestOffers } from './functions/magiceden/getMEHighestOffers';
import { fetchCollectionDetails } from './functions/magiceden/getMECollectionDetails';
import { RATE_LIMIT } from './bottleneck';

const result: CollectionData[] = [];
dotenv.config()

const options: any = yargs
  .usage(
    'Usage: -p <private_key> -a <api_key> -l <list> -r(if you want to use opensea api key, you can remove this param) -b(bid on blur)'
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
let floor_factor_a: number,
  floor_factor_b: number,
  floor_factor_c: number,
  profit_base: number,
  balance_max_opensea: number,
  balance_max_blur: number,
  balance_factor: number,
  balance_ratio: number,
  profit_max_base: number,
  profit_max_factor: number,
  profit_max_ceil: number,
  outbid_margin: number,
  outbid_margin_max: number,
  wethBalanceMax: number,
  blurPoolBalanceMax: number,
  gasFactor: number,
  ethBalanceMin: number;

const bidVariableFile = "Bid_Convert_Bot.csv";

fs.createReadStream(path.join(__dirname, `../${bidVariableFile}`))
  .pipe(csvParser({
    escape: "\",",
    mapHeaders: ({ header }) => header.trim(),
    mapValues: ({ value }) => value.trim()
  }))
  .on('data', (data: any) => {
    floor_factor_a = parseFloat(data.floor_factor_a);
    floor_factor_b = parseFloat(data.floor_factor_b);
    floor_factor_c = parseFloat(data.floor_factor_c);
    profit_base = parseFloat(data.profit_base);
    balance_max_opensea = parseFloat(data.balance_max_opensea.replace('e18', '')) * 10 ** 18;
    balance_max_blur = parseFloat(data.balance_max_blur);
    balance_factor = parseFloat(data.balance_factor);
    balance_ratio = parseFloat(data.balance_ratio);
    profit_max_base = parseFloat(data.profit_max_base);
    profit_max_factor = parseFloat(data.profit_max_factor);
    profit_max_ceil = parseFloat(data.profit_max_ceil);
    outbid_margin = parseFloat(data.outbid_margin);
    outbid_margin_max = parseFloat(data.outbid_margin_max);
    wethBalanceMax = parseFloat(data.wethBalanceMax);
    blurPoolBalanceMax = parseFloat(data.blurPoolBalanceMax);
    gasFactor = parseFloat(data.gasFactor);
    ethBalanceMin = parseFloat(data.ethBalanceMin);

    console.log("Variables loaded from CSV:");
    console.table({
      floor_factor_a,
      floor_factor_b,
      floor_factor_c,
      profit_base,
      balance_max_opensea,
      balance_max_blur,
      balance_factor,
      balance_ratio,
      profit_max_base,
      profit_max_factor,
      profit_max_ceil,
      outbid_margin,
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

const filePath = path.join(__dirname, `../${options.list}`);
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
fs.createReadStream(path.join(__dirname, `../${options.list}`))
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

    // get me here

    let magicEdenCollectionDetails: any;

    magicEdenCollectionDetails = collectionInfo[collectionSlug.names].magicEdenCollectionDetails

    if (!magicEdenCollectionDetails) {
      magicEdenCollectionDetails = await fetchCollectionDetails(collectionData.primary_asset_contracts_address)
      collectionInfo[collectionData.primary_asset_contracts_address] = { magicEdenCollectionDetails }
    }


    const magicEdenCreatorFees = totalCreatorFee

    const account = getAccount(private_key);
    const wallet = await getWallet(account);
    const balance = +(await getBalance(wallet));

    const accessToken = await getAccessToken(
      'https://nfttools.pro/blur',
      private_key
    );


    const blurFloorPrice = await getFloorPriceFromBlur(
      collectionData.primary_asset_contracts_address,
      accessToken,
      wallet.address
    );

    const magicEdenFloorPrice = magicEdenCollectionDetails?.collections[0]?.floorAsk?.price?.amount?.decimal ?? 0

    const floorPrice =
      blurFloorPrice === 0 ? magicEdenFloorPrice :
        magicEdenFloorPrice === 0 ? blurFloorPrice :
          Math.min(Number(magicEdenFloorPrice), Number(blurFloorPrice))

    if (floorPrice === undefined) {
      console.log('Can not get floor price');
      return;
    }

    const blurBalance = await getBlurPoolBalance(private_key);
    const highestOffer = await getMEHighestOffers(collectionData?.primary_asset_contracts_address, collectionSlug.names)


    const marketplaces = [
      { name: 'Blur', override: parseBoolean(collectionSlug.bidOnBlur, bidBlur), balance: blurBalance, maxBalance: balance_max_blur },
      { name: 'Opensea', override: parseBoolean(collectionSlug.bidOnOpensea, bidOpensea), balance: balance, maxBalance: balance_max_opensea },
      { name: 'MagicEden', override: parseBoolean(collectionSlug.bidOnMagicEden, bidMagicEden), balance: balance, maxBalance: balance_max_opensea }
    ];

    for (const { name, override, balance, maxBalance } of marketplaces) {
      if (override) {
        logMarketplaceBidding(name, collectionSlug.names);
        if (name === 'Blur' && !balance) continue;
        await bidOnMarketplace(
          name as 'Blur' | 'Opensea' | 'MagicEden',
          collectionSlug,
          collectionData,
          name === 'MagicEden' ? magicEdenCreatorFees : totalCreatorFee,
          wallet,
          Number(balance),
          maxBalance,
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
  balance: number,
  balance_max: number,
  floorPrice: number,
  highestOffer: {
    opensea: Orders;
    blur: Orders;
    magiceden: Orders;
  },
  accessToken?: string
) {
  try {
    if (!collectionSlug || !collectionSlug.names) {
      throw new Error('Invalid collection data');
    }


    let profit = calculateAndAdjustProfit(floorPrice, collectionSlug.factor, balance, balance_max, marketplace);
    const royalty_fee = getRoyaltyFee(marketplace);

    if (!validateProfit(profit, collectionSlug.names)) return;

    const feeRate = await getFeeRate(
      collectionData?.primary_asset_contracts_address,
      wallet.address,
      accessToken
    );

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
 * Calculates and adjusts the profit based on various factors.
 * @param floorPrice - The floor price of the collection.
 * @param collectionFactor - The collection-specific factor.
 * @param balance - The user's balance.
 * @param balance_max - The maximum balance.
 * @param marketplace - The marketplace being used.
 * @returns The calculated and adjusted profit.
 */
function calculateAndAdjustProfit(floorPrice: number, collectionFactor: string, balance: number, balance_max: number, marketplace: 'Blur' | 'Opensea' | 'MagicEden') {
  let profit = calculateProfit(floorPrice, collectionFactor, balance, balance_max);
  let profit_max = calculateProfitMax(balance, balance_max, collectionFactor, marketplace);

  return Math.min(profit, profit_max);
}

/**
 * Gets the royalty fee for a specific marketplace.
 * @param marketplace - The marketplace.
 * @returns The royalty fee percentage.
 */
function getRoyaltyFee(marketplace: 'Blur' | 'Opensea' | 'MagicEden'): number {
  switch (marketplace) {
    case 'Opensea': return 0.5;
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
 * Calculates the profit based on various factors.
 * @param floorPrice - The floor price of the collection.
 * @param collectionFactor - The collection-specific factor.
 * @param balance - The user's balance.
 * @param balance_max - The maximum balance.
 * @returns The calculated profit.
 */
function calculateProfit(floorPrice: number, collectionFactor: string, balance: number, balance_max: number) {

  let profit_balance = (balance / (balance_max * balance_ratio) * balance_factor);

  if (profit_balance > balance_factor) {
    profit_balance = balance_factor;
  }

  let floor_factor = (floor_factor_c - (floor_factor_a * floorPrice ** 2 + floor_factor_b * floorPrice + floor_factor_c)) / 100

  const profit =
    floor_factor +
    parseFloat(collectionFactor) +
    profit_base + profit_balance;

  console.log('Floor Factor: ', floor_factor);
  console.log('Collection Factor: ', parseFloat(collectionFactor));
  console.log('Profit Base: ', profit_base);
  console.log('Profit Balance: ', profit_balance);

  return profit
}

/**
 * Calculates the maximum profit based on balance and marketplace.
 * @param balance - The user's balance.
 * @param balance_max - The maximum balance.
 * @param collectionFactor - The collection-specific factor.
 * @param marketplace - The marketplace being used.
 * @returns The calculated maximum profit.
 */
function calculateProfitMax(balance: number, balance_max: number, collectionFactor: string, marketplace: 'Blur' | 'Opensea' | 'MagicEden') {
  let profit_max =
    profit_max_base +
    profit_max_factor * parseFloat(collectionFactor) +
    ((balance / balance_max_opensea) * balance_factor) / 2;

  if (marketplace === 'Blur') {
    profit_max =
      profit_max_base +
      profit_max_factor * parseFloat(collectionFactor) +
      ((balance / balance_max_blur) * balance_factor) / 2;
  }

  if (profit_max > profit_max_ceil) {
    profit_max = profit_max_ceil;
  }

  return profit_max;
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
  if (offer > 2 * 10 ** 17) {
    return offer + tickPrice - (offer % tickPrice);
  } else {
    return offer - (offer % tickPrice);
  }
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
  highestOffer: {
    opensea: Orders;
    blur: Orders;
    magiceden: Orders;
  }
) {
  const hightOfferPrice = getHighestOfferPrice(marketplace, highestOffer);
  const opensea = getHighestOfferPrice("Opensea", highestOffer);
  const blur = getHighestOfferPrice("Blur", highestOffer);
  const magiceden = getHighestOfferPrice("MagicEden", highestOffer);

  console.log('\x1b[35m%s\x1b[0m', '--------------------------------------------------------------------------------------------');
  console.log('\x1b[35m%s\x1b[0m', `HIGHEST OFFER FOR ${collectionSlug.names} on ${marketplace.toUpperCase()} ${hightOfferPrice}`);
  console.log('\x1b[35m%s\x1b[0m', '--------------------------------------------------------------------------------------------');


  if (!opensea && !blur && !magiceden) {
    logNoOfferSkip(collectionSlug.names);
    return;
  }

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
    currentHighestOffer
  );
}

/**
 * Gets the highest offer price from different marketplaces.
 * @param marketplace - The marketplace to get the offer price from.
 * @param highestOffer - The highest offers on different marketplaces.
 * @returns The highest offer price.
 */
function getHighestOfferPrice(marketplace: 'Blur' | 'Opensea' | 'MagicEden', highestOffer: any) {
  const openseaHighestOffer = highestOffer?.opensea?.price?.amount?.decimal ?? 0;
  const blurHighestOffer = highestOffer?.blur?.price?.amount?.decimal ?? 0;
  const magicEdenHighestOffer = highestOffer?.magiceden?.price?.amount?.decimal ?? 0;

  switch (marketplace) {
    case 'Opensea': return openseaHighestOffer;
    case 'Blur': return blurHighestOffer;
    case 'MagicEden': return magicEdenHighestOffer;
    default: return 0;
  }
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
function prepareBidData(marketplace: 'Blur' | 'Opensea' | 'MagicEden', collectionSlug: CollectionData, collectionData: ICollection | undefined, offerPrice: number | string, hightOfferPrice: number) {
  let collectionOffer = BigInt(offerPrice);
  let trait_bid_activate = 1;
  let currentHighestOffer = Number(hightOfferPrice) * 10 ** 18;
  let highOfferInEth: any = hightOfferPrice.toString() ?? '0';


  if (marketplace === 'Blur') {
    let collectionOffer = BigInt(offerPrice);
    collectionOffer = adjustOfferByTickPrice(collectionOffer);
    let collectionOfferOutbid = adjustOfferByTickPrice(BigInt(Math.ceil(+offerPrice * outbid_margin)));
    let collectionOfferInEth = formatEther(collectionOffer);

    console.log({ collectionOfferInEth, hightOfferPrice, collectionOffer, collectionOfferOutbid, line: 679 });

    if ((Number(collectionOfferInEth)) > hightOfferPrice || !hightOfferPrice) {
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

      trait_bid_activate = 1;

      console.log(
        '---------------------------------------------------------------------------------'
      );
      console.log(
        `${marketplace}: Collection`.toUpperCase(),
        collectionSlug.names,
        'current highest bidder: '.toUpperCase(),
        (Number(collectionOffer) / 10 ** 18)
      );
      console.log(
        '---------------------------------------------------------------------------------'
      );

    }

    else if (Number(hightOfferPrice) >= Number(collectionOfferOutbid) / 10 ** 18) {

      collectionOfferInEth = adjustOffer(collectionOfferOutbid).toString();
      highOfferInEth = hightOfferPrice

      console.log(
        `${marketplace}: Collection`,
        collectionSlug.names,
        `current highest offer:`,
        Number(highOfferInEth),
        `Higher than bot offer:`,
        Number(collectionOfferInEth) / 10 ** 18,
        `including ${outbid_margin} outbid margin.`
      );

      collectionOffer = collectionOfferOutbid

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
        Number(collectionOfferInEth) / 10 ** 18,
        `partly including ${outbid_margin} outbid margin.`
      );
    }
    return { collectionOffer, trait_bid_activate, currentHighestOffer };

  } else if (marketplace === 'Opensea' || marketplace === 'MagicEden') {

    console.log(`{ hightOfferPrice: ${hightOfferPrice}, line: 900 }`);
    let collectionOfferInEth = formatEther(collectionOffer);
    let highOfferInEth: string | number = hightOfferPrice ?? '0';


    if (Number(collectionOfferInEth) > Number(highOfferInEth) || highOfferInEth === undefined) {
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
      }
      trait_bid_activate = 1;
      console.log(
        '---------------------------------------------------------------------------------'
      );
      console.log(
        `${marketplace}: Collection`.toUpperCase(),
        collectionSlug.names,
        'current highest bidder: '.toUpperCase(),
        collectionOfferInEth
      );
      console.log(
        '---------------------------------------------------------------------------------'
      );

    } else if ((Number(highOfferInEth) * 1.005) > Number(collectionOfferInEth) * outbid_margin) {

      collectionOffer = BigInt(Math.floor(+offerPrice * outbid_margin));
      trait_bid_activate = 0;
      collectionOfferInEth = formatEther(collectionOffer);
      highOfferInEth = hightOfferPrice?.toString() as string;
      console.log(`${marketplace}: Collection ${collectionSlug.names} current highest offer: ${highOfferInEth} Higher than bot offer: ${collectionOfferInEth} including ${outbid_margin} outbid margin.`);
    }
    else if (Number(collectionOfferInEth) * outbid_margin > (Number(hightOfferPrice) * 1.005)) {
      collectionOffer = BigInt(Math.floor(Number((parseEther(hightOfferPrice.toString()).toBigInt())) + 100000000000000));
    }

    else {
      trait_bid_activate = 1;
      collectionOfferInEth = (Number(collectionOffer) / 10 ** 18).toFixed(9)
      highOfferInEth = hightOfferPrice

      console.log(
        `${marketplace}: Collection`,
        collectionSlug.names,
        `current highest offer:`,
        Number(highOfferInEth),
        `Lower than bot offer:`,
        Number(collectionOfferInEth),
        `partly including ${outbid_margin} outbid margin.`
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
  currentHighestOffer: number
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
      await createOfferWithRapid(walletAddress, privateKey, collectionSlug, collectionOffer, creatorFees, enforceCreatorFee, trait);
    }
  } else {
    await createOfferWithRapid(walletAddress, privateKey, collectionSlug, collectionOffer, creatorFees, enforceCreatorFee);
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