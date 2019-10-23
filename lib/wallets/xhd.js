const LHDWallet = require('./lhd');

class XHDWallet extends LHDWallet {
  constructor({
    walletUrls,
    pledgeThreshold = 0,
    pledgeTo,
    sendThreshold = 0,
    sendTo,
    moveOtherPledges = false,
    maxPledge,
  }) {
    super({
      walletUrls,
      pledgeThreshold,
      pledgeTo,
      sendThreshold,
      sendTo,
      moveOtherPledges,
      maxPledge,
    });
    this.symbol = 'XHD';
  }
}

module.exports = XHDWallet;
