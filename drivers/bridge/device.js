'use strict';

const Device = require('/lib/Device');

class BridgeDevice extends Device {

  /*
  |-----------------------------------------------------------------------------
  | Bridge events
  |-----------------------------------------------------------------------------
  */

  // Bridge initialized
  async _onOAuth2Init() {
    // Get bridge data from tedee API
    const deviceData = await this.oAuth2Client.getBridge(this.tedeeId);

    // Sync bridge
    return this._syncDevice(deviceData);
  }

  /*
  |-----------------------------------------------------------------------------
  | Bridge actions
  |-----------------------------------------------------------------------------
  */

  // Sync
  async _syncDevice(deviceData) {
    // Connected capability
    if (deviceData.hasOwnProperty('isConnected')) {
      this.setCapabilityValue('connected', deviceData.isConnected).catch(this.error);
    }

    // Update available capability (only full update)
    if (deviceData.hasOwnProperty('softwareVersions')) {
      this.setCapabilityValue('update_available', deviceData.softwareVersions[0].updateAvailable).catch(this.error);
    }
  }

  // Availability
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
