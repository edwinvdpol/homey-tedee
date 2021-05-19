'use strict';

const {OAuth2Device} = require('homey-oauth2app');

class Device extends OAuth2Device {

  /*
  |-----------------------------------------------------------------------------
  | Device events
  |-----------------------------------------------------------------------------
  */

  /**
   * Device initialized.
   *
   * @async
   * @returns {Promise<void>}
   */
  async onOAuth2Init() {
    this.log('Device initialized');

    // Set tedee ID
    this.tedeeId = Number(this.getSetting('tedee_id'));

    // Reset device state and timers
    await this.resetState();

    // Initialize and sync child device
    await this._onOAuth2Init();

    // Register event listeners
    this.homey.on('sync_devices', this.onSyncDevices.bind(this));
  }

  /**
   * Device saved.
   *
   * @async
   * @returns {Promise<void>}
   */
  async onOAuth2Saved() {
    this.log('Device saved');
  }

  /**
   * Device uninitialized.
   *
   * @async
   * @returns {Promise<void>}
   */
  async onOAuth2Uninit() {
    this.log('Device uninitialized');
  }

  /**
   * Device deleted.
   *
   * @async
   * @returns {Promise<*>}
   */
  async onOAuth2Deleted() {
    this.log('Device deleted');

    // Verify timers
    await this.homey.app.verifyTimers();
  }

  /**
   * Sync devices.
   *
   * @async
   * @param {Device[]} devices
   * @returns {Promise<void>}
   */
  async onSyncDevices(devices) {
    for (const deviceData of devices) {
      if (deviceData.id !== this.tedeeId) {
        continue;
      }

      // Make sure the device is idle, else skip this update
      if (this.isBusy()) {
        this.log('Device is busy, skip update...');

        continue;
      }

      try {
        // Set device settings
        await this._setSettings(deviceData);

        // Set device availability
        await this._setAvailability(deviceData);

        // Sync device data
        await this._syncDevice(deviceData);
      } catch (err) {
        this.error('Sync device failed', err);
      }
    }
  }

  /*
  |-----------------------------------------------------------------------------
  | Support functions
  |-----------------------------------------------------------------------------
  */

  /**
   * Set device settings.
   *
   * @async
   * @param {object} deviceData
   * @returns {Promise<void>}
   * @private
   */
  async _setSettings(deviceData) {
    // New settings object
    let settings = {}

    // Set connected status
    if (deviceData.hasOwnProperty('isConnected')) {
      settings.status = deviceData.isConnected ? this.homey.__('connected') : this.homey.__('disconnected');
    }

    // Set firmware version
    if (deviceData.hasOwnProperty('softwareVersions')) {
      settings.firmware = String(deviceData.softwareVersions[0].version);
    }

    // Set auto lock
    if (deviceData.hasOwnProperty('deviceSettings')) {
      settings.auto_lock_enabled = deviceData.deviceSettings.autoLockEnabled ? 'on' : 'off';
    }

    // Update device settings
    await this.setSettings(settings);
  }

  /*
  |-----------------------------------------------------------------------------
  | Capabilities
  |-----------------------------------------------------------------------------
  */

  /**
   * This method will be called when locked changed.
   *
   * @async
   * @param {boolean} lock
   * @returns {Promise<*>}
   * @throws {Error}
   */
  async onCapabilityLocked(lock) {
    try {
      // Skip when old- and new values are the same
      if (lock === await this.getCapabilityValue('locked')) {
        return;
      }

      // Set locked capability
      await this.setCapabilityValue('locked', lock);

      // Lock the lock
      if (lock) {
        return await this.lock();
      }

      // Unlock the lock
      return await this.unlock();
    } catch (err) {
      this.error('onCapabilityLocked', err);

      throw err;
    }
  }

  /**
   * This method will be called when open changed.
   *
   * @async
   * @param {boolean} open
   * @returns {Promise<*>}
   * @throws {Error}
   */
  async onCapabilityOpen(open) {
    try {
      // Skip when old- and new values are the same
      if (open === await this.getCapabilityValue('open')) {
        return;
      }

      // Set open capability
      await this.setCapabilityValue('open', open);

      // Open lock
      if (open) {
        return await this.open();
      }
    } catch (err) {
      this.error('onCapabilityOpen', err);

      throw err;
    }
  }

  /*
  |-----------------------------------------------------------------------------
  | Trigger helpers
  |-----------------------------------------------------------------------------
  */

  /**
   * Add trigger to triggered list.
   *
   * @param {string} trigger
   */
  addTriggered(trigger) {
    this.flowsTriggered[trigger] = true;
  }

  /**
   * Return if given flow is already triggered.
   *
   * @param {string} trigger
   * @returns {boolean}
   */
  alreadyTriggered(trigger) {
    return this.flowsTriggered.hasOwnProperty(trigger);
  }

  /*
  |-----------------------------------------------------------------------------
  | Device state
  |-----------------------------------------------------------------------------
  */

  /**
   * Reset device state and timers.
   *
   * @async
   * @returns {Promise<void>}
   */
  async resetState() {
    // Reset open capability
    if (this.hasCapability('open')) {
      await this.setCapabilityValue('open', false);
    }

    // Cleanup triggered flows and monitors
    await this.cleanup();

    // Set device to idle
    this.setIdle();
  }

  /**
   * Set device to busy.
   */
  setBusy() {
    if (this.isBusy()) {
      return;
    }

    this.idle = false;

    this.log('Device is now busy');
  }

  /**
   * Set device to idle.
   */
  setIdle() {
    if (this.isIdle()) {
      return;
    }

    this.idle = true;

    this.log('Device is now idle');
  }

  /**
   * Return if device is busy.
   *
   * @returns {boolean}
   */
  isBusy() {
    return ! this.isIdle();
  }

  /**
   * Return if device is idle.
   *
   * @returns {boolean}
   */
  isIdle() {
    return this.idle;
  }

  /**
   * Cleanup triggered flows and monitors.
   *
   * @async
   * @returns {Promise<void>}
   */
  async cleanup() {
    this.log('Cleanup triggers and timers');

    this.flowsTriggered = {};

    if (this.stateMonitor) {
      this.homey.clearInterval(this.stateMonitor);

      this.log('State monitor stopped');
    }

    if (this.operationMonitor) {
      this.homey.clearInterval(this.operationMonitor);

      this.log('Operation monitor stopped');
    }

    this.stateMonitor = null;
    this.operationMonitor = null;
  }

}

module.exports = Device;
