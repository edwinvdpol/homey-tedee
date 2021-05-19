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
    devices.forEach(deviceData => {
      if (deviceData.id !== this.tedeeId) {
        return;
      }

      // Make sure the device is idle, else skip this update
      if (this.isBusy()) {
        this.log('Device is busy, skip update...');

        return;
      }

      // Set device settings
      this._setSettings(deviceData);

      // Set device availability
      this._setAvailability(deviceData);

      // Sync device specific data
      this._syncDevice(deviceData).catch(this.error);
    });
  }

  /*
  |-----------------------------------------------------------------------------
  | Device status functions
  |-----------------------------------------------------------------------------
  */

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

  /**
   * Set device settings.
   *
   * @param {object} deviceData
   * @returns {void}
   * @private
   */
  _setSettings(deviceData) {
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
    this.setSettings(settings).catch(this.error);
  }

  /*
  |-----------------------------------------------------------------------------
  | Capabilities
  |-----------------------------------------------------------------------------
  */

  /**
   * This method will be called when locked changed.
   *
   * @param {boolean} lock
   * @returns {*}
   */
  onCapabilityLocked(lock) {
    const currentValue = this.getCapabilityValue('locked');

    // Skip when old- and new values are the same
    if (currentValue === lock) {
      return;
    }

    this.setCapabilityValue('locked', lock).catch(this.error);

    // Lock the lock
    if (lock) {
      return this.lock();
    }

    // Unlock the lock
    return this.unlock();
  }

  /**
   * This method will be called when open changed.
   *
   * @param {boolean} open
   * @returns {*}
   */
  onCapabilityOpen(open) {
    const currentValue = this.getCapabilityValue('open');

    // Skip when old- and new values are the same
    if (currentValue === open) {
      return;
    }

    this.setCapabilityValue('open', open).catch(this.error);

    // Open lock
    if (open) {
      return this.open();
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

}

module.exports = Device;
