const { config } = require('dotenv');
const Bottleneck = require('bottleneck');

config();

const RATE_LIMIT = Number(process.env.RATE_LIMIT) ?? 4;

const limiter = new Bottleneck({
  minTime: 1 / RATE_LIMIT
});

module.exports = limiter;
