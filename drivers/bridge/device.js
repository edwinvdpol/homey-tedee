'use strict';

const Device = require('../../lib/Device');
const { filled } = require('../../lib/Utils');

class BridgeDevice extends Device {

  /*
  | Device events
  */

  // Settings changed
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log('[Settings] Updating');

    const settings = {};

    // Check availability
    if (!this.getAvailable()) {
      throw new Error(this.homey.__('state.notAvailable'));
    }

    for (const name of changedKeys) {
      const newValue = newSettings[name];

      this.log(`[Settings] '${name}' is now '${newValue}'`);

      // Local API enabled
      if (name === 'local_api_enabled') {
        settings.localApiEnabled = newValue;
      }
    }

    // Device settings need to be updated
    if (filled(settings)) {
      this.log('[Settings] Updating device');

      await this.oAuth2Client.updateSettings('bridge', this.tid, settings);
    }

    this.log('[Settings] Updated');
  }

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

    // Local API status
    if ('localApiEnabled' in data) {
      settings.local_api_enabled = data.localApiEnabled;
    }

    return settings;
  }

}

module.exports = BridgeDevice;
