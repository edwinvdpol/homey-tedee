'use strict';

const Device = require('../../lib/Device');

class BridgeDevice extends Device {

  /*
  | Support functions
  */

  // Returns settings from given data
  getSettingsData(data) {
    const settings = {};

    // Set connected status
    if ('isConnected' in data) {
      settings.status = data.isConnected
        ? this.homey.__('settings.connected')
        : this.homey.__('settings.disconnected');
    }

    return settings;
  }

}

module.exports = BridgeDevice;
