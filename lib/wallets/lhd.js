const BHDWallet = require('./bhd');

class LHDWallet extends BHDWallet {
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
    this.symbol = 'LHD';
  }

  async getPledges(walletUrl, address) {
    let allPledges = [];
    const batchSize = 50;
    for (let skip = 0, exit = false; !exit; skip += batchSize) {
      const pledges = await this.doApiCall(walletUrl, 'listpointto', [batchSize, skip]);
      if (pledges.length !== batchSize) {
        exit = true;
      }
      allPledges = allPledges.concat(pledges.filter(pledge => pledge.from === address));
    }

    return allPledges;
  }

  async cancelPledge(walletUrl, txId) {
    return this.doApiCall(walletUrl, 'withdrawpoint', [txId]);
  }

  async createPledge(walletUrl, recipient, amount) {
    return this.doApiCall(walletUrl, 'pointtoaddress', [recipient, amount.toFixed(8)]);
  }
}

module.exports = LHDWallet;
