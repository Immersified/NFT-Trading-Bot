
import axiosInstance from "./axios/axiosInstance";
import config from "./config";
const payload = { "id": "AcceptOfferModalContentQuery", "query": "query AcceptOfferModalContentQuery(\n  $orderId: OrderRelayID!\n) {\n  order(order: $orderId) {\n    isOpen\n    maker {\n      ...AccountLink_data\n      id\n    }\n    item {\n      __typename\n      relayId\n      ... on AssetType {\n        ownedQuantity(identity: {})\n        isCurrentlyFungible\n        defaultRarityData {\n          rank\n          id\n        }\n      }\n      ... on AssetBundleType {\n        displayName\n        assetQuantities(first: 18) {\n          edges {\n            node {\n              asset {\n                relayId\n                id\n              }\n              id\n            }\n          }\n        }\n      }\n      ...ItemOfferDetails_item\n      ...FloorPriceDifference_item\n      ...readOptionalCreatorFees_item\n      ... on Node {\n        __isNode: __typename\n        id\n      }\n    }\n    relayId\n    remainingQuantityType\n    perUnitPriceType {\n      ...FloorPriceDifference_perUnitPrice\n    }\n    ...ExpirationDate_data\n    ...OrderPrice\n    ...OrderUsdPrice\n    ...readOrderFees_order\n    ...ServiceFeeText_orders\n    id\n  }\n}\n\nfragment AccountLink_data on AccountType {\n  address\n  config\n  isCompromised\n  user {\n    publicUsername\n    id\n  }\n  displayName\n  ...ProfileImage_data\n  ...wallet_accountKey\n  ...accounts_url\n}\n\nfragment AssetMediaAnimation_asset on AssetType {\n  ...AssetMediaImage_asset\n  ...AssetMediaContainer_asset\n  ...AssetMediaPlaceholderImage_asset\n}\n\nfragment AssetMediaAudio_asset on AssetType {\n  backgroundColor\n  ...AssetMediaImage_asset\n}\n\nfragment AssetMediaContainer_asset on AssetType {\n  backgroundColor\n  ...AssetMediaEditions_asset_1mZMwQ\n  collection {\n    ...useIsRarityEnabled_collection\n    id\n  }\n}\n\nfragment AssetMediaContainer_asset_1LNk0S on AssetType {\n  backgroundColor\n  ...AssetMediaEditions_asset_1mZMwQ\n  collection {\n    ...useIsRarityEnabled_collection\n    id\n  }\n}\n\nfragment AssetMediaEditions_asset_1mZMwQ on AssetType {\n  decimals\n}\n\nfragment AssetMediaImage_asset on AssetType {\n  backgroundColor\n  imageUrl\n  collection {\n    displayData {\n      cardDisplayStyle\n    }\n    id\n  }\n}\n\nfragment AssetMediaPlaceholderImage_asset on AssetType {\n  collection {\n    displayData {\n      cardDisplayStyle\n    }\n    id\n  }\n}\n\nfragment AssetMediaVideo_asset on AssetType {\n  backgroundColor\n  ...AssetMediaImage_asset\n}\n\nfragment AssetMediaWebgl_asset on AssetType {\n  backgroundColor\n  ...AssetMediaImage_asset\n}\n\nfragment AssetMedia_asset on AssetType {\n  animationUrl\n  displayImageUrl\n  imageUrl\n  isDelisted\n  ...AssetMediaAnimation_asset\n  ...AssetMediaAudio_asset\n  ...AssetMediaContainer_asset_1LNk0S\n  ...AssetMediaImage_asset\n  ...AssetMediaPlaceholderImage_asset\n  ...AssetMediaVideo_asset\n  ...AssetMediaWebgl_asset\n}\n\nfragment CollectionLink_collection on CollectionType {\n  name\n  slug\n  verificationStatus\n  ...collection_url\n}\n\nfragment ExpirationDate_data on OrderV2Type {\n  closedAt\n}\n\nfragment FloorPriceDifference_item on ItemType {\n  __isItemType: __typename\n  ... on AssetType {\n    collection {\n      statsV2 {\n        floorPrice {\n          eth\n        }\n      }\n      id\n    }\n  }\n}\n\nfragment FloorPriceDifference_perUnitPrice on PriceType {\n  eth\n}\n\nfragment ItemOfferDetails_item on ItemType {\n  __isItemType: __typename\n  __typename\n  ... on AssetType {\n    displayName\n    collection {\n      ...CollectionLink_collection\n      id\n    }\n    ...StackedAssetMedia_assets\n  }\n  ... on AssetBundleType {\n    displayName\n    bundleCollection: collection {\n      ...CollectionLink_collection\n      id\n    }\n    assetQuantities(first: 18) {\n      edges {\n        node {\n          asset {\n            ...StackedAssetMedia_assets\n            id\n          }\n          id\n        }\n      }\n    }\n  }\n}\n\nfragment OrderPrice on OrderV2Type {\n  priceType {\n    unit\n  }\n  perUnitPriceType {\n    unit\n  }\n  payment {\n    ...TokenPricePayment\n    id\n  }\n}\n\nfragment OrderUsdPrice on OrderV2Type {\n  priceType {\n    usd\n  }\n  perUnitPriceType {\n    usd\n  }\n}\n\nfragment ProfileImage_data on AccountType {\n  imageUrl\n}\n\nfragment ServiceFeeText_orders on OrderV2Type {\n  ...readOrderFees_order\n}\n\nfragment StackedAssetMedia_assets on AssetType {\n  relayId\n  ...AssetMedia_asset\n  collection {\n    logo\n    id\n  }\n}\n\nfragment TokenPricePayment on PaymentAssetType {\n  symbol\n}\n\nfragment accounts_url on AccountType {\n  address\n  user {\n    publicUsername\n    id\n  }\n}\n\nfragment collection_url on CollectionType {\n  slug\n  isCategory\n}\n\nfragment readOptionalCreatorFees_item on ItemType {\n  __isItemType: __typename\n  __typename\n  ... on AssetType {\n    collection {\n      isCreatorFeesEnforced\n      totalCreatorFeeBasisPoints\n      id\n    }\n  }\n}\n\nfragment readOrderFees_order on OrderV2Type {\n  makerFees(first: 10) {\n    edges {\n      node {\n        basisPoints\n        isOpenseaFee\n        id\n      }\n    }\n  }\n  takerFees(first: 10) {\n    edges {\n      node {\n        basisPoints\n        isOpenseaFee\n        id\n      }\n    }\n  }\n}\n\nfragment useIsRarityEnabled_collection on CollectionType {\n  slug\n  enabledRarities\n}\n\nfragment wallet_accountKey on AccountType {\n  address\n}\n", "variables": { "orderId": "QXNzZXRUeXBlOjg3MzM0Nzk0Mw==" } }

async function retrieveOrders() {

  try {
    const { data } = await axiosInstance.post(
      "https://nfttools.pro/opensea/__api/graphql/",
      payload,
      {
        headers: {
          'X-NFT-API-Key': config.apiKey,
          "x-signed-query": "8b661c7ec409944943a2c008a6d617a170af034875fe0c57eadaab3c4ca7543b",
        },
      }
    )
    console.log(JSON.stringify(data));
  } catch (error) {
    console.log(error);

  }
}


retrieveOrders()
const response = {
  "data": {
    "order": {
      "isOpen": true,
      "maker": {
        "address": "0xd651398ce40cc430bf31588a430b2116905786f6",
        "config": null,
        "isCompromised": false,
        "user": {
          "publicUsername": null,
          "id": "VXNlclR5cGU6NTE3NzAxNTQ="
        },
        "displayName": null,
        "imageUrl": "https://storage.googleapis.com/opensea-static/opensea-profile/18.png",
        "id": "QWNjb3VudFR5cGU6NDgzNzk1MDQ1MQ=="
      },
      "item": {
        "__typename": "AssetType",
        "relayId": "QXNzZXRUeXBlOjg3MzM0Nzk0Mw==",
        "ownedQuantity": "1",
        "isCurrentlyFungible": false,
        "defaultRarityData": null,
        "__isItemType": "AssetType",
        "displayName": "3012",
        "collection": {
          "name": "Dreamy Official",
          "slug": "dreamyofficial",
          "verificationStatus": "VERIFIED",
          "isCategory": false,
          "id": "Q29sbGVjdGlvblR5cGU6MjIzNjk1Mzg=",
          "displayData": {
            "cardDisplayStyle": "CONTAIN"
          },
          "enabledRarities": [],
          "logo": "https://i.seadn.io/gcs/files/41430968e84727ec2cbc2e41325f314e.png?w=500&auto=format",
          "statsV2": {
            "floorPrice": {
              "eth": "0.004"
            }
          },
          "isCreatorFeesEnforced": false,
          "totalCreatorFeeBasisPoints": 500
        },
        "animationUrl": null,
        "displayImageUrl": "https://i.seadn.io/gcs/files/00575219813262c3b80a47bd53914633.png?w=500&auto=format",
        "imageUrl": "https://i.seadn.io/gcs/files/00575219813262c3b80a47bd53914633.png?w=500&auto=format",
        "isDelisted": false,
        "backgroundColor": null,
        "decimals": null,
        "__isNode": "AssetType",
        "id": "QXNzZXRUeXBlOjg3MzM0Nzk0Mw=="
      },
      "relayId": "T3JkZXJWMlR5cGU6MjMzOTEyODUzOTI=",
      "remainingQuantityType": "1",
      "perUnitPriceType": {
        "eth": "0.002",
        "unit": "0.002",
        "usd": "5.100920000000000072"
      },
      "closedAt": "2024-11-01T02:07:36",
      "priceType": {
        "unit": "0.002",
        "usd": "5.100920000000000072"
      },
      "payment": {
        "symbol": "WETH",
        "id": "UGF5bWVudEFzc2V0VHlwZTo3OQ=="
      },
      "makerFees": {
        "edges": []
      },
      "takerFees": {
        "edges": [
          {
            "node": {
              "basisPoints": 250,
              "isOpenseaFee": true,
              "id": "RmVlVHlwZToyMTI3NTg3"
            }
          }
        ]
      },
      "id": "T3JkZXJWMlR5cGU6MjMzOTEyODUzOTI="
    }
  }
}