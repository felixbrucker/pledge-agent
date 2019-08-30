const superagent = require('superagent');
const JSONbig = require('json-bigint');
const eventBus = require('../services/event-bus');

class BHDWallet {
  constructor({
    walletUrls,
    pledgeThreshold,
    pledgeTo,
    moveOtherPledges
  }) {
    this.walletUrls = walletUrls;
    this.pledgeThreshold = pledgeThreshold;
    this.pledgeTo = pledgeTo;
    this.moveOtherPledges = moveOtherPledges;
    this.avgTxFee = 0.0001;
    this.symbol = 'BHD';
  }

  async init() {
    await this.checkBalancesAndRePledge();
    setInterval(this.checkBalancesAndRePledge.bind(this), 10 * 60 * 1000);
  }

  async checkBalancesAndRePledge() {
    if (this.movingPledge) {
      return;
    }
    this.movingPledge = true;
    let createdPledges = false;
    await Promise.all(this.walletUrls.map(async walletUrl => {
      const address = await this.getPrimaryAddress(walletUrl);
      if (this.moveOtherPledges) {
        await this.moveOutdatedPledges(walletUrl, address);
      }
      const balance = await this.getBalance(walletUrl);
      const pledges = await this.getPledges(walletUrl, address);
      const coinsToKeepInWallet = (this.avgTxFee * pledges.length) + (this.avgTxFee * 2);
      if (balance < (this.pledgeThreshold + coinsToKeepInWallet)) {
        return;
      }
      const toPledge = parseFloat((balance - coinsToKeepInWallet).toFixed(8));
      if (toPledge <= 1) {
        return;
      }
      eventBus.publish('log/info', `${this.symbol} | ${address} | Creating pledge of ${toPledge} ${this.symbol} to ${this.pledgeTo} ..`);
      createdPledges = true;
      try {
        await this.createPledge(walletUrl, this.pledgeTo, toPledge);
        await this.waitForUnconfirmedTransactions(walletUrl, address);
      } catch (err) {
        eventBus.publish('log/error', `${this.symbol} | ${address} | Failed creating pledge of ${toPledge} ${this.symbol} to ${this.pledgeTo}: ${err.response.text}`);
      }
    }));
    if (createdPledges) {
      eventBus.publish('log/info', `${this.symbol} | Done pledging to ${this.pledgeTo}`);
    }
    this.movingPledge = false;
  }

  async moveOutdatedPledges(walletUrl, address) {
    const outDatedPledges = await this.getOutDatedPledges(walletUrl, address, this.pledgeTo);
    if (outDatedPledges.length === 0) {
      return;
    }
    const balance = await this.getBalance(walletUrl);
    if (balance < (outDatedPledges.length * this.avgTxFee)) {
      eventBus.publish('log/error', `${this.symbol} | Address ${address} doesn't have enough funds to cover the pledge canceling, skipping ..`);
      return;
    }
    await this.cancelPledges(outDatedPledges, walletUrl, address);
    await this.waitForUnconfirmedTransactions(walletUrl, address);
  }

  async cancelPledges(pledges, walletUrl, address) {
    for (let pledge of pledges) {
      eventBus.publish('log/info', `${this.symbol} | ${address} | Canceling pledge ${pledge.txid} of ${pledge.amount} ${this.symbol} to ${pledge.to} ..`);
      await this.cancelPledge(walletUrl, pledge.txid);
    }
  }

  async waitForUnconfirmedTransactions(walletUrl, address) {
    let unconfirmedTransactions = await this.getUnconfirmedTransactions(walletUrl);
    if (unconfirmedTransactions.length === 0) {
      return false;
    }
    eventBus.publish('log/info', `${this.symbol} | ${address} | Waiting for all unconfirmed transactions ..`);
    while(unconfirmedTransactions.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 10 * 1000));
      unconfirmedTransactions = await this.getUnconfirmedTransactions(walletUrl);
    }

    return true;
  }

  async doApiCall(walletUrl, method, params = []) {
    const res = await superagent.post(walletUrl).send({
      jsonrpc: '2.0',
      id: 0,
      method,
      params,
    });

    return JSONbig.parse(res.res.text).result;
  }

  async getPrimaryAddress(walletUrl) {
    return this.doApiCall(walletUrl, 'getprimaryaddress');
  }

  async getBalance(walletUrl) {
    const { balance } = await this.doApiCall(walletUrl, 'getwalletinfo');

    return balance;
  }

  async getPledges(walletUrl, address) {
    let allPledges = [];
    const batchSize = 50;
    for (let skip = 0, exit = false; !exit; skip += batchSize) {
      const pledges = await this.doApiCall(walletUrl, 'listpledges', [batchSize, skip]);
      if (pledges.length !== batchSize) {
        exit = true;
      }
      allPledges = allPledges.concat(pledges.filter(pledge => pledge.from === address));
    }

    return allPledges;
  }

  async getOutDatedPledges(walletUrl, address, pledgeDestination) {
    const pledges = await this.getPledges(walletUrl, address);

    return pledges.filter(pledge => pledge.to !== pledgeDestination);
  }

  async cancelPledge(walletUrl, txId) {
    return this.doApiCall(walletUrl, 'withdrawpledge', [txId]);
  }

  async createPledge(walletUrl, recipient, amount) {
    return this.doApiCall(walletUrl, 'sendpledgetoaddress', [recipient, amount.toFixed(8)]);
  }

  async getUnconfirmedTransactions(walletUrl) {
    const transactions = await this.doApiCall(walletUrl, 'listtransactions');

    return transactions.filter(transaction => transaction.confirmations === 0);
  }
}

module.exports = BHDWallet;
