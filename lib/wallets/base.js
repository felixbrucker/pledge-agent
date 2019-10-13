const eventBus = require('../services/event-bus');

module.exports = class Base {
  get pledgeToPercentage() {
    return this.pledgeTo ? (this.pledgeTo[1] / 100) : 0;
  }

  get sendToPercentage() {
    return this.sendTo ? (this.sendTo[1] / 100) : 0;
  }

  async init() {
    let remainingPercent = 100;
    if (this.pledgeTo) {
      if (Array.isArray(this.pledgeTo)) {
        this.pledgeTo = this.pledgeTo.length === 2 ? this.pledgeTo : [this.pledgeTo[0], 100];
      } else {
        this.pledgeTo = [this.pledgeTo, 100];
      }
      if (this.pledgeTo[1] > 100) {
        eventBus.publish('log/error', `${this.symbol} | Error: pledgeTo percentage exceeds 100`);
        process.exit(1);
      }
      remainingPercent -= this.pledgeTo[1];
    }
    if (this.sendTo) {
      if (Array.isArray(this.sendTo)) {
        this.sendTo = this.sendTo.length === 2 ? this.sendTo : [this.sendTo[0], remainingPercent];
      } else {
        this.sendTo = [this.sendTo, remainingPercent];
      }
      if (this.sendTo[1] > 100) {
        eventBus.publish('log/error', `${this.symbol} | Error: sendTo percentage exceeds 100`);
        process.exit(1);
      }
    }
    const totalPercent = (this.pledgeTo ? this.pledgeTo[1] : 0) + (this.sendTo ? this.sendTo[1] : 0);
    if (totalPercent > 100) {
      eventBus.publish('log/error', `${this.symbol} | Error: total pledgeTo / sendTo percentage exceeds 100`);
      process.exit(1);
    }
  }
};