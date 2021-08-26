'use strict';

const {OAuth2Device} = require('homey-oauth2app');

class Device extends OAuth2Device {

  /*
  |-----------------------------------------------------------------------------
  | Device events
  |-----------------------------------------------------------------------------
  */

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
   * Full device update.
   *
   * @async
   * @returns {Promise<void>}
   */
  async onFull() {
    this.log(`----- Full update ${this.driver.id} -----`);

    // Check if device is busy
    if (!this.idle) {
      this.log(`${this.name} is busy, skipping...`);

      return;
    }

    let deviceData = await this.oAuth2Client.getDevice(this.driver.id, this.tedeeId);

    // Set device data
    await this.setDeviceData(deviceData);

    this.log(`${this.name} ${this.tedeeId} updated successfully!`);
  }

  /**
   * Sync device.
   *
   * @async
   * @returns {Promise<void>}
   */
  async onSync() {
    this.log(`----- Syncing ${this.driver.id} -----`);

    // Check if device is busy
    if (!this.idle) {
      this.log(`${this.name} is busy, skipping...`);

      return;
    }

    let deviceData = await this.oAuth2Client.getSyncLock(this.tedeeId);

    // Set device data
    await this.setDeviceData(deviceData);

    this.log(`${this.name} ${this.tedeeId} synchronization successfully!`);
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
      await this._setStore(deviceData);
      await this._setSettings(deviceData);
      await this.setCapabilities(deviceData);
      await this.setAvailability(deviceData);
    } catch (err) {
      this.error('Update failed:', err);
      await this.setUnavailable(`Update failed: ${err.message}`);
    }
  }

  /**
   * Set device availability.
   *
   * @async
   * @param {object} deviceData
   * @returns {Promise<void>}
   */
  async setAvailability(deviceData) {
    // Disconnected
    if (deviceData.hasOwnProperty('isConnected') && !deviceData.isConnected) {
      return this.setUnavailable(this.homey.__('state.disconnected'));
    }

    // Updating
    if (deviceData.hasOwnProperty('isUpdating') && deviceData.isUpdating) {
      return this.setUnavailable(this.homey.__('state.updating'));
    }
  }

  /**
   * Set device capabilities.
   *
   * @async
   * @param {object} deviceData
   * @returns {Promise<void>}
   */
  async setCapabilities(deviceData) {
    // Connected capability
    if (deviceData.hasOwnProperty('isConnected')) {
      this.setCapabilityValue('connected', deviceData.isConnected).catch(this.error);
    }

    // Update available capability
    if (deviceData.hasOwnProperty('softwareVersions')) {
      this.setCapabilityValue('update_available', deviceData.softwareVersions[0].updateAvailable).catch(this.error);
    }
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
      settings.firmware_version = String(deviceData.softwareVersions[0].version);
    }

    // Set device settings
    if (deviceData.hasOwnProperty('deviceSettings')) {
      settings.auto_lock_enabled = deviceData.deviceSettings.autoLockEnabled ? 'on' : 'off';
      settings.button_lock_enabled = deviceData.deviceSettings.buttonLockEnabled ? 'on' : 'off';
      settings.button_unlock_enabled = deviceData.deviceSettings.buttonUnlockEnabled ? 'on' : 'off';
    }

    // Update device settings
    await this.setSettings(settings);
  }

  /**
   * Set device store values.
   *
   * @async
   * @param {object} deviceData
   * @returns {Promise<void>}
   * @private
   */
  async _setStore(deviceData) {
    if (!deviceData.hasOwnProperty('deviceSettings')) {
      return;
    }

    const pullSpringEnabled = deviceData.deviceSettings.pullSpringEnabled ? 'on' : 'off';

    // Set store values
    await this.setStoreValue('pull_spring_enabled', pullSpringEnabled);

    // Remove or add "open" capability
    await this._setOpenCapability(pullSpringEnabled);
  }

  /*
  |-----------------------------------------------------------------------------
  | Support functions
  |-----------------------------------------------------------------------------
  */

  /**
   * Remove or add "open" capability.
   *
   * @async
   * @param {string} pullSpringEnabled
   * @returns {Promise<void>}
   * @private
   */
  async _setOpenCapability(pullSpringEnabled) {
    // Remove capability
    if (this.hasCapability('open') && pullSpringEnabled === 'off') {
      this.log('Pull spring disabled, removing "open" capability');

      return this.removeCapability('open');
    }

    // Add capability
    if (!this.hasCapability('open') && pullSpringEnabled === 'on') {
      this.log('Pull spring enabled, adding "open" capability');

      return this.addCapability('open');
    }
  }

  /**
   * Log error, set device state to idle and throw error.
   *
   * @async
   * @param {string} message
   * @param {string} locale
   * @returns {Promise<void>}
   * @throws {Error}
   */
  async errorIdle(message, locale) {
    this.error(message);

    // Set device to idle state
    await this.resetState();

    throw new Error(this.homey.__(locale));
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
    if (this.idle) {
      this.log(`${this.name} is now busy`);
    }

    // Set to busy state
    this.idle = false;
  }

  /**
   * Set device to idle.
   *
   * @returns {Promise<void>}
   */
  async resetState() {
    if (!this.idle) {
      this.log(`${this.name} is now idle`);
    }

    // Reset monitors
    await this.stopOperationMonitor();
    await this.stopStateMonitor();

    // Reset properties
    this.idle = true;
    this.flowsTriggered = {};

    // Reset open capability
    if (this.hasCapability('open')) {
      this.setCapabilityValue('open', false).catch(this.error);
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

}

module.exports = Device;
