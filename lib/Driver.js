'use strict';

const {OAuth2Driver} = require('homey-oauth2app');
const {DeviceType} = require('/lib/Enums');

class Driver extends OAuth2Driver {

  /*
  |-----------------------------------------------------------------------------
  | Driver initialization
  |-----------------------------------------------------------------------------
  */

  async onOAuth2Init() {
    this.log('Driver initialized');
  }

  /*
  |-----------------------------------------------------------------------------
  | Driver events
  |-----------------------------------------------------------------------------
  */

  // Pair devices
  async onPairListDevices({oAuth2Client}) {
    this.log(`Listing ${this.id}s`);

    // Fetch all devices from tedee API
    const availableDevices = await oAuth2Client.getDevicesDetails();

    // Define empty device list
    let devices = [];

    // Loop available devices
    availableDevices.forEach(device => {
      const type = device.type === DeviceType.Bridge ? 'bridge' : 'lock';

      if (type === this.id) {
        // All devices
        let settings = {
          status: device.isConnected ? this.homey.__('connected') : this.homey.__('disconnected'),
          tedee_id: String(device.id),
          firmware_version: String(device.softwareVersions[0].version),
          serial_number: String(device.serialNumber),
          mac_address: String(device.macAddress)
        }

        // Lock
        if (type === 'lock') {
          settings.auto_lock_enabled = device.deviceSettings.autoLockEnabled ? 'on' : 'off';
        }

        // Add device to device list
        devices.push({
          name: device.name,
          data: {
            id: device.serialNumber
          },
          settings: settings
        });
      }
    });

    return devices;
  }

}

module.exports = Driver;
