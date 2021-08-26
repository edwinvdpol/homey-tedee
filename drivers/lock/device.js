'use strict';

const Device = require('/lib/Device');
const {LockState, OperationTypes} = require('/lib/Enums');

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
    if (this.idle && this._needsStateMonitor(state)) {
      return this._startStateMonitor();
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
  | Lock events
  |-----------------------------------------------------------------------------
  */

  /**
   * Device initialized.
   *
   * @async
   * @returns {Promise<void>}
   */
  async onOAuth2Init() {
    this.flowsTriggered = {};
    this.idle = false;
    this.name = this.driver.id.charAt(0).toUpperCase() + this.driver.id.slice(1);
    this.operationMonitor = false;
    this.stateMonitor = false;
    this.tedeeId = Number(this.getSetting('tedee_id'));

    await this.setUnavailable(this.homey.__('connecting'));

    // Set device to idle state
    await this.resetState();

    // Register capability listeners
    await this._registerCapabilityListeners();

    // Register event listeners
    this.on('full', this.onFull.bind(this));
    this.on('sync', this.onSync.bind(this));

    // Full update event
    this.emit('full');
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
      return this.resetState();
    }

    // Start progress monitor
    if (this._needsStateMonitor(state)) {
      return this._startStateMonitor();
    }

    // Make sure the lock is in a valid state to lock
    if (state !== LockState.Unlocked && state !== LockState.SemiLocked) {
      await this.errorIdle(`Not ready to lock, currently ${state}`, 'error.notReadyToLock');
    }

    // Send close command to tedee API
    const operationId = await this.oAuth2Client.close(this.tedeeId);

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
      await this.errorIdle('Pull spring not enabled', 'error.pullSpringDisabled');
    }

    // Get and validate state
    const state = await this._getState();

    // Make sure the lock is in a valid state
    if (state !== LockState.Unlocked) {
      await this.errorIdle(`Not in unlocked state, currently ${state}`, 'error.firstUnLock');
    }

    // Send pull spring command to tedee API
    const operationId = await this.oAuth2Client.pullSpring(this.tedeeId);

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
      return this.resetState();
    }

    // Start progress monitor
    if (this._needsStateMonitor(state)) {
      return this._startStateMonitor();
    }

    // Make sure the lock is in a valid state
    if (state !== LockState.Locked && state !== LockState.SemiLocked) {
      await this.errorIdle(`Not ready to unlock, currently ${state}`, 'error.notReadyToUnlock');
    }

    // Send open command to tedee API
    const operationId = await this.oAuth2Client.open(this.tedeeId);

    // Start operation monitor
    await this._startOperationMonitor(operationId);
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
    this.setCapabilityValue('locked', lock).catch(this.error);

    if (lock) {
      // Lock the lock
      await this.lock();

      return this.log(`Lock ${this.tedeeId} locked successfully!`);
    }

    // Unlock the lock
    await this.unlock();

    return this.log(`Lock ${this.tedeeId} unlocked successfully!`);
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
      await this.open();

      return this.log(`Lock ${this.tedeeId} opened successfully!`);
    }
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
      this.log('Operation monitor stopped');
    }

    this.operationMonitor = false;
  }

  /**
   * Stop state monitor.
   *
   * @returns {Promise<void>}
   */
  async stopStateMonitor() {
    if (this.stateMonitor) {
      this.log('State monitor stopped');
    }

    this.stateMonitor = false;
  }

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
      this.error('State monitor is active, stopped');

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
          await this.errorIdle('Stopping operation monitor, to many tries', 'error.response');
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

        // Error message
        let error = '';

        switch (type) {
          case OperationTypes.Pull:
            error = 'Pull operation failed';
            break;
          case OperationTypes.Close:
            error = 'Close operation failed';
            break;
          case OperationTypes.Open:
            error = 'Open operation failed';
            break;
          default:
            error = 'Unknown operation type';
        }

        await this.errorIdle(error, 'error.response');
      }
    })();
  }

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
      this.error('Operation monitor is active, stopped');

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
          this.setCapabilityValue('locked', true).catch(this.error);
        }

        // State is unlocked
        if (state === LockState.Unlocked) {
          this.setCapabilityValue('locked', false).catch(this.error);
        }

        // State is semi locked (show as unlocked for safety reasons)
        if (state === LockState.SemiLocked) {
          this.setCapabilityValue('locked', false).catch(this.error);
        }

        // Check if state monitor is still needed
        if (!this._needsStateMonitor(state)) {
          // Set device to idle state
          await this.resetState();

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
   * @returns {boolean}
   * @private
   */
  _needsStateMonitor(stateId) {
    return this.getAvailable() &&
        (stateId === LockState.Locking ||
            stateId === LockState.Unlocking ||
            stateId === LockState.Pulled ||
            stateId === LockState.Pulling);
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
    this.registerCapabilityListener('locked', this.onCapabilityLocked.bind(this));

    if (this.hasCapability('open')) {
      this.registerCapabilityListener('open', this.onCapabilityOpen.bind(this));
    }
  }

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
        return `error`;
    }
  }

  /**
   * Validate and return state.
   *
   * @async
   * @returns {Promise<number>}
   * @throws {Error}
   * @private
   */
  async _getState() {
    this.log('Fetching state...');

    // Check if lock is available
    if (!this.getAvailable()) {
      await this.errorIdle('Device not available', 'state.notAvailable');
    }

    // Check if lock is busy
    if (!this.idle) {
      this.error('Device is busy, stopped');

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

}

module.exports = LockDevice;
