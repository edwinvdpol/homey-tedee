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
    this.state = this.getStoreValue('state');

    // Register capability listeners
    this.registerCapabilityListeners();

    await super.onOAuth2Init();
  }

  // Settings changed
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log('[Settings] Updating');

    const settings = {};

    // Check availability
    if (!this.getAvailable()) {
      throw new Error(this.homey.__('state.unavailable'));
    }

    for (const name of changedKeys) {
      const newValue = newSettings[name];

      this.log(`[Settings] '${name}' is now '${newValue}'`);

      // Auto lock enabled
      if (name === 'auto_lock_enabled') {
        settings.autoLockEnabled = newValue;
      }

      // Button lock enabled
      if (name === 'button_lock_enabled') {
        settings.buttonLockEnabled = newValue;
      }

      // Button unlock enabled
      if (name === 'button_unlock_enabled') {
        settings.buttonUnlockEnabled = newValue;
      }

      // Postponed lock enabled
      if (name === 'postponed_lock_enabled') {
        settings.postponedLockEnabled = newValue;
      }

      // Postponed lock delay
      if (name === 'postponed_lock_delay') {
        settings.postponedLockDelay = newValue;
      }
    }

    // Device settings need to be updated
    if (filled(settings)) {
      this.log('[Settings] Updating device');

      await this.oAuth2Client.updateSettings('lock', this.tid, settings);
    }

    this.log('[Settings] Updated');
  }

  /*
  | Synchronization functions
  */

  // Set availability
  async setAvailability(data) {
    await super.setAvailability(data);

    if (this.isUncalibrated()) {
      throw new Error(this.homey.__('state.uncalibrated'));
    }

    if (this.isCalibrating()) {
      throw new Error(this.homey.__('state.calibrating'));
    }

    if (this.isUpdating()) {
      throw new Error(this.homey.__('state.updating'));
    }

    if (this.hasUnknownState()) {
      throw new Error(this.homey.__('state.unknown'));
    }
  }

  // Set capabilities
  async setCapabilities(data) {
    // Lock state
    if ('state' in data) {
      this.state = data.state;

      this.setCapabilityValue('locked', this.isLocked()).catch(this.error);
    }

    await super.setCapabilities(data);
  }

  // Set state
  async setState() {
    this.log('Set state from API');

    // Fetch current lock state from tedee API
    this.state = await this.oAuth2Client.getLockState(this.tid);

    this.log(`Current state is ${LockStateNames[this.state]} (${this.state})`);
  }

  // Set store values
  async setStore(data) {
    // Lock state
    if ('state' in data) {
      this.setStoreValue('state', data.state).catch(this.error);
    }

    // Connected via bridge
    if ('connectedToId' in data) {
      this.setStoreValue('connected_via_bridge', filled(data.connectedToId)).catch(this.error);
    }

    if (!('deviceSettings' in data)) return;
    const settings = data.deviceSettings;

    if (!('pullSpringEnabled' in settings)) return;

    // Pull spring enabled
    this.setStoreValue('pull_spring_enabled', settings.pullSpringEnabled).catch(this.error);

    // Remove or add "open" capability
    this.toggleOpenCapability(settings.pullSpringEnabled);
  }

  // Set warning message
  async setWarningMessage(data) {
    // Half open state
    if ('state' in data && this.state === LockState.SemiLocked) {
      this.setWarning(this.homey.__('state.semilocked')).catch(this.error);

      return;
    }

    await super.setWarningMessage(data);
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

    await this.open();
  }

  /*
  | Lock actions
  */

  // Lock
  async lock() {
    // Check availability
    if (!this.getAvailable()) return;

    // Set state from API
    await this.setState();

    // Lock is already locked
    if (this.isLocked()) return;

    this.log('Locking');

    // Make sure the lock is in a valid state to lock
    if (!this.isLockable()) {
      this.throwError(`Not ready, currently ${LockStateNames[this.state]} (${this.state})`, 'error.not_ready_to_lock');
    }

    // Send lock command to tedee API
    await this.oAuth2Client.lock(this.tid);
  }

  // Open
  async open() {
    // Check availability
    if (!this.getAvailable()) return;

    this.log('Opening');

    // Send open command to tedee API
    await this.oAuth2Client.unlock(this.tid, UnlockMode.UnlockOrPullSpring);
  }

  // Unlock
  async unlock() {
    // Check availability
    if (!this.getAvailable()) return;

    // Set state from API
    await this.setState();

    // Lock is already unlocked
    if (this.isUnlocked()) return;

    this.log('Unlocking');

    // Make sure the lock is in a valid state
    if (!this.isUnlockable()) {
      this.throwError(`Not ready, currently ${LockStateNames[this.state]} (${this.state})`, 'error.not_ready_to_unlock');
    }

    // Send unlock command to tedee API
    await this.oAuth2Client.unlock(this.tid);
  }

  /*
  | Lock states
  */

  hasState(stateId) {
    return this.state === stateId;
  }

  hasUnknownState() {
    return this.hasState(LockState.Unknown);
  }

  isCalibrating() {
    return this.hasState(LockState.Calibrating);
  }

  isLockable() {
    return this.isUnlocked() || this.isSemiLocked();
  }

  isLocked() {
    return this.hasState(LockState.Locked);
  }

  isUncalibrated() {
    return this.hasState(LockState.Uncalibrated);
  }

  isSemiLocked() {
    return this.hasState(LockState.SemiLocked);
  }

  isUnlockable() {
    return this.isLocked() || this.isSemiLocked();
  }

  isUnlocked() {
    return this.hasState(LockState.Unlocked);
  }

  isUpdating() {
    return this.hasState(LockState.Updating);
  }

  /*
  | Listener functions
  */

  // Register capability listeners
  registerCapabilityListeners() {
    this.registerCapabilityListener('locked', this.onCapabilityLocked.bind(this));
    this.registerCapabilityListener('open', this.onCapabilityOpen.bind(this));

    this.log('Capability listeners registered');
  }

  /*
  | Support functions
  */

  // Returns settings from given data
  getSettingsData(data) {
    const settings = {};

    // Status
    if ('status' in data) {
      settings.status = data.status;

      if (this.getStoreValue('connected_via_bridge')) {
        settings.status = this.homey.__('setting.connected_via_bridge');
      }
    }

    if (!('deviceSettings' in data)) {
      return settings;
    }

    // Device settings
    const device = data.deviceSettings;

    if ('autoLockEnabled' in device) {
      settings.auto_lock_enabled = device.autoLockEnabled;
    }

    if ('buttonLockEnabled' in device) {
      settings.button_lock_enabled = device.buttonLockEnabled;
    }

    if ('buttonUnlockEnabled' in device) {
      settings.button_unlock_enabled = device.buttonUnlockEnabled;
    }

    if ('postponedLockEnabled' in device) {
      settings.postponed_lock_enabled = device.postponedLockEnabled;
    }

    if ('postponedLockDelay' in device) {
      settings.postponed_lock_delay = device.postponedLockDelay;
    }

    return settings;
  }

  // Remove or add "open" capability
  toggleOpenCapability(pullSpringEnabled) {
    // Remove capability
    if (this.hasCapability('open') && !pullSpringEnabled) {
      this.log('Pull spring is disabled, removing "open" capability');

      this.removeCapability('open').catch(this.error);
    }

    // Add capability
    if (!this.hasCapability('open') && pullSpringEnabled) {
      this.log('Pull spring is enabled, adding "open" capability');

      this.addCapability('open').catch(this.error);
    }
  }

  // Trigger flows
  async triggerFlows(data) {
    if (!('state' in data)) return;

    const state = this.getStoreValue('state');

    // State not changed
    if (data.state === state) return;

    // Initial state was empty
    if (blank(state)) return;

    // Trigger pulled (open)
    if (data.state !== LockState.Pulled) return;

    let device = this;

    // Wait for driver
    await this.driver.ready();

    this.log('Trigger pulled');

    this.driver.lockPulled.trigger(device).catch(this.error);

    device = null;
  }

}

module.exports = LockDevice;
