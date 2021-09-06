'use strict';

const {OAuth2App} = require('homey-oauth2app');
const Client = require('./lib/Client');
const {Log} = require('homey-log');

const fullUpdateMinute = 5; // Full update every 5 minutes
const refreshInterval = 10 * 1000; // 10 seconds

class Tedee extends OAuth2App {

  static OAUTH2_CLIENT = Client;

  /*
  |-----------------------------------------------------------------------------
  | Application events
  |-----------------------------------------------------------------------------
  */

  /**
   * Application initialized.
   *
   * @async
   * @returns {Promise<void>}
   */
  async onOAuth2Init() {
    // Sentry logging
    this.homeyLog = new Log({ homey: this.homey });

    // Reset properties
    this.lastRefreshMinute = null;
    this.client = null;
    this.refreshTimer = null;

    // Register flow cards
    this._registerActionFlowCards();
    this._registerConditionFlowCards();

    // Register app event listeners
    this.homey.on('cpuwarn', () => {
      this.log('-- CPU warning! --');
    }).on('memwarn', () => {
      this.log('-- Memory warning! --');
    }).on('unload', () => {
      this.log('-- Unloaded! _o/ --');
    });
  }

  /*
  |-----------------------------------------------------------------------------
  | Application actions
  |-----------------------------------------------------------------------------
  */

  /**
   * Start refresh timer.
   *
   * @returns <void>
   */
  startTimer() {
    if (this.refreshTimer) {
      return;
    }

    this.refreshTimer = this.homey.setInterval(this.refreshDevices.bind(this), refreshInterval);

    this.log('Refresh timer started');
  }

  /**
   * Refresh devices.
   *
   * @async
   * @returns {Promise<void>}
   */
  async refreshDevices() {
    try {
      this.client = this.getFirstSavedOAuth2Client();

      // Fetch requested data from tedee API
      if (this.refreshType() === 'full') {
        await this.client.syncDevices();
      } else {
        await this.client.syncLocks();
      }
    } catch (err) {
      this.error(err.message);

      this.homey.emit('tedee:error', err.message);
    }
  }

  /**
   * Get refresh type.
   *
   * @returns {string}
   */
  refreshType() {
    const currentMinute = new Date().getMinutes();

    if (currentMinute === this.lastRefreshMinute) {
      return 'sync';
    }

    if (currentMinute !== this.lastRefreshMinute) {
      this.lastRefreshMinute = currentMinute;

      if (currentMinute % fullUpdateMinute === 0) {
        return 'full';
      }
    }

    return 'sync';
  }

  /*
  |-----------------------------------------------------------------------------
  | Flow cards
  |-----------------------------------------------------------------------------
  */

  /**
   * Register condition flow cards.
   *
   * @returns {void}
   * @private
   */
  _registerConditionFlowCards() {
    // ... and is charging ...
    this.homey.flow.getConditionCard('charging').registerRunListener(async (args) => {
      return args.device.getCapabilityValue('charging') === true;
    });

    // ... and is connected ...
    this.homey.flow.getConditionCard('connected').registerRunListener(async (args) => {
      return args.device.getCapabilityValue('connected') === true;
    });

    // ... and update is available ...
    this.homey.flow.getConditionCard('update_available').registerRunListener(async (args) => {
      return args.device.getCapabilityValue('update_available') === true;
    });
  }

  /**
   * Register action flow cards.
   *
   * @returns {void}
   * @private
   */
  _registerActionFlowCards() {
    // ... then pull the spring ...
    this.homey.flow.getActionCard('open').registerRunListener(async (args) => {
      return args.device.open();
    });
  }

}

module.exports = Tedee;
