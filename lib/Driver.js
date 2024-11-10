'use strict';

const { OAuth2Driver } = require('homey-oauth2app');

class Driver extends OAuth2Driver {

  /*
  | Driver events
  */

  // Driver initialized
  async onOAuth2Init() {
    this.log('Initialized');
  }

  // Driver destroyed
  async onOAuth2Uninit() {
    this.log('Destroyed');
  }

  /*
  | Pairing functions
  */

  // Pair devices
  async onPairListDevices({ oAuth2Client }) {
    this.log(`Pairing ${this.id}s`);

    const devices = await oAuth2Client.discoverDevices(this.id);

    return devices.map((device) => this.getDeviceData(device)).filter((e) => e);
  }

  // Return data to create the device
  getDeviceData(device) {
    const data = {
      name: device.name,
      data: {
        id: device.serialNumber,
      },
      settings: this.getPairSettings(device),
      store: this.getPairStore(device),
    };

    this.log('Device found', JSON.stringify(data));

    return data;
  }

  // Return store value while pairing
  getPairStore(device) {
    return {};
  }

}

module.exports = Driver;
