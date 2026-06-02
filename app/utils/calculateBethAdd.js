async function calculateBETHAdd(
  blurPoolBalanceMax,
  wethBalance,
  etherUse,
  wethBalanceMax,
  blurPoolBalance
) {
  try {
    let bethAdd =
      ((blurPoolBalanceMax * (wethBalance + etherUse) -
        wethBalanceMax * blurPoolBalance)) /
      (blurPoolBalanceMax + wethBalanceMax);

    if  (bethAdd > etherUse) {
      bethAdd = etherUse
    }

    return bethAdd;

  } catch (error) {
    console.log('error calculating BETH Add');
  }
}

module.exports = { calculateBETHAdd };
