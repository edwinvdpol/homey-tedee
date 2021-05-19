'use strict';

const Device = require('/lib/Device');

class BridgeDevice extends Device {

  /*
  |-----------------------------------------------------------------------------
  | Bridge events
  |-----------------------------------------------------------------------------
  */

  /**
   * Bridge initialized.
   *
   * @async
   * @returns {Promise<void>}
   * @private
   */
  async _onOAuth2Init() {
    // Get bridge data from tedee API
    const deviceData = await this.oAuth2Client.getBridge(this.tedeeId);

    // Sync bridge
    await this._syncDevice(deviceData);
  }

  /*
  |-----------------------------------------------------------------------------
  | Bridge actions
  |-----------------------------------------------------------------------------
  */

  /**
   * Sync bridge.
   *
   * @async
   * @param {object} deviceData
   * @returns {Promise<void>}
   * @private
   */
  async _syncDevice(deviceData) {
    // Connected capability
    if (deviceData.hasOwnProperty('isConnected')) {
      await this.setCapabilityValue('connected', deviceData.isConnected);
    }

    // Update available capability (only full update)
    if (deviceData.hasOwnProperty('softwareVersions')) {
      const updateAvailable = deviceData.softwareVersions[0].updateAvailable;
      const currentlyAvailable = await this.getCapabilityValue('update_available');

      // Update available message
      if (updateAvailable && !currentlyAvailable) {
        await this.setWarning(this.homey.__('state.updateAvailable'));
      }

      // Remove update available message if needed
      if (!updateAvailable && currentlyAvailable) {
        await this.unsetWarning();
      }

      await this.setCapabilityValue('update_available', updateAvailable);
    }
  }

  /**
   * Availability.
   *
   * @async
   * @param {object} deviceData
   * @returns {Promise<any>}
   * @private
   */
  async _setAvailability(deviceData) {
    // Disconnected
    if (deviceData.hasOwnProperty('isConnected') && !deviceData.isConnected) {
      return this.setUnavailable(this.homey.__('state.disconnected'));
    }

    // Updating
    if (deviceData.hasOwnProperty('isUpdating') && deviceData.isUpdating) {
      return this.setUnavailable(this.homey.__('state.updating'));
    }

    // Set available if currently not available
    if (!this.getAvailable()) {
      await this.setAvailable();
    }
  }

}

module.exports = BridgeDevice;
