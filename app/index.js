#!/usr/bin/env node

require('dotenv').config();
const {
  getCollectionInfo,
  getCollectionInfoWithRapidApi,
  getFloorPriceFromBlur
} = require('./functions/collection');
const { getWallet, getBalance, getAccount } = require('./functions/wallet');
const {
  getOffers,
  getOffersWithRapid,
  createOffer,
  createOfferWithRapid,
  getOffersFromBlur,
  createOfferToBlur
} = require('./functions/offer');
const yargs = require('yargs');
const config = require('./config');
const fs = require('fs');
const csvParser = require('csv-parser');
const path = require('path');
const { utils, BigNumber, Wallet, providers } = require('ethers');
const { getAccessToken } = require('./functions/accessToken');
const { parseEther } = require('ethers/lib/utils');
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
  .option('r', {
    alias: 'useRapid',
    describe: 'use Rapid API',
    type: 'boolean',
    demandOption: false,
    default: false
  })
  .option('b', {
    alias: 'bidBlur',
    describe: 'bid on blur',
    type: 'boolean',
    demandOption: false,
    default: false
  }).argv;

const { private_key, api_key, useRapid, bidBlur } = options;
config.apiKey = api_key;

// Variables //
const factor = 0.01;
const profit_base = 0.3;
const balance_max_opensea = 0.02 * 10 ** 18;
const balance_max_blur = 0.015;
const balance_factor = 0.06;
const balance_ratio = 0.75;

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
    for (i = 0; i < result.length; i++) {
      try {
        await (useRapid ? listenToEventsWithRapid : listenToEvents)(result[i]);
      } catch (err) {
        console.log(err?.response?.data ?? err);
      }
    }
  });

const listenToEvents = async (collectionSlug) => {
  const collectionData = await getCollectionInfo(collectionSlug.names); // owner info

  const creator_fees = collectionData.creator_fees; // Payout Address for collection fee
  let totalCreatorFee = 0;

  // Get the total creator fees for the collection
  for (address in creator_fees) {
    totalCreatorFee += creator_fees[address];
  }

  const account = getAccount(private_key); // get private key to account
  const wallet = await getWallet(account); // get wallet
  const balance = await getBalance(wallet); // get wallet balance

  let profit_balance =
    (balance / (balance_max * balance_ratio)) * balance_factor;
  if (profit_balance > balance_factor) {
    profit_balance = balance_factor;
  }

  let profit =
    factor * collectionData.floor_price +
    parseFloat(collectionSlug.factor) +
    profit_base +
    profit_balance;

  let profit_max =
    profit_max_base +
    profit_max_factor * parseFloat(collectionSlug.factor) +
    ((balance / balance_max) * balance_factor) / 2;

  if (profit_max > profit_max_ceil) {
    profit_max = profit_max_ceil;
  }

  if (profit > profit_max) {
    profit = profit_max;
  }

  console.log('Floor Price Factor: ', factor * collectionData.floor_price);
  console.log('Collection Factor: ', parseFloat(collectionSlug.factor));
  console.log('Profit Balance: ', profit_balance);
  console.log('Profit max: ', profit_max);
  console.log('Profit: ', profit);
  console.log('Difference Raw: ', profit_max - profit);

  let floorPrice = collectionData.floor_price;

  const royalty_fee = 0;

  if (isNaN(profit) || profit <= 0) {
    console.log(
      `profit: ${profit} is less than or equal to zero for collection: ${collectionSlug.names}. Skip this collection`
    );
    return;
  }

  const offerPrice = Math.round(
    collectionData.floor_price *
      ((100 - totalCreatorFee / 100 - royalty_fee) / 100) *
      profit *
      10 ** 18
  );

  if (offerPrice == 0) {
    console.log('The offer price counts as zero. Skip this collection');
    return;
  }

  if (balance <= offerPrice) {
    console.log(
      'Collection',
      collectionSlug.names,
      'not enough funds in wallet: Balance =',
      Math.round(balance * 10 ** -18 * 10000) / 10000,
      `Offer =`,
      Math.round(offerPrice * 10 ** -18 * 10000) / 10000
    );
  } else {
    const offers = await getOffers(collectionSlug.names);

    const ethOffers = offers.offers.filter(
      (o) => o.protocol_data.parameters.offer[0].token === config.weth
    );

    let highestOffer = ethOffers[0];

    if (
      offerPrice > highestOffer?.protocol_data.parameters.offer[0].endAmount ||
      highestOffer === undefined
    ) {
      let collectionOffer = BigInt(offerPrice);

      // convert offer price to 4dp in wei
      const offerInEth = utils.formatEther(collectionOffer);
      const collectionOfferInEth = (
        Math.round(offerInEth * 1e4) / 1e4
      ).toString();
      collectionOffer = BigInt(
        utils.parseEther(collectionOfferInEth).toString()
      );

      // convert highest offer to 4dp in wei
      const highestOfferInEth = utils.formatEther(
        BigInt(highestOffer?.protocol_data.parameters.offer[0].endAmount ?? '0')
      );
      const highOfferInEth = (
        Math.round(highestOfferInEth * 1e4) / 1e4
      ).toString();
      highestOffer = BigNumber.from(
        utils.parseEther(highOfferInEth).toString()
      );

      if (
        collectionOffer > highestOffer.mul(outbid_margin_max + 100).div(100)
      ) {
        console.log(
          'Collection',
          collectionSlug.names,
          'offer is higher than the highest offer by more than',
          outbid_margin_max,
          `%.`
        );
        return;
      }

      console.log(
        'Collection',
        collectionSlug.names,
        'current highest bidder: ',
        collectionOfferInEth
      );

      if (Number(floorPrice) < Number(collectionOffer) / 10 ** 18) {
        console.log(
          `floor price is greater than collection offer for collection: ${collectionSlug.names}. Skipping`
        );
        return;
      }

      await createOffer(
        wallet.address,
        private_key,
        collectionSlug.names,
        collectionOffer,
        creator_fees
      );
      return;
    }

    if (
      highestOffer.protocol_data.parameters.offer[0].endAmount >
      offerPrice * outbid_margin
    ) {
      let collectionOffer = BigInt(Math.floor(offerPrice * outbid_margin));

      // convert offer price to 4dp in wei
      const offerInEth = utils.formatEther(collectionOffer);
      const collectionOfferInEth = (
        Math.round(offerInEth * 1e4) / 1e4
      ).toString();
      collectionOffer = BigInt(
        utils.parseEther(collectionOfferInEth).toString()
      );

      // convert highest offer to 4dp in wei
      const highestOfferInEth = utils.formatEther(
        BigInt(highestOffer?.protocol_data.parameters.offer[0].endAmount)
      );
      const highOfferInEth = (
        Math.round(highestOfferInEth * 1e4) / 1e4
      ).toString();
      highestOffer = BigNumber.from(
        utils.parseEther(highOfferInEth).toString()
      );

      console.log(
        `Collection`,
        collectionSlug.names,
        `current highest offer:`,
        highestOfferInEth,
        `Higher then bot offer:`,
        collectionOfferInEth,
        `including ${outbid_margin} outbid margin.`
      );

      if (balance < collectionOffer) {
        console.log(
          'Collection',
          collectionSlug.names,
          'not enough funds in wallet: Balance =',
          Math.round(balance * 10 ** -18 * 10000) / 10000,
          `Offer =`,
          collectionOfferInEth
        );
        return;
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

      await createOffer(
        wallet.address,
        private_key,
        collectionSlug.names,
        collectionOffer,
        creator_fees
      );
      return;
    } else {
      let collectionOffer = BigInt(
        Math.floor(
          parseInt(highestOffer.protocol_data.parameters.offer[0].endAmount) +
            100000000000000
        )
      );

      // convert offer price to 4dp in wei
      const offerInEth = utils.formatEther(collectionOffer);
      const collectionOfferInEth = (
        Math.round(offerInEth * 1e4) / 1e4
      ).toString();
      collectionOffer = BigInt(
        utils.parseEther(collectionOfferInEth).toString()
      );

      // convert highest offer to 4dp in wei
      const highestOfferInEth = utils.formatEther(
        BigInt(highestOffer?.protocol_data.parameters.offer[0].endAmount)
      );
      const highOfferInEth = (
        Math.round(highestOfferInEth * 1e4) / 1e4
      ).toString();
      highestOffer = BigNumber.from(
        utils.parseEther(highOfferInEth).toString()
      );

      console.log(
        `Collection`,
        collectionSlug.names,
        `current highest offer:`,
        highestOfferInEth,
        `Lower then bot offer:`,
        collectionOfferInEth,
        `partly including ${outbid_margin} outbid margin.`
      );

      if (balance < collectionOffer) {
        console.log(
          'Collection',
          collectionSlug.names,
          'not enough funds in wallet: Balance =',
          Math.round(balance * 10 ** -18 * 10000) / 10000,
          `Offer =`,
          collectionOfferInEth
        );
        return;
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

      await createOffer(
        wallet.address,
        private_key,
        collectionSlug.names,
        collectionOffer,
        creator_fees
      );
      return;
    }
  }
};

const listenToEventsWithRapid = async (collectionSlug) => {
  const collectionData = await getCollectionInfoWithRapidApi(
    collectionSlug.names
  ); // owner info

  if (!collectionData) {
    console.log("Can't find such collection");
    return;
  }

  if (collectionData.enforceCreatorFee == false) {
    creator_fees = 0;
  } else {
    creator_fees = collectionData.creator_fees;
  }

  //const creator_fees = collectionData.creator_fees; // Payout Address for collection fee

  // Get the total creator fees for the collection
  //for (address in creator_fees) {
  //  totalCreatorFee += creator_fees[address];
  //}

  const account = getAccount(private_key); // get private key to account
  const wallet = await getWallet(account); // get wallet

  const balance = await getBalance(wallet); // get wallet balance

  const blurBalance = await getBlurPoolBalance(private_key);

  console.log({ blurBalance });

  const accessToken = await getAccessToken(
    'https://nfttools.pro/blur',
    private_key
  );

  const blurFloorPrice = await getFloorPriceFromBlur(
    collectionData.primary_asset_contracts_address,
    accessToken,
    wallet.address
  );

  const feeRate = await getFeeRate(
    collectionData.primary_asset_contracts_address,
    wallet.address,
    accessToken
  );

  let floorPrice = collectionData.floor_price;
  if (!collectionData.floor_price && blurFloorPrice) {
    floorPrice = blurFloorPrice;
  } else if (collectionData.floor_price && !blurFloorPrice) {
    floorPrice = collectionData.floor_price;
  } else if (collectionData.floor_price && blurFloorPrice) {
    if (collectionData.floor_price >= blurFloorPrice) {
      floorPrice = blurFloorPrice;
    } else {
      floorPrice = collectionData.floor_price;
    }
  } else {
    console.log('Can not get floor price');
    return;
  }

  /// make blur bid
  if (bidBlur) {
    console.log('Bidding on Marketplace Blur');
    try {
      if (!blurFloorPrice) {
        console.log("Floor price doesn't exist on blur. skip blur bid");
      } else {
        let profit_balance =
          (blurBalance / (balance_max_blur * balance_ratio)) * balance_factor;
        if (profit_balance > balance_factor) {
          profit_balance = balance_factor;
        }

        let profit =
          factor * floorPrice +
          profit_base +
          parseFloat(collectionSlug.factor) +
          profit_balance;

        let profit_max =
          profit_max_base +
          profit_max_factor * parseFloat(collectionSlug.factor) +
          ((blurBalance / balance_max_blur) * balance_factor) / 2;

        if (profit_max > profit_max_ceil) {
          profit_max = profit_max_ceil;
        }

        if (profit > profit_max) {
          profit = profit_max;
        }

        console.log(
          'Floor Price Factor: ',
          factor * collectionData.floor_price
        );
        console.log('Collection Factor: ', parseFloat(collectionSlug.factor));
        console.log('Profit Balance:', profit_balance);
        console.log('Profit max: ', profit_max);
        console.log('Profit: ', profit);
        console.log('Difference Raw: ', profit_max - profit);
        console.log('Creator Fee Blur: ', feeRate);

        const royalty_fee = 0;

        if (isNaN(profit) || profit <= 0) {
          console.log(
            `profit: ${profit} is less than or equal to zero for collection: ${collectionSlug.names}. Skip this collection`
          );
          return;
        }

        let offerPrice = Math.round(
          floorPrice *
            ((100 - feeRate / 100 - royalty_fee) / 100) *
            profit *
            10 ** 18
        );

        if (offerPrice == 0) {
          console.log('The offer price counts as zero. Skip this collection');
          return;
        }

        let offers = await getOffersFromBlur(
          collectionData.primary_asset_contracts_address,
          accessToken,
          wallet.address
        );
        let highestOffer = offers?.priceLevels?.[0];
        const hightOfferPrice = parseEther(
          highestOffer?.price ?? '0'
        ).toBigInt();

        console.log(hightOfferPrice, offerPrice);
        // console.log(typeof(highestOffer?.protocol_data.parameters.offer[0].endAmount));

        if (offerPrice > hightOfferPrice || highestOffer === undefined) {
          let collectionOffer = BigInt(offerPrice);

          // convert offer price to 4dp in wei
          const offerInEth = utils.formatEther(collectionOffer);
          const collectionOfferInEth = (
            Math.round(offerInEth * 1e4) / 1e4
          ).toString();
          collectionOffer = BigInt(
            utils.parseEther(collectionOfferInEth).toString()
          );

          // convert highest offer to 4dp in wei
          const highestOfferInEth = utils.formatEther(
            BigInt(hightOfferPrice ?? '0')
          );
          const highOfferInEth = (
            Math.round(highestOfferInEth * 1e4) / 1e4
          ).toString();
          highestOffer = BigNumber.from(
            utils.parseEther(highOfferInEth).toString()
          );

          // adjust offer by tick price, if offer is bigger than 0,2, ceil or floor
          const tickPrice = BigInt(10 ** 16);
          if (collectionOffer > 2 * 10 ** 17) {
            collectionOffer =
              collectionOffer + tickPrice - (collectionOffer % tickPrice);
          } else {
            collectionOffer = collectionOffer - (collectionOffer % tickPrice);
          }

          if (
            collectionOffer > highestOffer.mul(outbid_margin_max + 100).div(100)
          ) {
            console.log(
              'Blur: Collection',
              collectionSlug.names,
              'offer is higher than the highest offer by more than',
              outbid_margin_max,
              `%.`
            );
          } else {
            console.log(
              'Blur: Collection',
              collectionSlug.names,
              'current highest bidder: ',
              collectionOfferInEth
            );

            console.log({
              collectionOffer: Number(collectionOffer) / 10 ** 18,
              blurFloorPrice
            });

            if (isNaN(profit) || profit <= 0) {
              console.log(
                `profit is less than or equal to zero for collection: ${collectionSlug.names}. Skip this collection`
              );
              return;
            }

            if (Number(blurFloorPrice) < Number(collectionOffer) / 10 ** 18) {
              console.log(
                `floor price is greater than collection offer for collection: ${collectionSlug.names}. Skipping`
              );
              return;
            }

            const data = await createOfferToBlur(
              wallet.address,
              private_key,
              accessToken,
              collectionData.primary_asset_contracts_address,
              collectionOffer
            );

            if (data) {
              console.log(
                '------------------------------------------------------------------'
              );
              console.log('SUCCESSFULLY SUBMITTED BID TO BLUR');
              console.log(
                '------------------------------------------------------------------'
              );
            }
          }
        } else if (hightOfferPrice > offerPrice * outbid_margin) {
          let collectionOffer = BigInt(Math.floor(offerPrice * outbid_margin));

          // convert offer price to 4dp in wei
          const offerInEth = utils.formatEther(collectionOffer);
          const collectionOfferInEth = (
            Math.round(offerInEth * 1e4) / 1e4
          ).toString();
          collectionOffer = BigInt(
            utils.parseEther(collectionOfferInEth).toString()
          );

          // convert highest offer to 4dp in wei
          const highestOfferInEth = utils.formatEther(BigInt(hightOfferPrice));
          const highOfferInEth = (
            Math.round(highestOfferInEth * 1e4) / 1e4
          ).toString();
          highestOffer = BigNumber.from(
            utils.parseEther(highOfferInEth).toString()
          );

          // adjust offer by tick price, if offer is bigger than 0,2, ceil or floor
          const tickPrice = BigInt(10 ** 16);
          if (collectionOffer > 2 * 10 ** 17) {
            collectionOffer =
              collectionOffer + tickPrice - (collectionOffer % tickPrice);
          } else {
            collectionOffer = collectionOffer - (collectionOffer % tickPrice);
          }

          console.log(
            `Blur: Collection`,
            collectionSlug.names,
            `current highest offer:`,
            highestOfferInEth,
            `Higher then bot offer:`,
            collectionOfferInEth,
            `including ${outbid_margin} outbid margin.`
          );

          if (isNaN(profit) || profit <= 0) {
            console.log(
              `profit is less than or equal to zero for collection: ${collectionSlug.names}. Skip this collection`
            );
            return;
          }
          if (Number(blurFloorPrice) < Number(collectionOffer) / 10 ** 18) {
            console.log(
              `floor price is greater than collection offer for collection: ${collectionSlug.names}. Skipping`
            );
            return;
          }

          const data = await createOfferToBlur(
            wallet.address,
            private_key,
            accessToken,
            collectionData.primary_asset_contracts_address,
            collectionOffer
          );

          if (data) {
            console.log(
              '------------------------------------------------------------------'
            );
            console.log('SUCCESSFULLY SUBMITTED BID TO BLUR');
            console.log(
              '------------------------------------------------------------------'
            );
          }
        } else {
          let collectionOffer = BigInt(
            Math.floor(parseInt(hightOfferPrice) + 100000000000000)
          );

          // convert offer price to 4dp in wei
          const offerInEth = utils.formatEther(collectionOffer);
          const collectionOfferInEth = (
            Math.round(offerInEth * 1e4) / 1e4
          ).toString();
          collectionOffer = BigInt(
            utils.parseEther(collectionOfferInEth).toString()
          );

          // convert highest offer to 4dp in wei
          const highestOfferInEth = utils.formatEther(BigInt(hightOfferPrice));
          const highOfferInEth = (
            Math.round(highestOfferInEth * 1e4) / 1e4
          ).toString();
          highestOffer = BigNumber.from(
            utils.parseEther(highOfferInEth).toString()
          );

          // adjust offer by tick price, if offer is bigger than 0,2, ceil or floor
          const tickPrice = BigInt(10 ** 16);
          if (collectionOffer > 2 * 10 ** 17) {
            collectionOffer =
              collectionOffer + tickPrice - (collectionOffer % tickPrice);
          } else {
            collectionOffer = collectionOffer - (collectionOffer % tickPrice);
          }

          console.log(
            `Blur: Collection`,
            collectionSlug.names,
            `current highest offer:`,
            highestOfferInEth,
            `Lower then bot offer:`,
            collectionOfferInEth,
            `partly including ${outbid_margin} outbid margin.`
          );
          if (isNaN(profit) || profit <= 0) {
            console.log(
              `profit is less than or equal to zero for collection: ${collectionSlug.names}. Skip this collection`
            );
            return;
          }

          if (Number(blurFloorPrice) < Number(collectionOffer) / 10 ** 18) {
            console.log(
              `floor price is greater than collection offer for collection: ${collectionSlug.names}. Skipping`
            );
            return;
          }

          const data = await createOfferToBlur(
            wallet.address,
            private_key,
            accessToken,
            collectionData.primary_asset_contracts_address,
            collectionOffer
          );

          if (data) {
            console.log(
              '------------------------------------------------------------------'
            );
            console.log('SUCCESSFULLY SUBMITTED BID TO BLUR');
            console.log(
              '------------------------------------------------------------------'
            );
          }
        }
      }
    } catch (err) {
      console.log('Error on Blur Bid', err?.response?.data?.message);
    }
  }

  // make opensea bid
  console.log('Bidding on Marketplace OpenSea');
  try {
    let profit_balance =
      (balance / (balance_max_opensea * balance_ratio)) * balance_factor;
    if (profit_balance > balance_factor) {
      profit_balance = balance_factor;
    }

    profit =
      factor * floorPrice +
      profit_base +
      parseFloat(collectionSlug.factor) +
      profit_balance;

    let profit_max =
      profit_max_base +
      profit_max_factor * parseFloat(collectionSlug.factor) +
      ((balance / balance_max_opensea) * balance_factor) / 2;

    if (profit_max > profit_max_ceil) {
      profit_max = profit_max_ceil;
    }

    if (profit > profit_max) {
      profit = profit_max;
    }

    console.log('Floor Price Factor: ', factor * collectionData.floor_price);
    console.log('Collection Factor: ', parseFloat(collectionSlug.factor));
    console.log('Profit Balance: ', profit_balance);
    console.log('Profit max: ', profit_max);
    console.log('Profit: ', profit);
    console.log('Difference Raw: ', profit_max - profit);
    console.log('Creator Fee OpenSea: ', creator_fees);

    const royalty_fee = 0;

    if (isNaN(profit) || profit <= 0) {
      console.log(
        `Profit ${profit} is less than or equal to zero for collection: ${collectionSlug.names}. Skip this collection`
      );
      return;
    }

    offerPrice = Math.round(
      floorPrice *
        ((100 - creator_fees / 100 - royalty_fee) / 100) *
        profit *
        10 ** 18
    );

    if (offerPrice == 0) {
      console.log('The offer price counts as zero. Skip this collection');
      return;
    }

    if (balance <= offerPrice) {
      console.log(
        'Opensea: Collection',
        collectionSlug.names,
        'not enough funds in wallet: Balance =',
        Math.round(balance * 10 ** -18 * 10000) / 10000,
        `Offer =`,
        Math.round(offerPrice * 10 ** -18 * 10000) / 10000
      );
      return;
    }

    offers = await getOffersWithRapid(collectionSlug.names);

    const ethOffers = offers.offers.filter(
      (o) => o.protocol_data.parameters.offer[0].token === config.weth
    );

    highestOffer = ethOffers[0];

    // console.log(typeof(highestOffer?.protocol_data.parameters.offer[0].endAmount));

    if (
      offerPrice > highestOffer?.protocol_data.parameters.offer[0].endAmount ||
      highestOffer === undefined
    ) {
      let collectionOffer = BigInt(offerPrice);

      // convert offer price to 4dp in wei
      const offerInEth = utils.formatEther(collectionOffer);
      const collectionOfferInEth = (
        Math.round(offerInEth * 1e4) / 1e4
      ).toString();
      collectionOffer = BigInt(
        utils.parseEther(collectionOfferInEth).toString()
      );

      // convert highest offer to 4dp in wei
      const highestOfferInEth = utils.formatEther(
        BigInt(highestOffer?.protocol_data.parameters.offer[0].endAmount ?? '0')
      );
      const highOfferInEth = (
        Math.round(highestOfferInEth * 1e4) / 1e4
      ).toString();
      highestOffer = BigNumber.from(
        utils.parseEther(highOfferInEth).toString()
      );

      if (
        collectionOffer > highestOffer.mul(outbid_margin_max + 100).div(100)
      ) {
        console.log(
          'Opensea: Collection',
          collectionSlug.names,
          'offer is higher than the highest offer by more than',
          outbid_margin_max,
          `%.`
        );
        return;
      }

      console.log(
        'Opensea: Collection',
        collectionSlug.names,
        'current highest bidder: ',
        collectionOfferInEth
      );

      console.log({
        collectionOffer: Number(collectionOffer) / 10 ** 18,
        floorPrice: Number(floorPrice)
      });

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
      await createOfferWithRapid(
        wallet.address,
        private_key,
        collectionSlug.names,
        collectionOffer,
        creator_fees
      );
      return;
    }

    if (
      highestOffer.protocol_data.parameters.offer[0].endAmount >
      offerPrice * outbid_margin
    ) {
      let collectionOffer = BigInt(Math.floor(offerPrice * outbid_margin));

      // convert offer price to 4dp in wei
      const offerInEth = utils.formatEther(collectionOffer);
      const collectionOfferInEth = (
        Math.round(offerInEth * 1e4) / 1e4
      ).toString();
      collectionOffer = BigInt(
        utils.parseEther(collectionOfferInEth).toString()
      );

      // convert highest offer to 4dp in wei
      const highestOfferInEth = utils.formatEther(
        BigInt(highestOffer?.protocol_data.parameters.offer[0].endAmount)
      );
      const highOfferInEth = (
        Math.round(highestOfferInEth * 1e4) / 1e4
      ).toString();
      highestOffer = BigNumber.from(
        utils.parseEther(highOfferInEth).toString()
      );

      console.log(
        `Opensea: Collection`,
        collectionSlug.names,
        `current highest offer:`,
        highestOfferInEth,
        `Higher then bot offer:`,
        collectionOfferInEth,
        `including ${outbid_margin} outbid margin.`
      );

      if (balance < collectionOffer) {
        console.log(
          'Opensea: Collection',
          collectionSlug.names,
          'not enough funds in wallet: Balance =',
          Math.round(balance * 10 ** -18 * 10000) / 10000,
          `Offer =`,
          collectionOfferInEth
        );
        return;
      }

      console.log({
        collectionOffer: Number(collectionOffer) / 10 ** 18,
        floorPrice: Number(floorPrice)
      });

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

      await createOfferWithRapid(
        wallet.address,
        private_key,
        collectionSlug.names,
        collectionOffer,
        creator_fees
      );
      return;
    } else {
      let collectionOffer = BigInt(
        Math.floor(
          parseInt(highestOffer.protocol_data.parameters.offer[0].endAmount) +
            100000000000000
        )
      );

      // convert offer price to 4dp in wei
      const offerInEth = utils.formatEther(collectionOffer);
      const collectionOfferInEth = (
        Math.round(offerInEth * 1e4) / 1e4
      ).toString();
      collectionOffer = BigInt(
        utils.parseEther(collectionOfferInEth).toString()
      );

      // convert highest offer to 4dp in wei
      const highestOfferInEth = utils.formatEther(
        BigInt(highestOffer?.protocol_data.parameters.offer[0].endAmount)
      );
      const highOfferInEth = (
        Math.round(highestOfferInEth * 1e4) / 1e4
      ).toString();
      highestOffer = BigNumber.from(
        utils.parseEther(highOfferInEth).toString()
      );

      console.log(
        `Opensea: Collection`,
        collectionSlug.names,
        `current highest offer:`,
        highestOfferInEth,
        `Lower then bot offer:`,
        collectionOfferInEth,
        `partly including ${outbid_margin} outbid margin.`
      );

      if (balance < collectionOffer) {
        console.log(
          'Opensea: Collection',
          collectionSlug.names,
          'not enough funds in wallet: Balance =',
          Math.round(balance * 10 ** -18 * 10000) / 10000,
          `Offer =`,
          collectionOfferInEth
        );
        return;
      }

      console.log({
        collectionOffer: Number(collectionOffer) / 10 ** 18,
        floorPrice: Number(floorPrice)
      });

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

      await createOfferWithRapid(
        wallet.address,
        private_key,
        collectionSlug.names,
        collectionOffer,
        creator_fees
      );
      return;
    }
  } catch (err) {
    console.log(err);
  }
};
