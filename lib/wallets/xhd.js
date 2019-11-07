const LHDWallet = require('./lhd');
const moment = require('moment');
const eventBus = require('../services/event-bus');

class XHDWallet extends LHDWallet {
  constructor({
    walletUrls,
    pledgeThreshold = 0,
    pledgeTo,
    sendThreshold = 0,
    sendTo,
    moveOtherPledges = false,
    maxPledge,
    lockingPeriod,
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
    this.symbol = 'XHD';
    this.lockingPeriodInBlocks = 0;
    if (lockingPeriod) {
      if (typeof lockingPeriod === 'number') {
        this.lockingPeriodInBlocks = lockingPeriod;
        return;
      }
      if (typeof lockingPeriod !== 'string' || lockingPeriod.split(' ').length !== 2) {
        eventBus.publish('log/error', `${this.symbol} | Error: invalid lockingPeriod, ignoring ..`);
        return;
      }
      const [amount, unit] = lockingPeriod.split(' ');
      this.lockingPeriodInBlocks = moment.duration(parseInt(amount, 10), unit).asHours() * 12;
    }
  }

  async getOutDatedPledges(walletUrl, address, pledgeDestination) {
    const pledges = await this.getPledges(walletUrl, address);
    const currentHeight = await this.getCurrentHeight(walletUrl);

    return pledges
      .filter(pledge => pledge.to !== pledgeDestination)
      .filter(pledge => (parseInt(pledge.blockheight, 10) + parseInt(pledge.lockblocks, 10)) < currentHeight);
  }

  async createPledge(walletUrl, recipient, amount) {
    return this.doApiCall(walletUrl, 'pointtoaddress', [recipient, amount.toFixed(8), this.lockingPeriodInBlocks]);
  }

  async getCurrentHeight(walletUrl) {
    const miningInfo = await this.doApiCall(walletUrl, 'getMiningInfo');

    return miningInfo.height - 1;
  }
}

module.exports = XHDWallet;
