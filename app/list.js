const yargs = require('yargs');
const config = require('./config');
const { ethers } = require('ethers');
const { providers, Wallet, Contract } = require('ethers');
const {
  getAssetsFromOpensea,
  getAssetListedStateFromOpensea
} = require('./functions/assets');
const {
  getCollectionInfoWithRapidApi,
  getListingsFromBlur,
  getFloorPriceFromOpensea,
  getFloorPriceFromBlur
} = require('./functions/collection');
const { getAccessToken } = require('./functions/accessToken');
const { getBalance } = require('./functions/wallet');
const { formatUnits } = require('ethers/lib/utils');
const {
  listToOpenseaWithRapid,
  listToBlurWithRapid,
  getFeeRate
} = require('./functions/list');
const { listOnOpenseaPro } = require('./proList');

/// expire time - constant 60 min = 60 * 60 * 1000
const expireTime = 30 * 60 * 1000;
const profitBase = 8;
const balanceMax = 6.5;
const factor = 0.04;
const multiply = 1.5;
const profitmin_day = 0.3; // -30 % per day
const profitmin = 0.2; // -20% max

const options = yargs
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
  .option('b', {
    alias: 'useBlur',
    describe: 'list to blur',
    type: 'boolean',
    demandOption: false,
    default: false
  })
  .option('o', {
    alias: 'useOpensea',
    describe: 'List to opensea',
    type: 'boolean',
    demandOption: false,
    default: false
  }).argv;

const { private_key, api_key, useBlur, useOpensea } = options;
config.apiKey = api_key;

const main = async () => {
  const provider = providers.getDefaultProvider('mainnet');
  const wallet = new Wallet(private_key, provider);

  const balanceInWei = await getBalance(wallet);
  const balance = parseFloat(formatUnits(balanceInWei));

  const accessToken = await getAccessToken(
    'https://nfttools.pro/blur',
    private_key
  );

  const assets = await getAssetsFromOpensea(wallet.address, accessToken);
  for (const asset of assets) {
    if (asset.lastSale.price == undefined) {
      console.log('Seems like spam NFT. skips this NFT');
      continue;
    }

    const collectionInfo = await getCollectionInfoWithRapidApi(
      asset.collectionSlug
    );
    const holdingTime = Date.now() - new Date(asset.lastSale.date).getTime();

    const profit_deduct = profitmin_day * (holdingTime / (60 * 60 * 24 * 1000));
    let profitMinSell =
      profitBase / 100 +
      (balance / balanceMax) * (factor / 100) -
      profit_deduct;
    if (profitMinSell < -profitmin) {
      profitMinSell = -profitmin;
    }
    if (holdingTime / (60 * 60 * 24 * 1000) > 7) {
      profitMinSell = -profitmin / 2;
    }

    let creatorFee = 0;

    console.log({
      enforceCreatorFee: collectionInfo.enforceCreatorFee
    });

    if (collectionInfo.enforceCreatorFee) {
      for (const feeValue of Object.values(collectionInfo.creator_fees)) {
        creatorFee += feeValue;
      }
    }

    /// calculate floor price
    // let floorPrice = asset.supportsWyvern ? collectionInfo.floor_price : -1;

    let floorPrice = await getFloorPriceFromOpensea(asset.collectionSlug);

    const listingPrices = await getListingsFromBlur(
      collectionInfo.primary_asset_contracts_address,
      accessToken,
      wallet.address
    );

    for (const listing of listingPrices) {
      if (asset.supportsWyvern == listing.isSuspicious) {
        continue;
      }
    }

    // const blurFloorPrice = await getFloorPriceFromBlur(
    //   collectionInfo.primary_asset_contracts_address,
    //   accessToken,
    //   wallet.address
    // );

    console.log('Floor price:', floorPrice);
    console.log('Last sale: ', asset.lastSale.price);
    console.log('Creator Fee: ', creatorFee);
    console.log('Profit_Min_Sell: ', profitMinSell);
    console.log('Holding Time: ', holdingTime);

    // if(floorPrice > blurFloorPrice) {
    //   floorPrice = blurFloorPrice;
    // }

    /// opensea list
    if (useOpensea) {
      if (!asset.supportsWyvern) {
        console.log('Trading is not enabled for this item on opensea.');
        continue;
      }
      console.log(
        `Listing item ${asset.collectionSlug} #${asset.tokenId} on OPENSEA`
      );
      /// calculate listing price
      const floorPriceN =
        floorPrice * (multiply - ((multiply - 1) * holdingTime) / expireTime);

      let profit;
      let openseaProProfit;

      let sellPrice;
      let openseaSellPrice;
      if (floorPriceN > floorPrice) {
        profit =
          (floorPriceN * (100 - 2.5 - creatorFee / 100)) / 100 -
          asset.lastSale.price;
        openseaProProfit =
          (floorPriceN * (100 - 0.5 - creatorFee / 100)) / 100 -
          asset.lastSale.price;
        sellPrice = floorPrice * (1 + profit);
        openseaSellPrice = floorPrice * (1 + openseaProProfit);
      } else {
        profit =
          (floorPrice * (100 - 2.5 - creatorFee / 100)) / 100 -
          asset.lastSale.price;
        openseaProProfit =
          (floorPrice * (100 - 0.5 - creatorFee / 100)) / 100 -
          asset.lastSale.price;
        sellPrice = floorPrice - 0.0001;
        openseaSellPrice = floorPrice - 0.0001;
      }

      if (profit / asset.lastSale.price < profitMinSell) {
        sellPrice = 0;

        for (const listing of listingPrices) {
          profit =
            (listing.price * (100 - 2.5 - creatorFee / 100)) / 100 -
            asset.lastSale.price;

          if (profit / asset.lastSale.price > profitMinSell) {
            sellPrice = listing.price - 0.0001;
            break;
          }
        }
      }

      if (openseaProProfit / asset.lastSale.price < profitMinSell) {
        openseaSellPrice = 0;

        for (const listing of listingPrices) {
          openseaProProfit =
            (listing.price * (100 - 0.5 - creatorFee / 100)) / 100 -
            asset.lastSale.price;

          if (openseaProProfit / asset.lastSale.price > profitMinSell) {
            openseaSellPrice = listing.price - 0.0001;
            break;
          }
        }
      }

      if (!sellPrice) {
        sellPrice =
          asset.lastSale.price *
          (1 + profitMinSell + (2.5 + creatorFee / 100) / 100);
      }

      if (!openseaSellPrice) {
        openseaSellPrice =
          asset.lastSale.price *
          (1 + profitMinSell + (0.5 + creatorFee / 100) / 100);
      }

      // threshold sellPrice
      sellPrice = Math.floor(sellPrice * 10000) / 10000;
      openseaSellPrice = Math.floor(openseaSellPrice * 10000) / 10000;
      console.log('Listing item with', sellPrice, 'eth on opensea');
      console.log(
        'Listing on opensea pro item with',
        openseaSellPrice,
        'eth on opensea'
      );
      const jsonProvider = new ethers.providers.JsonRpcProvider(config.network);
      const ethersSigner = new ethers.Wallet(private_key, jsonProvider);

      console.log({ lastSale: asset.lastSale.price, sellPrice });

      if (sellPrice < asset.lastSale.price * (1 - (profitmin + 0.01))) {
        console.log(
          `listing price is lower then the Profitmin price. skip collection: ${asset.collectionSlug}`
        );

        continue;
      }

      if (isNaN(floorPrice) || floorPrice <= 0) {
        console.log(
          `FloorPrice: ${floorPrice} is less than or equal to zero for collection: ${asset.collectionSlug}. Skip this collection`
        );
        return;
      }

      if (isNaN(asset.lastSale.price) || asset.lastSale.price <= 0) {
        console.log(
          `Last Sale Price: ${asset.lastSale.price} is less than or equal to zero for collection: ${asset.collectionSlug}. Skip this collection`
        );
        return;
      }

      try {
        const success = await listOnOpenseaPro(
          collectionInfo.primary_asset_contracts_address.toLowerCase(),
          asset.tokenId.toString(),
          openseaSellPrice,
          ethersSigner
        );
        if (!success) {
          await listToOpenseaWithRapid(
            collectionInfo.primary_asset_contracts_address,
            asset.tokenId,
            sellPrice,
            wallet,
            collectionInfo.creator_fees,
            collectionInfo.schema
          );
        }
      } catch (error) {
        console.log(error);
        continue;
      }
    }

    // blur list
    if (useBlur && collectionInfo.schema !== 'ERC1155' && listingPrices) {
      console.log(
        `Listing item ${asset.collectionSlug} #${asset.tokenId} on BLUR`
      );
      let blurFloorPrice = await getFloorPriceFromBlur(
        collectionInfo.primary_asset_contracts_address,
        accessToken,
        wallet.address
      );

      for (const listing of listingPrices) {
        if (blurFloorPrice < 0 || blurFloorPrice > listing.price) {
          if (asset.supportsWyvern == listing.isSuspicious) {
            continue;
          }

          blurFloorPrice = listing.price;
        }
      }

      /// calculate listing price
      const floorPriceN =
        +blurFloorPrice *
        (multiply - ((multiply - 1) * holdingTime) / expireTime);

      const feeRate = await getFeeRate(
        asset.contractAddress,
        wallet.address,
        accessToken
      );

      let profit;
      let sellPrice;

      if (floorPriceN > blurFloorPrice) {
        profit =
          (floorPriceN * (100 - feeRate / 100)) / 100 - asset.lastSale.price;
        sellPrice = blurFloorPrice * (1 + profit);
      } else {
        profit =
          (blurFloorPrice * (100 - feeRate / 100)) / 100 - asset.lastSale.price;
        sellPrice = blurFloorPrice - 0.0001;
      }

      if (profit / asset.lastSale.price < profitMinSell) {
        sellPrice = 0;

        for (const listing of listingPrices) {
          profit =
            (listing.price * (100 - feeRate / 100)) / 100 -
            asset.lastSale.price;

          if (profit / asset.lastSale.price > profitMinSell) {
            sellPrice = listing.price - 0.0001;
            break;
          }
        }
      }

      if (!sellPrice) {
        sellPrice =
          asset.lastSale.price * (1 + profitMinSell + feeRate / 10000);
      }

      // threshold sellPrice
      sellPrice = Math.floor(sellPrice * 10000) / 10000;
      console.log('Floor Price Blur: ', blurFloorPrice);
      console.log('Listing item with', sellPrice, 'eth on blur');
      console.log('Last sale price blur: ', asset.lastSale.price);
      console.log('Creator fee blur: ', feeRate);
      console.log('Profit min blur: ', profitMinSell);

      console.log({ blur: sellPrice, lastSale: asset.lastSale.price });

      if (sellPrice < asset.lastSale.price * (1 - (profitmin + 0.01))) {
        console.log(
          `listing price is lower then the Profitmin price. skip collection: ${asset.collectionSlug}`
        );

        continue;
      }

      if (isNaN(blurFloorPrice) || blurFloorPrice <= 0) {
        console.log(
          `FloorPrice: ${blurFloorPrice} is less than or equal to zero for collection: ${asset.collectionSlug}. Skip this collection`
        );
        return;
      }

      if (isNaN(asset.lastSale.price) || asset.lastSale.price <= 0) {
        console.log(
          `Last Sale Price: ${asset.lastSale.price} is less than or equal to zero for collection: ${asset.collectionSlug}. Skip this collection`
        );
        return;
      }

      await listToBlurWithRapid(
        collectionInfo.primary_asset_contracts_address,
        asset.tokenId,
        sellPrice,
        wallet,
        accessToken,
        feeRate
      );
    }
  }
};

main()
  .then()
  .catch((err) => console.dir(err?.response?.data ?? err));
