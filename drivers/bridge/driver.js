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
      status: device.isConnected ? this.homey.__('setting.connected') : this.homey.__('setting.disconnected'),
      local_api_enabled: device.localApiEnabled,
      firmware_version: device.softwareVersions[0].version,
      serial_number: device.serialNumber,
      mac_address: device.macAddress,
      access_level: this.homey.__(`access_level.${device.accessLevel}`) || '-',
    };
  }

}

module.exports = BridgeDriver;
