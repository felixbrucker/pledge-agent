#!/usr/bin/env node

const logger = require('./lib/services/logger');
const eventBus = require('./lib/services/event-bus');
const config = require('./lib/services/config');
const wallets = require('./lib/wallets');
const version = require('./package').version;

(async () => {
  eventBus.publish('log/info', `Pledge-Agent ${version} starting ..`);
  await config.init();

  const coins = Object.keys(config.config);
  coins.forEach(coin => eventBus.publish('log/info', `${coin} | Initializing ..`));
  await Promise.all(coins.map(async coin => {
    const Wallet = wallets[coin];
    if (!Wallet) {
      eventBus.publish('log/error', `${coin} | Unknown coin!`);
      return;
    }
    const wallet = new Wallet(config.config[coin]);
    await wallet.init();
    eventBus.publish('log/info', `${coin} | Initialized`);
  }));
})();