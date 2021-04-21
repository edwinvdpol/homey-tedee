'use strict';

const Homey = require('homey');
const {OAuth2App} = require('homey-oauth2app');
const Client = require('./lib/Client');

const syncLocksInterval = 10 * 1000; // 10 seconds
const refreshDevicesInterval = 10 * 60 * 1000; // 10 minutes

class Tedee extends OAuth2App {

  static OAUTH2_CLIENT = Client;
  // static OAUTH2_DEBUG = true;

  /*
  |-----------------------------------------------------------------------------
  | Application events
  |-----------------------------------------------------------------------------
  */

  // Application initialized
  async onOAuth2Init() {
    // The timers will be automagicly removed by Homey when unloading
    this.log('Starting timers');

    // Short interval for delta updates
    this.homey.setInterval(this._syncLocks.bind(this), syncLocksInterval);

    // Longer interval for full updates
    this.homey.setInterval(this._refreshDevices.bind(this), refreshDevicesInterval);

    // Register action- and condition flow cards
    await this._registerActionFlowCards();
    await this._registerConditionFlowCards();

    // Set API to available
    await this.setApiAvailable();

    // Register app event listeners
    this.homey.on('cpuwarn', () => {
      this.log('-- CPU warning! --');
    }).on('memwarn', () => {
      this.log('-- Memory warning! --');
    }).on('unload', () => {
      this.log('-- Unloaded! _o/ --');
    });
  }

  /*
  |-----------------------------------------------------------------------------
  | Application actions
  |-----------------------------------------------------------------------------
  */

  // Refresh devices (full update)
  async _refreshDevices() {
    return this._updateDevices('refresh');
  }

  // Sync locks (delta update)
  async _syncLocks() {
    return this._updateDevices('sync');
  }

  // Update devices by action
  async _updateDevices(action) {
    try {
      // Verify action
      if (action !== 'refresh' && action !== 'sync') {
        this.log(`Invalid action: ${action}`);

        return;
      }

      // Set oAuth client
      this.oAuth2Client = this.getFirstSavedOAuth2Client();

      let data;

      // Fetch requested data from tedee API
      if (action === 'refresh') {
        data = await this.oAuth2Client.getDevices();
      } else if (action === 'sync') {
        data = await this.oAuth2Client.getSyncLocks();
      }

      // Enable devices when API was unavailable
      if (this.apiIsUnavailable()) {
        await this.setApiAvailable();
      }

      // Emit the sync devices event
      this.homey.emit('sync_devices', data);
    } catch (err) {
      this.setApiUnavailable(err.message);
    }
  }

  /*
  |-----------------------------------------------------------------------------
  | Flow cards
  |-----------------------------------------------------------------------------
  */

  // Register action flow cards
  async _registerActionFlowCards() {
    // Register action flow card for pulling the spring
    this.homey.flow.getActionCard('open')
        .registerRunListener(async (args) => args.device.open());
  }

  // Register condition flow cards
  async _registerConditionFlowCards() {
    // Register condition flow card for charging
    this.homey.flow.getConditionCard('is_charging')
        .registerRunListener(async (args) => {
          return args.device.getCapabilityValue('charging');
        });

    // Register condition flow card for connected
    this.homey.flow.getConditionCard('is_connected')
        .registerRunListener(async (args) => {
          return args.device.getCapabilityValue('connected');
        });

    // Register condition flow card for update available
    this.homey.flow.getConditionCard('is_update_available')
        .registerRunListener(async (args) => {
          return args.device.getCapabilityValue('update_available');
        });
  }

  /*
  |-----------------------------------------------------------------------------
  | API availability
  |-----------------------------------------------------------------------------
  */

  // Return if API is available
  apiIsAvailable() {
    return this.apiAvailable
  }

  // Return if API is unavailable
  apiIsUnavailable() {
    return ! this.apiIsAvailable();
  }

  // Set API available and enable devices
  async setApiAvailable() {
    if (this.apiIsAvailable()) {
      return;
    }

    this.log('API is available');
    this.apiAvailable = true;

    // Emit the enable devices event
    this.homey.emit('enable_devices');
  }

  // Set API unavailable and disable devices
  setApiUnavailable(reason) {
    if (this.apiIsUnavailable()) {
      return;
    }

    this.log(`API is unavailable: ${reason}`);
    this.apiAvailable = false;

    // Emit the disable devices event
    this.homey.emit('disable_devices', this.homey.__('error.50x'));
  }

}

module.exports = Tedee;
