1.6.0 / 2021-04-07
==================

* Add support for BURST commitment.
* Allow removing all pledges with `maxPledge` of zero.
* Add support for the `multiplesOf` config option to send or pledge only multiples of a defined amount.
* Add support for the `coinsToKeepInWallet` config option to keep a defined amount of coins in the wallet and not send or pledge it.
* Fix waiting one round when not actually removing pledges with `maxPledge` configured.
* Remove support for BOOM.

1.5.0 / 2019-11-07
==================

* Add support for BURST (sending only).
* Add support for sending public messages with BURST/BOOM payments.

1.4.0 / 2019-11-02
==================

* Add support for locking periods for XHD pledges.

1.3.0 / 2019-10-23
==================

* Add support for XHD.

1.2.0 / 2019-10-13
==================

* Add support for max pledge option to limit the pledge on the pledgeTo address.
* Add support for sendTo and sendThreshold.
* Add support for pledgeTo / sendTo percentages.
* Add support for walletUrls in the walletPassphrase syntax (to unlock wallets) without supplying the walletPassphrase.
* Add support for HDD.

1.1.0 / 2019-09-02
==================

* Add support for automatic unlocking of wallets secured with a passphrase.

1.0.0 / 2019-08-30
==================

* Initial release.
