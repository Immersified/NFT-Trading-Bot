import axios from 'axios';
import config from '../config';

interface TokenInfo {
  unit: string;
  symbol?: string;
  contractAddress: string;
  chain?: {
    identifier: string;
  };
  __typename: string;
}

interface Price {
  usd: number;
  token: TokenInfo;
  __typename: string;
}

interface Bidder {
  quantity: number;
  imageUrl: string;
  address: string;
  __typename: string;
}

interface OfferAggregate {
  id: string;
  totalOffers: number;
  offerPrice: Price;
  totalValue: Price;
  bidders: Bidder[];
  __typename: string;
}

interface TraitOffersResponse {
  data: {
    traitOfferAggregates: {
      items: OfferAggregate[];
      nextPageCursor: string;
      __typename: string;
    };
    collectionBySlug: {
      slug: string;
      isOffersEnabled: boolean;
      traitOffersEnabled: boolean;
      __typename: string;
    };
  };
}

interface TraitOffersQueryParams {
  collectionSlug: string;
  traitType: string;
  traitValue: string;
  limit?: number;
  cursor?: string;
  sortBy?: 'OFFER_PRICE' | 'TOTAL_OFFERS';
  sortDirection?: 'ASC' | 'DESC';
}

interface ItemIdentifier {
  chain: string;
  contractAddress: string;
  tokenId: string;
}

interface Chain {
  identifier: string;
  arch: string;
  __typename: string;
  name: string;
}

interface Collection {
  description: string;
  __typename: string;
  id: string;
  slug: string;
  floorPrice?: {
    pricePerItem: Price;
    __typename: string;
  };
  imageUrl: string;
  isVerified: boolean;
  name: string;
  externalUrl: string;
  discordUrl: string;
  instagramUsername: string;
  twitterUsername: string;
  isTradingEnabled: boolean;
}

interface Rarity {
  rank: number;
  __typename: string;
  category: string;
  totalSupply: number;
}

interface BestOrder {
  pricePerItem: Price;
  __typename: string;
}

interface Profile {
  address: string;
  displayName: string;
  imageUrl: string;
  __typename: string;
}

interface Enforcement {
  isCompromised: boolean;
  isDisabled: boolean;
  __typename: string;
}

interface ItemDetail {
  __typename: string;
  id: string;
  chain: Chain;
  contractAddress: string;
  isFungible: boolean;
  tokenId: string;
  standard: string;
  description: string;
  collection: Collection;
  details: any[];
  totalSupply: number;
  rarity: Rarity;
  bestOffer: BestOrder | null;
  bestListing: BestOrder | null;
  lastSale: Price | null;
  name: string;
  owner: Profile;
  externalUrl: string | null;
  imageUrl: string;
  animationUrl: string | null;
  backgroundColor: string | null;
  version: number;
  enforcement: Enforcement;
}

interface ItemViewModalResponse {
  data: {
    itemByIdentifier: ItemDetail;
  };
  extensions: {
    debugInfo: {
      additionalInformation: {
        "x-trace-id": string;
        "cache-control": string;
        "x-ratelimit-remaining": number;
        "x-cache-status": string;
      };
    };
  };
}

const NFT_TOOLS_API = 'https://nfttools.pro/opensea/graphql';
const API_KEY = config.apiKey;

export async function fetchTraitOffers({
  collectionSlug = "azuki",
  traitType = "Type",
  traitValue = "Spirit",
  limit = 50,
  cursor,
  sortBy = 'OFFER_PRICE',
  sortDirection = 'DESC'
}: TraitOffersQueryParams): Promise<TraitOffersResponse> {
  try {
    const response = await axios.post(
      NFT_TOOLS_API,
      {
        operationName: 'TraitOffersTableQuery',
        query: `query TraitOffersTableQuery($collectionSlug: String!, $filter: TraitOffersFilter, $sort: TraitOfferAggregateSort!, $cursor: String, $limit: Int!) {
          traitOfferAggregates(
            collectionSlug: $collectionSlug
            filter: $filter
            sort: $sort
            cursor: $cursor
            limit: $limit
          ) {
            items {
              id
              totalOffers
              offerPrice {
                usd
                __typename
              }
              ...OfferAggregateTable
              __typename
            }
            nextPageCursor
            __typename
          }
          collectionBySlug(slug: $collectionSlug) {
            ...OfferAggregateTable_collection
            __typename
          }
        }
        fragment OfferAggregateTable_collection on Collection {
          ...useCollectionOffers
          ...OfferAggregateTableRow_collection
          __typename
        }
        fragment useCollectionOffers on CollectionResult {
          __typename
          ... on Collection {
            slug
            isOffersEnabled
            traitOffersEnabled
            __typename
          }
        }
        fragment OfferAggregateTableRow_collection on Collection {
          ...useCollectionOffers
          __typename
        }
        fragment OfferAggregateTable on OfferAggregate {
          id
          ...OfferAggregateTableRow
          __typename
        }
        fragment OfferAggregateTableRow on OfferAggregate {
          offerPrice {
            token {
              unit
              contractAddress
              __typename
            }
            ...TokenPrice
            __typename
          }
          totalValue {
            token {
              unit
              __typename
            }
            ...TokenPrice
            __typename
          }
          totalOffers
          bidders {
            quantity
            __typename
          }
          ...OfferAggregateBidders
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
        fragment OfferAggregateBidders on OfferAggregate {
          offerPrice {
            ...TokenPrice
            __typename
          }
          totalValue {
            ...TokenPrice
            __typename
          }
          totalOffers
          bidders {
            quantity
            imageUrl
            address
            ...AccountLockup
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
        }`,
        variables: {
          collectionSlug,
          filter: {
            traitType,
            traitValue
          },
          limit,
          cursor,
          sort: {
            by: sortBy,
            direction: sortDirection
          }
        }
      },
      {
        headers: {
          'x-nft-api-key': API_KEY,
          'content-type': 'application/json'
        }
      }
    );

    console.log(response.data);
    return response.data;

  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`NFT Tools API request failed: ${error.message}`);
    }
    throw error;
  }
}

export async function fetchItemDetails({
  chain = "ethereum",
  contractAddress,
  tokenId,
  authAddress = ""
}: ItemIdentifier & { authAddress?: string }): Promise<ItemViewModalResponse> {
  try {
    const response = await axios.post(
      NFT_TOOLS_API,
      {
        operationName: 'ItemViewModalQuery',
        query: `query ItemViewModalQuery($identifier: ItemIdentifierInput!) {
          itemByIdentifier(identifier: $identifier) {
            __typename
            ... on Item {
              id
              ...ItemView
              ...ItemViewModal
              __typename
            }
          }
        }
        fragment ItemView on Item {
          chain {
            identifier
            arch
            __typename
          }
          contractAddress
          isFungible
          tokenId
          ...ItemAttributes
          ...ItemAbout
          ...ItemActivity
          ...ItemStats
          ...ItemDetails
          ...ItemPageMedia
          ...ItemSocial
          ...ItemAction
          ...itemUrl
          ...ItemTabs
          ...ItemTitle
          ...ItemOrders
          ...ItemMetadataChips
          ...itemIdentifier
          enforcement {
            isDisabled
            __typename
          }
          version
          __typename
        }
        fragment ItemAttributes on ItemIdentifier {
          ...itemIdentifier
          __typename
        }
        fragment itemIdentifier on ItemIdentifier {
          chain {
            identifier
            __typename
          }
          tokenId
          contractAddress
          __typename
        }
        fragment ItemStats on Item {
          tokenId
          isFungible
          totalSupply
          rarity {
            rank
            __typename
          }
          bestOffer {
            pricePerItem {
              usd
              ...TokenPrice
              __typename
            }
            __typename
          }
          bestListing {
            pricePerItem {
              usd
              ...TokenPrice
              __typename
            }
            __typename
          }
          collection {
            id
            slug
            floorPrice {
              pricePerItem {
                usd
                ...TokenPrice
                __typename
              }
              __typename
            }
            __typename
          }
          lastSale {
            ...TokenPrice
            __typename
          }
          ...isItemRarityDisabled
          ...RarityTooltip
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
        fragment isItemRarityDisabled on Item {
          collection {
            id
            slug
            __typename
          }
          __typename
        }
        fragment RarityTooltip on Item {
          rarity {
            category
            rank
            totalSupply
            __typename
          }
          ...isItemRarityDisabled
          __typename
        }
        fragment ItemAbout on Item {
          id
          tokenId
          contractAddress
          chain {
            name
            identifier
            arch
            __typename
          }
          standard
          description
          collection {
            description
            __typename
          }
          details {
            name
            value
            __typename
          }
          __typename
        }
        fragment ItemActivity on Item {
          id
          contractAddress
          tokenId
          chain {
            identifier
            __typename
          }
          isFungible
          __typename
        }
        fragment ItemDetails on Item {
          name
          contractAddress
          tokenId
          chain {
            identifier
            __typename
          }
          owner {
            address
            ...AccountLockup
            ...profileUrl
            __typename
          }
          isFungible
          ...ItemCollection
          ...ItemSocial
          ...RefreshItemMetadataButton
          ...itemUrl
          __typename
        }
        fragment ItemCollection on Item {
          collection {
            slug
            imageUrl
            isVerified
            name
            ...collectionUrl
            __typename
          }
          __typename
        }
        fragment collectionUrl on CollectionIdentifier {
          slug
          __typename
        }
        fragment ItemSocial on Item {
          chain {
            identifier
            __typename
          }
          contractAddress
          tokenId
          externalUrl
          collection {
            externalUrl
            discordUrl
            instagramUsername
            twitterUsername
            __typename
          }
          __typename
        }
        fragment RefreshItemMetadataButton on ItemIdentifier {
          ...itemIdentifier
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
        fragment itemUrl on ItemIdentifier {
          chain {
            identifier
            arch
            __typename
          }
          tokenId
          contractAddress
          __typename
        }
        fragment ItemPageMedia on Item {
          ...ItemMedia
          __typename
        }
        fragment ItemMedia on Item {
          imageUrl
          animationUrl
          backgroundColor
          __typename
        }
        fragment ItemAction on Item {
          id
          isFungible
          version
          ...itemIdentifier
          __typename
        }
        fragment ItemTitle on Item {
          name
          ...EnforcementBadge
          __typename
        }
        fragment EnforcementBadge on EnforcedEntity {
          __typename
          enforcement {
            isCompromised
            isDisabled
            __typename
          }
        }
        fragment ItemTabs on Item {
          isFungible
          collection {
            slug
            __typename
          }
          __typename
        }
        fragment ItemOrders on Item {
          contractAddress
          tokenId
          collection {
            slug
            __typename
          }
          chain {
            identifier
            __typename
          }
          isFungible
          ...ItemOrdersDepthChart
          ...ItemOrdersFeed
          __typename
        }
        fragment ItemOrdersDepthChart on Item {
          contractAddress
          tokenId
          chain {
            identifier
            __typename
          }
          __typename
        }
        fragment ItemOrdersFeed on Item {
          tokenId
          collection {
            slug
            __typename
          }
          ...ItemOffersTable
          __typename
        }
        fragment ItemOffersTable on Item {
          isFungible
          ...itemIdentifier
          ...useAcceptOffers
          __typename
        }
        fragment useAcceptOffers on Item {
          chain {
            identifier
            arch
            __typename
          }
          contractAddress
          tokenId
          collection {
            isTradingEnabled
            __typename
          }
          bestOffer {
            pricePerItem {
              token {
                unit
                address
                __typename
              }
              __typename
            }
            maker {
              address
              __typename
            }
            __typename
          }
          enforcement {
            isCompromised
            __typename
          }
          __typename
        }
        fragment ItemMetadataChips on Item {
          ...ItemMetadataChip
          __typename
        }
        fragment ItemMetadataChip on Item {
          ...ItemChainChip
          ...ItemRarityChip
          ...ItemTokenIdChip
          ...ItemStandardChip
          ...ItemTopOfferChip
          ...ItemOwnersChip
          __typename
        }
        fragment ItemChainChip on Item {
          chain {
            ...ChainChip
            __typename
          }
          __typename
        }
        fragment ChainChip on Chain {
          identifier
          name
          __typename
        }
        fragment ItemRarityChip on Item {
          rarity {
            rank
            category
            __typename
          }
          __typename
        }
        fragment ItemTokenIdChip on Item {
          tokenId
          __typename
        }
        fragment ItemStandardChip on Item {
          standard
          __typename
        }
        fragment ItemTopOfferChip on Item {
          bestOffer {
            pricePerItem {
              ...TokenPrice
              __typename
            }
            __typename
          }
          enforcement {
            isCompromised
            __typename
          }
          ...EnforcementBadge
          __typename
        }
        fragment ItemOwnersChip on Item {
          ...ItemOwnersModal
          ...ItemOwnersCount
          isFungible
          __typename
        }
        fragment ItemOwnersModal on Item {
          ...ItemOwnersModalContent
          __typename
        }
        fragment ItemOwnersModalContent on Item {
          ...ItemOwnersTable
          __typename
        }
        fragment ItemOwnersTable on Item {
          tokenId
          chain {
            identifier
            __typename
          }
          contractAddress
          __typename
        }
        fragment ItemOwnersCount on Item {
          tokenId
          chain {
            identifier
            __typename
          }
          contractAddress
          __typename
        }
        fragment ItemViewModal on Item {
          name
          __typename
        }`,
        variables: {
          identifier: {
            chain,
            contractAddress,
            tokenId
          }
        }
      },
      {
        headers: {
          'x-nft-api-key': API_KEY,
          'content-type': 'application/json',
          ...(authAddress && { 'x-auth-address': authAddress.toLowerCase() })
        }
      }
    );

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`NFT Tools API request failed: ${error.message}`);
    }
    throw error;
  }
} 