'use strict';

const {OAuth2Device} = require('homey-oauth2app');
const {LockState} = require('/lib/Enums');

class Device extends OAuth2Device {

  /*
  |-----------------------------------------------------------------------------
  | Device overrides
  |-----------------------------------------------------------------------------
  */

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

  /*
  |-----------------------------------------------------------------------------
  | Device events
  |-----------------------------------------------------------------------------
  */

  /**
   * Full device update.
   *
   * @async
   * @returns {Promise<void>}
   */
  async onFull() {
    this.log(`Full update ${this.driver.id}...`);

    // Check if device is busy
    if (await this.isBusy()) {
      this.log('Device is busy, skipping full update...');

      return;
    }

    let deviceData = await this.oAuth2Client.getDevice(this.driver.id, this.tedeeId);

    // Set device data
    await this.setDeviceData(deviceData);
  }

  /**
   * Sync device.
   *
   * @async
   * @returns {Promise<void>}
   */
  async onSync() {
    this.log(`Syncing ${this.driver.id}...`);

    // Check if device is busy
    if (await this.isBusy()) {
      this.log('Device is busy, skipping sync...');

      return;
    }

    let deviceData = await this.oAuth2Client.getSyncLock(this.tedeeId);

    // Set device data
    await this.setDeviceData(deviceData);
  }

  /*
  |-----------------------------------------------------------------------------
  | Device update functions
  |-----------------------------------------------------------------------------
  */

  /**
   * Set device data.
   *
   * @async
   * @param {object} deviceData
   * @returns {Promise<void>}
   */
  async setDeviceData(deviceData) {
    try {
      // Update device data
      await this._setSettings(deviceData);
      await this._setAvailability(deviceData);
      await this._setCapabilities(deviceData);
    } catch (err) {
      this.error('Set device data failed:', err.message);
    }
  }

  /**
   * Set device availability.
   *
   * @async
   * @param {object} deviceData
   * @returns {Promise<void>}
   */
  async _setAvailability(deviceData) {
    // Disconnected
    if (deviceData.hasOwnProperty('isConnected') && !deviceData.isConnected) {
      return this.setUnavailable(this.homey.__('state.disconnected'));
    }

    // Updating
    if (deviceData.hasOwnProperty('isUpdating') && deviceData.isUpdating) {
      return this.setUnavailable(this.homey.__('state.updating'));
    }

    // Return when `lockProperties` is not found in device data
    if (!deviceData.hasOwnProperty('lockProperties') || deviceData.lockProperties === null) {
      // Set available if currently not available
      if (!this.getAvailable()) {
         await this.setAvailable();
      }

      return;
    }

    // Current state
    const state = deviceData.lockProperties.state;

    // Uncalibrated
    if (state === LockState.Uncalibrated) {
      return this.setUnavailable(this.homey.__('state.uncalibrated'));
    }

    // Calibrating
    if (state === LockState.Calibrating) {
      return this.setUnavailable(this.homey.__('state.calibrating'));
    }

    // Unknown
    if (state === LockState.Unknown) {
      return this.setUnavailable(this.homey.__('state.unknown'));
    }

    // Updating
    if (state === LockState.Updating) {
      return this.setUnavailable(this.homey.__('state.updating'));
    }

    // Set available if currently not available
    if (!this.getAvailable()) {
      await this.setAvailable();
    }
  }

  /**
   * Set device capabilities.
   *
   * @async
   * @param {object} deviceData
   * @returns {Promise<void>}
   * @private
   */
  async _setCapabilities(deviceData) {
    // Connected capability
    if (deviceData.hasOwnProperty('isConnected')) {
      await this.setCapabilityValue('connected', deviceData.isConnected);
    }

    // Update available capability
    if (deviceData.hasOwnProperty('softwareVersions')) {
      await this.setCapabilityValue('update_available', deviceData.softwareVersions[0].updateAvailable);
    }

    // Return when `lockProperties` is not found in device data
    if (!deviceData.hasOwnProperty('lockProperties') || deviceData.lockProperties === null) {
      return;
    }

    const lockProperties = deviceData.lockProperties;

    // Measure battery capability
    if (lockProperties.hasOwnProperty('batteryLevel')) {
      await this.setCapabilityValue('measure_battery', lockProperties.batteryLevel);
    }

    // Charging capability
    if (lockProperties.hasOwnProperty('isCharging')) {
      await this.setCapabilityValue('charging', lockProperties.isCharging);
    }

    // Locked capability
    const state = lockProperties.state;

    // Start state monitor if needed
    if (await this._needsStateMonitor(state) && await this.isIdle()) {
      return this._startStateMonitor();
    }

    // Locked state
    let locked = state === LockState.Locked;

    await this.setCapabilityValue('locked', locked);
  }

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

    // Set device settings
    if (deviceData.hasOwnProperty('deviceSettings')) {
      settings.auto_lock_enabled = deviceData.deviceSettings.autoLockEnabled ? 'on' : 'off';
      settings.pull_spring_enabled = deviceData.deviceSettings.pullSpringEnabled ? 'on' : 'off';
    }

    // Update device settings
    await this.setSettings(settings);
  }

  /*
  |-----------------------------------------------------------------------------
  | Support functions
  |-----------------------------------------------------------------------------
  */

  /**
   * Register capability listeners.
   *
   * @async
   * @returns {Promise<void>}
   */
  async registerCapabilityListeners() {
    if (this.hasCapability('locked')) {
      this.registerCapabilityListener('locked', this.onCapabilityLocked.bind(this));
    }

    if (this.hasCapability('open')) {
      this.registerCapabilityListener('open', this.onCapabilityOpen.bind(this));
    }
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
   */
  async onCapabilityLocked(lock) {
    // Skip when old- and new values are the same
    if (lock === await this.getCapabilityValue('locked')) {
      return;
    }

    // Set locked capability
    await this.setCapabilityValue('locked', lock);

    if (lock) {
      // Lock the lock
      await this.lock();
    } else {
      // Unlock the lock
      await this.unlock();
    }

    return this.log(`Capability 'locked' is now '${lock}'`);
  }

  /**
   * This method will be called when open changed.
   *
   * @async
   * @param {boolean} open
   * @returns {Promise<*>}
   */
  async onCapabilityOpen(open) {
    // Skip when old- and new values are the same
    if (open === await this.getCapabilityValue('open')) {
      return;
    }

    this.log(`Capability 'open' is now '${open}'`);

    if (open) {
      await this.open();
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
    this.log(`Trigger '${trigger}' is triggered`);

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
  | Monitor functions
  |-----------------------------------------------------------------------------
  */

  /**
   * Stop operation monitor.
   *
   * @returns {Promise<void>}
   */
  async stopOperationMonitor() {
    if (this.operationMonitor) {
      this.operationMonitor = null;

      this.log('Operation monitor stopped');
    }
  }

  /**
   * Stop state monitor.
   *
   * @returns {Promise<void>}
   */
  async stopStateMonitor() {
    if (this.stateMonitor) {
      this.stateMonitor = null;

      this.log('State monitor stopped');
    }
  }

  /*
  |-----------------------------------------------------------------------------
  | Device state functions
  |-----------------------------------------------------------------------------
  */

  /**
   * Set device to busy.
   *
   * @returns {Promise<void>}
   */
  async setBusy() {
    if (await this.isBusy()) {
      return;
    }

    // Set to busy state
    this.idle = false;

    this.log('Device is now busy');
  }

  /**
   * Set device to idle.
   *
   * @returns {Promise<void>}
   */
  async setIdle() {
    if (await this.isIdle()) {
      return;
    }

    // Reset open capability
    await this.setCapabilityValue('open', false);

    // Reset tiggered flows
    this.flowsTriggered = {};

    // Reset monitors
    await this.stopOperationMonitor();
    await this.stopStateMonitor();

    // Set to idle state
    this.idle = true;

    this.log('Device is now idle');
  }

  /**
   * Return if device is busy.
   *
   * @returns {Promise<boolean>}
   */
  async isBusy() {
    return ! await this.isIdle();
  }

  /**
   * Return if device is idle.
   *
   * @returns {Promise<*|boolean>}
   */
  async isIdle() {
    return this.idle;
  }

}

module.exports = Device;
