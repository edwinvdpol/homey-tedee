'use strict';

const Device = require('/lib/Device');

class BridgeDevice extends Device {

  /**
   * Set device availability.
   *
   * @async
   * @param {object} deviceData
   * @returns {Promise<void>}
   */
  async setAvailability(deviceData) {
    await super.setAvailability(deviceData);

    // Set available if currently not available
    if (!this.getAvailable()) {
      await this.setAvailable();
    }
  }

}

module.exports = BridgeDevice;
