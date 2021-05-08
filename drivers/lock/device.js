'use strict';

const Device = require('/lib/Device');
const {LockState, OperationTypes} = require('/lib/Enums');

class LockDevice extends Device {

  /*
  |-----------------------------------------------------------------------------
  | Lock events
  |-----------------------------------------------------------------------------
  */

  /**
   * Lock initialized.
   *
   * @async
   * @returns {Promise<undefined|void>}
   * @private
   */
  async _onOAuth2Init() {
    // Get lock data from tedee API
    const deviceData = await this.oAuth2Client.getLock(this.tedeeId);

    // Sync lock
    return this._syncDevice(deviceData);
  }

  /**
   * This method is called when the user updates the device's settings.
   *
   * @async
   * @param {object} oldSettings - The old settings object
   * @param {object} newSettings - The new settings object
   * @param {string[]} changedKeys - An array of keys changed since the previous version
   * @returns {Promise<string|void>} - Return a custom message that will be displayed
   */
  async onSettings({oldSettings, newSettings, changedKeys}) {
    let settings = {}

    // Auto lock enabled updated
    if (changedKeys.includes('auto_lock_enabled')) {
      this.log(`Auto lock enabled updated: ${newSettings.auto_lock_enabled}`);

      settings.autoLockEnabled = newSettings.auto_lock_enabled === 'on';
    }

    // Device settings need to be updated
    if (Object.keys(settings).length > 0) {
      await this.oAuth2Client.updateLockSettings(this.tedeeId, settings);
    }
  }

  /*
  |-----------------------------------------------------------------------------
  | Lock actions
  |-----------------------------------------------------------------------------
  */

  /**
   * Sync lock.
   *
   * @async
   * @param {object} deviceData
   * @returns {Promise<void>}
   * @private
   */
  async _syncDevice(deviceData) {
    // Connected capability
    if (deviceData.hasOwnProperty('isConnected')) {
      this.setCapabilityValue('connected', deviceData.isConnected).catch(this.error);
    }

    // Update available capability (only full update)
    if (deviceData.hasOwnProperty('softwareVersions')) {
      this.setCapabilityValue('update_available', deviceData.softwareVersions[0].updateAvailable).catch(this.error);
    }

    // Return when `lockProperties` is not found in lock data
    if (!deviceData.hasOwnProperty('lockProperties') || deviceData.lockProperties === null) {
      return;
    }

    const lockProperties = deviceData.lockProperties;

    // Measure battery capability
    if (lockProperties.hasOwnProperty('batteryLevel')) {
      this.setCapabilityValue('measure_battery', lockProperties.batteryLevel).catch(this.error);
    }

    // Charging capability
    if (lockProperties.hasOwnProperty('isCharging')) {
      this.setCapabilityValue('charging', lockProperties.isCharging).catch(this.error);
    }

    // Locked capability
    const state = lockProperties.state;

    // Start state monitor if needed
    if (await this._needsStateMonitor(state) && this.isIdle()) {
      return this._startStateMonitor();
    }

    // Locked state
    const locked = state === LockState.Locked;

    this.setCapabilityValue('locked', locked).catch(this.error);
  }

  /**
   * Availability.
   *
   * @param {object} deviceData
   * @returns {Promise<any>}
   * @private
   */
  async _setAvailability(deviceData) {
    // Disconnected
    if (!deviceData.isConnected) {
      return this.setUnavailable(this.homey.__('state.disconnected'));
    }

    // Return when `lockProperties` is not found in lock data
    if (!deviceData.hasOwnProperty('lockProperties') || deviceData.lockProperties === null) {
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

  /*
  |-----------------------------------------------------------------------------
  | API commands
  |-----------------------------------------------------------------------------
  */

  /**
   * Lock (close).
   *
   * @async
   * @returns {Promise<void>}
   * @throws {Error}
   */
  async lock() {
    this.log('Locking lock...');

    // Check if lock is busy
    if (this.isBusy()) {
      this.log('Device is busy, stopped');

      throw new Error(this.homey.__('state.inUse'));
    }

    // Set the lock to busy
    this.setBusy();

    // Fetch current lock state from tedee API
    const state = await this.oAuth2Client.getLockState(this.tedeeId);
    const stateName = await this._getLockStateName(state);

    this.log(`Current state is ${stateName}`);

    // Start progress monitor if needed
    if (await this._needsStateMonitor(state)) {
      return this._startStateMonitor();
    }

    // Make sure the lock is in a valid state to lock
    if (state !== LockState.Unlocked && state !== LockState.SemiLocked) {
      await this.resetState();

      this.error(`Lock is ${stateName}, not ready to lock`);

      throw new Error(this.homey.__('state.notReadyToLock'));
    }

    // Send close command to tedee API
    const operationId = await this.oAuth2Client.close(this.tedeeId);

    // Start operation monitor
    return this._startOperationMonitor(operationId);
  }

  /**
   * Unlock (open).
   *
   * @async
   * @returns {Promise<void>}
   * @throws {Error}
   */
  async unlock() {
    this.log('Unlocking lock...');

    // Check if lock is busy
    if (this.isBusy()) {
      this.log('Device is busy, stopped');

      throw new Error(this.homey.__('state.inUse'));
    }

    // Set the lock to busy
    this.setBusy();

    // Fetch current lock state from tedee API
    const state = await this.oAuth2Client.getLockState(this.tedeeId);
    const stateName = await this._getLockStateName(state);

    this.log(`Current state is ${stateName}`);

    // Start progress monitor if needed
    if (await this._needsStateMonitor(state)) {
      return this._startStateMonitor();
    }

    // Make sure the lock is in a valid state
    if (state !== LockState.Locked && state !== LockState.SemiLocked) {
      await this.resetState();

      this.error(`Lock is ${stateName}, not ready to unlock`);

      throw new Error(this.homey.__('state.notReadyToUnlock'));
    }

    // Send open command to tedee API
    const operationId = await this.oAuth2Client.open(this.tedeeId);

    // Start operation monitor
    return this._startOperationMonitor(operationId);
  }

  /**
   * Open (pull spring).
   *
   * @async
   * @returns {Promise<void>}
   * @throws {Error}
   */
  async open() {
    this.log('Opening lock...');

    // Check if lock is busy
    if (this.isBusy()) {
      this.log('Device is busy, stopped');

      throw new Error(this.homey.__('state.inUse'));
    }

    // Set the lock to busy
    this.setBusy();

    // Trigger opened
    await this.driver.triggerOpened(this);

    // Fetch current lock state from tedee API
    const state = await this.oAuth2Client.getLockState(this.tedeeId);
    const stateName = await this._getLockStateName(state);

    this.log(`Current state is ${stateName}`);

    // Start progress monitor if needed
    if (await this._needsStateMonitor(state)) {
      return this._startStateMonitor();
    }

    // Make sure the lock is in a valid state
    if (state !== LockState.Unlocked) {
      await this.resetState();

      this.error(`Lock is ${stateName}, not ready to open`);

      throw new Error(this.homey.__('state.firstUnLock'));
    }

    // Send pull spring command to tedee API
    const operationId = await this.oAuth2Client.pullSpring(this.tedeeId);

    // Start operation monitor
    return this._startOperationMonitor(operationId);
  }

  /*
  |-----------------------------------------------------------------------------
  | Lock state monitor
  |-----------------------------------------------------------------------------
  */

  /**
   * Start the state monitor.
   *
   * @async
   * @returns {Promise<void>}
   * @throws {Error}
   * @private
   */
  async _startStateMonitor() {
    this.log('Starting state monitor');

    // Extra safety check if lock is available
    if (!this.getAvailable()) {
      this.error('Device not available');

      return this.resetState();
    }

    // Check if operation monitor is active
    if (this.operationMonitor) {
      this.log('Operation monitor is active, stopped');

      throw new Error(this.homey.__('state.inUse'));
    }

    this.stateMonitor = this.homey.setInterval(async () => {
      try {
        // Set lock to busy
        this.setBusy();

        // Fetch current lock state from tedee API
        const deviceData = await this.oAuth2Client.getSyncLock(this.tedeeId);
        const state = deviceData.lockProperties.state;
        const stateName = await this._getLockStateName(state);

        // Log current state
        this.log(`Lock is ${stateName}`);

        // State is pulling or pulled
        if (state === LockState.Pulling || state === LockState.Pulled) {
          await this.driver.triggerOpened(this);
        }

        // State is locked
        if (state === LockState.Locked) {
          this.setCapabilityValue('locked', true).catch(this.error);
        }

        // State is unlocked
        if (state === LockState.Unlocked) {
          this.setCapabilityValue('locked', false).catch(this.error);
        }

        // Check if state monitor is still needed
        if (!await this._needsStateMonitor(state)) {
          await this.resetState();
        }
      } catch (err) {
        this.error('State monitor error', err);

        await this.resetState();

        throw new Error('Could not update lock state');
      }
    }, 800);
  }

  /**
   * Verify if the state monitor needs to be started or continue.
   *
   * @async
   * @param {number} stateId
   * @returns {Promise<boolean>}
   * @private
   */
  async _needsStateMonitor(stateId) {
    return this.getAvailable() &&
        (stateId === LockState.Locking ||
            stateId === LockState.Unlocking ||
            stateId === LockState.Pulled ||
            stateId === LockState.Pulling);
  }

  /*
  |-----------------------------------------------------------------------------
  | Lock operation monitor
  |-----------------------------------------------------------------------------
  */

  /**
   * Start the operation monitor.
   *
   * @async
   * @param {string} operationId
   * @returns {Promise<void>}
   * @throws {Error}
   * @private
   */
  async _startOperationMonitor(operationId) {
    this.log(`Starting operation monitor for ${operationId}`);

    // Extra safety check if lock is available
    if (!this.getAvailable()) {
      this.error('Device not available');

      return this.resetState();
    }

    // Check if state monitor monitor is active
    if (this.stateMonitor) {
      this.log('State monitor is active, stopped');

      throw new Error(this.homey.__('state.inUse'));
    }

    this.operationMonitor = this.homey.setInterval(async () => {
      // Set lock to busy
      this.setBusy();

      // Fetch current lock state from tedee API
      const operationData = await this.oAuth2Client.getOperation(operationId);
      const status = operationData.status;
      const type = operationData.type;

      // Log current state
      this.log(`Operation status is ${status}`);

      // Operation monitor is not completed (pending)
      if (status === 'PENDING') {
        return;
      }

      // Successful
      if (operationData.result === 0) {
        // Cleanup timers
        await this.cleanup();

        // Start state monitor
        return this._startStateMonitor();
      }

      // Pull failed
      if (type === OperationTypes.Pull) {
        this.error('Pull operation failed');
      }

      // Close failed
      if (type === OperationTypes.Close) {
        this.error('Close operation failed');
      }

      // Open failed
      if (type === OperationTypes.Open) {
        this.error('Open operation failed');
      }

      // Reset state
      await this.resetState();

      throw new Error(this.homey.__('error.actionFailed'));
    }, 800);
  }

  /*
  |-----------------------------------------------------------------------------
  | Support functions
  |-----------------------------------------------------------------------------
  */

  /**
   * Returns readable name that belongs to the lock state.
   *
   * @async
   * @param {number} stateId
   * @returns {Promise<string>}
   * @private
   */
  async _getLockStateName(stateId) {
    switch (stateId) {
      case LockState.Uncalibrated:
        return `uncalibrated (${stateId})`;
      case LockState.Calibrating:
        return `calibrating (${stateId})`;
      case LockState.Unlocked:
        return `unlocked (${stateId})`;
      case LockState.SemiLocked:
        return `semi locked (${stateId})`;
      case LockState.Unlocking:
        return `unlocking (${stateId})`;
      case LockState.Locking:
        return `locking (${stateId})`;
      case LockState.Locked:
        return `locked (${stateId})`;
      case LockState.Pulled:
        return `pulled (${stateId})`;
      case LockState.Pulling:
        return `pulling (${stateId})`;
      case LockState.Unknown:
        return `unknown (${stateId})`;
      case LockState.Updating:
        return `updating (${stateId})`;
      default:
        return `unknown`;
    }
  }

}

module.exports = LockDevice;
