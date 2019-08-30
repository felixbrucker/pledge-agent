const fs = require('fs');
const YAML = require('js-yaml');
const eventBus = require('./event-bus');

class Config {
  static get defaultConfig() {
    return {
      BHD: {
        pledgeTo: '3LxNj4jkU251oKqaSxLxRLgcTBNu58maWf',
        walletUrls: [
          'http://someuser:somepass@127.0.0.1:8732',
        ],
        pledgeThreshold: 1,
        moveOtherPledges: false,
      },
      BOOM: {
        pledgeTo: 'BOOM-2RKG-UQW9-UKEV-D9HVN',
        accountIdToPassPhrase: {
          '1234567890': 'my secret passphrase here',
        },
        walletUrl: 'http://127.0.0.1:9925',
        pledgeThreshold: 5,
        moveOtherPledges: true,
      },
      DISC: {
        pledgeTo: '12ha4kKZfb3jjQa1hgSJbywtDHrzPmXyC7',
        walletUrls: [
          'http://someuser:somepass@127.0.0.1:63336',
        ],
        pledgeThreshold: 5,
        moveOtherPledges: true,
      },
      LHD: {
        pledgeTo: '37vyzxepZ2foekG9ih7MzUy5HhDa61fDCy',
        walletUrls: [
          'http://someuser:somepass@127.0.0.1:9832',
        ],
        pledgeThreshold: 1,
        moveOtherPledges: true,
      },
    };
  }

  static logErrorAndExit(error) {
    eventBus.publish('log/error', `There is an error with your config file: ${error}`);
    process.exit(1);
  }

  async init() {
    this.filePath = 'pledge-agent.yaml';
    await this.loadFromFile();
  }

  async loadFromFile() {
    let file;
    try {
      file = fs.readFileSync(this.filePath);
    } catch (err) {
      eventBus.publish('log/info', `First start detected, creating the config file (${this.filePath}), please adjust it to your preferences.`);
      this.initFromObject();
      this.saveToFile();
      process.exit(0);
    }
    let configObject = null;
    try {
      configObject = YAML.safeLoad(file);
    } catch (err) {
      Config.logErrorAndExit(err);
    }
    this.initFromObject(configObject);
  }

  saveToFile() {
    const yaml = YAML.safeDump(this.config, {
      lineWidth: 140,
    });
    fs.writeFileSync(this.filePath, yaml, 'utf8');
  }

  initFromObject(configObject = null) {
    this._config = configObject || Config.defaultConfig;
  }

  get config() {
    return this._config;
  }
}

module.exports = new Config();
