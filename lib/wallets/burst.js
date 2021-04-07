const superagent = require('superagent');
const JSONbig = require('json-bigint');
const BigNumber = require('bignumber.js');

const eventBus = require('../services/event-bus');
const Base = require('./base');

class BURSTWallet extends Base {
  constructor({
    walletUrl,
    accountIdToPassPhrase,
    commitPercentage = 0,
    commitmentThreshold = 0,
    sendThreshold = 0,
    sendTo,
    sendMessage = null,
    maxCommitment,
    coinsToKeepInWallet = 0,
    multiplesOf = null,
  }) {
    super();
    this.walletUrl = walletUrl;
    this.commitPercentage = commitPercentage / 100;
    this.commitmentThreshold = commitmentThreshold;
    this.sendThreshold = sendThreshold;
    this.sendTo = sendTo;
    this.sendMessage = sendMessage;
    this.accounts = Object.keys(accountIdToPassPhrase).map(id => ([id, accountIdToPassPhrase[id]]));
    this.maxCommitment = maxCommitment;
    this.standardFee = 0.0147;
    this.symbol = 'BURST';
    this.coinsToKeepInWallet = coinsToKeepInWallet;
    this.multiplesOf = multiplesOf;
    this.decimalPlaces = 8;
  }

  async init() {
    await super.init();

    await this.updateStandardFee();
    setInterval(this.updateStandardFee.bind(this), 60 * 1000);

    await this.checkBalancesAndCommit();
    setInterval(this.checkBalancesAndCommit.bind(this), 10 * 60 * 1000);
  }

  async checkBalancesAndCommit() {
    if (this.sendingAndCommittingCoins) {
      return;
    }
    try {
      this.sendingAndCommittingCoins = true;
      let createdCommitments = false;
      let sentCoins = false;
      await Promise.all(this.accounts.map(async ([accountId, secretPhrase]) => {
        const balance = await this.getBalance(accountId);
        const toDistribute = parseFloat((balance - this.coinsToKeepInWallet).toFixed(8));
        let toCommit = parseFloat((toDistribute * this.commitPercentage).toFixed(8));
        if (this.maxCommitment !== undefined) {
          const committedAmount = await this.getCommittedAmount(accountId);
          const overCommittedAmount = committedAmount - this.maxCommitment;
          if (overCommittedAmount > 0) {
            eventBus.publish('log/info', `${this.symbol} | ${accountId} | Removing commitment of ${overCommittedAmount} ${this.symbol} ..`);
            await this.removeCommitment(overCommittedAmount, secretPhrase);
            await this.waitForUnconfirmedTransactions(accountId);
            toCommit = 0;
          } else {
            toCommit = Math.min(Math.abs(overCommittedAmount), toCommit);
          }
        }
        if (this.multiplesOf) {
          toCommit = parseFloat((Math.floor(toCommit / this.multiplesOf) * this.multiplesOf).toFixed(8));
        }
        if (toCommit > 0.0001 && toCommit > this.commitmentThreshold) {
          eventBus.publish('log/info', `${this.symbol} | ${accountId} | Creating commitment of ${toCommit} ${this.symbol} ..`);
          createdCommitments = true;
          try {
            await this.addCommitment(toCommit, secretPhrase);
            await this.waitForUnconfirmedTransactions(accountId);
          } catch (err) {
            eventBus.publish('log/error', `${this.symbol} | ${accountId} | Failed creating commitment of ${toCommit} ${this.symbol}: ${err.message}`);
          }
        }

        let toSend = parseFloat((toDistribute * this.sendToPercentage).toFixed(8));
        if (toCommit === 0 && toSend > 0) {
          toSend = toDistribute;
        }
        if (this.multiplesOf) {
          toSend = parseFloat((Math.floor(toSend / this.multiplesOf) * this.multiplesOf).toFixed(8));
        }
        if (toSend > 0.0001 && toSend > this.sendThreshold) {
          eventBus.publish('log/info', `${this.symbol} | ${accountId} | Sending ${toSend} ${this.symbol} to ${this.sendTo[0]} ..`);
          sentCoins = true;
          try {
            await this.sendCoins(this.sendTo[0], toSend, secretPhrase);
            await this.waitForUnconfirmedTransactions(accountId);
          } catch (err) {
            eventBus.publish('log/error', `${this.symbol} | ${accountId} | Failed sending ${toSend} ${this.symbol} to ${this.sendTo[0]}: ${err.message}`);
          }
        }
      }));
      if (createdCommitments) {
        eventBus.publish('log/info', `${this.symbol} | Done committing`);
      }
      if (sentCoins) {
        eventBus.publish('log/info', `${this.symbol} | Done sending to ${this.sendTo[0]}`);
      }
    } catch (err) {
      eventBus.publish('log/error', `${this.symbol} | Error: ${err.message}`);
    } finally {
      this.sendingAndCommittingCoins = false;
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
      this.standardFee = (new BigNumber(fees.standard)).shiftedBy(-this.decimalPlaces).toNumber();
    } catch (err) {
      eventBus.publish('log/error', `${this.symbol} | Error: ${err.message}`);
    }
  }

  async addCommitment(amount, secretPhrase) {
    return this.doApiCall('addCommitment', {
      amountNQT: (new BigNumber(amount)).shiftedBy(this.decimalPlaces).integerValue(BigNumber.ROUND_FLOOR).toString(),
      secretPhrase,
      feeNQT: (new BigNumber(this.standardFee)).shiftedBy(this.decimalPlaces).integerValue(BigNumber.ROUND_FLOOR).toString(),
      deadline: 150,
    }, 'post');
  }

  async removeCommitment(amount, secretPhrase) {
    return this.doApiCall('removeCommitment', {
      amountNQT: (new BigNumber(amount)).shiftedBy(this.decimalPlaces).integerValue(BigNumber.ROUND_FLOOR).toString(),
      secretPhrase,
      feeNQT: (new BigNumber(this.standardFee)).shiftedBy(this.decimalPlaces).integerValue(BigNumber.ROUND_FLOOR).toString(),
      deadline: 150,
    }, 'post');
  }

  async sendCoins(recipient, amount, secretPhrase) {
    const config = {
      recipient,
      amountNQT: (new BigNumber(amount)).shiftedBy(this.decimalPlaces).integerValue(BigNumber.ROUND_FLOOR).toString(),
      secretPhrase,
      feeNQT: (new BigNumber(this.standardFee)).shiftedBy(this.decimalPlaces).integerValue(BigNumber.ROUND_FLOOR).toString(),
      deadline: 150,
    };
    if (this.sendMessage) {
      config.message = this.sendMessage;
    }
    return this.doApiCall('sendMoney', config, 'post');
  }

  async getCommittedAmount(account) {
    const accountData = await this.doApiCall('getAccount', {
      account,
      getCommittedAmount: true,
    });

    return (new BigNumber(accountData.committedBalanceNQT)).shiftedBy(-this.decimalPlaces).toNumber();
  }

  async getBalance(account) {
    const balanceData = await this.doApiCall('getBalance', {
      account,
    });

    return (new BigNumber(balanceData.unconfirmedBalanceNQT)).shiftedBy(-this.decimalPlaces).toNumber();
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
    if (result.errorCode || result.errorDescription || result.error) {
      throw new Error(result.errorDescription || JSON.stringify(result));
    }

    return result;
  }
}

module.exports = BURSTWallet;
