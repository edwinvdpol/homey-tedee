'use strict';

const Device = require('/lib/Device');

class BridgeDevice extends Device {

  /**
   * Device initialized.
   *
   * @async
   * @returns {Promise<void>}
   */
  async onOAuth2Init() {
    this.idle = true;
    this.name = this.driver.id.charAt(0).toUpperCase() + this.driver.id.slice(1);
    this.tedeeId = Number(this.getSetting('tedee_id'));

    await this.setUnavailable(this.homey.__('connecting'));

    // Register event listeners
    this.on('full', this.onFull.bind(this));

    // Full update event
    this.emit('full');
  }

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
