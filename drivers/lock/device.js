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

    // Prepare and validate state
    const state = await this._prepareCommand();

    // Start progress monitor if needed
    if (await this._needsStateMonitor(state)) {
      return this._startStateMonitor();
    }

    // Make sure the lock is in a valid state to lock
    if (state !== LockState.Unlocked && state !== LockState.SemiLocked) {
      this.error('Lock failed: Not ready to lock');

      // Reset device state
      await this.resetState();

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

    // Prepare and validate state
    const state = await this._prepareCommand();

    // Start progress monitor if needed
    if (await this._needsStateMonitor(state)) {
      return this._startStateMonitor();
    }

    // Make sure the lock is in a valid state
    if (state !== LockState.Locked && state !== LockState.SemiLocked) {
      this.error('Unlock failed: Not ready to unlock');

      // Reset device state
      await this.resetState();

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

    // Prepare and validate state
    const state = await this._prepareCommand();

    // Trigger opened
    this.driver.triggerOpened(this);

    // Start progress monitor if needed
    if (await this._needsStateMonitor(state)) {
      return this._startStateMonitor();
    }

    // Make sure the lock is in a valid state
    if (state !== LockState.Unlocked) {
      this.error('Open failed: Unlock first');

      // Reset device state
      await this.resetState();

      throw new Error(this.homey.__('state.firstUnLock'));
    }

    // Send pull spring command to tedee API
    const operationId = await this.oAuth2Client.pullSpring(this.tedeeId);

    // Start operation monitor
    return this._startOperationMonitor(operationId);
  }

  /**
   * Prepare device and return state ID.
   *
   * @async
   * @returns {Promise<number>}
   * @private
   */
  async _prepareCommand() {
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

    // Extra safety check if lock is available
    if (!this.getAvailable()) {
      this.error('Device not available');

      // Reset device state
      await this.resetState();

      throw new Error(this.homey.__('state.notAvailable'));
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
          // Reset device state
          await this.resetState();
        }
      } catch (err) {
        this.error('State Monitor failed:', err.message);

        // Reset device state
        await this.resetState();

        throw new Error(this.homey.__('error.unknown'));
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

    // Extra safety check if lock is available
    if (!this.getAvailable()) {
      this.error('Device not available');

      // Reset device state
      await this.resetState();

      throw new Error(this.homey.__('state.notAvailable'));
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

      // Reset device state
      await this.resetState();

      throw new Error(this.homey.__('error.unknown'));
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
