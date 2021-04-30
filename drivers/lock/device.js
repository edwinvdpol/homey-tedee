'use strict';

const Device = require('/lib/Device');
const {LockState, OperationTypes} = require('/lib/Enums');

class LockDevice extends Device {

  /*
  |-----------------------------------------------------------------------------
  | Lock events
  |-----------------------------------------------------------------------------
  */

  // Lock initialized
  async _onOAuth2Init() {
    // Get lock data from tedee API
    const deviceData = await this.oAuth2Client.getLock(this.tedeeId);

    // Sync lock
    return this._syncDevice(deviceData);
  }

  /*
  |-----------------------------------------------------------------------------
  | Lock actions
  |-----------------------------------------------------------------------------
  */

  // Sync
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
    if (!deviceData.hasOwnProperty('lockProperties')) {
      return;
    }

    const lockProperties = deviceData.lockProperties;

    // Measure battery capability
    if (lockProperties.hasOwnProperty('batteryLevel')) {
      this.setCapabilityValue('measure_battery', Number(lockProperties.batteryLevel)).catch(this.error);
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

  // Availability
  async _setAvailability(deviceData) {
    // Disconnected
    if (!deviceData.isConnected) {
      return this.setUnavailable(this.homey.__('state.disconnected'));
    }

    // Return when `lockProperties` is not found in lock data
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

  /*
  |-----------------------------------------------------------------------------
  | API commands
  |-----------------------------------------------------------------------------
  */

  // Lock (close)
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

  // Unlock (open)
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

  // Open (pull spring)
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

  // Start the state monitor
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

  // Verify if the state monitor needs to be started or continue
  async _needsStateMonitor(state) {
    return this.getAvailable() &&
        (state === LockState.Locking ||
            state === LockState.Unlocking ||
            state === LockState.Pulled ||
            state === LockState.Pulling);
  }

  /*
  |-----------------------------------------------------------------------------
  | Lock operation monitor
  |-----------------------------------------------------------------------------
  */

  // Start the operation monitor
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

      // Operation monitor is completed
      if (status === 'COMPLETED') {
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
      }
    }, 800);
  }

  /*
  |-----------------------------------------------------------------------------
  | Support functions
  |-----------------------------------------------------------------------------
  */

  // Returns readable name that belongs to the lock state
  async _getLockStateName(state) {
    switch (state) {
      case LockState.Uncalibrated:
        return `uncalibrated (${state})`;
      case LockState.Calibrating:
        return `calibrating (${state})`;
      case LockState.Unlocked:
        return `unlocked (${state})`;
      case LockState.SemiLocked:
        return `semi locked (${state})`;
      case LockState.Unlocking:
        return `unlocking (${state})`;
      case LockState.Locking:
        return `locking (${state})`;
      case LockState.Locked:
        return `locked (${state})`;
      case LockState.Pulled:
        return `pulled (${state})`;
      case LockState.Pulling:
        return `pulling (${state})`;
      case LockState.Unknown:
        return `unknown (${state})`;
      case LockState.Updating:
        return `updating (${state})`;
      default:
        return `unknown`;
    }
  }

}

module.exports = LockDevice;
