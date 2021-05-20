'use strict';

const Device = require('/lib/Device');

class BridgeDevice extends Device {

  /**
   * Bridge initialized.
   *
   * @async
   * @returns {Promise<void>}
   */
  async onOAuth2Init() {
    this.log('Bridge initialized');

    // Initial data
    this.idle = true;

    // Set tedee ID
    this.tedeeId = Number(this.getSetting('tedee_id'));

    // Register event listeners
    this.on('full', this.onFull.bind(this));

    // Emit full update event
    this.emit('full');
  }

}

module.exports = BridgeDevice;
