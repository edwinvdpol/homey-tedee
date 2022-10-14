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

  /*
  | Pairing functions
  */

  // Pair devices
  async onPairListDevices({ oAuth2Client }) {
    this.log(`Listing ${this.id}s`);

    const devices = await oAuth2Client.discoverDevices(this.id);

    return devices.map((device) => this.getDeviceData(device)).filter((e) => e);
  }

  // Get data to create the device
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

}

module.exports = Driver;
