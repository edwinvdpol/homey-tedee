'use strict';

const Device = require('../../lib/Device');

class BridgeDevice extends Device {

  // Set device availability
  async setAvailability(data) {
    super.setAvailability(data).catch(this.error);

    // Set available if currently not available
    if (!this.getAvailable()) {
      this.setAvailable().catch(this.error);
    }
  }

}

module.exports = BridgeDevice;
