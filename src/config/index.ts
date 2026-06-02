import { config as envConfig } from 'dotenv';

envConfig();

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY as string;

const config = {
  /**
   * @description Raw Opensea API endpoints
   *  */
  endpoint: 'https://api.opensea.io/api/v2/',

  /**
   * @description Opensea api endpoints with rapid API
   */
  openseaRapidEndpoint: 'https://nfttools.pro/opensea/api/v1/',
  ALCHEMY_API_KEY: ALCHEMY_KEY,

  /**
   * @description Blur api endpoints with rapid API
   */
  blurRapidEndpoint: 'https://nfttools.pro/blur/v1/',

  /**
   * @description Ethereum network infura provider
   */
  network:
    `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,

  /**
   * @description Extra config
   */

  apiKey: process.env.API_KEY as string,
  openseaApiKey: process.env.OPENSEA_API_KEY as string,
  xApiKey: process.env.X_API_KEY as string,
  weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  private_key: process.env.PRIVATE_KEY as string
};

export default config
