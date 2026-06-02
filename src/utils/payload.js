const config = require('../config');

const payload = {
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
          token: config.weth,
          identifierOrCriteria: 0,
          startAmount: Date.now() / 1000,
          endAmount: Date.now() / 1000 + 100000
        }
      ],
      consideration: [],
      startTime: 1666480886,
      endTime: 1666680886,
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

const listingPayload = {
  parameters: {
    offerer: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    zone: '0x004C00500000aD104D7DBd00e3ae0A5C00560C00',
    zoneHash:
      '0x0000000000000000000000000000000000000000000000000000000000000000',
    startTime: '0',
    endTime: '1656044994000',
    orderType: 0,
    offer: [
      {
        itemType: 2,
        token: '0x0165878A594ca255338adfa4d48449f69242Eb8F',
        identifierOrCriteria: '1',
        startAmount: '1',
        endAmount: '1'
      }
    ],
    consideration: [],
    totalOriginalConsiderationItems: 2,
    salt: 12686911856931635052326433555881236148,
    conduitKey:
      '0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000',
    nonce: 0
  },
  signature: '0x',
  protocol_address: '0x00000000000000adc04c56bf30ac9d3c0aaf14dc'
};

module.exports = { payload, listingPayload };
