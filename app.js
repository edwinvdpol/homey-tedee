'use strict';

const {OAuth2App} = require('homey-oauth2app');
const Client = require('./lib/Client');

const syncLocksInterval = 10 * 1000; // 10 seconds
const refreshDevicesInterval = 10 * 60 * 1000; // 10 minutes

class Tedee extends OAuth2App {

  static OAUTH2_CLIENT = Client;
  // static OAUTH2_DEBUG = true;

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
    this.log('Application initialized');

    // Reset timers
    this.refreshTimer = null;
    this.syncTimer = null;

    // Start timers if not already started
    this.homey.setInterval(this._startTimers.bind(this), 5000);

    // Register action- and condition flow cards
    await this._registerActionFlowCards();
    await this._registerConditionFlowCards();

    // Register app event listeners
    this.homey.on('cpuwarn', () => {
      this.log('-- CPU warning! --');
    }).on('memwarn', () => {
      this.log('-- Memory warning! --');
    }).on('unload', () => {
      // Stop timers
      this._stopTimers();

      this.log('-- Unloaded! _o/ --');
    });
  }

  /*
  |-----------------------------------------------------------------------------
  | Application actions
  |-----------------------------------------------------------------------------
  */

  /**
   * Refresh devices (full update).
   *
   * @async
   * @returns {Promise<void>}
   * @private
   */
  async _refreshDevices() {
    return this._updateDevices('refresh');
  }

  /**
   * Sync locks (delta update).
   *
   * @async
   * @returns {Promise<void>}
   * @private
   */
  async _syncLocks() {
    return this._updateDevices('sync');
  }

  /**
   * Update devices by action.
   *
   * @async
   * @param {string} action
   * @returns {Promise<void>}
   * @private
   */
  async _updateDevices(action) {
    try {
      // Verify action
      if (action !== 'refresh' && action !== 'sync') {
        return this.log(`Invalid action: ${action}`);
      }

      // Set oAuth client
      this.oAuth2Client = this.getFirstSavedOAuth2Client();

      let data;

      // Fetch requested data from tedee API
      if (action === 'refresh') {
        data = await this.oAuth2Client.getDevices();
      } else if (action === 'sync') {
        data = await this.oAuth2Client.getSyncLocks();
      }

      // Emit the sync devices event
      this.homey.emit('sync_devices', data);
    } catch (err) {
      await this._stopTimers(err.message);
    }
  }

  /*
  |-----------------------------------------------------------------------------
  | Timers actions
  |-----------------------------------------------------------------------------
  */

  /**
   * Start timers.
   *
   * @async
   * @returns {Promise<void>}
   * @private
   */
  async _startTimers() {
    if (await this._timersAreRunning()) {
      return;
    }

    try {
      // Throws error if none is available, and stop timer
      this.oAuth2Client = this.getFirstSavedOAuth2Client();

      this.log('Starting timers');

      // Start short interval for delta updates
      this.syncTimer = this.homey.setInterval(this._syncLocks.bind(this), syncLocksInterval);

      // Start longer interval for full updates
      this.refreshTimer = this.homey.setInterval(this._refreshDevices.bind(this), refreshDevicesInterval);
    } catch (err) {
      await this._stopTimers(err.message);
    }
  }

  /**
   * Stop timers.
   *
   * @async
   * @param {string|null} reason
   * @returns {Promise<void>}
   * @private
   */
  async _stopTimers(reason = null) {
    if (! await this._timersAreRunning()) {
      return;
    }

    // Logging
    if (reason == null) {
      this.log('Stopping timers');
    } else {
      this.log(`Stopping timers: ${reason}`);
    }

    // Stop short interval for delta updates
    if (this.syncTimer != null) {
      this.homey.clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    // Stop longer interval for full updates
    if (this.refreshTimer != null) {
      this.homey.clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Return if timers are running.
   *
   * @async
   * @returns {Promise<boolean>}
   * @private
   */
  async _timersAreRunning() {
    return this.syncTimer != null && this.refreshTimer != null;
  }

  /**
   * Verify timers.
   *
   * @async
   * @returns {Promise<void>}
   */
  async verifyTimers() {
    try {
      const drivers = this.homey.drivers.getDrivers();
      let devices = 0;

      if (Object.keys(drivers).length === 0) {
        return await this._stopTimers();
      }

      for (const driverId in drivers) {
        if (!drivers.hasOwnProperty(driverId)) {
          return;
        }

        // Get driver
        const driver = this.homey.drivers.getDriver(driverId);

        // Add number of devices
        devices += Object.keys(driver.getDevices()).length;
      }

      if (devices === 0) {
        await this._stopTimers('No devices found');
      } else {
        await this._startTimers();
      }
    } catch (err) {
      this.error('Verify timers', err);
    }
  }

  /*
  |-----------------------------------------------------------------------------
  | Flow cards
  |-----------------------------------------------------------------------------
  */

  /**
   * Register action flow cards.
   *
   * @async
   * @returns {Promise<void>}
   * @private
   */
  async _registerActionFlowCards() {
    // Register action flow card for pulling the spring
    this.homey.flow.getActionCard('open')
        .registerRunListener(async (args) => args.device.open());
  }

  /**
   * Register condition flow cards.
   *
   * @async
   * @returns {Promise<void>}
   * @private
   */
  async _registerConditionFlowCards() {
    // Register condition flow card for charging
    this.homey.flow.getConditionCard('is_charging')
        .registerRunListener(async (args) => {
          return args.device.getCapabilityValue('charging');
        });

    // Register condition flow card for connected
    this.homey.flow.getConditionCard('is_connected')
        .registerRunListener(async (args) => {
          return args.device.getCapabilityValue('connected');
        });

    // Register condition flow card for update available
    this.homey.flow.getConditionCard('is_update_available')
        .registerRunListener(async (args) => {
          return args.device.getCapabilityValue('update_available');
        });
  }

}

module.exports = Tedee;
