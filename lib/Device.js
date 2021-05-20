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

    // Register capability listeners
    await this._registerCapabilityListeners();

    // Register event listeners
    this.on('sync', this.onSync.bind(this));

    // Emit sync event
    this.emit('sync');
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

  /*
  |-----------------------------------------------------------------------------
  | Device events
  |-----------------------------------------------------------------------------
  */

  /**
   * Sync device event.
   *
   * @async
   * @returns {Promise<void>}
   */
  async onSync() {
    this.log(`Syncing ${this.driver.id}...`);

    let deviceData = await this.oAuth2Client.getDevice(this.driver.id, this.tedeeId);

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
    // Make sure the device is idle
    if (this.isBusy()) {
      return this.log('Device is busy, skip update...');
    }

    try {
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
    if (await this._needsStateMonitor(state) && this.isIdle()) {
      return this._startStateMonitor();
    }

    // Locked state
    let locked = state === LockState.Locked;

    // State is semi locked (show as unlocked for safety reasons)
    if (state === LockState.SemiLocked) {
      locked = false;
    }

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

    // Set auto lock
    if (deviceData.hasOwnProperty('deviceSettings')) {
      settings.auto_lock_enabled = deviceData.deviceSettings.autoLockEnabled ? 'on' : 'off';
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
   * @private
   */
  async _registerCapabilityListeners() {
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
      this.error('Locking failed:', err.message);

      // Reset device state
      await this.resetState();

      throw new Error(this.homey.__('error.unknown'));
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
      // Reset device state
      await this.resetState();

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
