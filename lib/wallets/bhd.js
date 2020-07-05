const superagent = require('superagent');
const JSONbig = require('json-bigint');
const eventBus = require('../services/event-bus');
const Base = require('./base');

class BHDWallet extends Base {
  constructor({
    walletUrls,
    pledgeThreshold = 0,
    pledgeTo,
    sendThreshold = 0,
    sendTo,
    moveOtherPledges = false,
    maxPledge,
    coinsToKeepInWallet = 0,
    multiplesOf,
  }) {
    super();
    this.walletUrls = walletUrls;
    this.pledgeThreshold = pledgeThreshold;
    this.pledgeTo = pledgeTo;
    this.sendThreshold = sendThreshold;
    this.sendTo = sendTo;
    this.moveOtherPledges = moveOtherPledges;
    this.maxPledge = maxPledge;
    this.avgTxFee = 0.0003;
    this.symbol = 'BHD';
    this.coinsToKeepInWallet = coinsToKeepInWallet;
    this.multiplesOf = multiplesOf;
  }

  async init() {
    this.walletUrls = await Promise.all(this.walletUrls.map(async (walletUrl, index) => {
      if (typeof walletUrl === 'string') {
        return walletUrl;
      }
      if (!walletUrl.walletPassphrase) {
        return walletUrl.url;
      }
      eventBus.publish('log/info', `${this.symbol} | Unlocking wallet ${index + 1} ..`);
      await this.unlockWallet(walletUrl.url, walletUrl.walletPassphrase);

      return walletUrl.url;
    }));

    await super.init();

    await this.checkBalancesAndRePledge();
    setInterval(this.checkBalancesAndRePledge.bind(this), 10 * 60 * 1000);
  }

  async unlockWallet(walletUrl, passphrase) {
    return this.doApiCall(walletUrl, 'walletpassphrase', [passphrase, 1073741824]);
  }

  async checkBalancesAndRePledge() {
    if (this.movingPledge) {
      return;
    }
    try {
      this.movingPledge = true;
      let createdPledges = false;
      let sentCoins = false;
      await Promise.all(this.walletUrls.map(async walletUrl => {
        const address = await this.getPrimaryAddress(walletUrl);
        if (this.moveOtherPledges) {
          await this.moveOutdatedPledges(walletUrl, address);
        }
        const balance = await this.getBalance(walletUrl);
        const coinsToKeepInWallet = Math.max(this.avgTxFee, this.coinsToKeepInWallet);
        if (balance < coinsToKeepInWallet) {
          return;
        }
        const toDistribute = parseFloat((balance - coinsToKeepInWallet).toFixed(8));
        let toPledge = parseFloat((toDistribute * this.pledgeToPercentage).toFixed(8));
        if (this.maxPledge !== undefined && this.pledgeTo) {
          const currentPledge = await this.getPledgedAmount(walletUrl, address, this.pledgeTo[0]);
          toPledge = Math.min(Math.max((this.maxPledge - currentPledge), 0), toPledge);
        }
        if (toPledge > 1 && toPledge > this.pledgeThreshold) {
          eventBus.publish('log/info', `${this.symbol} | ${address} | Creating pledge of ${toPledge} ${this.symbol} to ${this.pledgeTo[0]} ..`);
          createdPledges = true;
          try {
            await this.createPledge(walletUrl, this.pledgeTo[0], toPledge);
            await this.waitForUnconfirmedTransactions(walletUrl, address);
          } catch (err) {
            eventBus.publish('log/error', `${this.symbol} | ${address} | Failed creating pledge of ${toPledge} ${this.symbol} to ${this.pledgeTo[0]}: ${err.response.text}`);
          }
        }
        let toSend = parseFloat((toDistribute * this.sendToPercentage).toFixed(8));
        if (this.multiplesOf) {
          toSend = parseFloat((Math.floor(toSend / this.multiplesOf) * this.multiplesOf).toFixed(8));
        }
        if (toSend > 0.0001 && toSend > this.sendThreshold) {
          eventBus.publish('log/info', `${this.symbol} | ${address} | Sending ${toSend} ${this.symbol} to ${this.sendTo[0]} ..`);
          sentCoins = true;
          try {
            await this.sendCoins(walletUrl, this.sendTo[0], toSend);
            await this.waitForUnconfirmedTransactions(walletUrl, address);
          } catch (err) {
            eventBus.publish('log/error', `${this.symbol} | ${address} | Failed sending ${toSend} ${this.symbol} to ${this.sendTo[0]}: ${err.response.text}`);
          }
        }
      }));
      if (createdPledges) {
        eventBus.publish('log/info', `${this.symbol} | Done pledging to ${this.pledgeTo[0]}`);
      }
      if (sentCoins) {
        eventBus.publish('log/info', `${this.symbol} | Done sending to ${this.sendTo[0]}`);
      }
      this.movingPledge = false;
    } catch(err) {
      this.movingPledge = false;
      eventBus.publish('log/error', `${this.symbol} | Error: ${err.message}`);
    }
  }

  async moveOutdatedPledges(walletUrl, address) {
    if (!this.pledgeTo) {
      return;
    }
    const outDatedPledges = await this.getOutDatedPledges(walletUrl, address, this.pledgeTo[0]);
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

  async getPledgedAmount(walletUrl, address, pledgeDestination) {
    const pledges = await this.getPledges(walletUrl, address);

    return pledges
      .filter(pledge => pledge.to === pledgeDestination)
      .map(pledge => pledge.amount)
      .reduce((acc, curr) => acc + curr, 0);
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

  async sendCoins(walletUrl, recipient, amount) {
    return this.doApiCall(walletUrl, 'sendtoaddress', [recipient, amount.toFixed(8)]);
  }

  async getUnconfirmedTransactions(walletUrl) {
    const transactions = await this.doApiCall(walletUrl, 'listtransactions');

    return transactions.filter(transaction => transaction.confirmations === 0);
  }
}

module.exports = BHDWallet;
