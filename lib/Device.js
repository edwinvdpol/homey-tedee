'use strict';

const Homey = require('homey');
const {OAuth2Device} = require('homey-oauth2app');

class Device extends OAuth2Device {

  /*
  |-----------------------------------------------------------------------------
  | Device events
  |-----------------------------------------------------------------------------
  */

  // Device initialized
  async onOAuth2Init() {
    this.tedeeId = Number(this.getSetting('tedee_id'));

    // Reset device state and timers
    this.resetState();

    // Initialize and sync sub device
    await this._onOAuth2Init();

    // Register capability listeners
    this._registerCapabilityListeners();

    // Register event listeners
    this.homey.on('sync_devices', this.onSyncDevices.bind(this));
    this.homey.on('enable_devices', this.onEnableDevices.bind(this));
    this.homey.on('disable_devices', this.onDisableDevices.bind(this));
  }

  // Device deleted
  async onOAuth2Deleted() {
    this.log('Device deleted');
  }

  // Sync devices
  async onSyncDevices(devices) {
    devices.forEach((deviceData) => {
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

  // Enable devices
  async onEnableDevices() {
    await this.setAvailable();

    this.log('Device enabled');
  }

  // Disable devices
  async onDisableDevices(reason) {
    await this.setUnavailable(reason);

    this.log(`Device disabled: ${reason}`);
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
  resetState() {
    this.cleanup();
    this.setIdle();
  }

  // Cleanup triggered flows and state monitor
  cleanup() {
    this.flowsTriggered = {};

    if (this.stateMonitor) {
      this.homey.clearInterval(this.stateMonitor);

      this.log('State monitor stopped');
    }
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
      this.registerCapabilityListener('connected', async (connected) => {
        const currentValue = this.getCapabilityValue('connected');

        // Connected status was unknown or already connected
        if (currentValue == null || currentValue === connected) {
          return;
        }

        if (connected) {
          return this.log('Connection was established');
        }

        return this.log('Connection was lost');
      });
    }

    // Update available capability listener
    if (this.hasCapability('update_available')) {
      this.registerCapabilityListener('update_available', async (available) => {
        const currentValue = this.getCapabilityValue('update_available');

        // Update available status was unknown or already available
        if (currentValue == null || currentValue === available) {
          return;
        }

        if (available) {
          return this.log('Update is available');
        }
      });
    }

    // Charging capability listener
    if (this.hasCapability('charging')) {
      this.registerCapabilityListener('charging', async (charging) => {
        const currentValue = this.getCapabilityValue('charging');

        // Charging status was unknown, or the same as before
        if (currentValue == null || currentValue === charging) {
          return;
        }

        // Lock is charging
        if (charging) {
          return this.log('Lock is charging');
        }

        // Lock is charged
        return this.log('Lock is charged');
      });
    }

    // Lock capability listener
    if (this.hasCapability('locked')) {
      this.registerCapabilityListener('locked', async (lock) => {
        if (lock) {
          return this.lock();
        }

        return this.unlock();
      });
    }

    // Open capability listener
    if (this.hasCapability('open')) {
      this.registerCapabilityListener('open', async () => {
        return this.open();
      });
    }
  }

  // Set device settings
  async _setSettings(deviceData) {
    // Get current device settings
    const currentSettings = await this.getSettings();

    // Set current firmware version
    let firmware = currentSettings.firmware_version;

    // Set status
    const status = deviceData.isConnected ? this.homey.__('connected') : this.homey.__('disconnected');

    // Set firmware version if `softwareVersions` is available
    if (deviceData.hasOwnProperty('softwareVersions')) {
      firmware = String(deviceData.softwareVersions[0].version);
    }

    // Update device settings
    return this.setSettings({
      status: status,
      firmware_version: firmware
    })
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
