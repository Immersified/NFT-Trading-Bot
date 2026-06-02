import { Contract, Signer, Wallet, ethers, providers } from "ethers";
import limiter from "../bottleneck";
import axiosInstance from "../axios/axiosInstance";
import config from "../config";

const challengeLoginMessageQuery =
  'query challengeLoginMessageQuery(\n  $address: AddressScalar!\n) {\n  auth {\n    loginMessage(address: $address)\n  }\n}\n';
const AssetPageQuery =
  'query AssetPageQuery(\n  $tokenId: String!\n  $contractAddress: AddressScalar!\n  $chain: ChainScalar!\n) {\n  ...AssetPage_data_3gcux1\n}\n\nfragment AcceptHighestOfferButton_asset on AssetType {\n  ...AcceptOfferButton_asset\n  ...itemEvents_dataV2\n}\n\nfragment AcceptHighestOfferButton_tradeSummary on TradeSummaryType {\n  bestBid {\n    item {\n      __typename\n      ...itemEvents_dataV2\n      ... on Node {\n        __isNode: __typename\n        id\n      }\n    }\n    perUnitPriceType {\n      unit\n      symbol\n    }\n    ...AcceptOfferButton_order\n    id\n  }\n}\n\nfragment AcceptOfferButton_asset on AssetType {\n  relayId\n  acceptOfferDisabled {\n    __typename\n  }\n  ownedQuantity(identity: {})\n  ...AcceptOfferModalContent_criteriaAsset_3z4lq0\n  ...itemEvents_dataV2\n}\n\nfragment AcceptOfferButton_order on OrderV2Type {\n  relayId\n  side\n  orderType\n  item {\n    __typename\n    ... on AssetType {\n      acceptOfferDisabled {\n        __typename\n      }\n      collection {\n        statsV2 {\n          floorPrice {\n            eth\n          }\n        }\n        id\n      }\n      chain {\n        identifier\n      }\n      ownedQuantity(identity: {})\n      ...itemEvents_dataV2\n    }\n    ... on AssetBundleType {\n      bundleCollection: collection {\n        statsV2 {\n          floorPrice {\n            eth\n          }\n        }\n        id\n      }\n      chain {\n        identifier\n      }\n      assetQuantities(first: 30) {\n        edges {\n          node {\n            asset {\n              ownedQuantity(identity: {})\n              id\n            }\n            id\n          }\n        }\n      }\n      ...itemEvents_dataV2\n    }\n    ... on Node {\n      __isNode: __typename\n      id\n    }\n  }\n  maker {\n    address\n    id\n  }\n  perUnitPriceType {\n    eth\n  }\n}\n\nfragment AcceptOfferDisabledAlert_asset on AssetType {\n  decimals\n  ownedQuantity(identity: {})\n  acceptOfferDisabled {\n    ...useAcceptOfferDisabledReason_data\n  }\n}\n\nfragment AcceptOfferModalContent_criteriaAsset_3z4lq0 on AssetType {\n  __typename\n  assetContract {\n    address\n    id\n  }\n  chain {\n    identifier\n  }\n  tokenId\n  relayId\n  ownedQuantity(identity: {})\n  isCurrentlyFungible\n  defaultRarityData {\n    rank\n    id\n  }\n  ...ItemOfferDetails_item\n  ...FloorPriceDifference_item\n  ...readOptionalCreatorFees_item\n}\n\nfragment AcceptOffersButton_asset on AssetType {\n  relayId\n  ...readOptionalCreatorFees_item\n  ...CreatorFeeInputModalContent_asset\n}\n\nfragment AcceptOffersButton_orders on OrderV2Type {\n  relayId\n  ...readOrderFees_order\n  ...CreatorFeeInputModalContent_orders\n}\n\nfragment AccountLink_data on AccountType {\n  address\n  config\n  isCompromised\n  user {\n    publicUsername\n    id\n  }\n  displayName\n  ...ProfileImage_data\n  ...wallet_accountKey\n  ...accounts_url\n}\n\nfragment AddToCartAndQuickBuyButton_order on OrderV2Type {\n  ...useIsQuickBuyEnabled_order\n  ...ItemAddToCartButton_order\n  ...QuickBuyButton_order\n}\n\nfragment AssetDealLink_asset on AssetType {\n  assetContract {\n    address\n    id\n  }\n  tokenId\n  chain {\n    identifier\n  }\n  assetOwners(first: 1) {\n    edges {\n      node {\n        owner {\n          address\n          id\n        }\n        id\n      }\n    }\n  }\n  ...useGetDealAssetDisabledReason_asset\n}\n\nfragment AssetDetails_data on AssetType {\n  assetContract {\n    openseaVersion\n    address\n    chain\n    blockExplorerLink\n    tokenStandard\n    id\n  }\n  metadataStatus\n  tokenId\n  isFrozen\n  frozenAt\n  tokenMetadata\n  lastUpdatedAt\n  ...useItemFees_item\n}\n\nfragment AssetListButton_asset on AssetType {\n  ...CreateListingButton_item\n}\n\nfragment AssetMediaAnimation_asset on AssetType {\n  ...AssetMediaImage_asset\n  ...AssetMediaContainer_asset\n  ...AssetMediaPlaceholderImage_asset\n}\n\nfragment AssetMediaAudio_asset on AssetType {\n  backgroundColor\n  ...AssetMediaImage_asset\n}\n\nfragment AssetMediaContainer_asset on AssetType {\n  backgroundColor\n  ...AssetMediaEditions_asset_1mZMwQ\n  collection {\n    ...useIsRarityEnabled_collection\n    id\n  }\n}\n\nfragment AssetMediaContainer_asset_1LNk0S on AssetType {\n  backgroundColor\n  ...AssetMediaEditions_asset_1mZMwQ\n  collection {\n    ...useIsRarityEnabled_collection\n    id\n  }\n}\n\nfragment AssetMediaEditions_asset_1mZMwQ on AssetType {\n  decimals\n}\n\nfragment AssetMediaImage_asset on AssetType {\n  backgroundColor\n  imageUrl\n  collection {\n    displayData {\n      cardDisplayStyle\n    }\n    id\n  }\n}\n\nfragment AssetMediaPlaceholderImage_asset on AssetType {\n  collection {\n    displayData {\n      cardDisplayStyle\n    }\n    id\n  }\n}\n\nfragment AssetMediaVideo_asset on AssetType {\n  backgroundColor\n  ...AssetMediaImage_asset\n}\n\nfragment AssetMediaWebgl_asset on AssetType {\n  backgroundColor\n  ...AssetMediaImage_asset\n}\n\nfragment AssetMedia_asset on AssetType {\n  animationUrl\n  displayImageUrl\n  imageUrl\n  isDelisted\n  ...AssetMediaAnimation_asset\n  ...AssetMediaAudio_asset\n  ...AssetMediaContainer_asset_1LNk0S\n  ...AssetMediaImage_asset\n  ...AssetMediaPlaceholderImage_asset\n  ...AssetMediaVideo_asset\n  ...AssetMediaWebgl_asset\n}\n\nfragment AssetOfferModal_asset on AssetType {\n  relayId\n  chain {\n    identifier\n  }\n}\n\nfragment AssetPageMediaHeader__accountInfo_1mZMwQ on AssetType {\n  isFavorite\n  animationUrl\n  imageUrl\n  imageStorageUrl\n}\n\nfragment AssetPageMediaHeader_item on ItemType {\n  __isItemType: __typename\n  relayId\n  __typename\n  ... on AssetType {\n    chain {\n      identifier\n    }\n    decimals\n    favoritesCount\n    isDelisted\n    isFrozen\n    hasUnlockableContent\n  }\n  ... on AssetBundleType {\n    chain {\n      identifier\n    }\n    assetCount\n  }\n}\n\nfragment AssetPage_data_3gcux1 on Query {\n  nft(tokenId: $tokenId, contractAddress: $contractAddress, chain: $chain) {\n    ...AssetPageMediaHeader_item\n    ...AssetPageMediaHeader__accountInfo_1mZMwQ\n    ...asset_display_name\n    ...ContentAuthenticity_data\n    assetContract {\n      address\n      chain\n      ...CollectionLink_assetContract\n      id\n    }\n    creator {\n      address\n      user {\n        publicUsername\n        id\n      }\n      displayName\n      ...AccountLink_data\n      id\n    }\n    animationUrl\n    backgroundColor\n    collection {\n      description\n      isSensitiveContent\n      displayData {\n        cardDisplayStyle\n      }\n      category {\n        slug\n      }\n      hidden\n      imageUrl\n      name\n      slug\n      ...CollectionLink_collection\n      ...Boost_collection\n      ...Property_collection\n      ...NumericTrait_collection\n      ...SocialBar_data\n      ...useIsLiveUpdatesEnabledForCollection_collection\n      ...useIsRarityEnabled_collection\n      ...CollectionInspiredBy_data\n      id\n    }\n    decimals\n    description\n    imageUrl\n    name\n    numVisitors\n    isDelisted\n    isListable\n    isReportedSuspicious\n    isSensitiveContent\n    isUnderReview\n    isCompromised\n    isBiddingEnabled {\n      value\n      reason\n    }\n    relayId\n    tokenId\n    hasUnlockableContent\n    favoritesCount\n    tradeSummary {\n      bestAsk {\n        closedAt\n        orderType\n        priceType {\n          usd\n        }\n        maker {\n          ...wallet_accountKey\n          id\n        }\n        relayId\n        ...PrivateListingBanner_data\n        id\n      }\n      bestBid {\n        __typename\n        id\n      }\n      ...TradeStation_data\n    }\n    acceptHighestOffer: tradeSummary(excludeAccountAsMaker: true) {\n      ...TradeStation_acceptHighestOffer\n    }\n    traits(first: 100) {\n      edges {\n        node {\n          relayId\n          displayType\n          floatValue\n          intValue\n          traitType\n          value\n          ...Boost_trait\n          ...Property_trait\n          ...NumericTrait_trait\n          ...Date_trait\n          id\n        }\n      }\n    }\n    defaultRarityData {\n      ...RarityIndicator_data\n      id\n    }\n    ...AssetMedia_asset\n    ...Toolbar_asset\n    ...asset_url\n    ...itemEvents_data\n    ...AssetDetails_data\n    ownedQuantity(identity: {})\n    assetOwners(first: 1) {\n      edges {\n        node {\n          quantity\n          owner {\n            ...AccountLink_data\n            id\n          }\n          id\n        }\n      }\n      count\n    }\n    totalQuantity\n    isCurrentlyFungible\n    ...RedeemableItemCard_itemToBurn\n    ...TradeStation_archetype\n    ...OffersPanel_asset\n    ...ListingsPanel_asset\n    ...SemiFungibleTradeStation_asset\n    ...OrderManager_item\n    ...ItemTrackingContext_item\n    activity(first: 11) {\n      edges {\n        node {\n          __typename\n          id\n        }\n      }\n    }\n    id\n  }\n  ...SemiFungibleTradeStation_bestListings_3gcux1\n  ...SemiFungibleTradeStation_bestOffers_3gcux1\n  ...CampaignAnnouncementModal_data\n}\n\nfragment Boost_collection on CollectionType {\n  numericTraits {\n    key\n    value {\n      max\n    }\n  }\n  ...collection_url\n}\n\nfragment Boost_trait on TraitType {\n  displayType\n  floatValue\n  intValue\n  traitType\n}\n\nfragment BulkPurchaseModal_orders on OrderV2Type {\n  relayId\n  item {\n    __typename\n    relayId\n    chain {\n      identifier\n    }\n    ... on AssetType {\n      collection {\n        slug\n        isSafelisted\n        id\n      }\n    }\n    ... on Node {\n      __isNode: __typename\n      id\n    }\n  }\n  payment {\n    relayId\n    symbol\n    id\n  }\n  ...useTotalPrice_orders\n  ...useFulfillingListingsWillReactivateOrders_orders\n}\n\nfragment BuyNowButton_orders on OrderV2Type {\n  ...BulkPurchaseModal_orders\n}\n\nfragment CampaignAnnouncementModal_data on Query {\n  campaignAnnouncementModal {\n    campaignId\n    title\n    description\n    overrideUrl\n    ctaText\n    ctaUrl\n    id\n  }\n}\n\nfragment CollectionInspiredBy_data on CollectionType {\n  inspiredBy(first: 2) {\n    edges {\n      node {\n        slug\n        name\n        ...collection_url\n        id\n      }\n    }\n  }\n}\n\nfragment CollectionLink_assetContract on AssetContractType {\n  address\n  blockExplorerLink\n}\n\nfragment CollectionLink_collection on CollectionType {\n  name\n  slug\n  verificationStatus\n  ...collection_url\n}\n\nfragment ContentAuthenticity_data on AssetType {\n  authenticityMetadata {\n    signedOn\n    signedBy\n    producedWith\n    walletAddress\n    id\n  }\n  imageUrl\n  creator {\n    address\n    id\n  }\n  chain {\n    identifier\n  }\n}\n\nfragment ContextualPriceListBestOfferItem_tradeSummary on TradeSummaryType {\n  bestBid {\n    perUnitPriceType {\n      unit\n      symbol\n      usd\n    }\n    id\n  }\n}\n\nfragment ContextualPriceList_tradeSummary on TradeSummaryType {\n  ...ContextualPriceListBestOfferItem_tradeSummary\n}\n\nfragment CreateListingButton_item on ItemType {\n  __isItemType: __typename\n  __typename\n  ... on AssetType {\n    ...CreateQuickSingleListingFlowModal_asset\n  }\n  ...itemEvents_dataV2\n  ...item_sellUrl\n}\n\nfragment CreateQuickSingleListingFlowModal_asset on AssetType {\n  relayId\n  chain {\n    identifier\n  }\n  ...itemEvents_dataV2\n}\n\nfragment CreatorFeeInputModalContent_asset on AssetType {\n  ...ItemOfferDetails_item\n  ...readOptionalCreatorFees_item\n  ...useItemFees_item\n}\n\nfragment CreatorFeeInputModalContent_orders on OrderV2Type {\n  ...readOrderFees_order\n  ...ServiceFeeText_orders\n}\n\nfragment Date_trait on TraitType {\n  traitType\n  floatValue\n  intValue\n}\n\nfragment EditListingButton_item on ItemType {\n  __isItemType: __typename\n  chain {\n    identifier\n  }\n  ...EditListingModal_item\n  ...itemEvents_dataV2\n}\n\nfragment EditListingButton_listing on OrderV2Type {\n  ...EditListingModal_listing\n}\n\nfragment EditListingModal_item on ItemType {\n  __isItemType: __typename\n  __typename\n  ... on AssetType {\n    tokenId\n    assetContract {\n      address\n      id\n    }\n    chain {\n      identifier\n    }\n  }\n}\n\nfragment EditListingModal_listing on OrderV2Type {\n  relayId\n}\n\nfragment FloorPriceDifference_item on ItemType {\n  __isItemType: __typename\n  ... on AssetType {\n    collection {\n      statsV2 {\n        floorPrice {\n          eth\n        }\n      }\n      id\n    }\n  }\n}\n\nfragment ItemAddToCartButton_order on OrderV2Type {\n  maker {\n    address\n    id\n  }\n  taker {\n    address\n    id\n  }\n  item {\n    __typename\n    ... on AssetType {\n      isCurrentlyFungible\n    }\n    ...itemEvents_dataV2\n    ... on Node {\n      __isNode: __typename\n      id\n    }\n  }\n  openedAt\n  ...ShoppingCartContextProvider_inline_order\n}\n\nfragment ItemOfferDetails_item on ItemType {\n  __isItemType: __typename\n  __typename\n  ... on AssetType {\n    displayName\n    collection {\n      ...CollectionLink_collection\n      id\n    }\n    ...StackedAssetMedia_assets\n  }\n  ... on AssetBundleType {\n    displayName\n    bundleCollection: collection {\n      ...CollectionLink_collection\n      id\n    }\n    assetQuantities(first: 18) {\n      edges {\n        node {\n          asset {\n            ...StackedAssetMedia_assets\n            id\n          }\n          id\n        }\n      }\n    }\n  }\n}\n\nfragment ItemTrackingContext_item on ItemType {\n  __isItemType: __typename\n  relayId\n  verificationStatus\n  chain {\n    identifier\n  }\n  ... on AssetType {\n    tokenId\n    isReportedSuspicious\n    assetContract {\n      address\n      id\n    }\n  }\n  ... on AssetBundleType {\n    slug\n  }\n}\n\nfragment ListingFeesSupportsCreator_orders on OrderV2Type {\n  side\n  item {\n    __typename\n    ... on AssetType {\n      totalCreatorFee\n    }\n    ... on Node {\n      __isNode: __typename\n      id\n    }\n  }\n  ...readOrderFees_order\n}\n\nfragment ListingsPanel_asset on AssetType {\n  tokenId\n  isCurrentlyFungible\n  ownedQuantity(identity: {})\n  chain {\n    identifier\n  }\n  assetContract {\n    address\n    id\n  }\n}\n\nfragment MakeAssetOfferButton_asset on AssetType {\n  relayId\n  verificationStatus\n  isBiddingEnabled {\n    value\n    reason\n  }\n  chain {\n    identifier\n  }\n  ...AssetOfferModal_asset\n}\n\nfragment NumericTrait_collection on CollectionType {\n  numericTraits {\n    key\n    value {\n      max\n    }\n  }\n  ...collection_url\n}\n\nfragment NumericTrait_trait on TraitType {\n  floatValue\n  intValue\n  maxValue\n  traitType\n}\n\nfragment OfferModal_tradeSummary on TradeSummaryType {\n  bestAsk {\n    relayId\n    closedAt\n    payment {\n      relayId\n      id\n    }\n    id\n  }\n  ...useOfferModalAdapter_tradeData\n  ...ContextualPriceList_tradeSummary\n}\n\nfragment OffersPanel_asset on AssetType {\n  relayId\n  tokenId\n  isCurrentlyFungible\n  ownedQuantity(identity: {})\n  chain {\n    identifier\n  }\n  assetContract {\n    address\n    id\n  }\n  ...AcceptOfferDisabledAlert_asset\n}\n\nfragment OrderListItem_order on OrderV2Type {\n  relayId\n  makerOwnedQuantity\n  item {\n    __typename\n    displayName\n    ... on AssetType {\n      assetContract {\n        ...CollectionLink_assetContract\n        id\n      }\n      collection {\n        ...CollectionLink_collection\n        id\n      }\n      ...AssetMedia_asset\n      ...asset_url\n      ...useItemFees_item\n    }\n    ... on AssetBundleType {\n      assetQuantities(first: 30) {\n        edges {\n          node {\n            asset {\n              displayName\n              relayId\n              assetContract {\n                ...CollectionLink_assetContract\n                id\n              }\n              collection {\n                ...CollectionLink_collection\n                id\n              }\n              ...StackedAssetMedia_assets\n              ...AssetMedia_asset\n              ...asset_url\n              id\n            }\n            id\n          }\n        }\n      }\n    }\n    ...itemEvents_dataV2\n    ...useIsItemSafelisted_item\n    ...ItemTrackingContext_item\n    ... on Node {\n      __isNode: __typename\n      id\n    }\n  }\n  remainingQuantityType\n  ...OrderPrice\n}\n\nfragment OrderList_orders on OrderV2Type {\n  item {\n    __typename\n    ... on AssetType {\n      __typename\n      relayId\n    }\n    ... on AssetBundleType {\n      __typename\n      assetQuantities(first: 30) {\n        edges {\n          node {\n            asset {\n              relayId\n              id\n            }\n            id\n          }\n        }\n      }\n    }\n    ... on Node {\n      __isNode: __typename\n      id\n    }\n  }\n  relayId\n  ...OrderListItem_order\n  ...useFulfillingListingsWillReactivateOrders_orders\n}\n\nfragment OrderManager_item on ItemType {\n  __isItemType: __typename\n  __typename\n  chain {\n    isTradingEnabled\n  }\n  tradeSummary {\n    bestAsk {\n      __typename\n      ...EditListingButton_listing\n      id\n    }\n  }\n  ... on AssetType {\n    isEditable {\n      value\n    }\n    ownedQuantity(identity: {})\n    isCurrentlyFungible\n    ...asset_edit_url\n  }\n  ...CreateListingButton_item\n  ...EditListingButton_item\n}\n\nfragment OrderPrice on OrderV2Type {\n  priceType {\n    unit\n  }\n  perUnitPriceType {\n    unit\n  }\n  payment {\n    ...TokenPricePayment\n    id\n  }\n}\n\nfragment OrderUsdPrice on OrderV2Type {\n  priceType {\n    usd\n  }\n  perUnitPriceType {\n    usd\n  }\n}\n\nfragment PrivateListingBanner_data on OrderV2Type {\n  taker {\n    address\n    ...AccountLink_data\n    ...wallet_accountKey\n    id\n  }\n  maker {\n    ...wallet_accountKey\n    id\n  }\n}\n\nfragment ProfileImage_data on AccountType {\n  imageUrl\n}\n\nfragment Property_collection on CollectionType {\n  ...collection_url\n  statsV2 {\n    totalSupply\n  }\n}\n\nfragment Property_trait on TraitType {\n  traitCount\n  traitType\n  value\n}\n\nfragment QuickBuyButton_order on OrderV2Type {\n  maker {\n    address\n    id\n  }\n  taker {\n    address\n    ...wallet_accountKey\n    id\n  }\n  item {\n    __typename\n    chain {\n      identifier\n    }\n    ...itemEvents_dataV2\n    ... on Node {\n      __isNode: __typename\n      id\n    }\n  }\n  openedAt\n  relayId\n}\n\nfragment RarityIndicator_data on RarityDataType {\n  rank\n  rankPercentile\n  rankCount\n  maxRank\n}\n\nfragment RedeemableItemCard_itemToBurn on AssetType {\n  collection {\n    name\n    id\n  }\n  ...asset_url\n}\n\nfragment SemiFungibleTradeStation_asset on AssetType {\n  ownedQuantity(identity: {})\n  ...TradeStationBuyTab_asset\n  ...TradeStationSellTab_asset\n}\n\nfragment SemiFungibleTradeStation_bestListings_3gcux1 on Query {\n  ...TradeStationBuyTab_bestListings_3gcux1\n}\n\nfragment SemiFungibleTradeStation_bestOffers_3gcux1 on Query {\n  ...TradeStationSellTab_bestOffers_3gcux1\n}\n\nfragment ServiceFeeText_orders on OrderV2Type {\n  ...readOrderFees_order\n}\n\nfragment ShoppingCartContextProvider_inline_order on OrderV2Type {\n  relayId\n  makerOwnedQuantity\n  item {\n    __typename\n    chain {\n      identifier\n    }\n    relayId\n    ... on AssetBundleType {\n      assetQuantities(first: 30) {\n        edges {\n          node {\n            asset {\n              relayId\n              id\n            }\n            id\n          }\n        }\n      }\n    }\n    ... on Node {\n      __isNode: __typename\n      id\n    }\n  }\n  maker {\n    relayId\n    id\n  }\n  taker {\n    address\n    ...wallet_accountKey\n    id\n  }\n  priceType {\n    usd\n  }\n  payment {\n    relayId\n    id\n  }\n  remainingQuantityType\n  ...useTotalItems_orders\n  ...ShoppingCart_orders\n}\n\nfragment ShoppingCartDetailedView_orders on OrderV2Type {\n  relayId\n  item {\n    __typename\n    chain {\n      identifier\n    }\n    ... on Node {\n      __isNode: __typename\n      id\n    }\n  }\n  supportsGiftingOnPurchase\n  ...useTotalPrice_orders\n  ...OrderList_orders\n}\n\nfragment ShoppingCart_orders on OrderV2Type {\n  ...ShoppingCartDetailedView_orders\n  ...BulkPurchaseModal_orders\n}\n\nfragment SocialBar_data on CollectionType {\n  relayId\n  discordUrl\n  externalUrl\n  mediumUsername\n  slug\n  telegramUrl\n  twitterUsername\n  connectedInstagramUsername\n  connectedTwitterUsername\n  assetContracts(first: 2) {\n    edges {\n      node {\n        blockExplorerLink\n        chainData {\n          blockExplorer {\n            name\n            identifier\n          }\n        }\n        id\n      }\n    }\n  }\n}\n\nfragment StackedAssetMedia_assets on AssetType {\n  relayId\n  ...AssetMedia_asset\n  collection {\n    logo\n    id\n  }\n}\n\nfragment TokenPricePayment on PaymentAssetType {\n  symbol\n}\n\nfragment Toolbar_asset on AssetType {\n  ...asset_url\n  ...AssetDealLink_asset\n  ...itemEvents_data\n  assetContract {\n    address\n    id\n  }\n  collection {\n    externalUrl\n    id\n  }\n  externalLink\n  relayId\n}\n\nfragment TradeStationBuyTab_asset on AssetType {\n  tradeSummary {\n    bestAsk {\n      ...TradeStationOrderPrice_order\n      id\n    }\n  }\n  ...useFulfillSemiFungibleOrders_asset\n  ...MakeAssetOfferButton_asset\n  ...itemEvents_dataV2\n}\n\nfragment TradeStationBuyTab_bestListings_3gcux1 on Query {\n  nft(tokenId: $tokenId, contractAddress: $contractAddress, chain: $chain) {\n    bestListings(first: 10, forTaker: {}) {\n      edges {\n        node {\n          ...useFulfillSemiFungibleOrders_orders\n          id\n          __typename\n        }\n        cursor\n      }\n      pageInfo {\n        endCursor\n        hasNextPage\n      }\n    }\n    id\n  }\n}\n\nfragment TradeStationOrderPrice_order on OrderV2Type {\n  ...OrderPrice\n  ...OrderUsdPrice\n}\n\nfragment TradeStationSellTab_asset on AssetType {\n  ownedQuantity(identity: {})\n  tradeSummary {\n    bestBid {\n      ...TradeStationOrderPrice_order\n      id\n    }\n  }\n  ...useFulfillSemiFungibleOrders_asset\n  ...AssetListButton_asset\n  ...itemEvents_dataV2\n}\n\nfragment TradeStationSellTab_bestOffers_3gcux1 on Query {\n  nft(tokenId: $tokenId, contractAddress: $contractAddress, chain: $chain) {\n    bestOffers(first: 10, forTaker: {}) {\n      edges {\n        node {\n          ...useFulfillSemiFungibleOrders_orders\n          id\n          __typename\n        }\n        cursor\n      }\n      pageInfo {\n        endCursor\n        hasNextPage\n      }\n    }\n    id\n  }\n}\n\nfragment TradeStation_acceptHighestOffer on TradeSummaryType {\n  bestBid {\n    relayId\n    id\n  }\n  ...AcceptHighestOfferButton_tradeSummary\n}\n\nfragment TradeStation_archetype on AssetType {\n  verificationStatus\n  chain {\n    identifier\n    isTradingEnabled\n  }\n  largestOwner {\n    owner {\n      ...wallet_accountKey\n      id\n    }\n    id\n  }\n  isCurrentlyFungible\n  isListable\n  isBiddingEnabled {\n    value\n    reason\n  }\n  relayId\n  acceptOfferDisabled {\n    __typename\n  }\n  isFastPollingEnabled\n  ...AcceptHighestOfferButton_asset\n  ...useFulfillSemiFungibleOrders_asset\n  ...AssetOfferModal_asset\n}\n\nfragment TradeStation_bestAsk on OrderV2Type {\n  closedAt\n  openedAt\n  orderType\n  englishAuctionReservePriceType {\n    unit\n  }\n  relayId\n  maker {\n    address\n    ...wallet_accountKey\n    id\n  }\n  item {\n    __typename\n    verificationStatus\n    relayId\n    chain {\n      identifier\n      isTradingEnabled\n    }\n    ... on AssetType {\n      tokenId\n      isCurrentlyFungible\n      assetContract {\n        address\n        id\n      }\n      collection {\n        slug\n        id\n      }\n    }\n    ...itemEvents_dataV2\n    ... on Node {\n      __isNode: __typename\n      id\n    }\n  }\n  priceType {\n    unit\n    usd\n  }\n  remainingQuantityType\n  perUnitPriceType {\n    usd\n  }\n  payment {\n    symbol\n    relayId\n    asset {\n      relayId\n      id\n    }\n    ...TokenPricePayment\n    id\n  }\n  taker {\n    ...wallet_accountKey\n    id\n  }\n  ...OrderPrice\n  ...OrderUsdPrice\n  ...AddToCartAndQuickBuyButton_order\n  ...QuickBuyButton_order\n}\n\nfragment TradeStation_bestBid on OrderV2Type {\n  ...OrderPrice\n  ...OrderUsdPrice\n  payment {\n    relayId\n    id\n  }\n  priceType {\n    unit\n  }\n  perUnitPriceType {\n    usd\n  }\n}\n\nfragment TradeStation_data on TradeSummaryType {\n  bestAsk {\n    ...TradeStation_bestAsk\n    ...ListingFeesSupportsCreator_orders\n    id\n  }\n  bestBid {\n    ...TradeStation_bestBid\n    id\n  }\n  ...OfferModal_tradeSummary\n}\n\nfragment accounts_url on AccountType {\n  address\n  user {\n    publicUsername\n    id\n  }\n}\n\nfragment asset_display_name on AssetType {\n  tokenId\n  name\n}\n\nfragment asset_edit_url on AssetType {\n  assetContract {\n    address\n    chain\n    id\n  }\n  tokenId\n  collection {\n    slug\n    id\n  }\n}\n\nfragment asset_url on AssetType {\n  assetContract {\n    address\n    id\n  }\n  tokenId\n  chain {\n    identifier\n  }\n}\n\nfragment collection_url on CollectionType {\n  slug\n  isCategory\n}\n\nfragment itemEvents_data on AssetType {\n  relayId\n  assetContract {\n    address\n    id\n  }\n  tokenId\n  chain {\n    identifier\n  }\n}\n\nfragment itemEvents_dataV2 on ItemType {\n  __isItemType: __typename\n  relayId\n  chain {\n    identifier\n  }\n  ... on AssetType {\n    tokenId\n    assetContract {\n      address\n      id\n    }\n  }\n}\n\nfragment item_sellUrl on ItemType {\n  __isItemType: __typename\n  __typename\n  ... on AssetType {\n    ...asset_url\n  }\n  ... on AssetBundleType {\n    slug\n    chain {\n      identifier\n    }\n    assetQuantities(first: 18) {\n      edges {\n        node {\n          asset {\n            relayId\n            id\n          }\n          id\n        }\n      }\n    }\n  }\n}\n\nfragment price on OrderV2Type {\n  priceType {\n    unit\n  }\n}\n\nfragment readOptionalCreatorFees_item on ItemType {\n  __isItemType: __typename\n  __typename\n  ... on AssetType {\n    collection {\n      isCreatorFeesEnforced\n      totalCreatorFeeBasisPoints\n      id\n    }\n  }\n}\n\nfragment readOrderFees_order on OrderV2Type {\n  makerFees(first: 10) {\n    edges {\n      node {\n        basisPoints\n        isOpenseaFee\n        id\n      }\n    }\n  }\n  takerFees(first: 10) {\n    edges {\n      node {\n        basisPoints\n        isOpenseaFee\n        id\n      }\n    }\n  }\n}\n\nfragment useAcceptOfferDisabledReason_data on AcceptOfferDisabledType {\n  until\n}\n\nfragment useFulfillSemiFungibleOrders_asset on AssetType {\n  relayId\n  totalQuantity\n  ownedQuantity(identity: {})\n  ...AcceptOffersButton_asset\n}\n\nfragment useFulfillSemiFungibleOrders_orders on OrderV2Type {\n  relayId\n  payment {\n    symbol\n    id\n  }\n  perUnitPriceType {\n    unit\n  }\n  remainingQuantityType\n  ...useOrdersWithValidMakerOwnedQuantity_order\n  ...useTotalPrice_orders\n  ...BuyNowButton_orders\n  ...AcceptOffersButton_orders\n  ...ListingFeesSupportsCreator_orders\n}\n\nfragment useFulfillingListingsWillReactivateOrders_orders on OrderV2Type {\n  ...useTotalItems_orders\n}\n\nfragment useGetDealAssetDisabledReason_asset on AssetType {\n  isCompromised\n  isCurrentlyFungible\n  isListable\n  tokenStandard\n  chain {\n    isTradingEnabled\n  }\n  collection {\n    safelistRequestStatus\n    id\n  }\n}\n\nfragment useIsItemSafelisted_item on ItemType {\n  __isItemType: __typename\n  __typename\n  ... on AssetType {\n    collection {\n      slug\n      verificationStatus\n      id\n    }\n  }\n  ... on AssetBundleType {\n    assetQuantities(first: 30) {\n      edges {\n        node {\n          asset {\n            collection {\n              slug\n              verificationStatus\n              id\n            }\n            id\n          }\n          id\n        }\n      }\n    }\n  }\n}\n\nfragment useIsLiveUpdatesEnabledForCollection_collection on CollectionType {\n  statsV2 {\n    hasFungibles\n  }\n}\n\nfragment useIsQuickBuyEnabled_order on OrderV2Type {\n  orderType\n  item {\n    __typename\n    ... on AssetType {\n      isCurrentlyFungible\n    }\n    ... on Node {\n      __isNode: __typename\n      id\n    }\n  }\n}\n\nfragment useIsRarityEnabled_collection on CollectionType {\n  slug\n  enabledRarities\n}\n\nfragment useItemFees_item on ItemType {\n  __isItemType: __typename\n  __typename\n  ... on AssetType {\n    totalCreatorFee\n    collection {\n      openseaSellerFeeBasisPoints\n      isCreatorFeesEnforced\n      id\n    }\n  }\n  ... on AssetBundleType {\n    bundleCollection: collection {\n      openseaSellerFeeBasisPoints\n      totalCreatorFeeBasisPoints\n      isCreatorFeesEnforced\n      id\n    }\n  }\n}\n\nfragment useOfferModalAdapter_tradeData on TradeSummaryType {\n  bestAsk {\n    orderType\n    relayId\n    item {\n      __typename\n      verificationStatus\n      ... on Node {\n        __isNode: __typename\n        id\n      }\n    }\n    payment {\n      relayId\n      id\n    }\n    perUnitPriceType {\n      unit\n    }\n    id\n  }\n  bestBid {\n    relayId\n    payment {\n      relayId\n      id\n    }\n    ...price\n    id\n  }\n}\n\nfragment useOrdersWithValidMakerOwnedQuantity_order on OrderV2Type {\n  makerOwnedQuantity\n  remainingQuantityType\n  side\n  perUnitPriceType {\n    unit\n  }\n  maker {\n    relayId\n    id\n  }\n}\n\nfragment useTotalItems_orders on OrderV2Type {\n  item {\n    __typename\n    relayId\n    ... on AssetBundleType {\n      assetQuantities(first: 30) {\n        edges {\n          node {\n            asset {\n              relayId\n              id\n            }\n            id\n          }\n        }\n      }\n    }\n    ... on Node {\n      __isNode: __typename\n      id\n    }\n  }\n}\n\nfragment useTotalPrice_orders on OrderV2Type {\n  relayId\n  perUnitPriceType {\n    usd\n    unit\n  }\n  payment {\n    symbol\n    ...TokenPricePayment\n    id\n  }\n}\n\nfragment wallet_accountKey on AccountType {\n  address\n}\n';
const CreateListingActionModalQuery =
  'query CreateListingActionModalQuery(\n  $item: AssetQuantityInputType!\n  $price: PaymentAssetQuantityInputType!\n  $recipient: AddressScalar\n  $openedAt: DateTime!\n  $closedAt: DateTime!\n  $englishAuctionReservePrice: BigNumberScalar\n  $optionalCreatorFeeBasisPoints: Int\n) {\n  blockchain {\n    createListingActions(item: $item, price: $price, recipient: $recipient, openedAt: $openedAt, closedAt: $closedAt, englishAuctionReservePrice: $englishAuctionReservePrice, optionalCreatorFeeBasisPoints: $optionalCreatorFeeBasisPoints) {\n      __typename\n      ...BlockchainActionList_data\n    }\n  }\n}\n\nfragment AskForDepositAction_data on AskForDepositType {\n  asset {\n    chain {\n      identifier\n    }\n    decimals\n    symbol\n    usdSpotPrice\n    id\n  }\n  minQuantity\n}\n\nfragment AskForSwapAction_data on AskForSwapType {\n  __typename\n  fromAsset {\n    chain {\n      identifier\n    }\n    decimals\n    symbol\n    id\n  }\n  toAsset {\n    chain {\n      identifier\n    }\n    symbol\n    id\n  }\n  minQuantity\n  maxQuantity\n  ...useHandleBlockchainActions_ask_for_asset_swap\n}\n\nfragment AssetApprovalAction_data on AssetApprovalActionType {\n  __typename\n  asset {\n    chain {\n      identifier\n    }\n    ...StackedAssetMedia_assets\n    assetContract {\n      ...CollectionLink_assetContract\n      id\n    }\n    collection {\n      __typename\n      ...CollectionLink_collection\n      id\n    }\n    id\n  }\n  ...useHandleBlockchainActions_approve_asset\n}\n\nfragment AssetBurnToRedeemAction_data on AssetBurnToRedeemActionType {\n  __typename\n  ...useHandleBlockchainActions_burnToRedeem\n  asset {\n    chain {\n      identifier\n    }\n    assetContract {\n      ...CollectionLink_assetContract\n      id\n    }\n    collection {\n      __typename\n      ...CollectionLink_collection\n      id\n    }\n    displayName\n    ...StackedAssetMedia_assets\n    id\n  }\n}\n\nfragment AssetItem_asset on AssetType {\n  chain {\n    identifier\n  }\n  displayName\n  relayId\n  collection {\n    name\n    id\n  }\n  ...StackedAssetMedia_assets\n}\n\nfragment AssetMediaAnimation_asset on AssetType {\n  ...AssetMediaImage_asset\n  ...AssetMediaContainer_asset\n  ...AssetMediaPlaceholderImage_asset\n}\n\nfragment AssetMediaAudio_asset on AssetType {\n  backgroundColor\n  ...AssetMediaImage_asset\n}\n\nfragment AssetMediaContainer_asset on AssetType {\n  backgroundColor\n  ...AssetMediaEditions_asset_1mZMwQ\n  collection {\n    ...useIsRarityEnabled_collection\n    id\n  }\n}\n\nfragment AssetMediaContainer_asset_1LNk0S on AssetType {\n  backgroundColor\n  ...AssetMediaEditions_asset_1mZMwQ\n  collection {\n    ...useIsRarityEnabled_collection\n    id\n  }\n}\n\nfragment AssetMediaEditions_asset_1mZMwQ on AssetType {\n  decimals\n}\n\nfragment AssetMediaImage_asset on AssetType {\n  backgroundColor\n  imageUrl\n  collection {\n    displayData {\n      cardDisplayStyle\n    }\n    id\n  }\n}\n\nfragment AssetMediaPlaceholderImage_asset on AssetType {\n  collection {\n    displayData {\n      cardDisplayStyle\n    }\n    id\n  }\n}\n\nfragment AssetMediaVideo_asset on AssetType {\n  backgroundColor\n  ...AssetMediaImage_asset\n}\n\nfragment AssetMediaWebgl_asset on AssetType {\n  backgroundColor\n  ...AssetMediaImage_asset\n}\n\nfragment AssetMedia_asset on AssetType {\n  animationUrl\n  displayImageUrl\n  imageUrl\n  isDelisted\n  ...AssetMediaAnimation_asset\n  ...AssetMediaAudio_asset\n  ...AssetMediaContainer_asset_1LNk0S\n  ...AssetMediaImage_asset\n  ...AssetMediaPlaceholderImage_asset\n  ...AssetMediaVideo_asset\n  ...AssetMediaWebgl_asset\n}\n\nfragment AssetSwapAction_data on AssetSwapActionType {\n  __typename\n  ...useHandleBlockchainActions_swap_asset\n}\n\nfragment AssetTransferAction_data on AssetTransferActionType {\n  __typename\n  ...useHandleBlockchainActions_transfer_asset\n}\n\nfragment BlockchainActionList_data on BlockchainActionType {\n  __isBlockchainActionType: __typename\n  __typename\n  ... on AssetApprovalActionType {\n    ...AssetApprovalAction_data\n  }\n  ... on AskForDepositType {\n    __typename\n    ...AskForDepositAction_data\n  }\n  ... on AskForSwapType {\n    __typename\n    ...AskForSwapAction_data\n  }\n  ... on AssetSwapActionType {\n    __typename\n    ...AssetSwapAction_data\n  }\n  ... on AssetTransferActionType {\n    __typename\n    ...AssetTransferAction_data\n  }\n  ... on CreateOrderActionType {\n    __typename\n    ...CreateOrderAction_data\n  }\n  ... on CreateBulkOrderActionType {\n    __typename\n    ...CreateBulkOrderAction_data\n  }\n  ... on CreateSwapOrderActionType {\n    __typename\n    ...CreateSwapOrderAction_data\n  }\n  ... on CancelOrderActionType {\n    __typename\n    ...CancelOrderAction_data\n  }\n  ... on CancelSwapOrdersActionType {\n    __typename\n    ...CancelSwapOrdersAction_data\n  }\n  ... on FulfillOrderActionType {\n    __typename\n    ...FulfillOrderAction_data\n  }\n  ... on FulfillSwapOrderActionType {\n    __typename\n    ...FulfillSwapOrderAction_data\n  }\n  ... on BulkAcceptOffersActionType {\n    __typename\n    ...BulkAcceptOffersAction_data\n  }\n  ... on BulkFulfillOrdersActionType {\n    __typename\n    ...BulkFulfillOrdersAction_data\n  }\n  ... on PaymentAssetApprovalActionType {\n    __typename\n    ...PaymentAssetApprovalAction_data\n  }\n  ... on MintActionType {\n    __typename\n    ...MintAction_data\n  }\n  ... on DropContractDeployActionType {\n    __typename\n    ...DeployContractAction_data\n  }\n  ... on DropMechanicsUpdateActionType {\n    __typename\n    ...UpdateDropMechanicsAction_data\n  }\n  ... on SetCreatorFeesActionType {\n    __typename\n    ...SetCreatorFeesAction_data\n  }\n  ... on CollectionTokenMetadataUpdateActionType {\n    __typename\n    ...UpdatePreRevealAction_data\n  }\n  ... on AssetBurnToRedeemActionType {\n    __typename\n    ...AssetBurnToRedeemAction_data\n  }\n  ... on MintYourOwnCollectionActionType {\n    __typename\n    ...MintYourOwnCollectionAction_data\n  }\n}\n\nfragment BulkAcceptOffersAction_data on BulkAcceptOffersActionType {\n  __typename\n  maxQuantityToFill\n  offersToAccept {\n    itemFillAmount\n    orderData {\n      chain {\n        identifier\n      }\n      item {\n        __typename\n        ... on AssetQuantityDataType {\n          asset {\n            ...StackedAssetMedia_assets\n            id\n          }\n        }\n        ... on AssetBundleType {\n          assetQuantities(first: 30) {\n            edges {\n              node {\n                asset {\n                  ...StackedAssetMedia_assets\n                  id\n                }\n                id\n              }\n            }\n          }\n        }\n        ... on Node {\n          __isNode: __typename\n          id\n        }\n      }\n      ...useTotalItems_ordersData\n    }\n    criteriaAsset {\n      relayId\n      ...StackedAssetMedia_assets\n      id\n    }\n    ...useTotalPriceOfferDataToAccept_offersToAccept\n    ...readOfferDataToAcceptPrice_offerToAccept\n  }\n  ...useHandleBlockchainActions_bulk_accept_offers\n}\n\nfragment BulkFulfillOrdersAction_data on BulkFulfillOrdersActionType {\n  __typename\n  maxOrdersToFill\n  ordersToFill {\n    itemFillAmount\n    orderData {\n      chain {\n        identifier\n      }\n      item {\n        __typename\n        ... on AssetQuantityDataType {\n          asset {\n            ...StackedAssetMedia_assets\n            id\n          }\n        }\n        ... on AssetBundleType {\n          assetQuantities(first: 30) {\n            edges {\n              node {\n                asset {\n                  ...StackedAssetMedia_assets\n                  id\n                }\n                id\n              }\n            }\n          }\n        }\n        ... on Node {\n          __isNode: __typename\n          id\n        }\n      }\n      ...useTotalItems_ordersData\n    }\n    ...useTotalPriceOrderDataToFill_ordersToFill\n    ...readOrderDataToFillPrices_orderDataToFill\n  }\n  ...useHandleBlockchainActions_bulk_fulfill_orders\n}\n\nfragment CancelOrderActionGaslessContent_action on CancelOrderActionType {\n  ordersData {\n    side\n    orderType\n    item {\n      __typename\n      ... on AssetQuantityDataType {\n        asset {\n          displayName\n          ...StackedAssetMedia_assets\n          id\n        }\n      }\n      ... on Node {\n        __isNode: __typename\n        id\n      }\n    }\n    price {\n      unit\n      symbol\n    }\n    orderCriteria {\n      collection {\n        name\n        representativeAsset {\n          ...StackedAssetMedia_assets\n          id\n        }\n        id\n      }\n    }\n  }\n}\n\nfragment CancelOrderActionOnChainContent_action on CancelOrderActionType {\n  ordersData {\n    side\n    orderType\n    ...OrderDataHeader_order\n    ...OrdersHeaderData_orders\n  }\n}\n\nfragment CancelOrderAction_data on CancelOrderActionType {\n  __typename\n  ordersData {\n    orderType\n    side\n    item {\n      __typename\n      ... on AssetQuantityDataType {\n        asset {\n          ...GaslessCancellationProcessingModal_items\n          ...GaslessCancellationFailedModal_items\n          id\n        }\n        quantity\n      }\n      ... on Node {\n        __isNode: __typename\n        id\n      }\n    }\n    orderCriteria {\n      collection {\n        representativeAsset {\n          ...GaslessCancellationProcessingModal_items\n          ...GaslessCancellationFailedModal_items\n          id\n        }\n        id\n      }\n      quantity\n    }\n  }\n  method {\n    __typename\n  }\n  ...CancelOrderActionOnChainContent_action\n  ...useHandleBlockchainActions_cancel_orders\n  ...CancelOrderActionGaslessContent_action\n}\n\nfragment CancelSwapOrdersAction_data on CancelSwapOrdersActionType {\n  __typename\n  swapsData {\n    ...SwapDataHeader_swap\n  }\n  ...useHandleBlockchainActions_cancel_swap_orders\n}\n\nfragment CollectionLink_assetContract on AssetContractType {\n  address\n  blockExplorerLink\n}\n\nfragment CollectionLink_collection on CollectionType {\n  name\n  slug\n  verificationStatus\n  ...collection_url\n}\n\nfragment CollectionOfferDetails_collection on CollectionType {\n  representativeAsset {\n    assetContract {\n      ...CollectionLink_assetContract\n      id\n    }\n    ...StackedAssetMedia_assets\n    id\n  }\n  ...CollectionLink_collection\n}\n\nfragment ConfirmationItem_asset on AssetType {\n  chain {\n    displayName\n  }\n  ...AssetItem_asset\n}\n\nfragment ConfirmationItem_asset_item_payment_asset on PaymentAssetType {\n  ...ConfirmationItem_extra_payment_asset\n}\n\nfragment ConfirmationItem_assets on AssetType {\n  ...ConfirmationItem_asset\n}\n\nfragment ConfirmationItem_extra_payment_asset on PaymentAssetType {\n  symbol\n  usdSpotPrice\n}\n\nfragment ConfirmationItem_payment_asset on PaymentAssetType {\n  ...ConfirmationItem_asset_item_payment_asset\n}\n\nfragment CreateBulkOrderAction_data on CreateBulkOrderActionType {\n  __typename\n  orderDatas {\n    item {\n      __typename\n      ... on AssetQuantityDataType {\n        asset {\n          ...StackedAssetMedia_assets\n          id\n        }\n      }\n      ... on Node {\n        __isNode: __typename\n        id\n      }\n    }\n    ...useTotalItems_ordersData\n    ...useTotalPriceOrderData_orderData\n  }\n  ...useHandleBlockchainActions_create_bulk_order\n}\n\nfragment CreateOrderAction_data on CreateOrderActionType {\n  __typename\n  orderData {\n    item {\n      __typename\n      ... on AssetQuantityDataType {\n        quantity\n      }\n      ... on Node {\n        __isNode: __typename\n        id\n      }\n    }\n    side\n    isCounterOrder\n    perUnitPrice {\n      unit\n      symbol\n    }\n    ...OrderDataHeader_order\n  }\n  ...useHandleBlockchainActions_create_order\n}\n\nfragment CreateSwapOrderAction_data on CreateSwapOrderActionType {\n  __typename\n  swapData {\n    ...SwapDataHeader_swap\n  }\n  ...useHandleBlockchainActions_create_swap_order\n}\n\nfragment DeployContractAction_data on DropContractDeployActionType {\n  __typename\n  ...useHandleBlockchainActions_deploy_contract\n}\n\nfragment FulfillOrderAction_data on FulfillOrderActionType {\n  __typename\n  orderData {\n    side\n    ...OrderDataHeader_order\n  }\n  itemFillAmount\n  criteriaAsset {\n    ...OrderDataHeader_criteriaAsset\n    id\n  }\n  ...useHandleBlockchainActions_fulfill_order\n}\n\nfragment FulfillSwapOrderAction_data on FulfillSwapOrderActionType {\n  __typename\n  swapData {\n    ...SwapDataHeader_swap\n  }\n  ...useHandleBlockchainActions_fulfill_swap_order\n}\n\nfragment GaslessCancellationFailedModal_items on ItemType {\n  __isItemType: __typename\n  ...StackedAssetMedia_assets\n}\n\nfragment GaslessCancellationProcessingModal_items on ItemType {\n  __isItemType: __typename\n  ...StackedAssetMedia_assets\n}\n\nfragment MintAction_data on MintActionType {\n  __typename\n  ...useHandleBlockchainActions_mint_asset\n}\n\nfragment MintYourOwnCollectionAction_data on MintYourOwnCollectionActionType {\n  __typename\n  ...useHandleBlockchainActions_mint_your_own_collection\n}\n\nfragment OrderDataHeader_criteriaAsset on AssetType {\n  ...ConfirmationItem_assets\n}\n\nfragment OrderDataHeader_order on OrderDataType {\n  item {\n    __typename\n    ... on AssetQuantityDataType {\n      asset {\n        ...ConfirmationItem_assets\n        id\n      }\n      quantity\n    }\n    ... on Node {\n      __isNode: __typename\n      id\n    }\n  }\n  recipient {\n    address\n    id\n  }\n  side\n  openedAt\n  closedAt\n  perUnitPrice {\n    unit\n  }\n  price {\n    unit\n    symbol\n    usd\n  }\n  payment {\n    ...ConfirmationItem_payment_asset\n    id\n  }\n  englishAuctionReservePrice {\n    unit\n  }\n  isCounterOrder\n  orderCriteria {\n    collection {\n      ...CollectionOfferDetails_collection\n      id\n    }\n    trait {\n      traitType\n      value\n      id\n    }\n    quantity\n  }\n}\n\nfragment OrdersHeaderData_orders on OrderDataType {\n  chain {\n    identifier\n  }\n  item {\n    __typename\n    ... on AssetQuantityDataType {\n      asset {\n        ...StackedAssetMedia_assets\n        id\n      }\n    }\n    ... on AssetBundleType {\n      assetQuantities(first: 20) {\n        edges {\n          node {\n            asset {\n              ...StackedAssetMedia_assets\n              id\n            }\n            id\n          }\n        }\n      }\n    }\n    ... on AssetBundleToBeCreatedType {\n      assetQuantitiesToBeCreated: assetQuantities {\n        asset {\n          ...StackedAssetMedia_assets\n          id\n        }\n      }\n    }\n    ... on Node {\n      __isNode: __typename\n      id\n    }\n  }\n  orderCriteria {\n    collection {\n      representativeAsset {\n        ...StackedAssetMedia_assets\n        id\n      }\n      id\n    }\n  }\n  orderType\n  side\n}\n\nfragment PaymentAssetApprovalAction_data on PaymentAssetApprovalActionType {\n  __typename\n  asset {\n    chain {\n      identifier\n    }\n    symbol\n    ...StackedAssetMedia_assets\n    id\n  }\n  ...useHandleBlockchainActions_approve_payment_asset\n}\n\nfragment SetCreatorFeesAction_data on SetCreatorFeesActionType {\n  __typename\n  ...useHandleBlockchainActions_set_creator_fees\n}\n\nfragment StackedAssetMedia_assets on AssetType {\n  relayId\n  ...AssetMedia_asset\n  collection {\n    logo\n    id\n  }\n}\n\nfragment SwapDataHeader_swap on SwapDataType {\n  maker {\n    address\n    displayName\n    id\n  }\n  taker {\n    address\n    displayName\n    id\n  }\n  makerAssets {\n    asset {\n      chain {\n        identifier\n      }\n      id\n    }\n    ...SwapDataSide_assets\n  }\n  takerAssets {\n    ...SwapDataSide_assets\n  }\n}\n\nfragment SwapDataSide_assets on AssetQuantityDataType {\n  asset {\n    relayId\n    displayName\n    symbol\n    assetContract {\n      tokenStandard\n      id\n    }\n    ...StackedAssetMedia_assets\n    id\n  }\n  quantity\n}\n\nfragment TokenPricePayment on PaymentAssetType {\n  symbol\n}\n\nfragment UpdateDropMechanicsAction_data on DropMechanicsUpdateActionType {\n  __typename\n  ...useHandleBlockchainActions_update_drop_mechanics\n}\n\nfragment UpdatePreRevealAction_data on CollectionTokenMetadataUpdateActionType {\n  __typename\n  ...useHandleBlockchainActions_update_drop_pre_reveal\n}\n\nfragment collection_url on CollectionType {\n  slug\n  isCategory\n}\n\nfragment readOfferDataToAcceptPerUnitPrice_offerToAccept on OfferToAcceptType {\n  orderData {\n    perUnitPrice {\n      usd\n      unit\n    }\n    payment {\n      ...TokenPricePayment\n      id\n    }\n  }\n}\n\nfragment readOfferDataToAcceptPrice_offerToAccept on OfferToAcceptType {\n  orderData {\n    perUnitPrice {\n      usd\n      unit\n    }\n    payment {\n      ...TokenPricePayment\n      id\n    }\n  }\n  itemFillAmount\n}\n\nfragment readOrderDataPrices on OrderDataType {\n  perUnitPrice {\n    usd\n    unit\n  }\n  payment {\n    ...TokenPricePayment\n    id\n  }\n  item {\n    __typename\n    ... on AssetQuantityDataType {\n      quantity\n    }\n    ... on Node {\n      __isNode: __typename\n      id\n    }\n  }\n}\n\nfragment readOrderDataToFillPrices_orderDataToFill on OrderToFillType {\n  orderData {\n    perUnitPrice {\n      usd\n      unit\n    }\n    payment {\n      ...TokenPricePayment\n      id\n    }\n  }\n  itemFillAmount\n}\n\nfragment useHandleBlockchainActions_approve_asset on AssetApprovalActionType {\n  method {\n    ...useHandleBlockchainActions_transaction\n  }\n}\n\nfragment useHandleBlockchainActions_approve_payment_asset on PaymentAssetApprovalActionType {\n  method {\n    ...useHandleBlockchainActions_transaction\n  }\n}\n\nfragment useHandleBlockchainActions_ask_for_asset_swap on AskForSwapType {\n  fromAsset {\n    decimals\n    relayId\n    id\n  }\n  toAsset {\n    relayId\n    id\n  }\n}\n\nfragment useHandleBlockchainActions_bulk_accept_offers on BulkAcceptOffersActionType {\n  method {\n    ...useHandleBlockchainActions_transaction\n  }\n  offersToAccept {\n    orderData {\n      openedAt\n    }\n  }\n}\n\nfragment useHandleBlockchainActions_bulk_fulfill_orders on BulkFulfillOrdersActionType {\n  method {\n    ...useHandleBlockchainActions_transaction\n  }\n  ordersToFill {\n    orderData {\n      openedAt\n    }\n  }\n}\n\nfragment useHandleBlockchainActions_burnToRedeem on AssetBurnToRedeemActionType {\n  method {\n    ...useHandleBlockchainActions_transaction\n  }\n}\n\nfragment useHandleBlockchainActions_cancel_orders on CancelOrderActionType {\n  method {\n    __typename\n    ... on TransactionSubmissionDataType {\n      ...useHandleBlockchainActions_transaction\n    }\n    ... on SignAndPostOrderCancelType {\n      cancelOrderData: data {\n        payload\n        message\n      }\n      serverSignature\n      clientSignatureStandard\n    }\n    ... on GaslessCancelType {\n      orderRelayIds\n    }\n  }\n}\n\nfragment useHandleBlockchainActions_cancel_swap_orders on CancelSwapOrdersActionType {\n  method {\n    __typename\n    ...useHandleBlockchainActions_transaction\n  }\n}\n\nfragment useHandleBlockchainActions_create_bulk_order on CreateBulkOrderActionType {\n  method {\n    clientMessage\n    clientSignatureStandard\n    serverSignature\n    orderDatas\n    chain {\n      identifier\n    }\n  }\n}\n\nfragment useHandleBlockchainActions_create_order on CreateOrderActionType {\n  method {\n    clientMessage\n    clientSignatureStandard\n    serverSignature\n    orderData\n    chain {\n      identifier\n    }\n  }\n}\n\nfragment useHandleBlockchainActions_create_swap_order on CreateSwapOrderActionType {\n  method {\n    clientMessage\n    clientSignatureStandard\n    serverSignature\n    swapData\n    chain {\n      identifier\n    }\n  }\n}\n\nfragment useHandleBlockchainActions_deploy_contract on DropContractDeployActionType {\n  method {\n    ...useHandleBlockchainActions_transaction\n  }\n}\n\nfragment useHandleBlockchainActions_fulfill_order on FulfillOrderActionType {\n  method {\n    ...useHandleBlockchainActions_transaction\n  }\n  orderData {\n    openedAt\n  }\n}\n\nfragment useHandleBlockchainActions_fulfill_swap_order on FulfillSwapOrderActionType {\n  method {\n    ...useHandleBlockchainActions_transaction\n  }\n  swapData {\n    openedAt\n  }\n}\n\nfragment useHandleBlockchainActions_mint_asset on MintActionType {\n  method {\n    ...useHandleBlockchainActions_transaction\n  }\n  startTime\n}\n\nfragment useHandleBlockchainActions_mint_your_own_collection on MintYourOwnCollectionActionType {\n  method {\n    ...useHandleBlockchainActions_transaction\n  }\n}\n\nfragment useHandleBlockchainActions_set_creator_fees on SetCreatorFeesActionType {\n  method {\n    ...useHandleBlockchainActions_transaction\n  }\n}\n\nfragment useHandleBlockchainActions_swap_asset on AssetSwapActionType {\n  method {\n    ...useHandleBlockchainActions_transaction\n  }\n}\n\nfragment useHandleBlockchainActions_transaction on TransactionSubmissionDataType {\n  chain {\n    identifier\n  }\n  ...useTransaction_transaction\n}\n\nfragment useHandleBlockchainActions_transfer_asset on AssetTransferActionType {\n  method {\n    ...useHandleBlockchainActions_transaction\n  }\n}\n\nfragment useHandleBlockchainActions_update_drop_mechanics on DropMechanicsUpdateActionType {\n  method {\n    ...useHandleBlockchainActions_transaction\n  }\n}\n\nfragment useHandleBlockchainActions_update_drop_pre_reveal on CollectionTokenMetadataUpdateActionType {\n  method {\n    ...useHandleBlockchainActions_transaction\n  }\n}\n\nfragment useIsRarityEnabled_collection on CollectionType {\n  slug\n  enabledRarities\n}\n\nfragment useTotalItems_ordersData on OrderDataType {\n  item {\n    __typename\n    ... on AssetQuantityDataType {\n      asset {\n        relayId\n        id\n      }\n    }\n    ... on AssetBundleType {\n      assetQuantities(first: 30) {\n        edges {\n          node {\n            asset {\n              relayId\n              id\n            }\n            id\n          }\n        }\n      }\n    }\n    ... on Node {\n      __isNode: __typename\n      id\n    }\n  }\n}\n\nfragment useTotalPriceOfferDataToAccept_offersToAccept on OfferToAcceptType {\n  itemFillAmount\n  ...readOfferDataToAcceptPerUnitPrice_offerToAccept\n}\n\nfragment useTotalPriceOrderDataToFill_ordersToFill on OrderToFillType {\n  ...readOrderDataToFillPrices_orderDataToFill\n}\n\nfragment useTotalPriceOrderData_orderData on OrderDataType {\n  ...readOrderDataPrices\n}\n\nfragment useTransaction_transaction on TransactionSubmissionDataType {\n  chain {\n    identifier\n  }\n  source {\n    value\n  }\n  destination {\n    value\n  }\n  value\n  data\n}\n';
const authLoginV2AuthSimplifiedMutation =
  'mutation authLoginV2AuthSimplifiedMutation(\n  $address: AddressScalar!\n  $message: String!\n  $deviceId: String!\n  $signature: String!\n  $chain: ChainScalar\n) {\n  AuthTypeV2 {\n    webLoginV2(address: $address, deviceId: $deviceId, message: $message, signature: $signature, chain: $chain) {\n      address\n      isEmployee\n    }\n  }\n}\n';
const authRefreshMutation =
  'mutation authRefreshMutation(\n  $address: AddressScalar!\n  $deviceId: String!\n) {\n  AuthTypeV2 {\n    webRefresh(address: $address, deviceId: $deviceId) {\n      isEmployee\n    }\n  }\n}\n';

const deviceId = generateUUIDv4();

const CONFIG = {
  X_RAPIDAPI_KEY: config.apiKey,
  OS_BASE_URL: 'https://nfttools.pro/opensea'
};

const HEADERS: any = {
  'content-type': 'application/json',
  'X-NFT-API-Key': config.apiKey,
};

async function getOSProToken(ethersSigner: any) {
  const url = `https://nfttools.pro/ospro/auth/message/${ethersSigner.address.toLowerCase()}`;
  try {
    const response = await limiter.schedule(() =>
      axiosInstance.get(url, { headers: HEADERS })
    );
    const message = response.data.data.message;

    const signature = await ethersSigner.signMessage(message);

    const data = {
      signature: signature,
      signer: ethersSigner.address,
      message: message
    };

    const authUrl = `https://nfttools.pro/ospro/auth/login`;

    const authResponse = await limiter.schedule(() =>
      axiosInstance.post(authUrl, data, {
        headers: HEADERS
      })
    );
    const token = authResponse.data.token;
    console.log('OSPro token Success ');
    HEADERS['token'] = token;
    return token;
  } catch (error: any) {
    console.log('Error in getOSProToken:', error);
    if (error.response) {
      console.log(error.response.data);
    }
    return null;
  }
}

// List NFT using OSPro
async function listOSPro(order: any, token: any) {
  const HEADERS = {
    'content-type': 'application/json',
    'X-NFT-API-Key': config.apiKey,
    token: token
  };
  const url = `https://nfttools.pro/ospro/opensea/listing`;
  try {
    const response = await limiter.schedule(() =>
      axiosInstance.post(url, order, { headers: HEADERS })
    );
    if (response.data.order) console.log('Listing Success');
    return response;
  } catch (error: any) {
    console.log('Error in listOSPro:', error.response.data);
  }
}
// I can edit and commit changes on the fly
async function createOSlistingOrder(
  cookies: any,
  assestID: any,
  listingPrice: any,
  expiryMin: any,
  ethersSigner: any
) {
  const openedAt = new Date();
  const closedAt = new Date(openedAt.getTime() + expiryMin * 60 * 1000); // Add 1 hour to the openedAt time

  const options = {
    method: 'POST',
    url: `${CONFIG.OS_BASE_URL}/__api/graphql/`,
    headers: {
      cookie: cookies,
      'content-type': 'application/json',
      'x-signed-query':
        '7cf0e05871dfc5136fd7fe6244a57ed106a5d073530affee3d78dc63aee694fe',
      'X-NFT-API-Key': CONFIG.X_RAPIDAPI_KEY,
      'x-auth-address': ethersSigner.address.toLowerCase()
    },
    data: {
      id: 'CreateListingActionModalQuery',
      query: CreateListingActionModalQuery,
      variables: {
        item: {
          asset: assestID,
          quantity: '1'
        },
        price: {
          paymentAsset: 'UGF5bWVudEFzc2V0VHlwZTo0Mg==',
          amount: listingPrice
        },
        recipient: null,
        openedAt: openedAt.toISOString(),
        closedAt: closedAt.toISOString(),
        englishAuctionReservePrice: null,
        optionalCreatorFeeBasisPoints: null
      }
    }
  };

  try {
    const response = await limiter.schedule(() => axiosInstance.request(options));
    const typedData = JSON.parse(
      response.data.data.blockchain.createListingActions[0].method.clientMessage
    );

    const feeRecipient = '0x0000a26b00c1F0DF003000390027140000fAa719';
    const newFeePercentage = 0.5; // 0.5%

    const order = {
      chainName: 'ethereum',
      parameters: typedData.message,
      protocol_address: '0x0000000000000068F116a894984e2DB1123eB395'
    };

    const totalAmount = order.parameters.consideration.reduce(
      (sum: any, item: any) => sum + BigInt(item.endAmount),
      BigInt(0)
    );

    const newFee =
      (totalAmount * BigInt(Math.round(newFeePercentage * 100))) / BigInt(10000);

    let feeItem = order.parameters.consideration.find(
      (item: any) => item.recipient.toLowerCase() === feeRecipient.toLowerCase()
    );


    if (!feeItem) {
      const opensea_consideration = {
        "itemType": 0,
        "token": "0x0000000000000000000000000000000000000000",
        "identifierOrCriteria": 0,
        "startAmount": newFee.toString(),
        "endAmount": newFee.toString(),
        "recipient": "0x0000a26b00c1F0DF003000390027140000fAa719"
      }
      const partialConsideration = order.parameters.consideration.filter((item: any) => item.recipient.toLowerCase() !== ethersSigner.address.toLowerCase())
      const consideration = [...partialConsideration, opensea_consideration]

      const totalFees = consideration.reduce((sum: any, item: any) => sum + Number(item.endAmount), 0);
      const netAmount = Number(listingPrice) * 1e18 - totalFees
      const netConsideration = {
        "itemType": "0",
        "token": "0x0000000000000000000000000000000000000000",
        "identifierOrCriteria": "0",
        "startAmount": netAmount.toString(),
        "endAmount": netAmount.toString(),
        "recipient": ethersSigner.address.toLowerCase()
      }
      consideration.unshift(netConsideration)
      order.parameters.consideration = consideration
      order.parameters.totalOriginalConsiderationItems = consideration.length
    }

    const modifiedOrder = await modifyOrder(order, ethersSigner);

    const signature = await ethersSigner._signTypedData(
      typedData.domain,
      {
        OrderComponents: typedData.types.OrderComponents,
        OfferItem: typedData.types.OfferItem,
        ConsiderationItem: typedData.types.ConsiderationItem
      },
      modifiedOrder.parameters
    );
    modifiedOrder.signature = signature;

    return modifiedOrder;
  } catch (error) {
    console.log(error);
  }
}

function computeResult() {
  // Given the output for the function you provided
  const hexString = '0x72db8c0b';

  // Convert the hex string to a BigInt and multiply it by 2^224
  // @ts-ignore
  const valueFromHexString = BigInt(hexString) * 2n ** 224n;

  // Compute the random value and convert to BigInt
  const randomValue = BigInt(
    Math.floor(18446744073709552e3 * Math.random()).toString()
  );

  // Add the random number to the result
  const result = valueFromHexString + randomValue;

  return result.toString();
}

function modifyOrder(order: any, ethersSigner: any) {
  // Convert itemType to number
  order.parameters.offer[0].itemType = Number(
    order.parameters.offer[0].itemType
  );

  order.parameters.consideration.forEach((item: any) => {
    item.itemType = Number(item.itemType);
  });

  // Convert totalOriginalConsiderationItems to number
  order.parameters.totalOriginalConsiderationItems = Number(
    order.parameters.totalOriginalConsiderationItems
  );

  // Convert identifierOrCriteria for consideration items to number
  order.parameters.consideration.forEach((item: any) => {
    item.identifierOrCriteria = Number(item.identifierOrCriteria);
  });

  // Convert orderType to number
  order.parameters.orderType = Number(order.parameters.orderType);
  // Convert identifierOrCriteria for consideration items to number

  order.parameters.salt = computeResult();

  //MODIFY THE FEES from 2.5% to 0.5%
  const feeRecipient = '0x0000a26b00c1F0DF003000390027140000fAa719';
  const newFeePercentage = 0.5; // 0.5%

  // Calculate the total amount by summing up all endAmount values in the consideration array
  const totalAmount = order.parameters.consideration.reduce(
    (sum: any, item: any) => sum + BigInt(item.endAmount),
    BigInt(0)
  );

  // Calculate the new fee
  const newFee =
    (totalAmount * BigInt(Math.round(newFeePercentage * 100))) / BigInt(10000);

  // Find the item with the recipient "0x0000a26b00c1F0DF003000390027140000fAa719"
  let feeItem = order.parameters.consideration.find(
    (item: any) => item.recipient.toLowerCase() === feeRecipient.toLowerCase()
  );

  feeItem = order.parameters.consideration.find(
    (item: any) => item.recipient.toLowerCase() === feeRecipient.toLowerCase()
  );
  // Calculate the difference between the original fee and the new fee
  const differenceEnd = BigInt(feeItem.endAmount) - newFee;
  const differenceStart = BigInt(feeItem?.startAmount) - newFee;

  // Update the endAmount and startAmount for the fee recipient

  feeItem.endAmount = newFee.toString();
  feeItem.startAmount = newFee.toString();

  // Add the difference to the endAmount and startAmount of the item with recipient walletaddress
  const walletItem = order.parameters.consideration.find(
    (item: any) =>
      item.recipient.toLowerCase() === ethersSigner.address.toLowerCase()
  );

  walletItem.endAmount = (
    BigInt(walletItem.endAmount) + differenceEnd
  ).toString();

  walletItem.startAmount = (
    BigInt(walletItem.startAmount) + differenceStart
  ).toString();
  return order;
}

function generateUUIDv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function getOSCookies(ethersSigner: any) {
  const options: any = {
    method: 'POST',
    url: `${CONFIG.OS_BASE_URL}/__api/graphql/`,
    headers: {
      'content-type': 'application/json',
      'x-signed-query':
        'e35fa1b7ede16cf8e95a6867a739cc0002ae8bfde2a8a1926d05d2919170e33a',
      'X-NFT-API-Key': CONFIG.X_RAPIDAPI_KEY
    },
    data: {
      id: 'challengeLoginMessageQuery',
      query: challengeLoginMessageQuery,
      variables: {
        address: ethersSigner.address.toLowerCase()
      }
    }
  };

  try {
    const loginResponse = await limiter.schedule(() => axiosInstance.request(options)) as any
    const message = loginResponse.data.data.auth.loginMessage;
    const signature = await ethersSigner.signMessage(message);
    const postOptions = {
      method: 'POST',
      url: `${CONFIG.OS_BASE_URL}/__api/graphql/`,
      headers: {
        'content-type': 'application/json',
        'x-signed-query':
          'f6b83e92d7ef2ba14a46f695d07198b7eae0403f0e2164270438eff613755981',
        'X-NFT-API-Key': CONFIG.X_RAPIDAPI_KEY
      },
      data: {
        id: 'authLoginV2AuthSimplifiedMutation',
        query: authLoginV2AuthSimplifiedMutation,
        variables: {
          address: ethersSigner.address.toLowerCase(),
          message: message,
          deviceId: deviceId,
          signature: signature,
          chain: 'ETHEREUM'
        }
      }
    };
    const authResponse = await limiter.schedule(() => axiosInstance.request(postOptions));
    if (authResponse.data.errors) return null;
    const cookies: any = authResponse.headers['set-cookie'];
    const combinedCookieHeader = cookies.join('; ');
    getJWTFromCookies(combinedCookieHeader, ethersSigner);
    return combinedCookieHeader;
  } catch (error: any) {
    console.log(error.response.data.errors);
  }
}

function getCookie(name: any) {
  const value = '; ' + document.cookie;
  const parts: any = value.split('; ' + name + '=');
  if (parts.length === 2) return parts.pop().split(';').shift();
}

function getJWTFromCookies(cookies: any, ethersSigner: any) {
  // Define the token's prefix based on the wallet address
  const tokenPrefix = ethersSigner.address.toLowerCase() + '_auth_token=';

  // Split the cookies string by the semicolon to get individual cookie assignments

  if (!cookies) return null
  const cookieList = cookies.split(';')

  // Find the JWT corresponding to the desired cookie
  for (const cookie of cookieList) {
    const trimmedCookie = cookie.trim(); // Remove any leading/trailing whitespace

    if (trimmedCookie.startsWith(tokenPrefix)) {
      // Return the JWT value without the prefix
      return trimmedCookie.substring(tokenPrefix.length);
    }
  }
}

function urlBase64Decode(str: any) {
  // Convert URL-safe base64 to standard base64
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  // Pad with '=' to make the string length a multiple of 4
  while (str.length % 4) {
    str += '=';
  }
  return Buffer.from(str, 'base64').toString();
}

function decodeJWT(jwt: any) {
  console.log({ jwt });
  const parts = jwt.split('.');
  const header = JSON.parse(urlBase64Decode(parts[0]));
  const payload = JSON.parse(urlBase64Decode(parts[1]));

  const currentTime = Math.floor(Date.now() / 1000); // current time in seconds since the Unix Epoch
  const expiryTime = payload.exp; // expiry time from the payload
  const minutesUntilExpiry = (expiryTime - currentTime) / 60;

  return {
    header: header,
    payload: payload,
    expiryInMinutes: minutesUntilExpiry
  };
}

async function refreshOSToken(cookies: any, ethersSigner: any) {
  const jwt = getJWTFromCookies(cookies, ethersSigner);
  const options = {
    method: 'POST',
    url: `${CONFIG.OS_BASE_URL}/__api/graphql/`,
    headers: {
      'content-type': 'application/json',
      'x-signed-query':
        'b7e62623eb6dc115cc77bc30144d64ab87d2d7a56dfb2866a16045df4e479f70',
      'X-NFT-API-Key': CONFIG.X_RAPIDAPI_KEY
    },
    data: {
      id: 'authRefreshMutation',
      query: authRefreshMutation,
      variables: {
        address: ethersSigner.address.toLowerCase(),
        deviceId: deviceId
      }
    }
  };
  try {
    const response = await limiter.schedule(() => axiosInstance.request(options));
    const cookies: any = response.headers['set-cookie'];
    const combinedCookieHeader = cookies.join('; ');
    return response.data;
  } catch (error) {
    console.log(error);
  }

  return;
}

async function getOSAssestID(contractAddress: any, tokenId: any) {
  // Use CONFIG for constants instead of hardcoding
  const options = {
    method: 'POST',
    url: `${CONFIG.OS_BASE_URL}/__api/graphql/`,
    headers: {
      'content-type': 'application/json',
      'x-signed-query':
        'be770800bdd51c9042b4c4cbb9e4706d49bc571908f18c38172d739c13fdbb45',
      'X-NFT-API-Key': CONFIG.X_RAPIDAPI_KEY
    },
    data: {
      id: 'AssetPageQuery',
      query: AssetPageQuery,
      variables: {
        tokenId: tokenId,
        contractAddress: contractAddress,
        chain: 'ETHEREUM'
      }
    }
  };
  try {
    const response = await limiter.schedule(() => axiosInstance.request(options));
    return response.data.data.nft.id;
  } catch (error: any) {
    console.log(error.response.data.errors);
  }
}

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 0.5 seconds

export async function listOnOpenseaPro(
  contractAddress: string,
  tokenId: string,
  openseaSellPrice: number,
  private_key: string
): Promise<boolean> {
  const ALCHEMY_API_KEY = config.ALCHEMY_API_KEY;
  const NETWORK = "mainnet";
  const provider = new providers.JsonRpcProvider(
        `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
        {
    name: "homestead",
    chainId: 1
  });
  const ethersSigner = new Wallet(private_key, provider);

  try {
    await approveNFT(
      contractAddress,
      ethersSigner,
      '0x1E0049783F008A0085193E00003D00cd54003c71'
    );

    const expiryMin = 16;
    const listingPrice = openseaSellPrice.toFixed(4); // ETH

    let cookies = null;
    let retries = 0;

    while (!cookies && retries < MAX_RETRIES) {
      try {
        console.time('getOSCookies');
        cookies = await getOSCookies(ethersSigner);
        console.timeEnd('getOSCookies');

        if (!cookies) {
          throw new Error('Cookies are null');
        }
      } catch (error) {
        console.error(`Failed to get cookies. Attempt ${retries + 1} of ${MAX_RETRIES}`);
        retries++;
        if (retries < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        } else {
          throw new Error('Max retries reached. Unable to get cookies.');
        }
      }
    }

    console.time('refreshOSToken');
    await refreshOSToken(cookies, ethersSigner);
    console.timeEnd('refreshOSToken');

    console.time('getOSAssestID');
    const assestID = await getOSAssestID(contractAddress, tokenId);
    console.timeEnd('getOSAssestID');

    console.time('createOSlistingOrder');
    const order = await createOSlistingOrder(
      cookies,
      assestID,
      listingPrice,
      expiryMin,
      ethersSigner
    );
    console.timeEnd('createOSlistingOrder');

    console.time('getOSProToken');
    const token = await getOSProToken(ethersSigner);
    console.timeEnd('getOSProToken');

    console.time('listOSPro');
    const response = await listOSPro(order, token);
    console.timeEnd('listOSPro');

    // Uncomment if you need to log the response data
    // console.log(JSON.stringify(response.data.order));

    return true;
  } catch (error) {
    console.error('Error in listOnOpenseaPro:', error);
    return false;
  }
}

const approveAbi = [
  {
    inputs: [
      {
        internalType: 'address',
        name: 'account',
        type: 'address'
      },
      {
        internalType: 'address',
        name: 'operator',
        type: 'address'
      }
    ],
    name: 'isApprovedForAll',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'operator',
        type: 'address'
      },
      {
        internalType: 'bool',
        name: 'approved',
        type: 'bool'
      }
    ],
    name: 'setApprovalForAll',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  }
];

async function approveNFT(
  nftAddress: string,
  wallet: Wallet,
  marketContractAddress: string
): Promise<void> {

  const nftContract = new Contract(nftAddress, approveAbi, wallet);

  try {
    const approved: boolean = await nftContract.isApprovedForAll(
      wallet.address,
      marketContractAddress
    );
    console.log({ approved });
    if (!approved) {
      console.log('Approve NFT to', marketContractAddress);
      const tx = await nftContract.setApprovalForAll(
        marketContractAddress,
        true
      );
      await tx.wait();
      console.log('NFT approved successfully');
    }
  } catch (err: any) {
    console.log(err?.reason ?? err?.message);
  }
};

