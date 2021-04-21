'use strict';

const {OAuth2Driver} = require('homey-oauth2app');

const {DeviceType} = require('/lib/Enums');

class Driver extends OAuth2Driver {

  /*
  |-----------------------------------------------------------------------------
  | Driver events
  |-----------------------------------------------------------------------------
  */

  // Pair devices
  async onPairListDevices({oAuth2Client}) {
    this.log(`Listing ${this.id}s`);

    // Fetch all devices from tedee API
    const availableDevices = await oAuth2Client.getDevices();

    // Define empty device list
    let devices = [];

    // Loop available devices
    availableDevices.forEach((device) => {
      const type = device.type === DeviceType.Bridge ? 'bridge' : 'lock';
      const status = device.isConnected ? this.homey.__('connected') : this.homey.__('disconnected');

      if (type === this.id) {
        devices.push({
          name: device.name,
          data: {
            id: device.serialNumber
          },
          settings: {
            status: status,
            tedee_id: String(device.id),
            firmware_version: String(device.softwareVersions[0].version),
            serial_number: String(device.serialNumber),
            mac_address: String(device.macAddress),
          }
        });
      }
    });

    return devices;
  }

}

module.exports = Driver;
