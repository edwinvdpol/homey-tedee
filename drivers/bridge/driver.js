'use strict';

const {OAuth2Driver} = require('homey-oauth2app');

class BridgeDriver extends OAuth2Driver {

  /**
   * Pair devices.
   */
  async onPairListDevices({oAuth2Client}) {
    this.log(`Listing bridges`);

    const availableDevices = await oAuth2Client.getDevicesDetails('bridge');

    let devices = [];

    // Loop available devices
    availableDevices.forEach(device => {
      devices.push({
        name: device.name,
        data: {
          id: device.serialNumber
        },
        settings: {
          status: device.isConnected ? this.homey.__('connected') : this.homey.__('disconnected'),
          tedee_id: String(device.id),
          firmware_version: String(device.softwareVersions[0].version),
          serial_number: String(device.serialNumber),
          mac_address: String(device.macAddress)
        }
      });
    });

    return devices;
  }

}

module.exports = BridgeDriver;
