const superagent = require('superagent');
const JSONbig = require('json-bigint');
const eventBus = require('../services/event-bus');
const Base = require('./base');

class BURSTWallet extends Base {
  constructor({
    walletUrl,
    accountIdToPassPhrase,
    sendThreshold = 0,
    sendTo,
    sendMessage = null,
    coinsToKeepInWallet = 0,
    multiplesOf = null,
  }) {
    super();
    this.walletUrl = walletUrl;
    this.sendThreshold = sendThreshold;
    this.sendTo = sendTo;
    this.sendMessage = sendMessage;
    this.accounts = Object.keys(accountIdToPassPhrase).map(id => ([id, accountIdToPassPhrase[id]]));
    this.standardFee = 0.0147;
    this.symbol = 'BURST';
    this.coinsToKeepInWallet = coinsToKeepInWallet;
    this.multiplesOf = multiplesOf;
  }

  async init() {
    await super.init();

    await this.updateStandardFee();
    setInterval(this.updateStandardFee.bind(this), 60 * 1000);

    await this.checkBalancesAndSend();
    setInterval(this.checkBalancesAndSend.bind(this), 10 * 60 * 1000);
  }

  async checkBalancesAndSend() {
    if (this.sendingCoins) {
      return;
    }
    try {
      this.sendingCoins = true;
      let sentCoins = false;
      await Promise.all(this.accounts.map(async ([accountId, secretPhrase]) => {
        const balance = await this.getBalance(accountId);
        if (balance < this.coinsToKeepInWallet) {
          return;
        }
        const toDistribute = parseFloat((balance - this.coinsToKeepInWallet).toFixed(8));
        let toSend = parseFloat((toDistribute * this.sendToPercentage).toFixed(8));
        if (this.multiplesOf) {
          toSend = parseFloat((Math.floor(toSend / this.multiplesOf) * this.multiplesOf).toFixed(8));
        }
        if (toSend > 0.0001 && toSend > this.sendThreshold) {
          eventBus.publish('log/info', `${this.symbol} | ${accountId} | Sending ${toSend} ${this.symbol} to ${this.sendTo[0]} ..`);
          sentCoins = true;
          try {
            await this.sendCoins(this.sendTo[0], toSend, accountId, secretPhrase);
            await this.waitForUnconfirmedTransactions(accountId);
          } catch (err) {
            eventBus.publish('log/error', `${this.symbol} | ${accountId} | Failed sending ${toSend} ${this.symbol} to ${this.sendTo[0]}: ${err.message}`);
          }
        }
      }));
      if (sentCoins) {
        eventBus.publish('log/info', `${this.symbol} | Done sending to ${this.sendTo[0]}`);
      }
    } catch (err) {
      eventBus.publish('log/error', `${this.symbol} | Error: ${err.message}`);
    } finally {
      this.sendingCoins = false;
    }
  }

  async waitForUnconfirmedTransactions(accountId) {
    let unconfirmedTransactions = await this.getUnconfirmedTransactions(accountId);
    if (unconfirmedTransactions.length === 0) {
      return false;
    }
    eventBus.publish('log/info', `${this.symbol} | ${accountId} | Waiting for all unconfirmed transactions ..`);
    while(unconfirmedTransactions.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 10 * 1000));
      unconfirmedTransactions = await this.getUnconfirmedTransactions(accountId);
    }

    return true;
  }

  async updateStandardFee() {
    try {
      const fees = await this.doApiCall('suggestFee');
      this.standardFee = parseInt(fees.standard, 10) / Math.pow(10, 8);
    } catch (err) {
      eventBus.publish('log/error', `${this.symbol} | Error: ${err.message}`);
    }
  }

  async sendCoins(recipient, amount, account, secretPhrase) {
    const config = {
      recipient,
      amountNQT: Math.round(amount * Math.pow(10, 8)),
      secretPhrase,
      feeNQT: Math.round(this.standardFee * Math.pow(10, 8)),
      deadline: 150,
    };
    if (this.sendMessage) {
      config.message = this.sendMessage;
    }
    return this.doApiCall('sendMoney', config, 'post');
  }

  async getBalance(account) {
    const balanceData = await this.doApiCall('getBalance', {
      account,
    });

    return parseInt(balanceData.balanceNQT, 10) / Math.pow(10, 8);
  }

  async getUnconfirmedTransactions(account) {
    const res = await this.doApiCall('getUnconfirmedTransactions', {
      account,
    });

    return res.unconfirmedTransactions;
  }

  async doApiCall(requestType, params = {}, method = 'get') {
    const queryParams = Object.assign(params, {requestType});
    const res = await superagent[method](`${this.walletUrl}/burst`).query(queryParams);
    const result = JSONbig.parse(res.text);
    if (result.errorCode || result.errorDescription) {
      throw new Error(result.errorDescription || JSON.stringify(result));
    }

    return result;
  }
}

module.exports = BURSTWallet;
