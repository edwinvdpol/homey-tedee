'use strict';

const Driver = require('../../lib/Driver');

class BridgeDriver extends Driver {

  /*
  | Pairing functions
  */

  // Return settings value while pairing
  getPairSettings(device) {
    return {
      tedee_id: `${device.id}`,
      status: device.isConnected ? this.homey.__('settings.connected') : this.homey.__('settings.disconnected'),
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
