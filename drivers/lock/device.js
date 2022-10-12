'use strict';

const Device = require('../../lib/Device');
const { LockState, LockStateNames } = require('../../lib/Enums');
const { blank, filled } = require('../../lib/Utils');
const Monitor = require('../../lib/Monitor');

class LockDevice extends Device {

  /*
  | Device events
  */

  // Device initialized
  async onOAuth2Init() {
    // Register listeners
    this.registerCapabilityListeners();

    const device = this;

    this.monitor = new Monitor({ device });

    await super.onOAuth2Init();
  }

  // Device deleted
  async onOAuth2Deleted() {
    this.monitor = null;

    await super.onOAuth2Deleted();
  }

  /*
  | Synchronization functions
  */

  // Return data which need to be synced
  async getSyncData() {
    return this.oAuth2Client.getLock(this.getSetting('tedee_id'));
  }

  // Set device data
  async handleSyncData(data) {
    try {
      await super.handleSyncData(data);
      await this.setStore(data);
    } catch (err) {
      this.error(err.message);
      this.setUnavailable(err.message).catch(this.error);
    }
  }

  // Set availability
  async setAvailability(data) {
    // Disconnected
    if (filled(data.isConnected) && !data.isConnected) {
      throw new Error(this.homey.__('state.disconnected'));
    }

    if (blank(data.lockProperties)) {
      return;
    }

    // Lock state
    const state = data.lockProperties.state || null;

    if (blank(state)) {
      throw new Error(this.homey.__('errors.response'));
    }

    if (state === LockState.Uncalibrated) {
      throw new Error(this.homey.__('state.uncalibrated'));
    }

    if (state === LockState.Calibrating) {
      throw new Error(this.homey.__('state.calibrating'));
    }

    if (state === LockState.Unknown) {
      throw new Error(this.homey.__('state.unknown'));
    }

    if (state === LockState.Updating) {
      throw new Error(this.homey.__('state.updating'));
    }

    // Run monitor if needed
    if (this.monitor.shouldRun(state)) {
      await this.monitor.run();
    } else {
      this.setCapabilityValue('locked', state === LockState.Locked).catch(this.error);
    }
  }

  // Set capabilities
  async setCapabilities(data) {
    await super.setCapabilities(data);

    // Return when properties are missing
    if (blank(data.lockProperties)) {
      return;
    }

    const lock = data.lockProperties;

    // Measure battery
    if (filled(lock.batteryLevel)) {
      this.setCapabilityValue('measure_battery', lock.batteryLevel).catch(this.error);
    }

    // Charging
    if (filled(lock.isCharging)) {
      this.setCapabilityValue('charging', lock.isCharging).catch(this.error);
    }
  }

  // Set store values
  async setStore(data) {
    if (blank(data.deviceSettings)) {
      return;
    }

    if (blank(data.deviceSettings.pullSpringEnabled)) {
      return;
    }

    const { pullSpringEnabled } = data.deviceSettings;

    // Set store values
    this.setStoreValue('pull_spring_enabled', pullSpringEnabled).catch(this.error);

    // Remove or add "open" capability
    this.toggleOpenCapability(pullSpringEnabled);
  }

  // Settings changed
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    const settings = {};

    // Check if lock is available
    if (!this.getAvailable()) {
      await this.reset();

      throw new Error(this.homey.__('state.notAvailable'));
    }

    // Auto lock enabled updated
    if (changedKeys.includes('auto_lock_enabled')) {
      this.log(`Auto-lock enabled is now '${newSettings.auto_lock_enabled}'`);

      settings.autoLockEnabled = newSettings.auto_lock_enabled;
    }

    // Button lock enabled updated
    if (changedKeys.includes('button_lock_enabled')) {
      this.log(`Button lock enabled is now '${newSettings.button_lock_enabled}'`);

      settings.buttonLockEnabled = newSettings.button_lock_enabled;
    }

    // Button unlock enabled updated
    if (changedKeys.includes('button_unlock_enabled')) {
      this.log(`Button unlock enabled is now '${newSettings.button_unlock_enabled}'`);

      settings.buttonUnlockEnabled = newSettings.button_unlock_enabled;
    }

    // Device settings need to be updated
    const tedeeId = this.getSetting('tedee_id');

    if (filled(settings)) {
      await this.oAuth2Client.updateLockSettings(tedeeId, settings);

      this.log(`Lock settings ${tedeeId} updated successfully!`);
    }
  }

  /*
  | API commands
  */

  // Lock action
  async lock() {
    this.log('----- Locking lock -----');

    // Check if lock is available
    if (!this.getAvailable()) {
      await this.reset();

      return;
    }

    // Get and validate state
    const state = await this.getState();

    // Lock is already locked
    if (state === LockState.Locked) {
      this.log('Lock is already locked');

      // Set device to idle state
      await this.reset();

      return;
    }

    // Make sure the lock is in a valid state to lock
    if (state !== LockState.Unlocked && state !== LockState.SemiLocked) {
      await this.errorIdle(`Not ready to lock, currently ${state}`, 'errors.notReadyToLock');
    }

    // Send lock command to tedee API
    const operationId = await this.oAuth2Client.lock(this.getSetting('tedee_id'));

    // Run monitor
    await this.monitor.run(operationId);
  }

  // Pull spring action
  async pullSpring() {
    this.log('----- Pulling spring -----');

    // Check if lock is available
    if (!this.getAvailable()) {
      await this.reset();

      return;
    }

    // Check if pull spring is enabled
    if (this.getStoreValue('pull_spring_enabled') !== 'on' || !this.hasCapability('open')) {
      await this.errorIdle('Pull spring not enabled', 'errors.pullSpringDisabled');
    }

    // Get and validate state
    const state = await this.getState();

    // Make sure the lock is in a valid state
    if (state !== LockState.Unlocked) {
      await this.errorIdle(`Not in unlocked state, currently ${LockStateNames[state]} (${state})`, 'errors.firstUnLock');
    }

    // Send pull spring command to tedee API
    const operationId = await this.oAuth2Client.pullSpring(this.getSetting('tedee_id'));

    // Run monitor
    await this.monitor.run(operationId);
  }

  // Unlock action
  async unlock() {
    this.log('----- Unlocking lock -----');

    // Check if lock is available
    if (!this.getAvailable()) {
      await this.reset();

      return;
    }

    // Get and validate state
    const state = await this.getState();

    // Lock is already unlocked
    if (state === LockState.Unlocked) {
      this.log('Lock is already unlocked');

      // Set device to idle state
      await this.reset();

      return;
    }

    // Make sure the lock is in a valid state
    if (state !== LockState.Locked && state !== LockState.SemiLocked) {
      await this.errorIdle(`Not ready to unlock, currently ${LockStateNames[state]} (${state})`, 'errors.notReadyToUnlock');
    }

    // Send unlock command to tedee API
    const operationId = await this.oAuth2Client.unlock(this.getSetting('tedee_id'));

    // Run monitor
    await this.monitor.run(operationId);
  }

  /*
  | Capabilities
  */

  // Locked capability changed
  async onCapabilityLocked(lock) {
    this.log(`Capability 'locked' is now '${lock}'`);

    if (lock) {
      await this.lock();
    } else {
      await this.unlock();
    }
  }

  // Open capability changed
  async onCapabilityOpen(open) {
    this.log(`Capability 'open' is now '${open}'`);

    if (open) {
      await this.pullSpring();
    }
  }

  /*
  | Listener functions
  */

  // Register capability listeners
  registerCapabilityListeners() {
    this.registerCapabilityListener('locked', this.onCapabilityLocked.bind(this));

    if (this.hasCapability('open')) {
      this.registerCapabilityListener('open', this.onCapabilityOpen.bind(this));
    }
  }

  /*
  | Support functions
  */

  // Returns settings from given data
  getNewSettings(data) {
    const settings = {};

    // Set connected status
    if (filled(data.isConnected)) {
      settings.status = data.isConnected
        ? this.homey.__('connected')
        : this.homey.__('disconnected');
    }

    if (blank(data.deviceSettings)) {
      return settings;
    }

    const device = data.deviceSettings;

    settings.auto_lock_enabled = device.autoLockEnabled || false;
    settings.button_lock_enabled = device.buttonLockEnabled || false;
    settings.button_unlock_enabled = device.buttonUnlockEnabled || false;

    return settings;
  }

  // Validate and return state
  async getState() {
    this.log('Fetching state...');

    // Check if monitor is running
    if (this.monitor.isRunning()) {
      this.error('Monitor is running, stopped');

      throw new Error(this.homey.__('state.inUse'));
    }

    // Fetch current lock state from tedee API
    const state = await this.oAuth2Client.getLockState(this.getSetting('tedee_id'));

    // Unknown state
    if (blank(state)) {
      throw new Error(this.homey.__('state.unknown'));
    }

    this.log(`Current state is ${LockStateNames[state]} (${state})`);

    return state;
  }

  // Set device to idle
  async reset() {
    // Reset open capability
    if (this.hasCapability('open')) {
      this.setCapabilityValue('open', false).catch(this.error);
    }

    // Refresh device
    await this.sync();
  }

  // Remove or add "open" capability
  toggleOpenCapability(pullSpringEnabled) {
    // Remove capability
    if (this.hasCapability('open') && !pullSpringEnabled) {
      this.log('Pull spring disabled, removing "open" capability');

      this.removeCapability('open').catch(this.error);
    }

    // Add capability
    if (!this.hasCapability('open') && pullSpringEnabled) {
      this.log('Pull spring enabled, adding "open" capability');

      this.addCapability('open').catch(this.error);
      this.registerCapabilityListener('open', this.onCapabilityOpen.bind(this));
    }
  }

  // Trigger opened capability
  async triggerOpened() {
    const device = this;

    await this.driver.triggerOpened(device);
  }

}

module.exports = LockDevice;
