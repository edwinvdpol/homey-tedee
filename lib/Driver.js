'use strict';

const {OAuth2Driver} = require('homey-oauth2app');

class Driver extends OAuth2Driver {

  // Driver initialized
  async onOAuth2Init() {
    this.log('Driver initialized (oAuth2)');
  }

  // Pair devices
  async onPairListDevices({oAuth2Client}) {
    this.log(`Listing ${this.id}s`);

    // Fetch all devices from tedee API
    const availableDevices = await oAuth2Client.getDevicesDetails(this.id);

    // Define empty device list
    let devices = [];

    // Loop available devices
    availableDevices.forEach(device => {
      let store = {}
      let settings = {
        status: device.isConnected ? this.homey.__('connected') : this.homey.__('disconnected'),
        tedee_id: String(device.id),
        firmware_version: String(device.softwareVersions[0].version),
        serial_number: String(device.serialNumber),
        mac_address: String(device.macAddress)
      }

      // Lock settings and store
      if (this.id === 'lock') {
        settings.auto_lock_enabled = device.deviceSettings.autoLockEnabled ? 'on' : 'off';
        settings.button_lock_enabled = device.deviceSettings.buttonLockEnabled ? 'on' : 'off';
        settings.button_unlock_enabled = device.deviceSettings.buttonUnlockEnabled ? 'on' : 'off';

        store.pull_spring_enabled = device.deviceSettings.pullSpringEnabled ? 'on' : 'off';
      }

      // Add device to device list
      devices.push({
        name: device.name,
        data: {
          id: device.serialNumber
        },
        store: store,
        settings: settings
      });
    });

    return devices;
  }

}

module.exports = Driver;
