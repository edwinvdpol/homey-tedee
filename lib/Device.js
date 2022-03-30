'use strict';

const {OAuth2Device} = require('homey-oauth2app');
const {OperationType, LockState} = require('./Enums');

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
   * @returns {Promise<void>}
   */
  async onOAuth2Added() {
    this.log('Device added (oAuth2)');
  }

  /**
   * Device deleted.
   *
   * @async
   * @returns {Promise<void>}
   */
  async onOAuth2Deleted() {
    this.log('Device deleted (oAuth2)');

    this.cleanup();
  }

  /**
   * Device initialized.
   *
   * @async
   * @returns {Promise<void>}
   */
  async onOAuth2Init() {
    this.log('Device initialized (oAuth2)');

    this.idle = true;
    this.tedeeId = Number(this.getSetting('tedee_id'));

    // Register listeners
    await this.registerCapabilityListeners();
    await this.registerEventListeners();

    // Set device to idle state
    await this.resetState(true);

    // Start refresh timer
    this.homey.app.startTimer();
  }

  /**
   * Device uninitialized.
   *
   * @async
   * @returns {Promise<void>}
   */
  async onOAuth2Uninit() {
    this.log('Device uninitialized (oAuth2)');

    this.cleanup();
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
   * @param {object} data
   * @returns {Promise<void>}
   */
  async setDeviceData(data) {
    if (data.id !== this.tedeeId) {
      return;
    }

    try {
      await this._setStore(data);
      await this._setSettings(data);
      await this.setCapabilities(data);
      await this.setAvailability(data);
    } catch (err) {
      this.error('Update failed:', err);
      await this.setUnavailable(err.message);
    }
  }

  /**
   * Set device availability.
   *
   * @async
   * @param {object} data
   * @returns {Promise<void>}
   */
  async setAvailability(data) {
    // Disconnected
    if (data.hasOwnProperty('isConnected') && !data.isConnected) {
      return this.setUnavailable(this.homey.__('state.disconnected'));
    }

    // Updating
    if (data.hasOwnProperty('isUpdating') && data.isUpdating) {
      return this.setUnavailable(this.homey.__('state.updating'));
    }
  }

  /**
   * Set device capabilities.
   *
   * @async
   * @param {object} data
   * @returns {Promise<void>}
   */
  async setCapabilities(data) {
    // Connected capability
    if (this.hasCapability('connected') && data.hasOwnProperty('isConnected')) {
      this.setCapabilityValue('connected', data.isConnected).catch(this.error);
    }

    // Update available capability
    if (this.hasCapability('update_available') && data.hasOwnProperty('softwareVersions')) {
      if (data.softwareVersions[0]) {
        this.setCapabilityValue('update_available', data.softwareVersions[0].updateAvailable).catch(this.error);
      }
    }
  }

  /**
   * Remove or add "open" capability.
   *
   * @async
   * @param {string} pullSpringEnabled
   * @returns {Promise<void>}
   * @private
   */
  async _toggleOpenCapability(pullSpringEnabled) {
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
   * Set device settings.
   *
   * @async
   * @param {object} data
   * @returns {Promise<void>}
   * @private
   */
  async _setSettings(data) {
    // New settings object
    let settings = {}

    // Set connected status
    if (data.hasOwnProperty('isConnected')) {
      settings.status = data.isConnected
          ? this.homey.__('connected')
          : this.homey.__('disconnected');
    }

    // Set firmware version
    if (data.hasOwnProperty('softwareVersions')) {
      settings.firmware_version = String(data.softwareVersions[0].version);
    }

    // Set device settings
    if (data.hasOwnProperty('deviceSettings')) {
      settings.auto_lock_enabled = data.deviceSettings.autoLockEnabled ? 'on' : 'off';
      settings.button_lock_enabled = data.deviceSettings.buttonLockEnabled ? 'on' : 'off';
      settings.button_unlock_enabled = data.deviceSettings.buttonUnlockEnabled ? 'on' : 'off';
    }

    // Update device settings
    await this.setSettings(settings);
  }

  /**
   * Set device store values.
   *
   * @async
   * @param {object} data
   * @returns {Promise<void>}
   * @private
   */
  async _setStore(data) {
    if (!data.hasOwnProperty('deviceSettings')) {
      return;
    }

    if (!data.deviceSettings.hasOwnProperty('pullSpringEnabled')) {
      return;
    }

    const pullSpringEnabled = data.deviceSettings.pullSpringEnabled ? 'on' : 'off';

    // Set store values
    await this.setStoreValue('pull_spring_enabled', pullSpringEnabled);

    // Remove or add "open" capability
    await this._toggleOpenCapability(pullSpringEnabled);
  }

  /*
  |-----------------------------------------------------------------------------
  | Support functions
  |-----------------------------------------------------------------------------
  */

  /**
   * Cleanup device data / listeners.
   */
  cleanup() {
    this.log('Cleanup device data');

    // Remove event listeners for device
    this.homey.removeListener('tedee:error', this.onError);
    this.homey.removeListener('tedee:sync', this.onSync);
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

  /**
   * Register event listeners.
   *
   * @async
   * @returns {Promise<void>}
   */
  async registerEventListeners() {
    this.onSync = this.setDeviceData.bind(this);
    this.onError = this.setUnavailable.bind(this);

    this.homey.on('tedee:error', this.onError);
    this.homey.on('tedee:sync', this.onSync);
  }

  /**
   * Set device to idle.
   *
   * @param {boolean} refresh
   * @returns {Promise<void>}
   */
  async resetState(refresh = false) {
    if (!this.idle) {
      this.log(`${this.driver.id} is now idle`);
    }

    if (this.monitor) {
      this.log('Monitor stopped');
    }

    // Reset properties
    this.flowsTriggered = {};
    this.idle = true;
    this.monitor = false;
    this.numberOfTries = 0;
    this.operationId = false;

    // Reset open capability
    if (this.hasCapability('open')) {
      this.setCapabilityValue('open', false).catch(this.error);
    }

    // Refresh device
    if (refresh) {
      await this.oAuth2Client.syncDevice(this.driver.id, this.tedeeId);
    }
  }

  /*
  |-----------------------------------------------------------------------------
  | Monitor functions
  |-----------------------------------------------------------------------------
  */

  /**
   * Start the monitor.
   *
   * @async
   * @returns {Promise<void>}
   * @throws {Error}
   */
  async startMonitor() {
    this.idle = false;
    this.monitor = this.operationId ? 'operation' : 'state';

    this.log(`Starting ${this.monitor} monitor`);

    await (async () => {
      while (this.monitor) {
        await new Promise(resolve => setTimeout(resolve, 900));

        // Operation monitor
        if (this.monitor === 'operation') {
          await this.handleOperationMonitor();
        }

        let monitor = this.operationId ? 'operation' : 'state';

        if (monitor !== this.monitor) {
          this.monitor = monitor;

          this.log(`Switched to ${monitor} monitor`);
        }

        // State monitor
        if (this.monitor === 'state') {
          let state = await this.handleStateMonitor();

          // Check if monitor is still needed
          if (!this.needsMonitor(state)) {
            await this.resetState(true);
          }
        }
      }
    })();
  }

  /**
   * Handle state monitor.
   *
   * @async
   * @returns {Promise<void>}
   */
  async handleOperationMonitor() {
    const operation = await this.oAuth2Client.getOperation(this.operationId);

    // Increment number of tries
    this.numberOfTries++;

    // Log current state
    this.log(`Operation status is '${operation.status}' (${this.numberOfTries})`);

    // Stop operation monitor at 5 or more tries
    if (this.numberOfTries > 4) {
      await this.errorIdle('Stopping operation monitor, to many tries', 'error.response');
    }

    // Operation monitor is not completed (pending)
    if (operation.status === 'PENDING') {
      return;
    }

    // Successful
    if (operation.result === 0) {
      this.numberOfTries = 0;
      this.operationId = false;

      return;
    }

    // Error message
    let error;

    switch (operation.type) {
      case OperationType.Pull:
        error = 'Pull operation failed';
        break;
      case OperationType.Close:
        error = 'Close operation failed';
        break;
      case OperationType.Open:
        error = 'Open operation failed';
        break;
      default:
        error = 'Unknown operation type';
    }

    await this.errorIdle(error, 'error.response');
  }

  /**
   * Handle state monitor.
   *
   * @async
   * @returns {Promise<number>}
   */
  async handleStateMonitor() {
    const data = await this.oAuth2Client.getSyncLock(this.tedeeId);

    // Increment number of tries
    this.numberOfTries++;

    // Return unknown when properties not found
    if (!data.hasOwnProperty('lockProperties')) {
      return LockState.Unknown;
    }

    const state = data.lockProperties.state;

    // Log current state
    this.log(`Lock is ${this.getLockStateName(state)}`);

    // State is pulling or pulled
    if (state === LockState.Pulling || state === LockState.Pulled) {
      await this.driver.triggerOpened(this);
    }

    // Update device
    await this.setDeviceData(data);

    // Stop state monitor at 6 or more tries
    if (this.numberOfTries > 5) {
      await this.errorIdle('Stopping state monitor, to many tries', 'error.response');
    }

    return state;
  }

  /**
   * Verify if the monitor needs to be started or continue.
   *
   * @async
   * @param {number} stateId
   * @returns {boolean}
   */
  needsMonitor(stateId) {
    return this.getAvailable() &&
        (stateId === LockState.Locking ||
            stateId === LockState.Unlocking ||
            stateId === LockState.Pulled ||
            stateId === LockState.Pulling);
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
