'use strict';

const { OAuth2Device } = require('homey-oauth2app');
const { filled } = require('./Utils');

class Device extends OAuth2Device {

  /*
  | Device events
  */

  // Device initialized
  async onOAuth2Init() {
    await this.sync();

    await this.homey.app.registerServices(this.driver.id);

    this.log('Initialized');
  }

  // Device deleted
  async onOAuth2Deleted() {
    this.log('Deleted');
  }

  /*
  | Synchronization functions
  */

  // Synchronize
  async sync() {
    try {
      const result = await this.getSyncData(true);

      await this.handleSyncData(result);
    } catch (err) {
      this.error(err.message);
      this.setUnavailable(err.message).catch(this.error);
    }
  }

  // Handle sync data
  async handleSyncData(data) {
    this.log('[Sync]', JSON.stringify(data));

    try {
      await this.setNewSettings(data);
      await this.setCapabilities(data);
      await this.setAvailability(data);

      this.setAvailable().catch(this.error);
    } catch (err) {
      this.error(err.message);
      this.setUnavailable(err.message).catch(this.error);
    }
  }

  // Handle webhook data
  async handleWebhookData(data) {
    this.log('[Webhook]', JSON.stringify(data));

    const converted = {};

    // Lock state
    if (filled(data.State)) {
      converted.lockProperties = {};
      converted.lockProperties.state = data.State;
    }

    // Connected
    if (filled(data.Connected)) {
      converted.isConnected = data.Connected;
    }

    // Battery level
    if (filled(data.BatteryLevel)) {
      converted.lockProperties = {};
      converted.lockProperties.batteryLevel = data.BatteryLevel;
    }

    await this.handleSyncData(converted);
  }

  // Set capabilities
  async setCapabilities(data) {
    // Connected
    if (filled(data.isConnected)) {
      this.setCapabilityValue('connected', !!data.isConnected).catch(this.error);
    }

    // Update available
    if (filled(data.softwareVersions)) {
      if (filled(data.softwareVersions[0].updateAvailable)) {
        const { updateAvailable } = data.softwareVersions[0];

        this.setCapabilityValue('update_available', updateAvailable).catch(this.error);

        if (updateAvailable) {
          this.setWarning(this.homey.__('state.updateAvailable')).catch(this.error);
        } else {
          this.unsetWarning().catch(this.error);
        }
      }
    }
  }

  // Set new settings
  async setNewSettings(data) {
    const newSettings = {};

    // Set firmware version
    if (filled(data.softwareVersions)) {
      const versions = data.softwareVersions;

      if (filled(versions[0].version)) {
        newSettings.firmware_version = data.softwareVersions[0].version;
      }
    }

    // Merge settings
    const settings = Object.assign(newSettings, this.getSettingsData(data));

    // Update settings
    this.setSettings(settings).catch(this.error);
  }

}

module.exports = Device;
