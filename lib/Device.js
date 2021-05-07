'use strict';

const {OAuth2Device} = require('homey-oauth2app');

class Device extends OAuth2Device {

  /*
  |-----------------------------------------------------------------------------
  | Device events
  |-----------------------------------------------------------------------------
  */

  // Device initialized
  async onOAuth2Init() {
    this.log('Device initialized');

    this.tedeeId = Number(this.getSetting('tedee_id'));

    // Reset device state and timers
    await this.resetState();

    // Initialize and sync sub device
    await this._onOAuth2Init();

    // Register capability listeners
    this._registerCapabilityListeners();

    // Register event listeners
    this.homey.on('sync_devices', this.onSyncDevices.bind(this));
  }

  // Device saved
  async onOAuth2Saved() {
    this.log('Device saved');
  }

  // Device uninitialized
  async onOAuth2Uninit() {
    this.log('Device uninitialized');
  }

  // Device deleted
  async onOAuth2Deleted() {
    this.log('Device deleted');

    // Verify timers
    await this.homey.app.verifyTimers();
  }

  // Sync devices
  async onSyncDevices(devices) {
    devices.forEach(deviceData => {
      if (deviceData.id !== this.tedeeId) {
        return;
      }

      // Make sure the device is idle, else skip this update
      if (this.isBusy()) {
        this.log('Device is busy, skip update...');

        return;
      }

      // Set device settings
      this._setSettings(deviceData);

      // Set device availability
      this._setAvailability(deviceData);

      // Sync device specific data
      this._syncDevice(deviceData).catch(this.error);
    });
  }

  /*
  |-----------------------------------------------------------------------------
  | Device status functions
  |-----------------------------------------------------------------------------
  */

  // Set device to busy
  setBusy() {
    if (this.isBusy()) {
      return;
    }

    this.idle = false;

    this.log('Device is now busy');
  }

  // Set device to idle
  setIdle() {
    if (this.isIdle()) {
      return;
    }

    this.idle = true;

    this.log('Device is now idle');
  }

  // Return if device is busy
  isBusy() {
    return ! this.isIdle();
  }

  // Return if device is idle
  isIdle() {
    return this.idle;
  }

  // Reset device state and timers
  async resetState() {
    // Reset open capability
    if (this.hasCapability('open')) {
      this.setCapabilityValue('open', false).catch(this.error);
    }

    await this.cleanup();
    this.setIdle();
  }

  // Cleanup triggered flows and state monitor
  async cleanup() {
    this.log('Cleanup triggers and timers');

    this.flowsTriggered = {};

    if (this.stateMonitor) {
      this.homey.clearInterval(this.stateMonitor);

      this.log('State monitor stopped');
    }

    if (this.operationMonitor) {
      this.homey.clearInterval(this.operationMonitor);

      this.log('Operation monitor stopped');
    }

    this.stateMonitor = null;
    this.operationMonitor = null;
  }

  /*
  |-----------------------------------------------------------------------------
  | Device actions
  |-----------------------------------------------------------------------------
  */

  // Register capability listeners
  _registerCapabilityListeners() {
    // Connected capability listener
    if (this.hasCapability('connected')) {
      this.registerCapabilityListener('connected', this.onCapabilityConnected.bind(this));
    }

    // Charging capability listener
    if (this.hasCapability('charging')) {
      this.registerCapabilityListener('charging', this.onCapabilityCharging.bind(this));
    }

    // Update available capability listener
    if (this.hasCapability('update_available')) {
      this.registerCapabilityListener('update_available', this.onCapabilityUpdateAvailable.bind(this));
    }

    // Lock capability listener
    if (this.hasCapability('locked')) {
      this.registerCapabilityListener('locked', this.onCapabilityLocked.bind(this));
    }

    // Open capability listener
    if (this.hasCapability('open')) {
      this.registerCapabilityListener('open', this.onCapabilityOpen.bind(this));
    }
  }

  // Set device settings
  async _setSettings(deviceData) {
    // New settings object
    let settings = {}

    // Set connected status
    if (deviceData.hasOwnProperty('isConnected')) {
      settings.status = deviceData.isConnected ? this.homey.__('connected') : this.homey.__('disconnected');
    }

    // Set firmware version
    if (deviceData.hasOwnProperty('softwareVersions')) {
      settings.firmware = String(deviceData.softwareVersions[0].version);
    }

    // Set auto lock
    if (deviceData.hasOwnProperty('deviceSettings')) {
      settings.auto_lock_enabled = deviceData.deviceSettings.autoLockEnabled ? 'on' : 'off';
    }

    // Update device settings
    return this.setSettings(settings);
  }

  /*
  |-----------------------------------------------------------------------------
  | Capabilities
  |-----------------------------------------------------------------------------
  */

  // This method will be called when connected is changed
  onCapabilityConnected(connected) {
    const currentValue = this.getCapabilityValue('connected');

    // Skip when old- and new values are the same
    if (currentValue === connected) {
      return;
    }

    this.setCapabilityValue('connected', connected).catch(this.error);

    // Connected status was unknown
    if (currentValue == null) {
      return connected;
    }

    if (connected) {
      return this.log('Connection was established');
    }

    return this.log('Connection was lost');
  }

  // This method will be called when charging changed
  onCapabilityCharging(charging) {
    const currentValue = this.getCapabilityValue('charging');

    // Skip when old- and new values are the same
    if (currentValue === charging) {
      return;
    }

    this.setCapabilityValue('charging', charging).catch(this.error);

    // Charging status was unknown
    if (currentValue == null) {
      return charging;
    }

    if (charging) {
      return this.log('Lock is charging');
    }

    return this.log('Lock is charged');
  }

  // This method will be called when locked changed
  onCapabilityLocked(lock) {
    const currentValue = this.getCapabilityValue('locked');

    // Skip when old- and new values are the same
    if (currentValue === lock) {
      return;
    }

    this.setCapabilityValue('locked', lock).catch(this.error);

    // Lock the lock
    if (lock) {
      return this.lock();
    }

    // Unlock the lock
    return this.unlock();
  }

  // This method will be called when open changed
  onCapabilityOpen(open) {
    const currentValue = this.getCapabilityValue('open');

    // Skip when old- and new values are the same
    if (currentValue === open) {
      return;
    }

    this.setCapabilityValue('open', open).catch(this.error);

    // Open lock
    if (open) {
      return this.open();
    }
  }

  // This method will be called when update available changed
  onCapabilityUpdateAvailable(available) {
    const currentValue = this.getCapabilityValue('update_available');

    // Skip when old- and new values are the same
    if (currentValue === available) {
      return;
    }

    this.setCapabilityValue('update_available', available).catch(this.error);

    // Update available status was unknown
    if (currentValue == null) {
      return available;
    }

    if (available) {
      return this.log('Update is available');
    }

    return this.log('Update is not available');
  }

  /*
  |-----------------------------------------------------------------------------
  | Trigger helpers
  |-----------------------------------------------------------------------------
  */

  // Add trigger to triggered list
  addTriggered(trigger) {
    this.flowsTriggered[trigger] = true;
  }

  // Return if given flow is already triggered
  alreadyTriggered(trigger) {
    return this.flowsTriggered.hasOwnProperty(trigger);
  }

}

module.exports = Device;
