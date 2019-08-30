const moment = require('moment');
const eventBus = require('./event-bus');

class Logger {
  constructor() {
    eventBus.subscribe('log/info', (msg) => Logger.onLogs('info', msg));
    eventBus.subscribe('log/debug', (msg) => Logger.onLogs('debug', msg));
    eventBus.subscribe('log/error', (msg) => Logger.onLogs('error', msg));
  }

  static onLogs(logLevel, msg) {
    const logLine = `${moment().format('YYYY-MM-DD HH:mm:ss.SSS')} [${logLevel.toUpperCase()}] | ${msg}`;
    switch (logLevel) {
      case 'debug':
        console.log(logLine);
        break;
      case 'info':
        console.log(logLine);
        break;
      case 'error':
        console.error(logLine);
        break;
    }
  }
}

module.exports = new Logger();
