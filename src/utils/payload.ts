import config from "../config";

export const payload: any = {
  criteria: {
    collection: {
      slug: 'cool-cats-nft'
    }
  },
  protocol_data: {
    parameters: {
      offerer: '0x85e9C0C52BE6fa83ec02120F419E9874e3707E7E',
      offer: [
        {
          itemType: 1,
          token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          identifierOrCriteria: 0,
          startAmount: (Date.now() / 1000).toString(),
          endAmount: (Date.now() / 1000 + 100000).toString()
        }
      ],
      consideration: [],
      startTime: '1666480886',
      endTime: '1666680886',
      orderType: 2,
      zone: '0x004C00500000aD104D7DBd00e3ae0A5C00560C00',
      zoneHash:
        '0x0000000000000000000000000000000000000000000000000000000000000000',
      conduitKey:
        '0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000',
      totalOriginalConsiderationItems: 2,
      counter: '0'
    },
    signature: '0x0'
  },
  protocol_address: '0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC'
};
