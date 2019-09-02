const eventBus = require('../services/event-bus');
const BHDWallet = require('./bhd');

class DISCWallet extends BHDWallet {
  constructor({
    walletUrls,
    pledgeThreshold,
    pledgeTo,
    moveOtherPledges
  }) {
    super({
      walletUrls,
      pledgeThreshold,
      pledgeTo,
      moveOtherPledges
    });
    this.symbol = 'DISC';
  }

  async getPrimaryAddress(walletUrl) {
    return this.doApiCall(walletUrl, 'getaccountaddress', ['']);
  }

  async getPledges(walletUrl) {
    return this.doApiCall(walletUrl, 'liststakeout');
  }

  async cancelPledge(walletUrl, txId) {
    return this.doApiCall(walletUrl, 'unstake', [txId]);
  }

  async createPledge(walletUrl, recipient, amount) {
    return this.doApiCall(walletUrl, 'staketo', [recipient, amount.toFixed(8)]);
  }

  async getOutDatedPledges(walletUrl, address, pledgeDestination) {
    const pledges = await this.getPledges(walletUrl, address);

    return pledges.filter(pledge => pledge.address !== pledgeDestination);
  }

  async cancelPledges(pledges, walletUrl, address) {
    for (let pledge of pledges) {
      eventBus.publish('log/info', `${this.symbol} | ${address} | Canceling pledge ${pledge.txid} of ${pledge.amount} ${this.symbol} to ${pledge.address} ..`);
      await this.cancelPledge(walletUrl, pledge.txid);
    }
  }
}

module.exports = DISCWallet;