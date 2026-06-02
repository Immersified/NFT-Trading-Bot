#!/usr/bin/env node

require('dotenv').config();
const {
  getCollectionInfoWithRapidApi,
  getFloorPriceFromBlur
} = require('./functions/collection');
const { getWallet, getBalance, getAccount } = require('./functions/wallet');
const {
  getOffersWithRapid,
  createOfferWithRapid,
  getOffersFromBlur,
  createOfferToBlur
} = require('./functions/offer');
const yargs = require('yargs');
const config = require('./config');
const fs = require('fs');
const csvParser = require('csv-parser');
const path = require('path');
const { utils, BigNumber } = require('ethers');
const { getAccessToken } = require('./functions/accessToken');
const { parseEther, formatEther } = require('ethers/lib/utils');
const { getBlurPoolBalance } = require('./utils/blurPoolBalance');
const { getFeeRate } = require('./functions/list');

const result = [];

const options = yargs
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
  }).argv;

const { private_key, api_key, bidBlur, bidOpensea } = options;
config.apiKey = api_key;

// Variables //
const factor = 0.06;
const profit_base = 0.25;
const balance_max = 3.1 * 10 ** 18;
const balance_max_opensea = 2 * 10 ** 18;
const balance_max_blur = 4.2;
const balance_factor = 0.065;

const profit_max_base = 0.81;
const profit_max_factor = 1.3;
const profit_max_ceil = 0.91;

const outbid_margin = 1.07;
const outbid_margin_max = 20;

fs.createReadStream(path.join(__dirname, `../${options.list}`))
  .pipe(csvParser())
  .on('data', async (data) => {
    result.push(data);
  })
  .on('end', async () => {
    console.log(result);
    for (let i = 0; i < result.length; i++) {
      try {
        await listenToEventsWithRapid(result[i]);
      } catch (err) {
        console.error('Error processing collection:', result[i], err);
      }
    }
  });

async function listenToEventsWithRapid(collectionSlug) {
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

    let totalCreatorFee = 0;
    if (collectionData.enforceCreatorFee == false) {
      totalCreatorFee = 0;
    } else {
      totalCreatorFee = collectionData.creator_fees;
    }

    const account = getAccount(private_key);
    const wallet = await getWallet(account);
    const balance = await getBalance(wallet);

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
      blurFloorPrice
    );

    if (floorPrice === undefined) {
      console.log('Can not get floor price');
      return;
    }

    const blurBalance = await getBlurPoolBalance(private_key);

    if (bidBlur) {
      await bidOnMarketplace(
        'Blur',
        collectionSlug,
        collectionData,
        totalCreatorFee,
        wallet,
        blurBalance,
        balance_max_blur,
        floorPrice,
        blurFloorPrice,
        accessToken
      );
    }

    if (bidOpensea) {
      console.log(
        '--------------------------------------------------------------------'
      );
      console.log('Bidding on Marketplace OpenSea'.toUpperCase());
      console.log(
        '--------------------------------------------------------------------'
      );

      console.log({ totalCreatorFee });
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

function getFloorPrice(collectionFloorPrice, blurFloorPrice) {
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
  marketplace,
  collectionSlug,
  collectionData,
  totalCreatorFee,
  wallet,
  balance,
  balance_max,
  floorPrice,
  blurFloorPrice,
  accessToken
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
    if (marketplace === 'Blur') {
      offers = await getOffersFromBlur(
        collectionData.primary_asset_contracts_address,
        accessToken,
        wallet.address
      );
      highestOffer = offers?.priceLevels?.[0];
    } else {
      offers = await getOffersWithRapid(collectionSlug.names);
      const ethOffers = offers.offers.filter(
        (o) => o.protocol_data.parameters.offer[0].token === config.weth
      );
      highestOffer = ethOffers[0];
    }

    if (marketplace === 'Blur') {
      console.log({ highestOffer, line: 210 });
      const highestOfferWei =
        highestOffer && +highestOffer?.price
          ? +highestOffer.price * 10 ** 18
          : 0;
      highestOffer = BigInt(highestOfferWei.toString());
    }
    await placeBid(
      marketplace,
      collectionSlug,
      collectionData,
      wallet,
      private_key,
      accessToken,
      highestOffer,
      offerPrice,
      floorPrice,
      profit,
      totalCreatorFee
    );
  } catch (err) {
    console.error(
      `Error on ${marketplace} Bid for collection ${
        collectionSlug?.names ?? 'unknown'
      }:`,
      err
    );
  }
}

function calculateProfit(floorPrice, collectionFactor, balance, balance_max) {
  return (
    factor * floorPrice +
    profit_base +
    parseFloat(collectionFactor) +
    (balance / balance_max) * balance_factor
  );
}

function calculateOfferPrice(floorPrice, totalCreatorFee, royalty_fee, profit) {
  return Math.round(
    floorPrice * ((100 - 0 / 100 - royalty_fee) / 100) * profit * 10 ** 18
  );
}

function adjustOffer(offer) {
  const offerInEth = utils.formatEther(offer);
  const offerInEthRounded = (Math.round(offerInEth * 1e4) / 1e4).toString();
  return BigNumber.from(utils.parseEther(offerInEthRounded).toString());
}

function adjustOfferByTickPrice(offer) {
  const tickPrice = BigInt(10 ** 16);
  if (offer > 2 * 10 ** 17) {
    return offer + tickPrice - (offer % tickPrice);
  } else {
    return offer - (offer % tickPrice);
  }
}

async function placeBid(
  marketplace,
  collectionSlug,
  collectionData,
  wallet,
  private_key,
  accessToken,
  highestOffer,
  offerPrice,
  floorPrice,
  profit,
  totalCreatorFee
) {
  let hightOfferPrice;

  if (marketplace === 'Opensea') {
    hightOfferPrice =
      highestOffer && highestOffer.price && highestOffer.price.value
        ? formatEther(highestOffer?.price?.value ?? '0')
        : highestOffer?.protocol_data?.parameters?.offer[0]?.endAmount;
  } else if (marketplace === 'Blur') {
    hightOfferPrice = highestOffer;
  }

  let collectionOffer = BigInt(offerPrice);

  let collectionOfferInEth = formatEther(collectionOffer);
  let highOfferInEth = hightOfferPrice ?? '0';

  if (marketplace === 'Blur') {
    collectionOffer = adjustOfferByTickPrice(collectionOffer);
  }

  if (offerPrice > hightOfferPrice || highestOffer === undefined) {
    if (
      Number(collectionOfferInEth) >
      Number(highOfferInEth) * outbid_margin_max
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
      await createOffer(
        marketplace,
        wallet.address,
        private_key,
        accessToken,
        collectionSlug.names,
        collectionData.primary_asset_contracts_address,
        collectionOffer,
        collectionData.creator_fees
      );
    } catch (err) {
      console.error(
        `Error creating offer for collection ${collectionSlug.names} on ${marketplace}:`,
        err
      );
    }
  } else if (hightOfferPrice > offerPrice * outbid_margin) {
    collectionOffer = BigInt(Math.floor(offerPrice * outbid_margin));
    collectionOfferInEth = adjustOffer(collectionOffer);
    highOfferInEth = hightOfferPrice;

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
      await createOffer(
        marketplace,
        wallet.address,
        private_key,
        accessToken,
        collectionSlug.names,
        collectionData.primary_asset_contracts_address,
        collectionOffer,
        totalCreatorFee
      );
    } catch (err) {
      console.error(
        `Error creating offer for collection ${collectionSlug.names} on ${marketplace}:`,
        err
      );
    }
  } else {
    collectionOffer = BigInt(
      Math.floor(parseInt(Number(hightOfferPrice)) + 100000000000000)
    );
    collectionOfferInEth = adjustOffer(collectionOffer);
    highOfferInEth = adjustOffer(hightOfferPrice);

    if (marketplace === 'Blur') {
      collectionOffer = adjustOfferByTickPrice(collectionOffer);
    }

    if (marketplace === 'Blur') {
      console.log(
        `${marketplace}: Collection`,
        collectionSlug.names,
        `current highest offer:`,
        Number(highOfferInEth) / 10 ** 18,
        `Lower then bot offer:`,
        Number(collectionOfferInEth) / 10 ** 18,
        `partly including ${outbid_margin} outbid margin.`
      );
    } else {
      console.log(
        `${marketplace}: Collection`,
        collectionSlug.names,
        `current highest offer:`,
        Number(highOfferInEth) / 10 ** 18,
        `Lower then bot offer:`,
        Number(collectionOfferInEth) / 10 ** 18,
        `partly including ${outbid_margin} outbid margin.`
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
      await createOffer(
        marketplace,
        wallet.address,
        private_key,
        accessToken,
        collectionSlug.names,
        collectionData.primary_asset_contracts_address,
        collectionOffer,
        totalCreatorFee
      );
    } catch (err) {
      console.error(
        `Error creating offer for collection ${collectionSlug.names} on ${marketplace}:`,
        err
      );
    }
  }
}

async function createOffer(
  marketplace,
  walletAddress,
  privateKey,
  accessToken,
  collectionSlug,
  collectionAddress,
  collectionOffer,
  creatorFees
) {
  console.log({
    marketplace,
    walletAddress,
    privateKey,
    accessToken,
    collectionSlug,
    collectionAddress,
    collectionOffer,
    creatorFees
  });

  try {
    if (marketplace === 'Blur') {
      await createOfferToBlur(
        walletAddress,
        privateKey,
        accessToken,
        collectionAddress,
        collectionOffer
      );
    } else {
      await createOfferWithRapid(
        walletAddress,
        privateKey,
        collectionSlug,
        collectionOffer,
        creatorFees
      );
    }
  } catch (err) {
    console.error(
      `Error creating offer on ${marketplace} for collection ${collectionSlug}:`,
      err
    );
  }
}
