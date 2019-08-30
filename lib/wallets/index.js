const BOOMWallet = require('./boom');
const BHDWallet = require('./bhd');
const LHDWallet = require('./lhd');
const DISCWallet = require('./disc');

module.exports = {
  BHD: BHDWallet,
  BOOM: BOOMWallet,
  DISC: DISCWallet,
  LHD: LHDWallet,
};