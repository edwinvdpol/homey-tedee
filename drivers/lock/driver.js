'use strict';

const Driver = require('../../lib/Driver');

class LockDriver extends Driver {

  /*
  | Driver events
  */

  // Driver initialized
  async onOAuth2Init() {
    // Register device flow cards
    this.registerDeviceFlowCards();

    // Initialise parent driver
    await super.onOAuth2Init();
  }

  /*
  | Pairing functions
  */

  // Return settings value while pairing
  getPairSettings(device) {
    return {
      status: device.isConnected ? this.homey.__('connected') : this.homey.__('disconnected'),
      tedee_id: `${device.id}`,
      firmware_version: device.softwareVersions[0].version,
      serial_number: device.serialNumber,
      mac_address: device.macAddress,
      auto_lock_enabled: device.deviceSettings.autoLockEnabled,
      button_lock_enabled: device.deviceSettings.buttonLockEnabled,
      button_unlock_enabled: device.deviceSettings.buttonUnlockEnabled,
    };
  }

  // Return store value while pairing
  getPairStore(device) {
    return {
      pull_spring_enabled: device.deviceSettings.pullSpringEnabled,
    };
  }

  /*
  | Flow cards functions
  */

  // Register device flow cards
  registerDeviceFlowCards() {
    // When lock was opened ...
    this.lockOpened = this.homey.flow.getDeviceTriggerCard('opened');
  }

  // Opened flow trigger
  triggerOpened(lock) {
    if (!lock.hasCapability('open')) {
      return;
    }

    this.lockOpened.trigger(lock, {}).then().catch(lock.error);
  }

}

module.exports = LockDriver;
