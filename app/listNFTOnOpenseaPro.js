const { axiosInstance } = require('./axios/axiosInstance');
const { retrieveAuthToken } = require('./retrieveAuthToken');

require('dotenv').config();

async function listNFTOnOpenseaPro() {
  try {
    const token = await retrieveAuthToken();

    const payload = {
      parameters: {
        offerer: '0x1b8AfD0DE8a9368ce635Be8B9572c65d8F590B21',
        zone: '0x004C00500000aD104D7DBd00e3ae0A5C00560C00',
        zoneHash:
          '0x0000000000000000000000000000000000000000000000000000000000000000',
        startTime: '1700348910',
        endTime: '1700349790',
        orderType: 0,
        offer: [
          {
            itemType: 2,
            token: '0x48c7f48622a2c31fc72b326332cf1e2357c8ef30',
            identifierOrCriteria: '4427',
            startAmount: 1,
            endAmount: 1
          }
        ],
        consideration: [
          {
            itemType: 0,
            token: '0x0000000000000000000000000000000000000000',
            identifierOrCriteria: 0,
            startAmount: '58182500000000000',
            endAmount: '58182500000000000',
            recipient: '0x1b8AfD0DE8a9368ce635Be8B9572c65d8F590B21'
          },
          {
            itemType: 0,
            token: '0x0000000000000000000000000000000000000000',
            identifierOrCriteria: 0,
            startAmount: '1572500000000000',
            endAmount: '1572500000000000',
            recipient: '0x0000a26b00c1F0DF003000390027140000fAa719'
          },
          {
            itemType: 0,
            token: '0x0000000000000000000000000000000000000000',
            identifierOrCriteria: 0,
            startAmount: '3145000000000000',
            endAmount: '3145000000000000',
            recipient: '0x44b3d1ea9732cae53164d9d17c5b25c3644aa76d'
          }
        ],
        totalOriginalConsiderationItems: 3,
        salt: '41266',
        conduitKey:
          '0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000',
        nonce: 0,
        counter: '0'
      },
      signature:
        '0xb0871c964bc2fd36d7565a8a72de18a6a52c5807655800fce0a8591b42599fc9189c7432daef2eae6fb24b82a04b7f39b44647c4106d2ddf79ceb209b411c74f1b',
      protocol_address: '0x00000000000000adc04c56bf30ac9d3c0aaf14dc'
    };
    const options = {
      method: 'POST',
      url: 'https://opensea-pro.p.rapidapi.com/opensea/listing',
      headers: {
        'content-type': 'application/json',
        token: token,
        'X-RapidAPI-Key': process.env.X_RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'opensea-pro.p.rapidapi.com'
      },
      data: JSON.stringify(payload)
    };
    const response = await axiosInstance.request(options);
    console.log(response.data);
  } catch (error) {
    console.error(error);
  }
}

listNFTOnOpenseaPro();
