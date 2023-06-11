'use strict';

const Device = require('../../lib/Device');
const { filled } = require('../../lib/Utils');

class BridgeDevice extends Device {

  /*
  | Synchronization functions
  */

  // Set availability
  async setAvailability(data) {
    // Updating
    if (filled(data.isUpdating) && data.isUpdating) {
      throw new Error(this.homey.__('state.updating'));
    }

    // Disconnected
    if (filled(data.isConnected) && !data.isConnected) {
      if (this.getAvailable()) {
        this.log('[Availability] Disconnected');
      }

      throw new Error(this.homey.__('state.disconnected'));
    }
  }

  /*
  | Support functions
  */

  // Returns settings from given data
  getSettingsData(data) {
    const settings = {};

    // Set connected status
    if (filled(data.isConnected)) {
      settings.status = data.isConnected
        ? this.homey.__('settings.connected')
        : this.homey.__('settings.disconnected');
    }

    return settings;
  }

}

module.exports = BridgeDevice;
