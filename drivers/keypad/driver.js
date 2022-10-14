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
      serial_number: device.serialNumber,
    };
  }

  // Return store value while pairing
  getPairStore(device) {
    return {};
  }

}

module.exports = KeypadDriver;
