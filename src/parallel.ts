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


// Variables //
const floor_factor_a = 3.35;
const floor_factor_b = -9.16;
const floor_factor_c = 10.54;

const profit_base = 0.01;
const balance_max_opensea = 2.4 * 10 ** 18;
const balance_max_blur = 8.6;
const balance_factor = 0.065;
const balance_ratio = 0.75;

const profit_max_base = 0.91;
const profit_max_factor = 1.3;
const profit_max_ceil = 0.91;

const outbid_margin = 1.07;
const outbid_margin_max = 20;

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


    const magicEdenCreatorFees = Number((magicEdenCollectionDetails)?.collections[0].royalties.bps)

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


    const floorPrice = Math.min(Number(magicEdenFloorPrice), Number(blurFloorPrice))


    if (floorPrice === undefined) {
      console.log('Can not get floor price');
      return;
    }

    const blurBalance = await getBlurPoolBalance(private_key);
    const highestOffer = await getMEHighestOffers(collectionData?.primary_asset_contracts_address, collectionSlug.names)


    const overrideBlur = collectionSlug.bidOnBlur?.toLowerCase() === "true" ? true : collectionSlug.bidOnBlur?.toLowerCase() === "false" ? false : bidBlur

    if (overrideBlur) {
      console.log(
        '--------------------------------------------------------------------'
      );
      console.log(`Bidding on Marketplace Blur ${collectionSlug.names}`.toUpperCase());
      console.log(
        '--------------------------------------------------------------------'
      );
      if (!blurBalance) return
      await bidOnMarketplace(
        'Blur',
        collectionSlug,
        collectionData,
        totalCreatorFee,
        wallet,
        blurBalance,
        balance_max_blur,
        floorPrice,
        highestOffer,
        accessToken
      );
    }

    const overrideOpensea = collectionSlug.bidOnOpensea?.toLowerCase() === "true" ? true : collectionSlug.bidOnOpensea?.toLowerCase() === "false" ? false : bidOpensea

    if (overrideOpensea) {
      console.log(
        '--------------------------------------------------------------------'
      );
      console.log(`Bidding on Marketplace OpenSea ${collectionSlug.names}`.toUpperCase());
      console.log(
        '--------------------------------------------------------------------'
      );

      await bidOnMarketplace(
        'Opensea',
        collectionSlug,
        collectionData,
        totalCreatorFee,
        wallet,
        balance,
        balance_max_opensea,
        floorPrice,
        highestOffer
      );
    }

    const overrideMagicEden = collectionSlug.bidOnMagicEden?.toLowerCase() === "true" ? true : collectionSlug.bidOnMagicEden?.toLowerCase() === "false" ? false : bidMagicEden

    if (overrideMagicEden) {
      console.log(
        '--------------------------------------------------------------------'
      );
      console.log(`Bidding on Marketplace magiceden ${collectionSlug.names}`.toUpperCase());
      console.log(
        '--------------------------------------------------------------------'
      );

      await bidOnMarketplace(
        'MagicEden',
        collectionSlug,
        collectionData,
        magicEdenCreatorFees,
        wallet,
        balance,
        balance_max_opensea,
        floorPrice,
        highestOffer
      );
    }
  } catch (err) {
    console.error('Error processing collection:', collectionSlug, err);
  }
}

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


    let profit = calculateProfit(
      floorPrice,
      collectionSlug.factor,
      balance,
      balance_max
    );


    var profit_max =
      profit_max_base +
      profit_max_factor * parseFloat(collectionSlug.factor) +
      ((balance / balance_max_opensea) * balance_factor) / 2;

    if (marketplace === 'Blur') {
      profit_max =
        profit_max_base +
        profit_max_factor * parseFloat(collectionSlug.factor) +
        ((balance / balance_max_blur) * balance_factor) / 2;
    }

    if (profit_max > profit_max_ceil) {
      profit_max = profit_max_ceil;
    }

    if (profit > profit_max) {
      profit = profit_max;
    }

    const royalty_fee = marketplace === "Opensea" ? 0.5 : marketplace === 'MagicEden' ? 2 : 0;

    if (isNaN(profit) || profit <= 0) {
      console.log(
        `Profit ${profit} is less than or equal to zero for collection: ${collectionSlug.names}. Skip this collection`
      );
      return;
    }
    if (!collectionData) return

    const feeRate = await getFeeRate(
      collectionData.primary_asset_contracts_address,
      wallet.address,
      accessToken
    );

    if (marketplace === 'Blur') {
      totalCreatorFee = feeRate;
    }

    let offerPrice = calculateOfferPrice(
      floorPrice,
      totalCreatorFee,
      royalty_fee,
      profit
    );

    if (offerPrice === 0 || !offerPrice) {
      console.log('The offer price counts as zero. Skip this collection');
      return;
    }

    await placeBid(
      marketplace,
      collectionSlug,
      collectionData,
      wallet,
      private_key,
      accessToken,
      offerPrice,
      floorPrice,
      profit,
      highestOffer
    );
  } catch (err) {
    console.error(
      `Error on ${marketplace} Bid for collection ${collectionSlug?.names ?? 'unknown'
      }:`,
      err
    );
  }
}

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

function calculateOfferPrice(floorPrice: number, totalCreatorFee: number, royalty_fee: number, profit: number) {

  console.log('FP: ', floorPrice);
  console.log('CF: ', totalCreatorFee);
  console.log('RF: ', royalty_fee);
  console.log('Profit: ', profit)
  console.log('Offer: ', floorPrice * ((100 - totalCreatorFee / 100 - royalty_fee) / 100) * profit)

  return Math.round(
    floorPrice * ((100 - totalCreatorFee / 100 - royalty_fee) / 100) * profit * 10 ** 18
  );
}
function adjustOffer(offer: bigint) {
  const offerInEth = utils.formatEther(offer);
  const offerInEthRounded = (Math.round(Number(offerInEth) * 1e4) / 1e4).toString();
  return BigNumber.from(utils.parseEther(offerInEthRounded).toString());
}

function adjustOfferByTickPrice(offer: bigint) {
  const tickPrice = BigInt(10 ** 16);
  if (offer > 2 * 10 ** 17) {
    return offer + tickPrice - (offer % tickPrice);
  } else {
    return offer - (offer % tickPrice);
  }
}

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

  let hightOfferPrice;
  const openseaHighestOffer = highestOffer?.opensea?.price?.amount?.decimal ?? 0
  let blurHighestOffer = highestOffer?.blur?.price?.amount?.decimal ?? 0
  const magicEdenHighestOffer = highestOffer?.magiceden?.price?.amount?.decimal ?? 0

  if (blurHighestOffer === 0) {
    const blurOffers = await getOffersFromBlur(
      collectionData?.primary_asset_contracts_address,
      accessToken as string,
      wallet.address
    );
    blurHighestOffer = Number(blurOffers?.priceLevels?.[0].price)
  }


  if (!openseaHighestOffer && !blurHighestOffer && !magicEdenHighestOffer) {
    console.log('\x1b[31m%s\x1b[0m', '-----------------------------------------------------------');
    console.log('\x1b[31m%s\x1b[0m', `🛑 ${collectionSlug.names} HAS NO OFFER ON ALL MARKETPLACE SKIP 🛑`);
    console.log('\x1b[31m%s\x1b[0m', '-----------------------------------------------------------');
    return
  }


  if (marketplace === 'Opensea') {
    const openseaHighestOffer = highestOffer?.opensea?.price?.amount?.decimal ?? 0


    console.log({ openseaHighestOffer, line: 439 });

    hightOfferPrice = openseaHighestOffer

    const currentHighestOffer = Number(hightOfferPrice) * 10 ** 18

    console.log({ currentHighestOffer, offerPrice, line: 524 });

    let collectionOffer = BigInt(offerPrice);
    let collectionOfferInEth = formatEther(collectionOffer);
    let highOfferInEth = hightOfferPrice ?? '0';

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

      const trait_bid_activate = 1

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

      if (isNaN(profit) || profit <= 0) {
        console.log('----------------------------------------------------------');
        console.log(
          `profit is less than or equal to zero for collection: ${collectionSlug.names}. Skip this collection`.toUpperCase()
        );
        console.log('----------------------------------------------------------');

        return;
      }

      if (Number(floorPrice) < Number(collectionOffer) / 10 ** 18) {
        console.log(
          `floor price is greater than collection offer for collection: ${collectionSlug.names}. Skipping`
        );
        return;
      }

      try {

        if (!collectionData) {
          console.log('ERROR: COULD NOT FETCH COLLECTION INFORMATION');
          return
        }
        await createOffer(
          marketplace,
          wallet.address,
          private_key,
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
        console.error(
          `Error creating offer for collection ${collectionSlug.names} on ${marketplace}:`,
          err
        );
      }
    } else if (Number(highOfferInEth) > Number(collectionOfferInEth) * outbid_margin) {

      const trait_bid_activate = 0;
      collectionOffer = BigInt(Math.floor(+offerPrice * outbid_margin));
      collectionOfferInEth = formatEther(collectionOffer);
      highOfferInEth = hightOfferPrice

      console.log(
        `${marketplace}: Collection`,
        collectionSlug.names,
        `current highest offer:`,
        (highOfferInEth),
        `Higher than bot offer:`,
        (collectionOfferInEth),
        `including ${outbid_margin} outbid margin.`,
        { line: 493 }
      );


      if (isNaN(profit) || profit <= 0) {
        console.log(
          `profit is less than or equal to zero for collection: ${collectionSlug.names}. Skip this collection`
        );
        return;
      }

      if (Number(floorPrice) < Number(collectionOffer) / 10 ** 18) {
        console.log(
          `floor price is greater than collection offer for collection: ${collectionSlug.names}. Skipping`
        );
        return;
      }

      try {
        if (!collectionData) {
          console.log('ERROR: COULD NOT GET COLLECTION INFORMATION');
          return
        }

        await createOffer(
          marketplace,
          wallet.address,
          private_key,
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
        console.error(
          `Error creating offer for collection ${collectionSlug.names} on ${marketplace}:`,
          err
        );
      }
    } else {

      const highestOffer = parseEther(hightOfferPrice.toString()).toBigInt()
      const trait_bid_activate = 1;
      collectionOffer = BigInt(
        Math.floor(Number((highestOffer)) + 100000000000000)
      );

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


      if (isNaN(profit) || profit <= 0) {
        console.log(
          `profit is less than or equal to zero for collection: ${collectionSlug.names}. Skip this collection`
        );
        return;
      }

      if (Number(floorPrice) < Number(collectionOffer) / 10 ** 18) {
        console.log(
          `floor price is greater than collection offer for collection: ${collectionSlug.names}. Skipping`
        );
        return;
      }

      try {
        if (!collectionData) return
        await createOffer(
          marketplace,
          wallet.address,
          private_key,
          accessToken,
          collectionSlug.names,
          collectionData.primary_asset_contracts_address,
          collectionOffer,
          trait_bid_activate,
          collectionData.creator_fees,
          collectionData.enforceCreatorFee,
          currentHighestOffer,
          collectionSlug.blur_traits,
          collectionSlug.opensea_traits,
        );
      } catch (err) {
        console.error(
          `Error creating offer for collection ${collectionSlug.names} on ${marketplace}:`,
          err
        );
      }
    }
  } else if (marketplace === 'Blur') {
    let collectionOffer = BigInt(offerPrice);
    let collectionOfferOutbid = adjustOfferByTickPrice(BigInt(+offerPrice * outbid_margin));
    collectionOffer = adjustOfferByTickPrice(collectionOffer);
    hightOfferPrice = blurHighestOffer

    let collectionOfferInEth = formatEther(collectionOffer);
    let highOfferInEth: any = hightOfferPrice.toString() ?? '0';

    const currentHighestOffer = Number(hightOfferPrice)

    console.log({ hightOfferPrice, offerPrice, collectionOffer, collectionOfferOutbid, line: 683 });


    if ((Number(collectionOffer) / 10 ** 18) > hightOfferPrice || !blurHighestOffer) {
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

      const trait_bid_activate = 1;
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

      if (isNaN(profit) || profit <= 0) {
        console.log('----------------------------------------------------------');
        console.log(
          `profit is less than or equal to zero for collection: ${collectionSlug.names}. Skip this collection`.toUpperCase()
        );
        console.log('----------------------------------------------------------');

        return;
      }

      if (Number(floorPrice) < Number(collectionOffer) / 10 ** 18) {
        console.log(
          `floor price is greater than collection offer for collection: ${collectionSlug.names}. Skipping`
        );
        return;
      }

      try {

        if (!collectionData) {
          console.log('ERROR: COULD NOT FETCH COLLECTION INFORMATION');
          return
        }
        await createOffer(
          marketplace,
          wallet.address,
          private_key,
          accessToken,
          collectionSlug.names,
          collectionData.primary_asset_contracts_address,
          collectionOffer,
          trait_bid_activate,
          collectionData.creator_fees,
          collectionData.enforceCreatorFee,
          currentHighestOffer,
          collectionSlug.blur_traits,
          collectionSlug.opensea_traits,
        );
      } catch (err) {
        console.error(
          `Error creating offer for collection ${collectionSlug.names} on ${marketplace}:`,
          err
        );
      }
    } else if (Number(hightOfferPrice) >= Number(collectionOfferOutbid) / 10 ** 18) {
      const trait_bid_activate = 0;
      collectionOffer = collectionOfferOutbid;
      console.log('\x1b[31m%s\x1b[0m', "I'M HERE");

      collectionOfferInEth = adjustOffer(collectionOffer).toString();
      highOfferInEth = hightOfferPrice

      if (marketplace === 'Blur') {
        console.log(
          `${marketplace}: Collection`,
          collectionSlug.names,
          `current highest offer:`,
          Number(highOfferInEth),
          `Higher than bot offer:`,
          Number(collectionOfferInEth) / 10 ** 18,
          `including ${outbid_margin} outbid margin.`
        );
      } else {
        console.log(
          `${marketplace}: Collection`,
          collectionSlug.names,
          `current highest offer:`,
          Number(highOfferInEth),
          `Higher than bot offer:`,
          Number(collectionOfferInEth) / 10 ** 18,
          `including ${outbid_margin} outbid margin.`,
          { line: 493 }
        );
      }

      if (isNaN(profit) || profit <= 0) {
        console.log(
          `profit is less than or equal to zero for collection: ${collectionSlug.names}. Skip this collection`
        );
        return;
      }

      if (Number(floorPrice) < Number(collectionOffer) / 10 ** 18) {
        console.log(
          `floor price is greater than collection offer for collection: ${collectionSlug.names}. Skipping`
        );
        return;
      }

      try {
        if (!collectionData) {
          console.log('ERROR: COULD NOT GET COLLECTION INFORMATION');
          return
        }
        await createOffer(
          marketplace,
          wallet.address,
          private_key,
          accessToken,
          collectionSlug.names,
          collectionData.primary_asset_contracts_address,
          collectionOffer,
          trait_bid_activate,
          collectionData.creator_fees,
          collectionData.enforceCreatorFee,
          currentHighestOffer,
          collectionSlug.blur_traits,
          collectionSlug.opensea_traits,
        );
      } catch (err) {
        console.error(
          `Error creating offer for collection ${collectionSlug.names} on ${marketplace}:`,
          err
        );
      }
    } else {
      console.log({ hightOfferPrice, line: 520 });
      collectionOffer = BigInt(
        Math.floor(parseInt(((hightOfferPrice * 1e18)?.toString() as string)) + 10000000000000000)
      );
      const trait_bid_activate = 1;
      collectionOfferInEth = adjustOffer(collectionOffer).toString();
      highOfferInEth = hightOfferPrice

      collectionOffer = adjustOfferByTickPrice(collectionOffer);

      console.log(
        `${marketplace}: Collection`,
        collectionSlug.names,
        `current highest offer:`,
        Number(highOfferInEth),
        `Lower than bot offer:`,
        Number(collectionOfferInEth) / 10 ** 18,
        `partly including ${outbid_margin} outbid margin.`
      );


      if (isNaN(profit) || profit <= 0) {
        console.log(
          `profit is less than or equal to zero for collection: ${collectionSlug.names}. Skip this collection`
        );
        return;
      }

      if (Number(floorPrice) < Number(collectionOffer) / 10 ** 18) {
        console.log(
          `floor price is greater than collection offer for collection: ${collectionSlug.names}. Skipping`
        );
        return;
      }

      try {
        if (!collectionData) return
        await createOffer(
          marketplace,
          wallet.address,
          private_key,
          accessToken,
          collectionSlug.names,
          collectionData.primary_asset_contracts_address,
          collectionOffer,
          trait_bid_activate,
          collectionData.creator_fees,
          collectionData.enforceCreatorFee,
          currentHighestOffer,
          collectionSlug.blur_traits,
          collectionSlug.opensea_traits,
        );
      } catch (err) {
        console.error(
          `Error creating offer for collection ${collectionSlug.names} on ${marketplace}:`,
          err
        );
      }
    }
  } else if (marketplace === "MagicEden") {
    hightOfferPrice = magicEdenHighestOffer

    console.log({ hightOfferPrice, line: 900 });
    const currentHighestOffer = Number(hightOfferPrice) * 10 ** 18
    let collectionOffer = BigInt(offerPrice);

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
      const trait_bid_activate = 1;
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

      if (isNaN(profit) || profit <= 0) {
        console.log('----------------------------------------------------------');
        console.log(
          `profit is less than or equal to zero for collection: ${collectionSlug.names}. Skip this collection`.toUpperCase()
        );
        console.log('----------------------------------------------------------');

        return;
      }

      if (Number(floorPrice) < Number(collectionOffer) / 10 ** 18) {
        console.log(
          `floor price is greater than collection offer for collection: ${collectionSlug.names}. Skipping`
        );
        return;
      }

      try {

        if (!collectionData) {
          console.log('ERROR: COULD NOT FETCH COLLECTION INFORMATION');
          return
        }

        await createOffer(
          marketplace,
          wallet.address,
          private_key,
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
        console.error(
          `Error creating offer for collection ${collectionSlug.names} on ${marketplace}:`,
          err
        );
      }
    } else if (Number(highOfferInEth) > Number(collectionOfferInEth) * outbid_margin) {

      //console.log({ highOfferInEth, collectionOfferInEth, line: 474 });
      collectionOffer = BigInt(Math.floor(+offerPrice * outbid_margin));
      const trait_bid_activate = 0;
      collectionOfferInEth = formatEther(collectionOffer);
      highOfferInEth = hightOfferPrice?.toString() as string;

      console.log(
        `${marketplace}: Collection`,
        collectionSlug.names,
        `current highest offer:`,
        (highOfferInEth),
        `Higher than bot offer:`,
        (collectionOfferInEth),
        `including ${outbid_margin} outbid margin.`,
        { line: 493 }
      );


      if (isNaN(profit) || profit <= 0) {
        console.log(
          `profit is less than or equal to zero for collection: ${collectionSlug.names}. Skip this collection`
        );
        return;
      }

      if (Number(floorPrice) < Number(collectionOffer) / 10 ** 18) {
        console.log(
          `floor price is greater than collection offer for collection: ${collectionSlug.names}. Skipping`
        );
        return;
      }

      try {
        if (!collectionData) {
          console.log('ERROR: COULD NOT GET COLLECTION INFORMATION');
          return
        }

        await createOffer(
          marketplace,
          wallet.address,
          private_key,
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
        console.error(
          `Error creating offer for collection ${collectionSlug.names} on ${marketplace}:`,
          err
        );
      }
    } else {

      const highestOffer = parseEther(hightOfferPrice.toString()).toBigInt()
      const trait_bid_activate = 1;
      collectionOffer = BigInt(
        Math.floor(Number((highestOffer)) + 100000000000000)
      );

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


      if (isNaN(profit) || profit <= 0) {
        console.log(
          `profit is less than or equal to zero for collection: ${collectionSlug.names}. Skip this collection`
        );
        return;
      }

      if (Number(floorPrice) < Number(collectionOffer) / 10 ** 18) {
        console.log(
          `floor price is greater than collection offer for collection: ${collectionSlug.names}. Skipping`
        );
        return;
      }

      try {
        if (!collectionData) return
        await createOffer(
          marketplace,
          wallet.address,
          private_key,
          accessToken,
          collectionSlug.names,
          collectionData.primary_asset_contracts_address,
          collectionOffer,
          trait_bid_activate,
          collectionData.creator_fees,
          collectionData.enforceCreatorFee,
          currentHighestOffer,
          collectionSlug.blur_traits,
          collectionSlug.opensea_traits,
        );
      } catch (err) {
        console.error(
          `Error creating offer for collection ${collectionSlug.names} on ${marketplace}:`,
          err
        );
      }
    }


  }
}

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
  console.log({
    marketplace,
    walletAddress,
    collectionSlug,
    collectionAddress,
    collectionOffer,
    trait_bid_activate,
    creatorFees,
    enforceCreatorFee,
    opensea_traits,
    highestOffer,
  });



  try {
    const wethBalance = await getWETHBalance(privateKey) as number;

    if (marketplace === 'Blur') {
      const blurBalance = await getBlurPoolBalance(private_key) as number;

      if (!accessToken) return

      if (Number(collectionOffer) / 1e18 > blurBalance) {
        console.log('\x1b[31m%s\x1b[0m', '-----------------------------------------------------------');
        console.log('\x1b[31m%s\x1b[0m', '🛑 MESSAGE INSUFFICIENT 🛑');
        console.log('\x1b[31m%s\x1b[0m', '-----------------------------------------------------------');
        return
      }

      if (Number(collectionOffer) / 1e18 < 0.01) {
        console.log('\x1b[31m%s\x1b[0m', '-----------------------------------------------------------');
        console.log('\x1b[31m%s\x1b[0m', `OFFER PRICE FOR ${collectionSlug} IS LESS THAN MINIMUM BLUR BID, SKIP`);
        console.log('\x1b[31m%s\x1b[0m', '-----------------------------------------------------------');
        return
      }
      if (blur_traits && traitBidding && trait_bid_activate == 1) {
        console.log('Activated 1')
        const traits = blur_traits.split("|")
        for (const trait of traits) {
          await createOfferToBlur(
            walletAddress,
            privateKey,
            accessToken,
            collectionAddress,
            collectionOffer,
            trait
          );
        }

      } else {
        await createOfferToBlur(
          walletAddress,
          privateKey,
          accessToken,
          collectionAddress,
          collectionOffer,
        );
      }

    } else if (marketplace === "Opensea") {
      if (Number(collectionOffer) / 1e18 > wethBalance) {
        console.log('\x1b[31m%s\x1b[0m', '-----------------------------------------------------------');
        console.log('\x1b[31m%s\x1b[0m', '🛑 MESSAGE INSUFFICIENT 🛑');
        console.log('\x1b[31m%s\x1b[0m', '-----------------------------------------------------------');
        return
      }
      if (opensea_traits && traitBidding && trait_bid_activate == 1) {
        const traits = opensea_traits.split("|")

        console.table(traits);

        for (const trait of traits) {
          await createOfferWithRapid(
            walletAddress,
            privateKey,
            collectionSlug,
            collectionOffer,
            creatorFees,
            enforceCreatorFee,
            trait
          );
        }
      } else {
        await createOfferWithRapid(
          walletAddress,
          privateKey,
          collectionSlug,
          collectionOffer,
          creatorFees,
          enforceCreatorFee,
        );
      }
    }
    else if (marketplace === "MagicEden") {
      const duration = 15 // minutes
      const currentTime = new Date().getTime();
      const expiration = Math.floor((currentTime + (duration * 60 * 1000)) / 1000);

      if (Number(collectionOffer) / 1e18 > wethBalance) {
        console.log('\x1b[31m%s\x1b[0m', '-----------------------------------------------------------');
        console.log('\x1b[31m%s\x1b[0m', '🛑 MESSAGE INSUFFICIENT 🛑');
        console.log('\x1b[31m%s\x1b[0m', '-----------------------------------------------------------');
        return
      }

      await bidOnMagicEden(walletAddress, collectionAddress, 1, collectionOffer.toString(), expiration.toString(), privateKey)
    }
  } catch (err) {
    console.error(
      `Error creating offer on ${marketplace} for collection ${collectionSlug}:`,
      err
    );
  }
}



interface Offer {
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
