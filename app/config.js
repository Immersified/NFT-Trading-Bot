require('dotenv').config();

const config = {
  /**
   * @description Raw Opensea API endpoints
   *  */
  endpoint: 'https://api.opensea.io/api/v1/',
  // endpoint: 'https://testnets-api.opensea.io/api/v1/',

  /**
   * @description Opensea api endpoints with rapid API
   */
  openseaRapidEndpoint: 'https://nfttools.pro/opensea/api/v1/',

  /**
   * @description Blur api endpoints with rapid API
   */
  blurRapidEndpoint: 'https://nfttools.pro/blur/v1/',

  /**
   * @description Ethereum network infura provider
   */
  network:
    `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
  // network: 'https://mainnet.infura.io/v3/<INFURA_KEY>',
  // network: 'https://rpc.ankr.com/eth_goerli',

  /**
   * @description Extra config
   */
  apiKey: process.env.API_KEY,
  openseaApiKey: process.env.OPENSEA_API_KEY,
  weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
};

module.exports = config;
