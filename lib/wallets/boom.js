const superagent = require('superagent');
const JSONbig = require('json-bigint');
const eventBus = require('../services/event-bus');

class BOOMWallet {
  constructor({
    walletUrl,
    pledgeThreshold,
    accountIdToPassPhrase,
    pledgeTo,
    moveOtherPledges,
    maxPledge,
  }) {
    this.walletUrl = walletUrl;
    this.pledgeThreshold = pledgeThreshold;
    this.pledgeTo = pledgeTo;
    this.moveOtherPledges = moveOtherPledges;
    this.maxPledge = maxPledge;
    this.accounts = Object.keys(accountIdToPassPhrase).map(id => ([id, accountIdToPassPhrase[id]]));
    this.standardFee = 0.0147;
    this.symbol = 'BOOM';
  }

  async init() {
    await this.updateStandardFee();
    setInterval(this.updateStandardFee.bind(this), 60 * 1000);

    await this.checkBalancesAndRePledge();
    setInterval(this.checkBalancesAndRePledge.bind(this), 10 * 60 * 1000);
  }

  async checkBalancesAndRePledge() {
    if (this.movingPledge) {
      return;
    }
    try {
      this.movingPledge = true;
      let createdPledges = false;
      await Promise.all(this.accounts.map(async ([accountId, secretPhrase]) => {
        if (this.moveOtherPledges) {
          await this.moveOutdatedPledges(accountId, secretPhrase);
        }
        const balance = await this.getBalance(accountId);
        const pledges = await this.getPledgesFromAccount(accountId);
        const coinsToKeepInWallet = (this.standardFee * pledges.length) + (this.standardFee * 2);
        if (balance < (this.pledgeThreshold + coinsToKeepInWallet)) {
          return;
        }
        let toPledge = parseFloat((balance - coinsToKeepInWallet).toFixed(8));
        if (this.maxPledge !== undefined) {
          const currentPledge = await this.getPledgedAmount(accountId, this.pledgeTo);
          toPledge = Math.min(Math.max((this.maxPledge - currentPledge), 0), toPledge);
        }
        if (toPledge <= 0) {
          return;
        }
        eventBus.publish('log/info', `${this.symbol} | ${accountId} | Creating pledge of ${toPledge} ${this.symbol} to ${this.pledgeTo} ..`);
        createdPledges = true;
        await this.createPledge(this.pledgeTo, toPledge, accountId, secretPhrase);
        await this.waitForUnconfirmedTransactions(accountId);
      }));
      if (createdPledges) {
        eventBus.publish('log/info', `${this.symbol} | Done pledging to ${this.pledgeTo}`);
      }
      this.movingPledge = false;
    } catch (err) {
      this.movingPledge = false;
      eventBus.publish('log/error', `${this.symbol} | Error: ${err.message}`);
    }
  }

  async moveOutdatedPledges(accountId, secretPhrase) {
    const outDatedPledges = await this.getOutDatedPledges(accountId, this.pledgeTo);
    if (outDatedPledges.length === 0) {
      return;
    }
    const balance = await this.getBalance(accountId);
    if (balance < (outDatedPledges.length * this.standardFee)) {
      eventBus.publish('log/error', `${this.symbol} | Account ${accountId} doesn't have enough funds to cover the pledge canceling, skipping ..`);
      return;
    }
    await this.cancelPledges(outDatedPledges, accountId, secretPhrase);
    const hadUnconfirmedTxs = await this.waitForUnconfirmedTransactions(accountId);
    if (outDatedPledges.length > 0 || hadUnconfirmedTxs) {
      eventBus.publish('log/info', `${this.symbol} | ${accountId} | Waiting one more block so all canceled pledges are accounted for ..`);
      await this.waitNBlocks(1);
    }
  }

  async waitNBlocks(blocksToWait) {
    const initialHeight = await this.getCurrentHeight();
    let currentHeight = initialHeight;
    while(currentHeight < initialHeight + blocksToWait) {
      await new Promise(resolve => setTimeout(resolve, 5 * 1000));
      currentHeight = await this.getCurrentHeight();
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

  async getOutDatedPledges(accountId, pledgeDestination) {
    const pledges = await this.getPledgesFromAccount(accountId);

    return pledges.filter(pledge => pledge.recipient !== pledgeDestination);
  }

  async cancelPledges(pledges, accountId, secretPhrase) {
    for (let pledge of pledges) {
      eventBus.publish('log/info', `${this.symbol} | ${accountId} | Canceling pledge ${pledge.order} of ${parseInt(pledge.amountNQT, 10) / Math.pow(10, 8)} ${this.symbol} to ${pledge.recipient} ..`);
      await this.cancelPledge(pledge.order, secretPhrase);
      await this.waitNBlocks(1);
    }
  }

  async updateStandardFee() {
    try {
      const fees = await this.doApiCall('suggestFee');
      this.standardFee = parseInt(fees.standard, 10) / Math.pow(10, 8);
    } catch (err) {
      eventBus.publish('log/error', `${this.symbol} | Error: ${err.message}`);
    }
  }

  async getPledgesFromAccount(account) {
    return this.doApiCall('getPledgesByAccount', {
      account,
    });
  }

  async getPledgedAmount(account, pledgeDestination) {
    const pledges = await this.getPledgesFromAccount(account);

    return pledges
      .filter(pledge => pledge.recipient === pledgeDestination)
      .map(pledge => parseInt(pledge.amountNQT, 10) / Math.pow(10, 8))
      .reduce((acc, curr) => acc + curr, 0);
  }

  async createPledge(recipient, amount, account, secretPhrase) {
    return this.doApiCall('createPledge', {
      recipient,
      amountNQT: Math.round(amount * Math.pow(10, 8)),
      secretPhrase,
      feeNQT: Math.round(this.standardFee * Math.pow(10, 8)),
      deadline: 150,
    }, 'post');
  }

  async cancelPledge(txId, secretPhrase) {
    let res = await this.doApiCall('cancelPledge', {
      order: txId,
      secretPhrase,
      feeNQT: Math.round(this.standardFee * Math.pow(10, 8)),
      deadline: 150,
    }, 'post');

    while(res.error) {
      await new Promise(resolve => setTimeout(resolve, 10 * 1000));

      res = await this.doApiCall('cancelPledge', {
        order: txId,
        secretPhrase,
        feeNQT: Math.round(this.standardFee * Math.pow(10, 8)),
        deadline: 150,
      }, 'post');
    }

    return res;
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

  async getCurrentHeight() {
    const miningInfo = this.doApiCall('getMiningInfo');

    return parseInt(miningInfo.height, 10);
  }

  async doApiCall(requestType, params = {}, method = 'get') {
    const queryParams = Object.assign(params, {requestType});
    const res = await superagent[method](`${this.walletUrl}/boom`).query(queryParams);

    return JSONbig.parse(res.text);
  }
}

module.exports = BOOMWallet;
