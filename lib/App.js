'use strict';

const { OAuth2App } = require('homey-oauth2app');
const { Log } = require('homey-log');
const Client = require('./Client');
const { blank, filled } = require('./Utils');

class App extends OAuth2App {

  static OAUTH2_CLIENT = Client;

  static SYNC_INTERVAL_LOCKS = 10;
  static SYNC_INTERVAL_FULL = 180;

  // Application initialized
  async onOAuth2Init() {
    // Sentry logging
    this.homeyLog = new Log({ homey: this.homey });

    // Register flow cards
    this.registerFlowCards();

    this.log('Initialized');
  }

  // Register timers
  registerTimers(driverId) {
    if (!this.syncDevicesTimer) {
      this.log('Register devices timer');
      this.syncDevicesTimer = this.homey.setInterval(this.syncDevices.bind(this), (1000 * this.constructor.SYNC_INTERVAL_FULL));
    }

    if (driverId !== 'lock') return;
    if (this.syncLockTimer) return;

    // Wait 3 seconds and register the locks timer so the timers are not run at the same time
    this.wait(3).then(() => {
      this.log('Register locks timer');
      this.syncLockTimer = this.homey.setInterval(this.syncLocks.bind(this), (1000 * this.constructor.SYNC_INTERVAL_LOCKS));
    });
  }

  /*
  | Synchronization functions
  */

  // Synchronize devices
  async syncDevices() {
    try {
      /** @type Client */
      const client = await this.getFirstSavedOAuth2Client();

      if (blank(client)) return;

      const result = await client.getAllDevicesDetails();

      if (blank(result)) return;

      // Update bridges
      if (filled(result.bridges)) {
        await this.updateDevices('bridge', result.bridges);
      }

      // Update keypads
      if (filled(result.keypads)) {
        await this.updateDevices('keypad', result.keypads);
      }

      // Update locks
      if (filled(result.locks)) {
        await this.updateDevices('lock', result.locks);
      }
    } catch (err) {
      if (err.message !== 'No OAuth2 Client Found') {
        this.error(err.message);
      }
    }
  }

  // Synchronize locks
  async syncLocks() {
    try {
      /** @type Client */
      const client = await this.getFirstSavedOAuth2Client();

      if (blank(client)) return;

      const result = await client.getSyncLocks();

      if (blank(result)) return;

      await this.updateDevices('lock', result);
    } catch (err) {
      if (err.message !== 'No OAuth2 Client Found') {
        this.error(err.message);
      }
    }
  }

  /*
  | Update functions
  */

  // Update devices for given driver
  async updateDevices(driverName, data) {
    if (blank(driverName)) return;
    if (blank(data)) return;

    const driver = this.homey.drivers.getDriver(driverName);
    const devices = driver.getDevices();

    for (const deviceData of data) {
      const device = devices.find((device) => String(device.getSetting('tedee_id')) === String(deviceData.id));

      if (!device) return;

      if (driverName === 'lock' && device.monitor.isRunning()) {
        continue;
      }

      await device.handleSyncData(deviceData).catch(this.error);
    }
  }

  /*
  | Support functions
  */

  // Register flow cards
  registerFlowCards() {
    // Action flow cards
    // ... then pull the spring ...
    this.homey.flow.getActionCard('open').registerRunListener(async ({ device }) => {
      await device.open();
    });

    // Condition flow cards
    // ... and is connected ...
    this.homey.flow.getConditionCard('connected').registerRunListener(async ({ device }) => {
      return device.getCapabilityValue('connected') === true;
    });

    // ... and is charging ...
    this.homey.flow.getConditionCard('charging').registerRunListener(async ({ device }) => {
      return device.getCapabilityValue('charging') === true;
    });

    // ... and update is available ...
    this.homey.flow.getConditionCard('update_available').registerRunListener(async ({ device }) => {
      return device.getCapabilityValue('update_available') === true;
    });
  }

  // Wait for x seconds
  async wait(seconds) {
    return new Promise((resolve) => setTimeout(resolve, (1000 * seconds)));
  }

}

module.exports = App;
