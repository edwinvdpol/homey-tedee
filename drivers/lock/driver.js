'use strict';

const Driver = require('../../lib/Driver');
const { filled } = require('../../lib/Utils');

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
      tedee_id: `${device.id}`,
      status: device.isConnected ? this.homey.__('setting.connected') : this.homey.__('setting.disconnected'),
      firmware_version: device.softwareVersions[0].version,
      serial_number: device.serialNumber,
      mac_address: device.macAddress,
      auto_lock_enabled: device.deviceSettings.autoLockEnabled,
      button_lock_enabled: device.deviceSettings.buttonLockEnabled,
      button_unlock_enabled: device.deviceSettings.buttonUnlockEnabled,
      postponed_lock_enabled: device.deviceSettings.postponedLockEnabled,
      postponed_lock_delay: device.deviceSettings.postponedLockDelay,
      access_level: this.homey.__(`access_level.${device.accessLevel}`) || '-',
    };
  }

  // Return store value while pairing
  getPairStore(device) {
    return {
      connected_via_bridge: filled(device.connectedToId),
      pull_spring_enabled: device.deviceSettings.pullSpringEnabled,
    };
  }

  /*
  | Flow cards functions
  */

  // Register device flow cards
  registerDeviceFlowCards() {
    // When lock was pulled ...
    this.lockPulled = this.homey.flow.getDeviceTriggerCard('pulled');
  }

}

module.exports = LockDriver;
