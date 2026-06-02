const { utils } = require('ethers');

async function convertToWeth(wethContract, wethAdd) {
  try {
    const convertToWeth = await wethContract.deposit({
      value: utils.parseEther(wethAdd.toString())
    });

    console.log('Transaction Hash:', convertToWeth.hash);
    const receipt = await convertToWeth.wait(1);

    console.log(
      'Transaction confirmed with',
      receipt.confirmations,
      'confirmation(s)'
    );
  } catch (error) {
    console.log('error converting eth to weth', error);
  }
}

module.exports = { convertToWeth };
