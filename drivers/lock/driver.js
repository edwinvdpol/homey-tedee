'use strict';

const {OAuth2Driver} = require('homey-oauth2app');

class LockDriver extends OAuth2Driver {

  /**
   * Initialized.
   */
  async onOAuth2Init() {
    // Register flow card when lock opened ...
    this._lockOpened = this.homey.flow.getDeviceTriggerCard('opened');
  }

  /**
   * Pair devices.
   */
  async onPairListDevices({oAuth2Client}) {
    this.log(`Listing locks`);

    const availableDevices = await oAuth2Client.getDevicesDetails('lock');

    let devices = [];

    // Loop available devices
    availableDevices.forEach(device => {
      devices.push({
        name: device.name,
        data: {
          id: device.serialNumber
        },
        store: {
          pull_spring_enabled: device.deviceSettings.pullSpringEnabled ? 'on' : 'off'
        },
        settings: {
          status: device.isConnected ? this.homey.__('connected') : this.homey.__('disconnected'),
          tedee_id: String(device.id),
          firmware_version: String(device.softwareVersions[0].version),
          serial_number: String(device.serialNumber),
          mac_address: String(device.macAddress),
          auto_lock_enabled: device.deviceSettings.autoLockEnabled ? 'on' : 'off',
          button_lock_enabled: device.deviceSettings.buttonLockEnabled ? 'on' : 'off',
          button_unlock_enabled: device.deviceSettings.buttonUnlockEnabled ? 'on' : 'off'
        }
      });
    });

    return devices;
  }

  /**
   * Opened trigger.
   */
  triggerOpened(lock) {
    if (lock.alreadyTriggered('opened')) {
      return;
    }

    this._lockOpened.trigger(lock, {})
        .then(() => lock.addTriggered('opened'))
        .catch(this.error);
  }

}

module.exports = LockDriver;
