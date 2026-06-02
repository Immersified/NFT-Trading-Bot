import WebSocket from "ws";
import { bidOnOpensea, createOfferWithRapid } from "./functions/offer";
import { ethers, Wallet } from "ethers";
import path from "path"
import yargs from "yargs";
import config from "./config";
import csvParser from "csv-parser";
import fs from "fs"
import PQueue from "p-queue";
import limiter, { RATE_LIMIT } from "./bottleneck";
import { getCollectionInfoWithRapidApi } from "./functions/collection";
import { IFee } from "./functions/list";
import axiosInstance from "./axios/axiosInstance";
import { PrismaClient } from "@prisma/client";

const ALCHEMY_API_KEY = config.ALCHEMY_API_KEY
const prisma = new PrismaClient()

const OPENSEA_API_KEY = config.openseaApiKey
const OPENSEA_WS_URL = `wss://stream.openseabeta.com/socket/websocket?token=${OPENSEA_API_KEY}`;
export const SEAPORT_CONTRACT_ADDRESS = '0x0000000000000068f116a894984e2db1123eb395';
const provider = new ethers.providers.JsonRpcProvider(`https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`, {
    name: "homestead",
    chainId: 1
  });
interface IData {
  names: string;
  factor: number;
}

const currentTopOffers: {
  [key: string]: {
    amount: number;
    owner: string;
  }
} = {}

const queue = new PQueue({
  concurrency: 1.5 * RATE_LIMIT
});

const ownWallets = ['0xb429279d1e233163afbe85ecf0e3c48522eccb06', '0x594283cee2123331ba2dcf2d603396def44b5de0', '0x4fb1136a1122b2312089b0a7ba2111866a6f7b59', '0X9ADCFFFF1DEF95F7E58B587C1A6B06AC6A7AE1E5'].map((wallet) => wallet.toLowerCase())

const result: IData[] = []
const ws = new WebSocket(OPENSEA_WS_URL);


const options: any = yargs
  .usage(
    'Usage: -p <private_key> -a <api_key>'
  )
  .option('p', {
    alias: 'private_key',
    describe: 'Wallet Private Key',
    type: 'string',
    demandOption: true
  })
  .option('l', {
    alias: 'list',
    describe: 'collection list',
    type: 'string',
    demandOption: true
  })
  .option('a', {
    alias: 'api_key',
    describe: 'OpenSea API Key',
    type: 'string',
    demandOption: false
  })
  .option('y', {
    alias: 'opensea_api_key',
    describe: 'OpenSea API Key',
    type: 'string',
    demandOption: false
  }).argv

const { private_key, api_key, opensea_api_key } = options;
config.apiKey = api_key;
config.xApiKey = opensea_api_key;

const processedOrderHashes = new Set<string>();

const startTime = Date.now();
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


async function main() {
  try {
    // Clear previous results to avoid duplicates
    result.length = 0;

    // Use a promise to ensure CSV is fully loaded before processing
    await new Promise<void>((resolve) => {
      fs.createReadStream(path.join(__dirname, `../${options.list}`))
        .pipe(csvParser({
          escape: "\",",
          mapHeaders: ({ header }) => header.trim(),
          mapValues: ({ value }) => value.trim()
        }))
        .on('data', (data: IData) => {
          result.push(data);
        })
        .on('end', () => {
          console.table(result);

          if (lastModifiedTimeOverOneHour) {
            console.log('\x1b[31m%s\x1b[0m', '--------------------------------------------------------------------------------------------------------------');
            console.log('\x1b[31m%s\x1b[0m', '🛑 The bidding collection file has not been updated for over an hour. Bidding has been stopped 🛑'.toUpperCase());
            console.log('\x1b[31m%s\x1b[0m', '--------------------------------------------------------------------------------------------------------------');
          }

          const endTime = Date.now();
          const elapsedTime = endTime - startTime;
          console.log(`Processing Time: ${elapsedTime / 1000} seconds`);
          resolve();
        });
    });

    // Get collections from database that are already stored
    const collectionsInDb = await prisma.collectionDetails.findMany({
      select: {
        slug: true
      }
    });

    const collectionsToRemove = collectionsInDb.filter((c: any) => !result.some(r => r.names === c.slug)).map((c: any) => c.slug)

    // Log collections that need to be removed
    if (collectionsToRemove.length > 0) {
      console.log('\x1b[31m--------------------------------------------------------------------------\x1b[0m');
      console.log('\x1b[31mCOLLECTIONS TO BE REMOVED:\x1b[0m');
      console.table(collectionsToRemove)
      console.log('\x1b[31m--------------------------------------------------------------------------\x1b[0m');
    }

    const offersToRemove = await prisma.offer.findMany({
      where: {
        collection: {
          in: collectionsToRemove
        }
      }
    })

    if (collectionsToRemove.length > 0) {
      console.log(`Removing ${collectionsToRemove.length} collections...`);
      await prisma.collectionDetails.deleteMany({
        where: {
          slug: { in: collectionsToRemove }
        }
      })

      for (const collection of collectionsToRemove) {
        console.log(`Unsubscribing from collection: ${collection}`);
        const openseaMessage = {
          topic: `collection:${collection}`,
          event: "phx_leave",
          payload: {},
          ref: 0,
        }
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(openseaMessage));
        }
      }
    }

    if (offersToRemove.length > 0) {
      console.log(`Removing ${offersToRemove.length} offers...`);

      for (const offer of offersToRemove) {
        await cancelOrder(offer.orderHash, SEAPORT_CONTRACT_ADDRESS, private_key as string, opensea_api_key)
        await prisma.offer.delete({
          where: {
            id: offer.id
          }
        })
      }

      await prisma.offer.deleteMany({
        where: {
          collection: { in: collectionsToRemove }
        }
      })
    }

    // Only process collections if file is recent enough
    if (!lastModifiedTimeOverOneHour && result.length > 0) {
      console.log(`Processing ${result.length} collections...`);

      queue.addAll(result.map(collection => async () => await processSchedule(collection)))
    }
  } catch (error) {
    console.error("Error in main function:", error);
  }
}

main().then(() => subscribeToCollection())

setInterval(() => {
  main().then(() => subscribeToCollection())
}, 60000);


async function processSchedule(collection: IData) {
  try {
    const { names, factor } = collection;

    if (ws.readyState === WebSocket.OPEN) {
      const openseaMessage = {
        topic: `collection:${names}`,
        event: "phx_join",
        payload: {},
        ref: 0,
      };

      ws.send(JSON.stringify(openseaMessage));
    }

    const wallet = new ethers.Wallet(private_key as string)
    const address = wallet.address
    ownWallets.push(address.toLocaleLowerCase())
    const floorPrice = await getFloorPrice(names, opensea_api_key)
    const royalty_fee = 0.5

    if (!floorPrice) {
      console.log('\x1b[31m--------------------------------------------------------------------------\x1b[0m');
      console.log(`\x1b[31mNO FLOOR PRICE FOUND FOR ${names.toUpperCase()}, SKIPPING...\x1b[0m`);
      console.log('\x1b[31m--------------------------------------------------------------------------\x1b[0m');
      return
    }

    let collectionDetails: {
      id: number;
      slug: string;
      creator_fees: string | null;
      enforceCreatorFee: boolean | null;
      contractAddress: string;
    } | null = null

    collectionDetails = await prisma.collectionDetails.findFirst({
      where: {
        slug: names
      }
    })

    if (!collectionDetails) {
      const collectionData = await getCollectionInfoWithRapidApi(
        names,
        opensea_api_key
      );
      collectionDetails = await prisma.collectionDetails.create({
        data: {
          slug: names,
          creator_fees: JSON.stringify(collectionData?.creator_fees),
          enforceCreatorFee: collectionData?.enforceCreatorFee as boolean,
          contractAddress: collectionData?.primary_asset_contracts_address as string
        }
      })
    }

    const creator_fees = JSON.parse(collectionDetails?.creator_fees as string)
    const enforceCreatorFee = collectionDetails?.enforceCreatorFee as boolean
    const contractAddress = collectionDetails?.contractAddress as string
    const totalCreatorFee = Object.values(creator_fees).length > 0 && enforceCreatorFee ? Number(Object.values(creator_fees)[0]) : 0

    const maxPrice = floorPrice * (1 - ((totalCreatorFee / 100) + royalty_fee) / 100) * factor

    const offer = await prisma.offer.findFirst({
      where: {
        collection: names
      },
      orderBy: {
        offerPrice: 'desc'
      }
    })
    const currentPrice = Number(offer?.offerPrice) / 1e18 || 0

    if (currentPrice > maxPrice) {
      console.log('\x1b[31m--------------------------------------------------------------------------\x1b[0m');
      console.log(`\x1b[31mOUR BID PRICE ${currentPrice} WETH FOR ${names} EXCEEDS MAX PRICE ${maxPrice} WETH\x1b[0m`);
      console.log('\x1b[31m--------------------------------------------------------------------------\x1b[0m');

      await cancelOrder(offer?.orderHash as string, SEAPORT_CONTRACT_ADDRESS, private_key as string, opensea_api_key)
      await prisma.offer.delete({
        where: {
          id: offer?.id
        }
      })

      return
    }

    let bidPrice = 0

    const [topOffers, secondTopOffers] = await fetchOpenseaOffers(names, contractAddress, opensea_api_key);
    console.log({ collection: names, topOffers, secondTopOffers });
    const topOfferWallet = topOffers.owner

    currentTopOffers[names] = {
      amount: topOffers.amount,
      owner: topOffers.owner
    }
    const topOfferAmount = topOffers.amount
    const topOfferAmountEth = Number(topOfferAmount) / 1e18
    const outbidMargin = calculateOutbidMargin(topOfferAmountEth)

    const secondTopOfferAmount = secondTopOffers.amount
    if (ownWallets.includes(topOfferWallet.toLowerCase())) {
      console.log('\x1b[33m--------------------------------------------------------------------------\x1b[0m');
      console.log(`\x1b[33mWE (${topOfferWallet.toUpperCase()}) OWN THE TOP OFFER ${topOfferAmount / 1e18} WETH FOR ${names.toUpperCase()}, SKIPPING...\x1b[0m`);
      console.log('\x1b[33m--------------------------------------------------------------------------\x1b[0m');

      const spread = (topOfferAmount - secondTopOfferAmount) / 1e18

      if (spread > outbidMargin) {
        console.log('\x1b[33m--------------------------------------------------------------------------\x1b[0m');
        console.log(`\x1b[33mOUR OFFER ${topOfferAmount / 1e18} WETH IS ${spread} WETH GREATER THAN THE SECONDTOPOFFERAMOUNT ${secondTopOfferAmount / 1e18} WETH, CANCELLING AND REBIDDING FOR ${names.toUpperCase()}...\x1b[0m`);
        console.log('\x1b[33m--------------------------------------------------------------------------\x1b[0m');
        const offers = await prisma.offer.findMany({
          where: {
            collection: names
          }
        })
        for (const offer of offers) {
          await cancelOrder(offer.orderHash, SEAPORT_CONTRACT_ADDRESS, private_key as string, opensea_api_key)
          await prisma.offer.delete({
            where: {
              id: offer.id
            }
          })
        }
        bidPrice = secondTopOfferAmount + (outbidMargin * 1e18)
      } else {
        return;
      }
    } else {
      bidPrice = topOfferAmount + (outbidMargin * 1e18)
    }

    if ((bidPrice / 1e18) > maxPrice) {
      console.log('\x1b[31m--------------------------------------------------------------------------\x1b[0m');
      console.log(`\x1b[31mOUR BID PRICE ${bidPrice / 1e18} WETH FOR ${names} EXCEEDS MAX PRICE ${maxPrice} WETH\x1b[0m`);
      console.log('\x1b[31m--------------------------------------------------------------------------\x1b[0m');
      return;
    }

    const collectionOffer = BigInt(bidPrice)
    let orderHash;
    if (opensea_api_key) {
      orderHash = await bidOnOpensea(
        address,
        private_key as string,
        names,
        collectionOffer,
        creator_fees,
        enforceCreatorFee,
        opensea_api_key
      );
    } else {
      orderHash = await createOfferWithRapid(
        address,
        private_key as string,
        names,
        collectionOffer,
        creator_fees,
        enforceCreatorFee,
      );
    }

    const offers = await prisma.offer.findMany({
      where: {
        collection: names
      }
    })

    for (const offer of offers) {
      await cancelOrder(offer.orderHash, SEAPORT_CONTRACT_ADDRESS, private_key as string, opensea_api_key)
      await prisma.offer.delete({
        where: {
          id: offer.id
        }
      })
    }
    await prisma.offer.create({
      data: {
        orderHash,
        collection: names,
        offerPrice: collectionOffer.toString(),
        expirationTime: new Date(Date.now() + 1000 * 900)
      }
    })
    console.log('\x1b[32m--------------------------------------------------------------------------\x1b[0m');
    console.log(`\x1b[32mOUTBIDDING ${topOfferWallet.toUpperCase()} BID OF ${topOfferAmount / 1e18} WETH FOR ${bidPrice / 1e18} WETH ON ${names.toUpperCase()}\x1b[0m`);
    console.log('\x1b[32m--------------------------------------------------------------------------\x1b[0m');
  } catch (error) {
    console.error(error);
  }
}

async function subscribeToCollection() {
  try {
    const { private_key, x_api_key } = options;
    config.xApiKey = x_api_key;

    // get collections to remove here
    const collectionsInDb = await prisma.collectionDetails.findMany({
      select: {
        slug: true
      }
    });

    const collectionsToRemove = collectionsInDb.filter((c: any) => !result.some(r => r.names === c.slug)).map((c: any) => c.slug)

    ws.addEventListener("open", () => {
      console.log("WebSocket connected");

      // First handle unsubscribes
      if (collectionsToRemove.length > 0) {
        for (const collection of collectionsToRemove) {
          console.log(`Unsubscribing from collection: ${collection}`);
          const openseaMessage = {
            topic: `collection:${collection}`,
            event: "phx_leave",
            payload: {},
            ref: 0,
          }
          ws.send(JSON.stringify(openseaMessage));
        }
      }

      // Then handle subscriptions
      for (const collection of result) {
        const openseaMessage = {
          topic: `collection:${collection.names}`,
          event: "phx_join",
          payload: {},
          ref: 0,
        };

        ws.send(JSON.stringify(openseaMessage));
      }
    });

    const heartbeatInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        const heartbeatMessage = {
          topic: "phoenix",
          event: "heartbeat",
          payload: {},
          ref: 0,
        };
        ws.send(JSON.stringify(heartbeatMessage));
      }

    }, 30000);

    ws.addEventListener("message", async (data) => {
      if (!data || !data.data) return;
      const message = JSON.parse(data.data.toString());
      if (message.event === "collection_offer") {
        console.log(JSON.stringify(message));

        const incomingOrderHash = message.payload.payload.order_hash;

        if (processedOrderHashes.has(incomingOrderHash)) return;
        processedOrderHashes.add(incomingOrderHash);

        const slug = message.payload.payload.collection.slug;
        const maker = message.payload.payload.maker.address.toLowerCase();
        const quantity = Number(message?.payload?.payload?.quantity) || 1
        const basePrice = Number(message.payload.payload.base_price)
        const incomingPrice = (Number(message.payload.payload.base_price) / 10 ** 18) / quantity;
        const collection = result.find(c => c.names === slug);


        if (ownWallets.includes(maker.toLowerCase())) return
        const wallet = new ethers.Wallet(private_key as string)
        const address = wallet.address.toLowerCase()

        if (maker === address) return

        console.log('\x1b[36m--------------------------------------------------------------------------\x1b[0m');
        console.log(`\x1b[36mINCOMING OFFER DETAILS:\x1b[0m COLLECTION: ${slug.toUpperCase()} | MAKER ADDRESS: ${maker.toUpperCase()} | OFFER PRICE: ${incomingPrice} ETH`);
        console.log('\x1b[36m--------------------------------------------------------------------------\x1b[0m');


        const topOffer = currentTopOffers[slug]?.amount / 1e18 || 0

        if (topOffer > incomingPrice) {
          console.log('\x1b[31m--------------------------------------------------------------------------\x1b[0m');
          console.log(`\x1b[31mINCOMING OFFER FOR ${slug.toUpperCase()} ${incomingPrice} WETH, LESS THAN HIGHEST OFFER OF ${topOffer} WETH, SKIPPING...\x1b[0m`);
          console.log('\x1b[31m--------------------------------------------------------------------------\x1b[0m');
          return
        }

        if (!collection) {
          console.log('\x1b[31m--------------------------------------------------------------------------\x1b[0m');
          console.log(`\x1b[31mNO COLLECTION FOUND FOR ${slug.toUpperCase()}, SKIPPING...\x1b[0m`);
          console.log('\x1b[31m--------------------------------------------------------------------------\x1b[0m');
          return
        }

        const factor = collection.factor
        const floorPrice = await getFloorPrice(slug, opensea_api_key)
        if (!floorPrice) {
          console.log('\x1b[31m--------------------------------------------------------------------------\x1b[0m');
          console.log(`\x1b[31mNO FLOOR PRICE FOUND FOR ${slug.toUpperCase()}, SKIPPING...\x1b[0m`);
          console.log('\x1b[31m--------------------------------------------------------------------------\x1b[0m');
          return
        }

        const outbidMargin = calculateOutbidMargin(incomingPrice)


        let collectionDetails: {
          slug: string;
          id: number;
          creator_fees: string | null;
          enforceCreatorFee: boolean | null;
        } | null = null

        collectionDetails = await prisma.collectionDetails.findFirst({
          where: {
            slug
          }
        })

        if (!collectionDetails) {
          const collectionData = await getCollectionInfoWithRapidApi(
            slug,
            opensea_api_key
          );
          collectionDetails = await prisma.collectionDetails.create({
            data: {
              slug,
              creator_fees: JSON.stringify(collectionData?.creator_fees),
              enforceCreatorFee: collectionData?.enforceCreatorFee as boolean,
              contractAddress: collectionData?.primary_asset_contracts_address as string
            }
          })
        }

        const creator_fees = JSON.parse(collectionDetails?.creator_fees as string) as IFee;
        const enforceCreatorFee = collectionDetails?.enforceCreatorFee as boolean;

        const totalCreatorFee = Object.values(creator_fees).length > 0 && enforceCreatorFee ? Number(Object.values(creator_fees)[0]) : 0
        const royalty_fee = 0.5
        const maxPrice = floorPrice * (1 - ((totalCreatorFee / 100) + royalty_fee) / 100) * factor

        const offer = await prisma.offer.findFirst({
          where: {
            collection: slug
          },
          orderBy: {
            offerPrice: 'desc'
          }
        })

        const currentPrice = Number(offer?.offerPrice) / 1e18 || 0

        if (currentPrice > maxPrice) {
          console.log('\x1b[31m--------------------------------------------------------------------------\x1b[0m');
          console.log(`\x1b[31mOUR BID PRICE ${currentPrice} WETH FOR ${slug} EXCEEDS MAX PRICE ${maxPrice} WETH\x1b[0m`);
          console.log('\x1b[31m--------------------------------------------------------------------------\x1b[0m');

          await cancelOrder(offer?.orderHash as string, SEAPORT_CONTRACT_ADDRESS, private_key as string, opensea_api_key)
          await prisma.offer.delete({
            where: {
              id: offer?.id
            }
          })

          return
        }

        if (incomingPrice < currentPrice) return

        if (incomingPrice > maxPrice) {
          console.log('\x1b[31m--------------------------------------------------------------------------\x1b[0m');
          console.log(`\x1b[31mINCOMING OFFER FOR ${slug} FROM ${maker.toUpperCase()} FOR ${incomingPrice} WETH EXCEEDS MAX PRICE ${maxPrice} WETH\x1b[0m`);
          console.log('\x1b[31m--------------------------------------------------------------------------\x1b[0m');
          return;
        }

        const price = BigInt(basePrice + (outbidMargin * 1e18))
        const priceEth = Number(price) / 10 ** 18;

        if (priceEth > maxPrice) {
          console.log('\x1b[31m--------------------------------------------------------------------------\x1b[0m');
          console.log(`\x1b[31mOUR BID PRICE ${priceEth} WETH FOR ${slug} EXCEEDS MAX PRICE ${maxPrice} WETH\x1b[0m`);
          console.log('\x1b[31m--------------------------------------------------------------------------\x1b[0m');
          return;
        }



        let orderHash;
        if (opensea_api_key) {
          orderHash = await bidOnOpensea(
            address,
            private_key as string,
            slug,
            price,
            creator_fees,
            enforceCreatorFee,
            opensea_api_key
          );
        } else {
          orderHash = await createOfferWithRapid(
            address,
            private_key as string,
            slug,
            price,
            creator_fees,
            enforceCreatorFee,
          );
        }

        const offers = await prisma.offer.findMany({
          where: {
            collection: slug
          }
        })

        for (const offer of offers) {
          await cancelOrder(offer.orderHash, SEAPORT_CONTRACT_ADDRESS, private_key as string, opensea_api_key)
          await prisma.offer.delete({
            where: {
              id: offer.id
            }
          })
        }

        console.log('\x1b[32m--------------------------------------------------------------------------\x1b[0m');
        console.log(`\x1b[32mOUTBIDDING MAKER ${maker.toUpperCase()} FOR ${slug} FOR ${incomingPrice} WETH\x1b[0m`);
        console.log('\x1b[32m--------------------------------------------------------------------------\x1b[0m');

        await prisma.offer.create({
          data: {
            orderHash,
            collection: slug,
            offerPrice: price.toString(),
            expirationTime: new Date(Date.now() + 1000 * 900)
          }
        })

        processedOrderHashes.delete(incomingOrderHash);
      }
    });

    ws.addEventListener("close", () => clearInterval(heartbeatInterval));
    ws.addEventListener("error", (error) => {
      console.error("WebSocket error:", error);
    });
  } catch (error) {
    console.error('Error processing collection:', error);
  }
}



export async function cancelOrder(orderHash: string, protocolAddress: string, privateKey: string, opensea_api_key: boolean = false) {

  if (!orderHash || !protocolAddress || !privateKey) return

  const offererSignature = await signCancelOrder(orderHash, privateKey);

  if (!offererSignature) return;

  const url = opensea_api_key ? `https://api.opensea.io/api/v2/orders/chain/ethereum/protocol/${protocolAddress}/${orderHash}/cancel` : `https://nfttools.pro/opensea/api/v2/orders/chain/ethereum/protocol/${protocolAddress}/${orderHash}/cancel`;

  const headers = {
    'content-type': 'application/json',
    ...(opensea_api_key ? { 'x-api-key': opensea_api_key } : { 'X-NFT-API-Key': config.apiKey })
  };

  const body = {
    offerer_signature: offererSignature
  };

  try {
    const response = await limiter.schedule(() => axiosInstance.post(url, body, { headers }))
    console.log(JSON.stringify({ cancelled: true }));
    return response.data;
  } catch (error: any) {
    console.log(error?.response?.data);
  }
}

async function signCancelOrder(orderHash: string, privateKey: string) {
  if (!orderHash) return

  const wallet = new Wallet(privateKey, provider);
  const domain = {
    name: 'Seaport',
    version: '1.6',
    chainId: '1',
    verifyingContract: SEAPORT_CONTRACT_ADDRESS
  };
  const types = {
    OrderHash: [
      { name: 'orderHash', type: 'bytes32' }
    ]
  };

  if (!orderHash) return
  const value = {
    orderHash: orderHash
  };
  try {

    if (!value) return
    const signature = await wallet._signTypedData(domain, types, value);
    return signature;
  } catch (error: any) {
    throw error
  }
}

function calculateOutbidMargin(currentPrice: number): number {
  if (currentPrice < 0.1) {
    return 0.0001;
  } else if (currentPrice < 1) {
    return 0.001;
  } else {
    return 0.01;
  }
}


function roundToValidPrecision(priceEth: number): number {
  if (priceEth < 0.1) {
    return Number(priceEth.toFixed(4));
  } else if (priceEth < 1) {
    return Number(priceEth.toFixed(3));
  } else {
    return Number(priceEth.toFixed(2));
  }
}



export async function fetchOpenseaOffers(
  collectionSlug: string,
  contractAddress: string,
  opensea_api_key: string | boolean = false
): Promise<OpenseaTopOffers[]> {
  try {
    // api.opensea.io/api
    const url = opensea_api_key ? `https://api.opensea.io/api/v2/offers/collection/${collectionSlug}` : `https://nfttools.pro/opensea/api/v2/offers/collection/${collectionSlug}`;
    const headers = {
      'accept': 'application/json',
      ...(opensea_api_key ? { 'x-api-key': opensea_api_key } : { 'X-NFT-API-Key': config.apiKey })
    };

    const { data } = await limiter.schedule(() => axiosInstance.get(url, { headers }));

    if (!data.offers?.length) {
      return [{ amount: 0, owner: "" }, { amount: 0, owner: "" }];
    }

    const topOffers = data.offers
      .filter((data: any) => data.price.currency === "WETH")
      .map((offer: any) => {
        const quantity = Number(offer.protocol_data.parameters.consideration.find((item: any) => item.token.toLowerCase() === contractAddress.toLowerCase()).startAmount || 1)
        return {
          amount: Number(offer.price.value) / quantity,
          owner: offer.protocol_data.parameters.offerer
        };
      });

    // Pad with empty offers if less than 2 offers exist
    while (topOffers.length < 2) {
      topOffers.push({ amount: 0, owner: "" });
    }

    return topOffers;


  } catch (error: any) {
    return [{ amount: 0, owner: "" }, { amount: 0, owner: "" }];
  }
}

type OpenseaTopOffers = {
  amount: number;
  owner: string;
}

export async function getFloorPrice(collectionSlug: string, opensea_api_key: boolean = false) {
  try {

    const url = opensea_api_key ? `https://api.opensea.io/api/v2/listings/collection/${collectionSlug}/best` : `https://nfttools.pro/opensea/api/v2/listings/collection/${collectionSlug}/best`;
    const headers = {
      'accept': 'application/json',
      ...(opensea_api_key ? { 'x-api-key': opensea_api_key } : { 'X-NFT-API-Key': config.apiKey })
    };


    const { data } = await limiter.schedule(() => axiosInstance.get(
      url,
      { headers }
    ));

    const listings = data.listings.sort((a: any, b: any) => Number(a.price.current.value) - Number(b.price.current.value))
    const floor_price = Number(listings[0].price.current.value) / 1e18
    return floor_price;
  } catch (error: any) {
    console.error('Error fetching collection stats:', error?.response?.data);
  }
}
// TODO:
// INCOMING OFFER FOR low-effort-punks FROM 0X87732B8683C950D4F897FEE7EE04E30850C8939D FOR 0.0144 WETH EXCEEDS MAX PRICE 0.038049264 WETH

// INCOMING OFFER FOR low-effort-punks FROM 0X87732B8683C950D4F897FEE7EE04E30850C8939D FOR 0.0144 WETH EXCEEDS MAX PRICE 0.038049264 WETH