'use strict';

const { OAuth2Device } = require('homey-oauth2app');
const { filled, blank } = require('./Utils');

class Device extends OAuth2Device {

  /*
  | Device events
  */

  // Device added
  async onOAuth2Added() {
    this.log('Added');
  }

  // Device deleted
  async onOAuth2Deleted() {
    this.log('Deleted');
  }

  // Device initialized
  async onOAuth2Init() {
    // Wait for application
    await this.homey.ready();

    // Register services
    await this.homey.app.registerServices();

    // Synchronize device
    await this.sync();

    this.log('Initialized');
  }

  // Device destroyed
  async onOAuth2Uninit() {
    this.log('Destroyed');
  }

  /*
  | Synchronization functions
  */

  // Synchronize
  async sync() {
    let result;

    try {
      this.log('[Sync] Get device from API');
      result = await this.oAuth2Client.getDevice(this.driver.id, this.getSetting('tedee_id'));

      await this.handleSyncData(result, 'sync');
    } catch (err) {
      this.error('[Sync]', err.toString());
      this.setUnavailable(err.message).catch(this.error);
    } finally {
      result = null;
    }
  }

  // Handle sync data
  async handleSyncData(raw, trigger) {
    if (blank(raw)) return;

    this.log('[Sync]', JSON.stringify(raw));

    let data;

    try {
      data = await this.getParsedData(raw);

      await this.triggerFlows(data);
      await this.setNewSettings(data);
      await this.setCapabilities(data);
      await this.setAvailability(data);

      this.setAvailable().catch(this.error);
    } catch (err) {
      this.error('[Sync]', err.message);
      this.setUnavailable(err.message).catch(this.error);
    } finally {
      data = null;
    }
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

  /*
  | Support functions
  */

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

  // Trigger flows
  async triggerFlows(data) {
    // ...
  }

  // Log and throw error
  async throwError(message, locale) {
    this.error(message);

    throw new Error(this.homey.__(locale));
  }

}

module.exports = Device;
