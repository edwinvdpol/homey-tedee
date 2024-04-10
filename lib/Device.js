'use strict';

const { OAuth2Device } = require('homey-oauth2app');
const { blank } = require('./Utils');

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
    // Unregister event listeners
    this.unregisterEventListeners();

    this.log('Deleted');
  }

  // Device initialized
  async onOAuth2Init() {
    this.tid = Number(this.getSetting('tedee_id'));

    // Register event listeners
    this.registerEventListeners();

    // Wait for application
    await this.homey.ready();

    // Synchronize
    await this.homey.app.sync(this.getData().id);

    this.log('Initialized');
  }

  // Device destroyed
  async onOAuth2Uninit() {
    // Unregister event listeners
    this.unregisterEventListeners();

    this.log('Destroyed');
  }

  /*
  | Synchronization functions
  */

  // Webhook message
  async webhook(data) {
    if (this.tid !== Number(data.id)) return;

    // Synchronize device when received settings updated event
    if ('event' in data && data.event === 'device-settings-changed') {
      await this.homey.app.sync();

      return;
    }

    // Synchronize
    await this.sync(data);
  }

  // Synchronize
  async sync(data = null) {
    const { id } = this.getData();

    if (data === null) {
      data = this.homey.app.devices[id] || {};
    }

    try {
      if (blank(data)) {
        throw new Error(this.homey.__('error.404'));
      }

      this.log('[Sync]', JSON.stringify(data));

      data = await this.getParsedData(data);

      await this.triggerFlows(data);
      await this.setStore(data);
      await this.setCapabilities(data);
      await this.setNewSettings(data);
      await this.setAvailability(data);
      await this.setWarningMessage(data);

      this.setAvailable().catch(this.error);
    } catch (err) {
      this.error('[Sync]', err.toString());
      this.unsetWarning().catch(this.error);
      this.setUnavailable(err.message).catch(this.error);
    } finally {
      data = null;
    }
  }

  // Set availability
  async setAvailability(data) {
    // Disconnected
    if ('isConnected' in data && !data.isConnected) {
      throw new Error(this.homey.__('state.disconnected'));
    }

    // Updating
    if ('isUpdating' in data && data.isUpdating) {
      throw new Error(this.homey.__('state.updating'));
    }
  }

  // Set capabilities
  async setCapabilities(data) {
    // Connected
    if (this.hasCapability('connected') && 'isConnected' in data) {
      this.setCapabilityValue('connected', data.isConnected).catch(this.error);
    }

    // Update available
    if (this.hasCapability('update_available') && 'updateAvailable' in data) {
      this.setCapabilityValue('update_available', data.updateAvailable).catch(this.error);
    }

    // Battery level
    if (this.hasCapability('measure_battery') && 'batteryLevel' in data) {
      this.setCapabilityValue('measure_battery', data.batteryLevel).catch(this.error);
    }

    // Charging
    if (this.hasCapability('charging') && 'isCharging' in data) {
      this.setCapabilityValue('charging', data.isCharging).catch(this.error);
    }
  }

  // Set new settings
  async setNewSettings(data) {
    const newSettings = {};

    // Access level
    if ('accessLevel' in data) {
      newSettings.access_level = data.accessLevel;
    }

    // Firmware version
    if ('firmwareVersion' in data) {
      newSettings.firmware_version = data.firmwareVersion;
    }

    // Merge settings
    const settings = Object.assign(newSettings, this.getSettingsData(data));

    // Update settings
    this.setSettings(settings).catch(this.error);
  }

  // Set store values
  async setStore(data) {
    // ...
  }

  // Set warning message
  async setWarningMessage(data) {
    // Update available
    if ('updateAvailable' in data && data.updateAvailable) {
      this.setWarning(this.homey.__('warning.update_available')).catch(this.error);

      return;
    }

    // Remove warning
    this.unsetWarning().catch(this.error);
  }

  /*
  | Listener functions
  */

  // Register event listeners
  registerEventListeners() {
    if (!this.onSync) {
      this.onSync = this.sync.bind(this);
      this.homey.on('sync', this.onSync);
    }

    if (!this.onWebhook) {
      this.onWebhook = this.webhook.bind(this);
      this.homey.on('webhook', this.onWebhook);
    }
  }

  // Unregister event listeners
  unregisterEventListeners() {
    if (this.onSync) {
      this.homey.off('sync', this.onSync);
      this.onSync = null;
    }

    if (this.onWebhook) {
      this.homey.off('webhook', this.onWebhook);
      this.onWebhook = null;
    }
  }

  /*
  | Support functions
  */

  // Return parsed data
  async getParsedData(data) {
    // Access level
    if ('accessLevel' in data) {
      data.accessLevel = this.homey.__(`access_level.${data.accessLevel}`) || '-';
    }

    // Connected
    if ('isConnected' in data && data.isConnected === null) {
      delete data.isConnected;
    }

    if ('isConnected' in data) {
      data.isConnected = !!data.isConnected;

      data.status = data.isConnected
        ? this.homey.__('setting.connected')
        : this.homey.__('setting.disconnected');
    }

    // Lock properties
    if ('lockProperties' in data) {
      const lock = data.lockProperties;

      // Battery level
      if ('batteryLevel' in lock) {
        data.batteryLevel = Number(lock.batteryLevel);
      }

      // Charging
      if ('isCharging' in lock) {
        data.isCharging = !!lock.isCharging;
      }

      // Lock state
      if ('state' in lock) {
        data.state = Number(lock.state);
      }
    }

    // Software versions
    if ('softwareVersions' in data && Array.isArray(data.softwareVersions)) {
      const software = data.softwareVersions[0];

      // Firmware version
      if ('version' in software) {
        data.firmwareVersion = software.version;
      }

      // Update available
      if ('updateAvailable' in software) {
        data.updateAvailable = !!software.updateAvailable;
      }
    }

    // Updating
    if ('isUpdating' in data) {
      data.isUpdating = !!data.isUpdating;
    }

    return data;
  }

  // Trigger flows
  async triggerFlows(data) {
    // ...
  }

  // Log and throw error
  throwError(message, locale) {
    this.error(message);

    throw new Error(this.homey.__(locale));
  }

}

module.exports = Device;
