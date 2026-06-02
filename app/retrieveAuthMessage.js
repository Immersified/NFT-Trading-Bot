require('dotenv').config();
const { axiosInstance } = require('./axios/axiosInstance');

async function retrieveAuthMessage() {
  const options = {
    method: 'GET',
    url: 'https://opensea-pro.p.rapidapi.com/auth/message/0x1b8AfD0DE8a9368ce635Be8B9572c65d8F590B21',
    headers: {
      'content-type': 'application/json',
      'X-RapidAPI-Key': process.env.X_RAPIDAPI_KEY,
      'X-RapidAPI-Host': 'opensea-pro.p.rapidapi.com'
    }
  };

  try {
    const response = await axiosInstance.request(options);
    const message = response.data.data.message;

    console.log({ message });
    return message;
  } catch (error) {
    console.error(error);
  }
}

module.exports = { retrieveAuthMessage };
