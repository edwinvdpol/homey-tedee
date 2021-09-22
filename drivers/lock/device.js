'use strict';

const Device = require('/lib/Device');
const {LockState} = require('/lib/Enums');

class LockDevice extends Device {

  /**
   * Set device capabilities.
   *
   * @async
   * @param {object} deviceData
   * @returns {Promise<void>}
   */
  async setCapabilities(deviceData) {
    await super.setCapabilities(deviceData);

    if (!deviceData.hasOwnProperty('lockProperties')) {
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

    // Start monitor if needed
    if (this.idle && ! this.monitor && this.needsMonitor(state)) {
      return this.startMonitor();
    }

    // Locked state
    let locked = state === LockState.Locked;

    this.setCapabilityValue('locked', locked).catch(this.error);
  }

  /**
   * Set device availability.
   *
   * @async
   * @param {object} deviceData
   * @returns {Promise<void>}
   */
  async setAvailability(deviceData) {
    await super.setAvailability(deviceData);

    if (!deviceData.hasOwnProperty('lockProperties')) {
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

    // Check if lock is available
    if (!this.getAvailable()) {
      await this.resetState();

      throw new Error(this.homey.__('state.notAvailable'));
    }

    // Auto lock enabled updated
    if (changedKeys.includes('auto_lock_enabled')) {
      this.log(`Auto-lock enabled is now '${newSettings.auto_lock_enabled}'`);

      settings.autoLockEnabled = newSettings.auto_lock_enabled === 'on';
    }

    // Button lock enabled updated
    if (changedKeys.includes('button_lock_enabled')) {
      this.log(`Button lock enabled is now '${newSettings.button_lock_enabled}'`);

      settings.buttonLockEnabled = newSettings.button_lock_enabled === 'on';
    }

    // Button unlock enabled updated
    if (changedKeys.includes('button_unlock_enabled')) {
      this.log(`Button unlock enabled is now '${newSettings.button_unlock_enabled}'`);

      settings.buttonUnlockEnabled = newSettings.button_unlock_enabled === 'on';
    }

    // Device settings need to be updated
    if (Object.keys(settings).length > 0) {
      await this.oAuth2Client.updateLockSettings(this.tedeeId, settings);

      this.log(`Lock settings ${this.tedeeId} updated successfully!`);
    }
  }

  /*
  |-----------------------------------------------------------------------------
  | API commands
  |-----------------------------------------------------------------------------
  */

  /**
   * Lock.
   *
   * @async
   * @returns {Promise<void>}
   * @throws {Error}
   */
  async lock() {
    this.log('----- Locking lock -----');

    // Check if lock is available
    if (!this.getAvailable()) {
      return this.resetState();
    }

    // Get and validate state
    const state = await this.getState();

    // Lock is already locked
    if (state === LockState.Locked) {
      this.log('Lock is already locked');

      // Set device to idle state
      return this.resetState();
    }

    // Make sure the lock is in a valid state to lock
    if (state !== LockState.Unlocked && state !== LockState.SemiLocked) {
      await this.errorIdle(`Not ready to lock, currently ${state}`, 'error.notReadyToLock');
    }

    // Send lock command to tedee API
    this.operationId = await this.oAuth2Client.lock(this.tedeeId);

    // Start monitor
    await this.startMonitor();
  }

  /**
   * Pull spring.
   *
   * @async
   * @returns {Promise<void>}
   * @throws {Error}
   */
  async pullSpring() {
    this.log('----- Pulling spring -----');

    // Check if pull spring is enabled
    if (this.getStoreValue('pull_spring_enabled') !== 'on' || !this.hasCapability('open')) {
      await this.errorIdle('Pull spring not enabled', 'error.pullSpringDisabled');
    }

    // Check if lock is available
    if (!this.getAvailable()) {
      return this.resetState();
    }

    // Get and validate state
    const state = await this.getState();

    // Make sure the lock is in a valid state
    if (state !== LockState.Unlocked) {
      await this.errorIdle(`Not in unlocked state, currently ${state}`, 'error.firstUnLock');
    }

    // Send pull spring command to tedee API
    this.operationId = await this.oAuth2Client.pullSpring(this.tedeeId);

    // Start monitor
    await this.startMonitor();
  }

  /**
   * Unlock.
   *
   * @async
   * @returns {Promise<void>}
   * @throws {Error}
   */
  async unlock() {
    this.log('----- Unlocking lock -----');

    // Check if lock is available
    if (!this.getAvailable()) {
      return this.resetState();
    }

    // Get and validate state
    const state = await this.getState();

    // Lock is already unlocked
    if (state === LockState.Unlocked) {
      this.log('Lock is already unlocked');

      // Set device to idle state
      return this.resetState();
    }

    // Make sure the lock is in a valid state
    if (state !== LockState.Locked && state !== LockState.SemiLocked) {
      await this.errorIdle(`Not ready to unlock, currently ${state}`, 'error.notReadyToUnlock');
    }

    // Send unlock command to tedee API
    this.operationId = await this.oAuth2Client.unlock(this.tedeeId);

    // Start monitor
    await this.startMonitor();
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
    this.log(`Capability 'locked' is now '${lock}'`);

    if (lock) {
      return this.lock();
    }

    return this.unlock();
  }

  /**
   * This method will be called when open changed.
   *
   * @async
   * @param {boolean} open
   * @returns {Promise<*>}
   */
  async onCapabilityOpen(open) {
    this.log(`Capability 'open' is now '${open}'`);

    if (open) {
      return this.pullSpring();
    }
  }

  /*
  |-----------------------------------------------------------------------------
  | Support functions
  |-----------------------------------------------------------------------------
  */

  /**
   * Returns readable name that belongs to the lock state.
   *
   * @param {number} stateId
   * @returns {string}
   */
  getLockStateName(stateId) {
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
        return `error`;
    }
  }

  /**
   * Validate and return state.
   *
   * @async
   * @returns {Promise<number>}
   * @throws {Error}
   */
  async getState() {
    this.log('Fetching state...');

    // Check if lock is busy
    if (!this.idle) {
      this.error('Device is busy, stopped');

      throw new Error(this.homey.__('state.inUse'));
    }

    // Set the lock to busy
    this.idle = false;

    // Fetch current lock state from tedee API
    const state = await this.oAuth2Client.getLockState(this.tedeeId);

    this.log(`Current state is ${this.getLockStateName(state)}`);

    return state;
  }

}

module.exports = LockDevice;
