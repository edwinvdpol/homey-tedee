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

      // Emit full update
      this.emit('full');
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
    this.log('----- Locking lock -----');

    // Get and validate state
    const state = await this._getState();

    // Lock is already locked
    if (state === LockState.Locked) {
      this.log('Lock is already locked');

      // Set device to idle state
      return this.setIdle();
    }

    // Start progress monitor
    if (await this._needsStateMonitor(state)) {
      return this._startStateMonitor();
    }

    // Make sure the lock is in a valid state to lock
    if (state !== LockState.Unlocked && state !== LockState.SemiLocked) {
      this.error('Lock failed: Not ready to lock');

      // Set device to idle state
      await this.setIdle();

      throw new Error(this.homey.__('state.notReadyToLock'));
    }

    // Send close command to tedee API
    const operationId = await this.oAuth2Client.close(this.tedeeId);

    // Start operation monitor
    await this._startOperationMonitor(operationId);
  }

  /**
   * Unlock (open).
   *
   * @async
   * @returns {Promise<void>}
   * @throws {Error}
   */
  async unlock() {
    this.log('----- Unlocking lock -----');

    // Get and validate state
    const state = await this._getState();

    // Lock is already unlocked
    if (state === LockState.Unlocked) {
      this.log('Lock is already unlocked');

      // Set device to idle state
      return this.setIdle();
    }

    // Start progress monitor
    if (await this._needsStateMonitor(state)) {
      return this._startStateMonitor();
    }

    // Make sure the lock is in a valid state
    if (state !== LockState.Locked) {
      this.error('Unlock failed: Not ready to unlock');

      // Set device to idle state
      await this.setIdle();

      throw new Error(this.homey.__('state.notReadyToUnlock'));
    }

    // Send open command to tedee API
    const operationId = await this.oAuth2Client.open(this.tedeeId);

    // Start operation monitor
    await this._startOperationMonitor(operationId);
  }

  /**
   * Open (pull spring).
   *
   * @async
   * @returns {Promise<void>}
   * @throws {Error}
   */
  async open() {
    this.log('----- Opening lock -----');

    // Check if pull spring is enabled
    if (this.getStoreValue('pull_spring_enabled') !== 'on') {
      this.error('Open failed: Pull spring not enabled');

      // Set device to idle state
      await this.setIdle();

      throw new Error(this.homey.__('error.pullSpringDisabled'));
    }

    // Get and validate state
    const state = await this._getState();

    // Make sure the lock is in a valid state
    if (state !== LockState.Unlocked) {
      this.error('Open failed: Unlock first');

      // Set device to idle state
      await this.setIdle();

      throw new Error(this.homey.__('state.firstUnLock'));
    }

    // Send pull spring command to tedee API
    const operationId = await this.oAuth2Client.pullSpring(this.tedeeId);

    // Start operation monitor
    await this._startOperationMonitor(operationId);
  }

  /**
   * Validate and return state.
   *
   * @async
   * @returns {Promise<number>}
   * @private
   */
  async _getState() {
    this.log('Fetching state...');

    // Check if lock is available
    if (!this.getAvailable()) {
      this.error('Device not available');

      // Set device to idle state
      await this.setIdle();

      throw new Error(this.homey.__('state.notAvailable'));
    }

    // Check if lock is busy
    if (await this.isBusy()) {
      this.log('Device is busy, stopped');

      throw new Error(this.homey.__('state.inUse'));
    }

    // Set the lock to busy
    await this.setBusy();

    // Fetch current lock state from tedee API
    const state = await this.oAuth2Client.getLockState(this.tedeeId);
    const stateName = await this._getLockStateName(state);

    this.log(`Current state is ${stateName}`);

    return state;
  }

  /*
  |-----------------------------------------------------------------------------
  | State monitor
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

    // Check if operation monitor is active
    if (this.operationMonitor) {
      this.log('Operation monitor is active, stopped');

      throw new Error(this.homey.__('state.inUse'));
    }

    await (async () => {
      this.stateMonitor = true;

      // Set lock to busy
      await this.setBusy();

      while (this.stateMonitor) {
        await new Promise(resolve => setTimeout(resolve, 800));

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
          await this.setCapabilityValue('locked', true);
        }

        // State is unlocked
        if (state === LockState.Unlocked) {
          await this.setCapabilityValue('locked', false);
        }

        // State is semi locked (show as unlocked for safety reasons)
        if (state === LockState.SemiLocked) {
          await this.setCapabilityValue('locked', false);
        }

        // Check if state monitor is still needed
        if (!await this._needsStateMonitor(state)) {
          // Set device to idle state
          await this.setIdle();

          // Final sync to make sure the states are correct
          this.emit('sync');
        }
      }
    })();
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
  | Operation monitor
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

    // Check if state monitor monitor is active
    if (this.stateMonitor) {
      this.log('State monitor is active, stopped');

      throw new Error(this.homey.__('state.inUse'));
    }

    await (async () => {
      this.operationMonitor = true;

      let numberOfTries = 0;

      // Set lock to busy
      await this.setBusy();

      while (this.operationMonitor) {
        await new Promise(resolve => setTimeout(resolve, 800));

        // Increment number of tries
        numberOfTries++;

        // Fetch current lock state from tedee API
        const operationData = await this.oAuth2Client.getOperation(operationId);
        const status = operationData.status;
        const type = operationData.type;

        // Log current state
        this.log(`Operation status is '${status}' (${numberOfTries})`);

        // Stop operation monitor at 5 or more tries
        if (numberOfTries > 4) {
          this.error('Stopping operation monitor, to many tries');

          // Set device to idle state
          await this.setIdle();

          throw new Error(this.homey.__('error.response'));
        }

        // Operation monitor is not completed (pending)
        if (status === 'PENDING') {
          continue;
        }

        // Stop operation monitor
        await this.stopOperationMonitor();

        // Successful
        if (operationData.result === 0) {
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

        // Set device to idle state
        await this.setIdle();

        throw new Error(this.homey.__('error.response'));
      }
    })();
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
