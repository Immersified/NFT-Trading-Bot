/**
 * Collection of GraphQL queries used for OpenSea API interactions
 */

/**
 * Query to fetch item details for a specific NFT
 */
export const ITEM_VIEW_MODAL_QUERY = `query ItemViewModalQuery($identifier: ItemIdentifierInput!) {
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
}`;

/**
 * Query to fetch listing flow data for an NFT
 */
export const LISTING_FLOW_QUERY = `query ListingFlowQuery($identifiers: [ItemIdentifierInput!]!, $address: Address) {
  itemsByIdentifiers(identifiers: $identifiers) {
    id
    tokenId
    contractAddress
    chain {
      identifier
      __typename
    }
    isTradingDisabled
    ...ListingFlowBase
    __typename
  }
}
fragment ListingFlowBase on Item {
  id
  imageUrl
  chain {
    identifier
    __typename
  }
  collection {
    id
    fees {
      totalCreatorFee {
        feeBasisPoints
        isRequired
        __typename
      }
      openseaFee {
        feeBasisPoints
        __typename
      }
      __typename
    }
    floorPrice {
      id
      pricePerItem {
        token {
          unit
          __typename
        }
        __typename
      }
      __typename
    }
    __typename
  }
  chain {
    listingCurrency {
      symbol
      __typename
    }
    __typename
  }
  isFungible
  ownership(address: $address) {
    quantity
    __typename
  }
  lowestListingForOwner(address: $address) {
    pricePerItem {
      token {
        unit
        __typename
      }
      __typename
    }
    __typename
  }
  ...ListingFlowForm_item
  ...ListingFlowDone_item
  ...ListingFlowReview_item
  ...useLiveUpdateItemsBestOrders
  ...readItemHighestTraitFloor
  __typename
}
fragment ListingFlowForm_item on Item {
  id
  collection {
    chain {
      identifier
      nativeCurrency {
        address
        __typename
      }
      listingCurrency {
        address
        symbol
        __typename
      }
      __typename
    }
    fees {
      openseaFee {
        feeBasisPoints
        __typename
      }
      __typename
    }
    ...CreateOrdersSummary
    __typename
  }
  chain {
    listingCurrency {
      symbol
      __typename
    }
    __typename
  }
  lowestListingForOwner(address: $address) {
    __typename
  }
  isFungible
  ...ListingFlowItemsTable
  __typename
}
fragment ListingFlowItemsTable on Item {
  id
  ...ListingFlowItemsTableRow
  __typename
}
fragment ListingFlowItemsTableRow on Item {
  id
  tokenId
  name
  imageUrl
  isFungible
  lastSale {
    token {
      unit
      symbol
      __typename
    }
    __typename
  }
  bestOffer {
    id
    pricePerItem {
      token {
        unit
        symbol
        __typename
      }
      __typename
    }
    __typename
  }
  chain {
    listingCurrency {
      symbol
      __typename
    }
    __typename
  }
  collection {
    id
    floorPrice {
      id
      pricePerItem {
        token {
          unit
          symbol
          __typename
        }
        __typename
      }
      __typename
    }
    fees {
      openseaFee {
        feeBasisPoints
        __typename
      }
      totalCreatorFee {
        feeBasisPoints
        __typename
      }
      __typename
    }
    __typename
  }
  ...RarityBadge
  ...readItemHighestTraitFloor
  __typename
}
fragment RarityBadge on Item {
  rarity {
    category
    rank
    totalSupply
    __typename
  }
  __typename
}
fragment readItemHighestTraitFloor on Item {
  __typename
  attributes {
    floorPrice {
      token {
        unit
        symbol
        __typename
      }
      __typename
    }
    __typename
  }
}
fragment CreateOrdersSummary on Collection {
  floorPrice {
    pricePerItem {
      usd
      __typename
    }
    __typename
  }
  fees {
    totalCreatorFee {
      feeBasisPoints
      __typename
    }
    openseaFee {
      feeBasisPoints
      __typename
    }
    __typename
  }
  __typename
}
fragment ListingFlowDone_item on Item {
  chain {
    identifier
    __typename
  }
  contractAddress
  tokenId
  name
  imageUrl
  collection {
    id
    name
    slug
    __typename
  }
  __typename
}
fragment ListingFlowReview_item on Item {
  id
  name
  tokenId
  imageUrl
  contractAddress
  ...convertItemsAndPricingToListings
  ...ListingFlowItemsTable
  collection {
    chain {
      identifier
      nativeCurrency {
        address
        __typename
      }
      listingCurrency {
        address
        symbol
        __typename
      }
      __typename
    }
    ...CreateOrdersSummary
    __typename
  }
  __typename
}
fragment convertItemsAndPricingToListings on Item {
  id
  name
  tokenId
  contractAddress
  chain {
    identifier
    listingCurrency {
      address
      symbol
      __typename
    }
    __typename
  }
  collection {
    id
    fees {
      openseaFee {
        feeBasisPoints
        isRequired
        __typename
      }
      __typename
    }
    __typename
  }
  __typename
}
fragment useLiveUpdateItemsBestOrders on Item {
  id
  tokenId
  contractAddress
  chain {
    identifier
    __typename
  }
  __typename
}`;

/**
 * Query to create a listing on OpenSea
 */
export const LISTING_FLOW_TIMELINE_QUERY = `query ListingFlowTimelineQuery($listings: [ItemListingInput!]!, $address: Address!, $useCreatorFee: Boolean!, $taker: Address) {
  createListings(
    listings: $listings
    address: $address
    useCreatorFee: $useCreatorFee
    taker: $taker
  ) {
    actions {
      __typename
      ... on CreateListingsAction {
        items {
          chain {
            identifier
            __typename
          }
          __typename
        }
        orders {
          ...seaportOrder
          __typename
        }
        __typename
      }
      ...ActionTimeline
    }
    __typename
  }
}
fragment ActionTimeline on BlockchainAction {
  __typename
  ... on TransactionAction {
    transactionSubmissionData {
      __typename
    }
    __typename
  }
  ...useScheduler_action
  ...ActionTimelineItem
}
fragment useScheduler_action on BlockchainAction {
  __typename
  ... on BlurAuthAction {
    chain {
      identifier
      __typename
    }
    expiresOn
    hmac
    signatureRequest {
      message
      ...useScheduler_signatureRequest
      __typename
    }
    __typename
  }
  ... on RefreshAction {
    message
    __typename
  }
  ... on SignatureRequestAction {
    signatureRequest {
      ...useScheduler_signatureRequest
      __typename
    }
    __typename
  }
  ... on TransactionAction {
    transactionSubmissionData {
      chain {
        networkId
        identifier
        blockExplorer {
          name
          transactionUrlTemplate
          __typename
        }
        __typename
      }
      ...useScheduler_transactionSubmissionData
      __typename
    }
    __typename
  }
  ... on GaslessCancelOrdersAction {
    signatureRequest {
      ...useScheduler_signatureRequest
      __typename
    }
    __typename
  }
  ... on SwapAssetsAction {
    isCrossChain
    __typename
  }
}
fragment useScheduler_signatureRequest on SignatureRequest {
  __typename
  message
  ... on SignTypedDataRequest {
    chain {
      networkId
      __typename
    }
    __typename
  }
}
fragment useScheduler_transactionSubmissionData on TransactionSubmissionData {
  to
  data
  value
  chain {
    networkId
    __typename
  }
  __typename
}
fragment ActionTimelineItem on BlockchainAction {
  ... on BuyItemAction {
    __typename
    items {
      imageUrl
      id
      __typename
    }
  }
  ... on AcceptOfferAction {
    __typename
    items {
      id
      __typename
    }
  }
  ... on ItemApprovalAction {
    __typename
    item {
      collection {
        name
        imageUrl
        __typename
      }
      __typename
    }
  }
  ... on PaymentApprovalAction {
    __typename
    currency {
      id
      symbol
      __typename
    }
  }
  ... on CreateListingsAction {
    items {
      id
      __typename
    }
    __typename
  }
  ... on UnwrapAction {
    __typename
    transactionSubmissionData {
      to
      chain {
        identifier
        nativeCurrency {
          symbol
          __typename
        }
        wrappedNativeCurrency {
          symbol
          __typename
        }
        __typename
      }
      __typename
    }
  }
  ... on WrapAction {
    __typename
    transactionSubmissionData {
      to
      chain {
        identifier
        nativeCurrency {
          symbol
          __typename
        }
        wrappedNativeCurrency {
          symbol
          __typename
        }
        __typename
      }
      __typename
    }
  }
  __typename
}
fragment seaportOrder on SeaportOrderComponents {
  offerer
  zone
  offer {
    itemType
    token
    identifierOrCriteria
    startAmount
    endAmount
    __typename
  }
  consideration {
    itemType
    token
    identifierOrCriteria
    startAmount
    endAmount
    recipient
    __typename
  }
  orderType
  startTime
  endTime
  zoneHash
  salt
  conduitKey
  counter
  __typename
}`;

/**
 * Mutation to create listings on OpenSea after signing
 */
export const CREATE_ORDER_MUTATION = `mutation ListingsFlowTimelineMutation($chain: ChainIdentifier!, $orders: [SeaportOrderComponentsInput!]!, $signature: String!) {
  createListingsV2(chain: $chain, orders: $orders, signature: $signature) {
    ...readOrderCreationError
    __typename
  }
}
fragment readOrderCreationError on OrderCreationMutationResponse {
  __typename
  ... on OrderCreationErrorResponse {
    errors {
      ... on TransactionError {
        message
        __typename
      }
      __typename
    }
    __typename
  }
}`;