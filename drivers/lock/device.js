'use strict';

const Device = require('../../lib/Device');
const { LockState, LockStateNames, UnlockMode } = require('../../lib/Enums');
const { blank, filled } = require('../../lib/Utils');

class LockDevice extends Device {

  /*
  | Device events
  */

  // Device initialized
  async onOAuth2Init() {
    // Register listeners
    this.registerCapabilityListeners();

    await super.onOAuth2Init();
  }

  /*
  | Synchronization functions
  */

  // Returns settings from given data
  getSettingsData(data) {
    const settings = {};

    // Set connected status
    if (filled(data.isConnected)) {
      settings.status = data.isConnected
        ? this.homey.__('connected')
        : this.homey.__('disconnected');

      if (this.getStoreValue('connected_via_bridge') && data.isConnected) {
        settings.status = this.homey.__('connectedViaBridge');
      }
    }

    if (blank(data.deviceSettings)) {
      return settings;
    }

    const device = data.deviceSettings;

    settings.auto_lock_enabled = device.autoLockEnabled || false;
    settings.button_lock_enabled = device.buttonLockEnabled || false;
    settings.button_unlock_enabled = device.buttonUnlockEnabled || false;
    settings.postponed_lock_enabled = device.postponedLockEnabled || false;
    settings.postponed_lock_delay = device.postponedLockDelay || 10;

    return settings;
  }

  // Handle sync data
  async handleSyncData(data) {
    try {
      await this.setStore(data);
      await super.handleSyncData(data);
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

    if (blank(data.state)) return;

    if (data.state === LockState.Uncalibrated) {
      throw new Error(this.homey.__('state.uncalibrated'));
    }

    if (data.state === LockState.Calibrating) {
      throw new Error(this.homey.__('state.calibrating'));
    }

    if (data.state === LockState.Unknown) {
      throw new Error(this.homey.__('state.unknown'));
    }

    if (data.state === LockState.Updating) {
      throw new Error(this.homey.__('state.updating'));
    }

    this.setCapabilityValue('locked', data.state === LockState.Locked).catch(this.error);
  }

  // Set capabilities
  async setCapabilities(data) {
    await super.setCapabilities(data);

    // Battery level
    if (filled(data.batteryLevel)) {
      this.setCapabilityValue('measure_battery', data.batteryLevel).catch(this.error);
    }

    // Charging
    if (filled(data.isCharging)) {
      this.setCapabilityValue('charging', data.isCharging).catch(this.error);
    }
  }

  // Set store values
  async setStore(data) {
    if ('connectedToId' in data) {
      this.setStoreValue('connected_via_bridge', filled(data.connectedToId)).catch(this.error);
    }

    if (blank(data.deviceSettings)) return;
    if (blank(data.deviceSettings.pullSpringEnabled)) return;

    const { pullSpringEnabled } = data.deviceSettings;

    // Set store values
    this.setStoreValue('pull_spring_enabled', pullSpringEnabled).catch(this.error);

    // Remove or add "open" capability
    this.toggleOpenCapability(pullSpringEnabled);
  }

  // Settings changed
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    const settings = {};

    // Check availability
    if (!this.getAvailable()) {
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

    // Postponed lock enabled updated
    if (changedKeys.includes('postponed_lock_enabled')) {
      this.log(`Postponed lock enabled is now '${newSettings.postponed_lock_enabled}'`);

      settings.postponedLockEnabled = newSettings.postponed_lock_enabled;
    }

    // Postponed lock delay updated
    if (changedKeys.includes('postponed_lock_delay')) {
      this.log(`Postponed lock delay is now '${newSettings.postponed_lock_delay}' seconds`);

      settings.postponedLockDelay = newSettings.postponed_lock_delay;
    }

    // Device settings need to be updated
    const tedeeId = this.getSetting('tedee_id');

    if (filled(settings)) {
      await this.oAuth2Client.updateSettings('lock', tedeeId, settings);

      this.log(`Lock settings ${tedeeId} updated successfully!`);
    }
  }

  /*
  | API commands
  */

  // Lock action
  async lock() {
    this.log('----- Locking lock -----');

    // Check availability
    if (!this.getAvailable()) return;

    // Get and validate state
    const state = await this.getState();

    // Lock is already locked
    if (state === LockState.Locked) {
      this.log('Lock is already locked');

      return;
    }

    // Make sure the lock is in a valid state to lock
    if (state !== LockState.Unlocked && state !== LockState.SemiLocked) {
      await this.throwError(`Not ready, currently ${state}`, 'errors.notReadyToLock');
    }

    // Send lock command to tedee API
    await this.oAuth2Client.lock(this.getSetting('tedee_id'));
  }

  // Open action
  async open() {
    this.log('----- Opening lock -----');

    // Check availability
    if (!this.getAvailable()) return;

    // Check if pull spring is enabled
    if (!this.hasCapability('open')) {
      await this.throwError('Open capability not found', 'errors.pullSpringDisabled');
    }

    // Validate state
    await this.getState();

    // Send open command to tedee API
    await this.oAuth2Client.unlock(this.getSetting('tedee_id'), UnlockMode.UnlockOrPullSpring);
  }

  // Unlock action
  async unlock() {
    this.log('----- Unlocking lock -----');

    // Check availability
    if (!this.getAvailable()) return;

    // Get and validate state
    const state = await this.getState();

    // Lock is already unlocked
    if (state === LockState.Unlocked) {
      this.log('Lock is already unlocked');

      return;
    }

    // Make sure the lock is in a valid state
    if (state !== LockState.Locked && state !== LockState.SemiLocked) {
      await this.throwError(`Not ready to unlock, currently ${LockStateNames[state]} (${state})`, 'errors.notReadyToUnlock');
    }

    // Send unlock command to tedee API
    await this.oAuth2Client.unlock(this.getSetting('tedee_id'));
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
      await this.open();

      this.setCapabilityValue('open', false).catch(this.error);
    }
  }

  /*
  | Listener functions
  */

  // Register capability listeners
  registerCapabilityListeners() {
    this.registerCapabilityListener('locked', this.onCapabilityLocked.bind(this));
    this.registerCapabilityListener('open', this.onCapabilityOpen.bind(this));
  }

  /*
  | Support functions
  */

  // Validate and return state
  async getState() {
    this.log('Fetching state...');

    // Fetch current lock state from tedee API
    const state = await this.oAuth2Client.getLockState(this.getSetting('tedee_id'));

    this.log(`Current state is ${LockStateNames[state]} (${state})`);

    return state;
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
    }
  }

  // Trigger opened capability
  async triggerOpened() {
    const device = this;

    await this.driver.triggerOpened(device);
  }

  // Log and throw error
  async throwError(message, locale) {
    this.error(message);

    throw new Error(this.homey.__(locale));
  }

}

module.exports = LockDevice;
