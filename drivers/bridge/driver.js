'use strict';

const Driver = require('../../lib/Driver');

class BridgeDriver extends Driver {

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
    };
  }

  // Return store value while pairing
  getPairStore(device) {
    return {};
  }

}

module.exports = BridgeDriver;
