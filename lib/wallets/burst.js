const superagent = require('superagent');
const JSONbig = require('json-bigint');
const eventBus = require('../services/event-bus');
const BOOMWallet = require('./boom');

class BURSTWallet extends BOOMWallet {
  constructor({
    walletUrl,
    accountIdToPassPhrase,
    sendThreshold = 0,
    sendTo,
    sendMessage = null,
    coinsToKeepInWallet = 0,
  }) {
    super({
      walletUrl,
      accountIdToPassPhrase,
      sendThreshold,
      sendTo,
      sendMessage,
      coinsToKeepInWallet,
    });
    this.symbol = 'BURST';
  }

  async checkBalancesAndRePledge() {
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
      this.sendingCoins = false;
    } catch (err) {
      this.sendingCoins = false;
      eventBus.publish('log/error', `${this.symbol} | Error: ${err.message}`);
    }
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
