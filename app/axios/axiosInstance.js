const axios = require('axios');
const axiosRetry = require('axios-retry');
const limiter = require('../bottleneck');

const axiosInstance = axios.create({
  timeout: 300000
});

const retryConfig = {
  retries: 3,
  retryDelay: (retryCount, error) => {
    limiter.schedule(() => Promise.resolve());
    if (error.response && error.response.status === 429) {
      return 1000;
    }
    return axiosRetry.exponentialDelay(retryCount);
  },
  retryCondition: async (error) => {
    if (error.response && error.response.status === 429) {
    }
    if (
      axiosRetry.isNetworkError(error) ||
      (error.response && error.response.status === 429)
    ) {
      return true;
    }
    if (error.response) {
      const { status, data, config } = error.response;
      console.log(`Request failed for URL: ${config.url}`);
      console.log(`Status Code: ${status}`);
      console.log(
        `Error Message: ${
          typeof data === 'object' && data.message
            ? data.message
            : 'Unknown error'
        }`
      );
      if (status === 400) {
        console.log('Bad Request. Please check the request parameters.');
      } else if (status === 401) {
        console.log('Unauthorized. Please check your credentials.');
      } else if (status === 403) {
        console.log(
          "Forbidden. You don't have permission to access this resource."
        );
      } else if (status === 404) {
        console.log('Not Found. The requested resource could not be found.');
      } else if (status === 500) {
        console.log('Internal Server Error. Please try again later.');
      } else {
        console.log('An unexpected error occurred.');
      }
    } else {
      console.log('An unknown error occurred.');
    }
    return false;
  }
};

axiosRetry.default(axiosInstance, retryConfig);

module.exports = { axiosInstance };
