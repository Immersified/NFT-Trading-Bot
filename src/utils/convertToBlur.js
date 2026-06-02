const { utils } = require('ethers');

async function convertToBlur(blurPoolContract, bethAdd) {
  try {
    const converToBlur = await blurPoolContract.deposit({
      value: utils.parseEther(bethAdd.toString())
    });

    console.log('Transaction Hash:', converToBlur.hash);
    const receipt = await converToBlur.wait(1);

    console.log(
      'Transaction confirmed with',
      receipt.confirmations,
      'confirmation(s)'
    );
  } catch (error) {
    console.log('error converting eth to blur', error);
  }
}

module.exports = { convertToBlur };
