import { utils, BigNumber, ethers, Wallet, providers } from 'ethers';
import path from "path"
import csvParser from "csv-parser"
import yargs from "yargs";
import fs from "fs"
import { getCollectionInfo, getCollectionInfoWithRapidApi, getFloorPriceFromBlur, getFloorPriceFromOpensea } from "./utils/collection";
import { getAccount, getBalance, getWallet } from "./functions/wallet";
import { IOpenseaOffer, PriceLevel, createOfferToBlur, createOfferWithRapid, createOpenseaOffer, getOffers, getOffersFromBlur, getOffersWithRapid } from "./functions/offer";
import config from "./config";
import { getAccessToken } from "./utils/accessToken";
import { getFeeRate } from './utils/fees';
import { formatEther, parseEther } from 'ethers/lib/utils';
import { getBlurPoolBalance } from './utils/blurPoolBalance';
import { getWETHBalance } from './utils/wethBalance';

const result: CollectionData[] = [];

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
  .option('o', {
    alias: 'bidOpensea',
    describe: 'bid on opensea',
    type: 'boolean',
    demandOption: false,
    default: false
  })
  .option('c', {
    alias: 'enableCounterBid',
    describe: 'enable counter bidding',
    type: 'boolean',
    demandOption: false,
    default: false
  })
  .argv;

const { private_key, api_key, bidBlur, bidOpensea, enableCounterBid } = options;
config.apiKey = api_key;

// Variables //
const factor = 0.01;
const profit_base = 0.05;
const balance_max = 3.1 * 10 ^ 18;
const balance_max_opensea = 2 * 10 ^ 18;
const balance_max_blur = 4.2;
const balance_factor = 0.00;
const balance_ratio = 0.75;


const profit_max_base = 0.81;
const profit_max_factor = 1.3;
const profit_max_ceil = 0.91;

const outbid_margin = 1.07;
const outbid_margin_max = 20;

const loop = 1 // minutes
class Mutex {
  private locked: boolean;
  private waitQueue: (() => void)[];

  constructor() {
    this.locked = false;
    this.waitQueue = [];
  }
  async acquire() {
    if (this.locked) {
      await new Promise<void>((resolve) => this.waitQueue.push(resolve));
    }
    this.locked = true;
  }
  release() {
    if (this.waitQueue.length > 0) {
      const resolve = this.waitQueue.shift();
      resolve?.();
    } else {
      this.locked = false;
    }
  }
}


async function main() {
  try {
    const result: CollectionData[] = await new Promise((resolve, reject) => {
      const result: CollectionData[] = [];
      fs.createReadStream(path.join(__dirname, `../${options.list}`))
        .pipe(csvParser())
        .on('data', async (data: CollectionData) => {
          result.push(data);
        })
        .on('end', async () => {
          console.table(result);
          resolve(result);
        })
    });

    await Promise.all(
      result.map(async (item) => {
        let isScheduledLoopRunning = false;
        let isCounterBidLoopRunning = false
        let mutex = new Mutex();
        while (true) {
          await mutex.acquire();
          if (!isCounterBidLoopRunning) {
            isScheduledLoopRunning = true;
            await processScheduleBid(item);
            isScheduledLoopRunning = false;
          }
          mutex.release();
          await delay(loop * 1000);
          while (true && bidOpensea && enableCounterBid) {
            await mutex.acquire();
            if (!isScheduledLoopRunning) {
              isCounterBidLoopRunning = true
              await processCounterBid(item)
              isCounterBidLoopRunning = false
            }
            mutex.release();
            await delay(loop * 1000);
          }
        }
      })
    )
  } catch (err) {
    console.error('Error in main function:', err);
  }
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main()
async function processScheduleBid(collectionSlug: CollectionData) {

  try {
    if (!collectionSlug || !collectionSlug.names) {
      throw new Error('Invalid collection data');
    }

    const collectionData = await getCollectionInfoWithRapidApi(
      collectionSlug.names
    );

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

    const account = getAccount(private_key);
    const wallet = await getWallet(account);
    const balance = await getWETHBalance(private_key) ?? 0

    const accessToken = await getAccessToken(
      'https://nfttools.pro/blur',
      private_key
    );

    const blurFloorPrice = await getFloorPriceFromBlur(
      collectionData.primary_asset_contracts_address,
      accessToken,
      wallet.address
    );

    const floorPrice = getFloorPrice(
      collectionData.floor_price,
      blurFloorPrice ?? 0
    );


    if (floorPrice === undefined) {
      console.log('Can not get floor price');
      return;
    }

    const blurBalance = await getBlurPoolBalance(private_key);

    if (bidBlur) {
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
        blurFloorPrice ?? 0,
        accessToken
      );
    }

    if (bidOpensea) {
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
        floorPrice
      );
    }
  } catch (err) {
    console.error('Error processing collection:', collectionSlug, err);
  }
}

async function processCounterBid(collectionSlug: CollectionData) {
  try {
    console.log('-------------------------------------------------------');
    console.log(`RUNNING COUNTER BID LOOP FOR ${collectionSlug.names}`);
    console.log('-------------------------------------------------------');

    const maxBid = Number(parseEther(collectionSlug.max_bid as string))
    const slug = collectionSlug.names

    const jsonRpcProvider = new providers.JsonRpcProvider(config.network);
    const wallet = new Wallet(private_key, jsonRpcProvider);
    let highestOffer;

    const offers = await getOffers(collectionSlug.names);

    const ethOffers = offers?.offers.filter(
      (o) => o.protocol_data.parameters.offer[0].token === config.weth
    );
    if (ethOffers && ethOffers.length > 0) {
      highestOffer = ethOffers[0] as Offer
    }

    const balance = await getWETHBalance(private_key)

    const address = wallet.address
    const offerer = highestOffer?.protocol_data.parameters.offerer
    const offerAmount = highestOffer?.protocol_data.parameters.offer[0].endAmount as string
    const counterBidMargin = Number(parseEther(collectionSlug.counter_bid_margin as string))
    const counterBidAmount = BigInt(+offerAmount + counterBidMargin)

    const collectionData = await getCollectionInfo(
      collectionSlug.names
    );

    if (!collectionData) {
      console.log("Can't find such collection");
      return;
    }

    const floorPrice = await getFloorPriceFromOpensea(slug)

    const royalty_fee = 0;

    let totalCreatorFee: any = 0;
    if (collectionData.enforceCreatorFee == false) {
      totalCreatorFee = 0;
    } else {
      totalCreatorFee = Object.values(collectionData.creator_fees)[0]
    }

    let profit = calculateProfit(
      floorPrice,
      collectionSlug.factor,
      balance as number,
      balance_max
    );

    let offerPrice = calculateOfferPrice(
      floorPrice,
      totalCreatorFee,
      royalty_fee,
      profit
    );

    if (offerPrice === 0) {
      console.log('The offer price counts as zero. Skip this collection');
      return;
    }

    if (highestOffer && offerAmount && offerer?.toLowerCase() === address.toLowerCase()) {
      console.log("HERE!!!");

      return
    }
    else if (highestOffer && offerAmount && offerer?.toLowerCase() !== address.toLowerCase() && counterBidAmount <= maxBid) {
      console.log("trigger outbid");
      let collectionOffer = BigInt(offerPrice);
      collectionOffer = BigInt(counterBidAmount);

      await createOpenseaOffer(address, private_key, slug, collectionOffer, totalCreatorFee)
    }
  } catch (err) {
    console.error('Error processing collection:', collectionSlug, err);
  }
}

function getFloorPrice(collectionFloorPrice: number, blurFloorPrice: number) {
  if (!collectionFloorPrice && blurFloorPrice) {
    return blurFloorPrice;
  } else if (collectionFloorPrice && !blurFloorPrice) {
    return collectionFloorPrice;
  } else if (collectionFloorPrice && blurFloorPrice) {
    return collectionFloorPrice >= blurFloorPrice
      ? blurFloorPrice
      : collectionFloorPrice;
  }
  return undefined;
}

async function bidOnMarketplace(
  marketplace: 'Blur' | 'Opensea',
  collectionSlug: CollectionData,
  collectionData: ICollection | undefined,
  totalCreatorFee: number,
  wallet: any,
  balance: number,
  balance_max: number,
  floorPrice: number,
  blurFloorPrice?: number,
  accessToken?: string
) {
  try {
    if (!collectionSlug || !collectionSlug.names) {
      throw new Error('Invalid collection data');
    }

    if (marketplace === 'Blur' && !blurFloorPrice) {
      console.log("Floor price doesn't exist on blur. skip blur bid");
      return;
    }

    let profit = calculateProfit(
      floorPrice,
      collectionSlug.factor,
      balance,
      balance_max
    );

    let profit_max =
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

    const royalty_fee = 0;
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

    if (offerPrice === 0) {
      console.log('The offer price counts as zero. Skip this collection');
      return;
    }

    if (marketplace !== 'Blur' && balance <= offerPrice) {
      console.log(
        `${marketplace}: Collection`,
        collectionSlug.names,
        'not enough funds in wallet: Balance =',
        Math.round(balance * 10 ** -18 * 10000) / 10000,
        `Offer =`,
        Math.round(offerPrice * 10 ** -18 * 10000) / 10000
      );
      return;
    }

    let offers, highestOffer;
    let quantity = 1
    if (marketplace === 'Blur' && accessToken) {
      offers = await getOffersFromBlur(
        collectionData.primary_asset_contracts_address,
        accessToken,
        wallet.address
      );
      highestOffer = offers?.priceLevels?.[0]
    } else {
      offers = await getOffersWithRapid(collectionSlug.names);
      const consideration = offers?.offers[0].protocol_data.parameters.consideration.find((item) => item.itemType === 4)
      const startAmount = Number(consideration?.startAmount)
      const endAmount = Number(consideration?.endAmount)
      quantity = Math.max(startAmount, endAmount)
      const ethOffers = offers?.offers.filter(
        (o) => o.protocol_data.parameters.offer[0].token === config.weth
      );
      if (ethOffers && ethOffers.length > 0) {
        highestOffer = ethOffers[0] as Offer
      }
    }

    if (marketplace === 'Blur' && highestOffer && highestOffer.price) {
      const highestOfferWei = +(highestOffer.price) * 10 ** 18;
      highestOffer = BigInt(highestOfferWei.toString()) as bigint
    }

    await placeBid(
      marketplace,
      collectionSlug,
      collectionData,
      wallet,
      private_key,
      accessToken,
      highestOffer as bigint | Offer,
      offerPrice,
      floorPrice,
      profit,
      quantity
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

  const profit =
    factor * floorPrice +
    parseFloat(collectionFactor) +
    profit_base + profit_balance;

  return profit
}

function calculateOfferPrice(floorPrice: number, totalCreatorFee: number, royalty_fee: number, profit: number) {

  return Math.round(
    floorPrice * ((100 - totalCreatorFee / 100 - royalty_fee) / 100) * profit * 10 ** 18
  );
}
function adjustOffer(offer: bigint) {
  console.log({ offer, line: 350 });

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
  marketplace: 'Blur' | 'Opensea',
  collectionSlug: CollectionData,
  collectionData: ICollection | undefined,
  wallet: ethers.Wallet,
  private_key: string,
  accessToken: string | undefined,
  highestOffer: Offer | bigint,
  offerPrice: number | string,
  floorPrice: number,
  profit: number,
  quantity: number
) {

  let hightOfferPrice;

  if (marketplace === 'Opensea') {
    // get opensea highest offer
    // if it's not ours outbid by a small margin

    const offer = highestOffer as Offer
    const jsonRpcProvider = new providers.JsonRpcProvider(config.network);
    const wallet = new Wallet(private_key, jsonRpcProvider);

    hightOfferPrice =
      offer && offer.price && offer.price.value
        ? (Number(formatEther(offer?.price?.value ?? '0')) / quantity).toString()
        : (Number(offer?.protocol_data?.parameters?.offer[0]?.endAmount) / quantity).toString()

    let collectionOffer = BigInt(offerPrice);

    let collectionOfferInEth = formatEther(collectionOffer);
    let highOfferInEth = hightOfferPrice ?? '0';

    if (Number(collectionOfferInEth) > Number(highOfferInEth) || highOfferInEth === undefined) {
      if (
        Number(collectionOfferInEth) >
        Number(highOfferInEth) * outbid_margin_max
      ) {
        console.log(
          `${marketplace}: Collection`,
          collectionSlug.names,
          'offer is higher than the highest offer by more than',
          (outbid_margin_max * 100 - 100),
          `%.`
        );
        return;
      }

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
          collectionData.creator_fees,
          collectionData.enforceCreatorFee,
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

      console.log({ highOfferInEth, collectionOfferInEth, line: 474 });
      collectionOffer = BigInt(Math.floor(+offerPrice * outbid_margin));
      collectionOfferInEth = formatEther(collectionOffer);
      highOfferInEth = hightOfferPrice?.toString() as string;

      console.log(
        `${marketplace}: Collection`,
        collectionSlug.names,
        `current highest offer:`,
        (highOfferInEth),
        `Higher then bot offer:`,
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
          collectionData.creator_fees,
          collectionData.enforceCreatorFee,
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

      const highestOffer = parseEther(hightOfferPrice).toBigInt()
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
        `Lower then bot offer:`,
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
          collectionData.creator_fees,
          collectionData.enforceCreatorFee,
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
    collectionOffer = adjustOfferByTickPrice(collectionOffer);
    hightOfferPrice = highestOffer as bigint;

    let collectionOfferInEth = formatEther(collectionOffer);
    let highOfferInEth: any = (Number(hightOfferPrice) / 10 ** 18).toString() ?? '0';

    if ((Number(offerPrice) / 10 ** 18) > Number(hightOfferPrice) / 10 ** 18 || highestOffer === undefined) {
      if (
        Number(collectionOfferInEth) >
        Number(highOfferInEth) * outbid_margin_max
      ) {
        console.log(
          `${marketplace}: Collection`,
          collectionSlug.names,
          'offer is higher than the highest offer by more than',
          (outbid_margin_max * 100 - 100),
          `%.`
        );
        return;
      }

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
          collectionData.creator_fees,
          collectionData.enforceCreatorFee,
          collectionSlug.blur_traits,
          collectionSlug.opensea_traits,
        );
      } catch (err) {
        console.error(
          `Error creating offer for collection ${collectionSlug.names} on ${marketplace}:`,
          err
        );
      }
    } else if (Number(hightOfferPrice) / 10 ** 18 > (+offerPrice / 10 ** 18) * outbid_margin) {
      collectionOffer = BigInt(Math.floor(+offerPrice * outbid_margin));
      collectionOfferInEth = adjustOffer(collectionOffer).toString();
      highOfferInEth = hightOfferPrice

      if (marketplace === 'Blur') {
        collectionOffer = adjustOfferByTickPrice(collectionOffer);
      }

      if (marketplace === 'Blur') {
        console.log(
          `${marketplace}: Collection`,
          collectionSlug.names,
          `current highest offer:`,
          Number(highOfferInEth) / 10 ** 18,
          `Higher then bot offer:`,
          Number(collectionOfferInEth) / 10 ** 18,
          `including ${outbid_margin} outbid margin.`
        );
      } else {
        console.log(
          `${marketplace}: Collection`,
          collectionSlug.names,
          `current highest offer:`,
          Number(highOfferInEth) / 10 ** 18,
          `Higher then bot offer:`,
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
          collectionData.creator_fees,
          collectionData.enforceCreatorFee,
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
        Math.floor(parseInt((hightOfferPrice?.toString() as string)) + 100000000000000)
      );
      collectionOfferInEth = adjustOffer(collectionOffer).toString();
      highOfferInEth = hightOfferPrice

      collectionOffer = adjustOfferByTickPrice(collectionOffer);

      console.log(
        `${marketplace}: Collection`,
        collectionSlug.names,
        `current highest offer:`,
        Number(highOfferInEth) / 10 ** 18,
        `Lower then bot offer:`,
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
          collectionData.creator_fees,
          collectionData.enforceCreatorFee,
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
  marketplace: 'Blur' | 'Opensea',
  walletAddress: string,
  privateKey: string,
  accessToken: string | undefined,
  collectionSlug: string,
  collectionAddress: string,
  collectionOffer: bigint,
  creatorFees: IFee,
  enforceCreatorFee: boolean = false,
  blur_traits?: string,
  opensea_traits?: string
) {

  console.log({
    marketplace,
    walletAddress,

    accessToken,
    collectionSlug,
    collectionAddress,
    collectionOffer,
    creatorFees,
    enforceCreatorFee
  });

  try {
    if (marketplace === 'Blur') {
      if (!accessToken) return
      await createOfferToBlur(
        walletAddress,
        privateKey,
        accessToken,
        collectionAddress,
        collectionOffer,
        blur_traits
      );
    } else {
      await createOfferWithRapid(
        walletAddress,
        privateKey,
        collectionSlug,
        collectionOffer,
        creatorFees,
        enforceCreatorFee,
        opensea_traits
      );
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
  max_bid?: string
  counter_bid_margin?: string
}

interface ICollection {
  address: any;
  floor_price: any;
  primary_asset_contracts_address: any;
  creator_fees: {
    [x: number]: number;
  } | {
    null: number;
  };
  schema: any;
  enforceCreatorFee: boolean;
}

interface IFee {
  [key: string]: number
}