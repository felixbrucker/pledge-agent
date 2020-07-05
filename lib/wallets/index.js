const BURSTWallet = require('./burst');
const BHDWallet = require('./bhd');
const LHDWallet = require('./lhd');
const DISCWallet = require('./disc');
const HDDWallet = require('./hdd');
const XHDWallet = require('./xhd');

module.exports = {
  BHD: BHDWallet,
  BURST: BURSTWallet,
  DISC: DISCWallet,
  LHD: LHDWallet,
  HDD: HDDWallet,
  XHD: XHDWallet,
};