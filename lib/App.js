'use strict';

const {OAuth2App} = require('homey-oauth2app');
const Client = require('./Client');
const Flow = require('./Flow');
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

    // Register flow cards
    await new Flow({ homey: this.homey }).register();

    // Register event listeners
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

  // Register event listeners
  async registerEventListeners() {
    this.homey.on('unload', () => {
      this.stopTimer(true).catch(this.error);
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
