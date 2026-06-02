import config from "../config";
import axiosInstance from "../axios/axiosInstance";
import limiter from "../bottleneck";

import { OrdersQuery } from "./graphql/query/OrdersQuery";
const GOLD = '\x1b[33m';
const RESET = '\x1b[0m';


export async function getBestOfferOpensea(slug: string, tokenId: string | number) {
  const options = {
    method: 'GET',
    url: `https://nfttools.pro/opensea/api/v2/offers/collection/${slug}/nfts/${tokenId}/best`,
    headers: {
      'X-NFT-API-Key': config.apiKey
    }
  };
  try {
    const { data } = await limiter.schedule(() => axiosInstance.request<Order>(options));
    return data
  } catch (error) {
    console.error(error);
  }
}

export async function retrieveOrders(slug: string, contractAddress: string, tokenId: string, ownWallets: string[]) {
  const payload = {
    operationName: "UseItemOffersQuery",
    query: `query UseItemOffersQuery($filter: ItemOffersFilter, $cursor: String, $limit: Int!, $address: Address, $identifier: ItemIdentifierInput!) {
      itemByIdentifier(identifier: $identifier) {
        ... on Item {
          ...ItemOwnedQuantity
          __typename
        }
        __typename
      }
      itemOffers(filter: $filter, cursor: $cursor, limit: $limit) {
        items {
          id
          ...ItemOrdersTableRow
          ...useCancelOrders
          __typename
        }
        nextPageCursor
        __typename
      }
    }
    fragment ItemOrdersTableRow on Order {
      id
      type
      pricePerItem {
        token {
          unit
          __typename
        }
        ...TokenPrice
        __typename
      }
      quantityRemaining
      maker {
        ...AccountLockup
        ...ProfilePreviewTooltip
        __typename
      }
      endTime
      ...useCancelOrders
      __typename
    }
    fragment TokenPrice on Price {
      usd
      token {
        unit
        symbol
        contractAddress
        chain {
          identifier
          __typename
        }
        __typename
      }
      __typename
    }
    fragment AccountLockup on ProfileIdentifier {
      address
      displayName
      imageUrl
      ...profileUrl
      __typename
    }
    fragment profileUrl on ProfileIdentifier {
      address
      __typename
    }
    fragment useCancelOrders on BaseOrder {
      id
      marketplace {
        identifier
        __typename
      }
      maker {
        address
        __typename
      }
      __typename
    }
    fragment ProfilePreviewTooltip on ProfileIdentifier {
      address
      ...ProfilePreviewTooltipContent
      __typename
    }
    fragment ProfilePreviewTooltipContent on ProfileIdentifier {
      address
      __typename
    }
    fragment ItemOwnedQuantity on Item {
      ownership(address: $address) {
        id
        quantity
        __typename
      }
      __typename
    }`,
    variables: {
      filter: {
        chain: "ethereum",
        contractAddress: contractAddress,
        tokenId: tokenId
      },
      identifier: {
        chain: "ethereum",
        contractAddress: contractAddress,
        tokenId: tokenId
      },
      limit: 15
    }
  };

  // Try both approaches
  try {

    // Try proxy approach since we know it works
    const response = await limiter.schedule(() => axiosInstance.post(
      "https://nfttools.pro/opensea/graphql", // This path worked
      payload,
      {
        headers: {
          'X-NFT-API-Key': config.apiKey,
          'Content-Type': 'application/json',
          'X-Query-Signature': 'ebd57d54ced47662fdda577f3b2eff92bfd1525e231c8684f21c028dac661b9d'
        },
        timeout: 10000
      }
    ));

  // Process and return the items

    return formatOrderDataForTable(response.data, ownWallets);
  } catch (error: any) {
    console.error('OpenSea API Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    throw error;
  }
}


function formatOrderDataForTable(data: any, ownWallets: string[]): any[] {
  const orders = data?.data?.itemOffers?.items;

  if (!orders || orders.length === 0) {
    console.log("No orders found.");
    return [];
  }

  const filteredOrders = orders.filter(
    (order: any) =>
      (order.type === 'CRITERIA_COLLECTION' ||
        order.type === 'CRITERIA_TRAIT' ||
        order.type === 'BASIC') &&
      !ownWallets.includes(order.maker?.address)
  );

  if (filteredOrders.length === 0) {
    console.log("No matching orders found after filtering own wallets.");
    return [];
  }

  return filteredOrders.map((order: any) => ({
    maker: order.maker?.address || '',
    price: order.pricePerItem?.token?.unit || '',
    orderId: order.id || '',
    payment: order.pricePerItem?.token?.symbol || '',
    endTime: order.endTime || '',
    type: order.type || '',
    quantityRemaining: order.quantityRemaining || '',
  }));
}


interface Order {
  order_hash: string;
  chain: string;
  price: {
    currency: string;
    decimals: number;
    value: string;
  };
  criteria: {
    collection: Object;
    contract: Object;
    trait: null;
    encoded_token_ids: string;
  };
  protocol_data: {
    parameters: Parameters;
    signature: null;
  };
  protocol_address: string;
}

interface OfferItem {
  itemType: string | number;
  token: string;
  identifierOrCriteria: string;
  startAmount: string;
  endAmount: string;
}

interface ConsiderationItem extends OfferItem {
  recipient: string;
}

interface Parameters {
  offerer: string;
  offer: OfferItem[];
  consideration: ConsiderationItem[];
  startTime: string;
  endTime: string;
  orderType: string;
  zoneHash: string;
  salt: string;
  conduitKey: string;
  totalOriginalConsiderationItems: number;
  counter: number;
}

// ... existing code ...

interface Payment {
  quantity: string;
  token_address: string;
  decimals: number;
  symbol: string;
}

interface Asset {
  identifier: string;
  collection: string;
  contract: string;
  token_standard: string;
  name: string;
  description: string;
  image_url: string;
  display_image_url: string;
  display_animation_url: string | null;
  metadata_url: string;
  opensea_url: string;
  updated_at: string;
  is_disabled: boolean;
  is_nsfw: boolean;
}

interface AssetEvent {
  event_type: string;
  order_hash: string;
  order_type: string;
  chain: string;
  protocol_address: string;
  start_date: number;
  expiration_date: number;
  asset: Asset;
  quantity: number;
  maker: string;
  taker: string;
  payment: Payment;
  criteria: Record<string, unknown>;
  event_timestamp: number;
  is_private_listing: boolean;
}

interface Offers {
  asset_events: AssetEvent[];
  next: string;
}


interface OpenSeaProBaseAsset {
  address: string;
  symbol: string;
  decimals: number;
}

interface OpenSeaProConsiderationItem {
  endAmount: string;
  identifierOrCriteria: string;
  itemType: number;
  recipient: string;
  startAmount: string;
  token: string;
}

interface OpenSeaProOfferItem {
  endAmount: string;
  identifierOrCriteria: string;
  itemType: number;
  startAmount: string;
  token: string;
}

interface OpenSeaProOrderParameters {
  conduitKey: string;
  consideration: OpenSeaProConsiderationItem[];
  counter: string | number;
  endTime: string;
  offer: OpenSeaProOfferItem[];
  offerer: string;
  orderType: number;
  salt: string;
  startTime: string;
  totalOriginalConsiderationItems: number;
  zone: string;
  zoneHash: string;
}

interface OpenSeaProOrder {
  parameters: OpenSeaProOrderParameters;
  signature: string | null;
}

interface OpenSeaProAssetContractCriteria {
  address: string;
}

interface OpenSeaProCollectionCriteria {
  slug: string;
}

interface OpenSeaProTraitCriteria {
  trait_name: string;
  trait_type: string;
}

interface OpenSeaProOrderData {
  orderHash: string;
  asset_contract_criteria: OpenSeaProAssetContractCriteria;
  collection_criteria: OpenSeaProCollectionCriteria;
  trait_criteria?: OpenSeaProTraitCriteria;
  order: OpenSeaProOrder;
  target: string;
}

interface OpenSeaProOffer {
  baseAsset: OpenSeaProBaseAsset;
  _id: string;
  _activityHash: string;
  hide: string;
  chainName: string;
  activityType: string;
  market: string;
  activityTimestamp: number;
  slug: string;
  listingDate: number;
  expirationDate: number;
  isPrivate: boolean;
  from: string;
  to: string;
  basePrice: number;
  ethPrice: number;
  collectionAddress: string;
  quantity: number;
  tokenStandard: string;
  collectionName: string;
  collectionImageUrl: string;
  intentTransactionHashes: any[];
  marketUrl: string;
  tradeDetails: any[];
  orderData: OpenSeaProOrderData;
  createdAt: string;
  updatedAt: string;
}

interface OpenSeaProOfferData {
  data: OpenSeaProOffer[];
}

interface ActivityResponse {
  data: {
    nft: {
      activity: {
        edges: Array<{
          node: ActivityNode;
          cursor: string;
        }>;
        pageInfo: {
          endCursor: string;
          hasNextPage: boolean;
        };
      };
      id: string;
    };
  };
}

interface ActivityNode {
  collection: {
    name: string;
    imageUrl: string;
    isVerified: boolean;
    slug: string;
    isCategory: boolean;
    id: string;
  };
  traitCriteria: null;
  itemQuantity: string;
  item: {
    __typename: string;
    relayId: string;
    verificationStatus: string;
    __isItemType: string;
    displayName: string;
    assetContract: {
      address: string;
      id: string;
      chain: string;
      blockExplorerLink: string;
    };
    tokenId: string;
    chain: {
      identifier: string;
    };
    animationUrl: null;
    displayImageUrl: string;
    imageUrl: string;
    isDelisted: boolean;
    backgroundColor: null;
    collection: {
      displayData: {
        cardDisplayStyle: string;
      };
      id: string;
      slug: string;
      enabledRarities: string[];
      name: string;
      verificationStatus: string;
      isCategory: boolean;
    };
    decimals: null;
    defaultRarityData: {
      rank: number;
      rankPercentile: number;
      rankCount: number;
      maxRank: number;
      id: string;
    };
    isCurrentlyFungible: boolean;
    hidden: boolean;
    isListable: boolean;
    isReportedSuspicious: boolean;
    isCompromised: boolean;
    isUnderReview: boolean;
    isSuspicious: boolean;
    __isNode: string;
    id: string;
  };
  relayId: string;
  eventTimestamp: string;
  eventType: string;
  customEventName: null;
  orderStatus: 'CANCELLED' | 'EXPIRED' | 'ACCEPTED';
  isMint: boolean;
  isAirdrop: boolean;
  fromAccount: {
    address: string;
    config: null;
    isCompromised: boolean;
    user: {
      publicUsername: string | null;
      id: string;
    };
    displayName: string | null;
    imageUrl: string;
    id: string;
  };
  perUnitPrice: {
    unit: string;
    eth: string;
    usd: string;
  };
  endingPriceType: {
    unit: string;
  };
  priceType: {
    unit: string;
  };
  payment: {
    symbol: string;
    id: string;
  };
  seller: null;
  sellOrder: null;
  toAccount: null;
  winnerAccount: null;
  swap: null;
  transaction: null;
  id: string;
  __typename: string;
}

interface OpenseaGraphOfferResponse {
  data: {
    criteriaTakerAsset: OpenseaGraphAsset;
    orders: OpenseaGraphOrderConnection;
  }
}

interface OpenseaGraphAsset {
  ownedQuantity: null | number;
  decimals: null | number;
  isDelisted: boolean;
  relayId: string;
  assetContract: {
    address: string;
    id: string;
  };
  tokenId: string;
  chain: {
    identifier: string;
  };
  acceptOfferDisabled: null | boolean;
  __typename: string;
  isCurrentlyFungible: boolean;
  defaultRarityData: null | any;
  __isItemType: string;
  displayName: string;
  collection: OpenseaGraphCollection;
  animationUrl: null | string;
  displayImageUrl: string;
  imageUrl: string;
  backgroundColor: null | string;
  id: string;
}

interface OpenseaGraphCollection {
  name: string;
  slug: string;
  verificationStatus: string;
  isCategory: boolean;
  id: string;
  displayData: {
    cardDisplayStyle: string;
  };
  enabledRarities: any[];
  logo: string;
  statsV2: {
    floorPrice: {
      eth: string;
    };
  };
  isCreatorFeesEnforced: boolean;
  totalCreatorFeeBasisPoints: number;
  openseaSellerFeeBasisPoints?: number;
}

interface OpenseaGraphOrderConnection {
  edges: OpenseaGraphOrderEdge[];
  pageInfo: {
    endCursor: string;
    hasNextPage: boolean;
  };
}

interface OpenseaGraphOrderEdge {
  node: OpenseaGraphOrder;
  cursor: string;
}

interface OpenseaGraphOrder {
  isValid: boolean;
  isCancelled: boolean;
  openedAt: string;
  orderType: string;
  remainingQuantityType: string;
  maker: {
    address: string;
    config: null | any;
    isCompromised: boolean;
    user: {
      publicUsername: null | string;
      id: string;
    };
    displayName: null | string;
    imageUrl: string;
    id: string;
    relayId: string;
  };
  payment: {
    relayId: string;
    symbol: string;
    id: string;
  };
  item: OpenseaGraphAssetItem;
  relayId: string;
  side: string;
  taker: null | any;
  invalidationReason: null | string;
  perUnitPriceType: {
    eth: string;
    usd: string;
    unit: string;
  };
  priceType: {
    unit: string;
    usd: string;
  };
  criteria: null | any;
  closedAt: string;
  makerOwnedQuantity: string;
  supportsGiftingOnPurchase: boolean;
  makerFees: {
    edges: any[];
  };
  takerFees: {
    edges: {
      node: {
        basisPoints: number;
        isOpenseaFee: boolean;
        id: string;
      };
    }[];
  };
  id: string;
  __typename: string;
}

interface OpenseaGraphAssetItem extends OpenseaGraphAsset {
  __isNode: string;
  totalCreatorFee: number;
  verificationStatus: string;
  isReportedSuspicious: boolean;
  blockExplorerLink?: string;
}


export async function fetchBestOffers(slug: string, contractAddress: string, tokenId: number, ownWallets: string[]) {
  try {
    // Define headers
    const headers = {
      'X-NFT-API-Key': config.apiKey,
      'Content-Type': 'application/json'
    };

    //Scrape OS2 offers
    const orders = await retrieveOrders(slug, contractAddress, tokenId.toString(), ownWallets)
    const valueInEthOS2 = orders[0].price
    const collectionValueinEthOS2 = orders.filter(order => order.type === 'CRITERIA_COLLECTION')[0].price

    // First fetch the best offer for the specific NFT with rate limiting
    const data = await limiter.schedule(() => 
      axiosInstance.get(`https://nfttools.pro/opensea/api/v2/offers/collection/${slug}/nfts/${tokenId}/best`, { headers })
        .then(response => response.data)
    );

    // Check if the offerer is in the list of own wallets
    const offerer = data?.protocol_data?.parameters?.offerer;
    const currency = data?.price?.currency;
    const totalOffer = BigInt(data?.price?.value.toString());
    const totalBids = BigInt(data?.protocol_data?.parameters?.consideration[0]?.endAmount.toString());

    const adjustedWei = totalBids === BigInt(0) ? BigInt(0) : totalOffer / totalBids;
    const valueInEth = Number(adjustedWei) / 1e18;

    // Check if offerer is not in ownWallets AND currency is WETH or BETH
    if (offerer && !ownWallets.includes(offerer.toLowerCase()) && (currency === 'WETH' || currency === 'BETH') && valueInEth === valueInEthOS2) {
      const orderHash = data?.order_hash;
      return {orderHash, valueInEth}
    } else {
      console.log(`Fetching highest collection offer...`);
      
      // Fetch highest offer for the entire collection with rate limiting
      const collectionData = await limiter.schedule(() => 
        axiosInstance.get(`https://nfttools.pro/opensea/api/v2/offers/collection/${slug}`, { headers })
          .then(response => response.data)
      );
      
      // Check if there are multiple offers
      if (collectionData?.offers && collectionData.offers.length > 0) {
        // Loop through each offer
        for (const offer of collectionData.offers) {

          // Process collection offer data
          const collectionOfferer = offer?.protocol_data?.parameters?.offerer;
          const collectionCurrency = offer?.price?.currency;
          const collectionTotalOffer = BigInt(offer?.price?.value.toString());
          const collectionTotalBids = BigInt(offer?.protocol_data?.parameters?.consideration[0]?.endAmount.toString());

          const adjustedWei = collectionTotalBids === BigInt(0) ? BigInt(0) : collectionTotalOffer / collectionTotalBids;
          const collectionValueInEth = Number(adjustedWei) / 1e18;

          // Check same conditions for collection offer
          if (collectionOfferer && !ownWallets.includes(collectionOfferer.toLowerCase()) && (collectionCurrency === 'WETH' || collectionCurrency === 'BETH' && collectionValueInEth === collectionValueinEthOS2)) {
            const collectionOrderHash = offer?.order_hash;
            return {orderHash: collectionOrderHash, valueInEth: collectionValueInEth};
          }
        }
      } else {
      console.log('No suitable offer found');
      return {orderHash: null, valueInEth: null};
    }}
  } catch (error) {
    console.error(error);
    return {orderHash: null, valueInEth: null};
  }
}