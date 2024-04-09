'use strict';

const Driver = require('../../lib/Driver');

class KeypadDriver extends Driver {

  /*
  | Pairing functions
  */

  // Return settings value while pairing
  getPairSettings(device) {
    return {
      tedee_id: `${device.id}`,
      firmware_version: device.softwareVersions[0].version,
      serial_number: device.serialNumber,
      access_level: this.homey.__(`accessLevel.${device.accessLevel}`) || '-',
    };
  }

  // Return store value while pairing
  getPairStore(device) {
    return {};
  }

}

module.exports = KeypadDriver;
