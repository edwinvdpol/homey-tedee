'use strict';

const {OAuth2App} = require('homey-oauth2app');
const Client = require('./Client');
const {Log} = require('homey-log');

class Tedee extends OAuth2App {

  static OAUTH2_CLIENT = Client;

  /*
  |-----------------------------------------------------------------------------
  | Application events
  |-----------------------------------------------------------------------------
  */

  // Application initialized
  async onOAuth2Init() {
    // Sentry logging
    this.homeyLog = new Log({ homey: this.homey });

    // Reset state
    await this.resetState();

    // Register flow cards and event listeners
    await this.registerActionFlowCards();
    await this.registerConditionFlowCards();
    await this.registerEventListeners();
  }

  /*
  |-----------------------------------------------------------------------------
  | Application actions
  |-----------------------------------------------------------------------------
  */

  // Refresh devices
  async refreshDevices() {
    if (await this.hasDevices()) {
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
  }

  // Start refresh timer
  async startTimer() {
    if (!this.refreshTimer) {
      this.refreshTimer = this.homey.setInterval(this.refreshDevices.bind(this), this.refreshInterval);

      this.log('Timer started');
    }
  }

  // Stop refresh timer
  async stopTimer(force = false) {
    if (this.refreshTimer) {
      // Check devices
      if (await this.hasDevices() && !force) {
        return;
      }

      this.homey.clearTimeout(this.refreshTimer);

      // Reset state
      await this.resetState();

      this.log('Timer stopped');
    }
  }

  /*
  |-----------------------------------------------------------------------------
  | Register flow cards and event listeners
  |-----------------------------------------------------------------------------
  */

  // Register condition flow cards
  async registerConditionFlowCards() {
    // ... and is charging ...
    this.homey.flow.getConditionCard('charging').registerRunListener(async ({ device }) => {
      return device.getCapabilityValue('charging') === true;
    });

    // ... and is connected ...
    this.homey.flow.getConditionCard('connected').registerRunListener(async ({ device }) => {
      return device.getCapabilityValue('connected') === true;
    });

    // ... and update is available ...
    this.homey.flow.getConditionCard('update_available').registerRunListener(async ({ device }) => {
      return device.getCapabilityValue('update_available') === true;
    });
  }

  // Register action flow cards
  async registerActionFlowCards() {
    // ... then pull the spring ...
    this.homey.flow.getActionCard('open').registerRunListener(async ({ device }) => {
      await device.pullSpring();
    });
  }

  // Register event listeners
  async registerEventListeners() {
    this.homey.on('cpuwarn', () => {
      this.log('-- CPU warning! --');
    }).on('memwarn', () => {
      this.log('-- Memory warning! --');
    }).on('unload', () => {
      this.stopTimer(true).catch(this.error);

      this.log('-- Unloaded! --');
    });
  }

  /*
  |-----------------------------------------------------------------------------
  | Helpers
  |-----------------------------------------------------------------------------
  */

  // Returns whether app has devices
  async hasDevices() {
    try {
      const sessions = this.getSavedOAuth2Sessions();

      // Check if there are sessions available
      if (Object.keys(sessions).length === 0) {
        return false;
      }

      const sessionId = Object.keys(sessions)[0];
      const configId = sessions[sessionId]['configId'];
      const devices = await this.getOAuth2Devices({sessionId, configId})

      return Object.keys(devices).length > 0;
    } catch (err) {
      return false;
    }
  }

  // Get refresh type
  refreshType() {
    const currentMinute = new Date().getMinutes();

    if (currentMinute === this.lastRefreshMinute) {
      return 'sync';
    }

    if (currentMinute !== this.lastRefreshMinute) {
      this.lastRefreshMinute = currentMinute;

      // Full update every 5 minutes
      if (currentMinute % 5 === 0) {
        return 'full';
      }
    }

    return 'sync';
  }

  // Reset state
  async resetState() {
    this.log('Reset state');

    this.lastRefreshMinute = null;
    this.client = null;
    this.refreshInterval = 10 * 1000; // 10 seconds
    this.refreshTimer = null;
  }

}

module.exports = Tedee;
