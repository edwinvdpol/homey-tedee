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

    await this.homey.app.registerServices();

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
      const result = await this.oAuth2Client.getDevice(this.driver.id, this.getSetting('tedee_id'));

      await this.handleSyncData(result);
    } catch (err) {
      this.error(err.message);
      this.setUnavailable(err.message).catch(this.error);
    }
  }

  // Handle sync data
  async handleSyncData(raw) {
    this.log('[Sync]', JSON.stringify(raw));

    try {
      const data = await this.getParsedData(raw);

      await this.setNewSettings(data);
      await this.setCapabilities(data);
      await this.setAvailability(data);

      this.setAvailable().catch(this.error);
    } catch (err) {
      this.error('Sync data error:', err.message);
      this.setUnavailable(err.message).catch(this.error);
    }
  }

  // Return parsed data
  async getParsedData(data) {
    // Connected
    if (filled(data.isConnected)) {
      data.isConnected = !!data.isConnected;
    }

    // Lock properties
    if (filled(data.lockProperties)) {
      const lock = data.lockProperties;

      // Battery level
      if (filled(lock.batteryLevel)) {
        data.batteryLevel = Number(lock.batteryLevel);
      }

      // Charging
      if (filled(lock.isCharging)) {
        data.isCharging = !!lock.isCharging;
      }

      // Lock state
      if (filled(lock.state)) {
        data.state = Number(lock.state);
      }
    }

    // Software versions
    if (Array.isArray(data.softwareVersions)) {
      const software = data.softwareVersions[0];

      // Firmware version
      if (filled(software.version)) {
        data.firmwareVersion = software.version;
      }

      // Update available
      if (filled(software.updateAvailable)) {
        data.updateAvailable = !!software.updateAvailable;
      }
    }

    // Updating
    if (filled(data.isUpdating)) {
      data.isUpdating = !!data.isUpdating;
    }

    return data;
  }

  // Set capabilities
  async setCapabilities(data) {
    // Connected
    if (filled(data.isConnected)) {
      this.setCapabilityValue('connected', data.isConnected).catch(this.error);
    }

    // Update available
    if (filled(data.updateAvailable)) {
      this.setCapabilityValue('update_available', data.updateAvailable).catch(this.error);

      if (data.updateAvailable) {
        this.setWarning(this.homey.__('state.updateAvailable')).catch(this.error);
      } else {
        this.unsetWarning().catch(this.error);
      }
    }
  }

  // Set new settings
  async setNewSettings(data) {
    const newSettings = {};

    // Set firmware version
    if (filled(data.firmwareVersion)) {
      newSettings.firmware_version = data.firmwareVersion;
    }

    // Merge settings
    const settings = Object.assign(newSettings, this.getSettingsData(data));

    // Update settings
    this.setSettings(settings).catch(this.error);
  }

}

module.exports = Device;
