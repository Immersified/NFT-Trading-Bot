async function calculateBETHAdd(
  blurPoolBalanceMax,
  wethBalance,
  etherUse,
  wethBalanceMax,
  blurPoolBalance
) {
  try {
    const bethAdd =
      ((blurPoolBalanceMax * (wethBalance + etherUse) -
        wethBalanceMax * blurPoolBalance)) /
      (blurPoolBalanceMax + wethBalanceMax);

    return bethAdd;
  } catch (error) {
    console.log('error calculating BETH Add');
  }
}

module.exports = { calculateBETHAdd };
