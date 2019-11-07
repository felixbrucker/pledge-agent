const LHDWallet = require('./lhd');

class HDDWallet extends LHDWallet {
  constructor({
    walletUrls,
    pledgeThreshold = 0,
    pledgeTo,
    sendThreshold = 0,
    sendTo,
    moveOtherPledges = false,
    maxPledge,
    coinsToKeepInWallet = 0,
  }) {
    super({
      walletUrls,
      pledgeThreshold,
      pledgeTo,
      sendThreshold,
      sendTo,
      moveOtherPledges,
      maxPledge,
      coinsToKeepInWallet,
    });
    this.symbol = 'HDD';
  }
}

module.exports = HDDWallet;
