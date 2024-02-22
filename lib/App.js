'use strict';

const Homey = require('homey');
const { OAuth2App } = require('homey-oauth2app');
const { Log } = require('homey-log');
const Client = require('./Client');
const { blank } = require('./Utils');

class App extends OAuth2App {

  static OAUTH2_CLIENT = Client;
  static SYNC_INTERVAL = 5; // Minutes

  /*
  | Application events
  */

  // Application initialized
  async onOAuth2Init() {
    // Sentry logging
    this.homeyLog = new Log({ homey: this.homey });

    // Register event listener
    this.homey.on('unload', () => this.onUninit());

    // Register flow cards
    this.registerFlowCards();

    this.log('Initialized');
  }

  // Application destroyed
  async onUninit() {
    this.unregisterTimer();
    this.unregisterWebhook().catch(this.error);

    this.log('Destroyed');
  }

  /*
  | Synchronization functions
  */

  // Synchronize devices
  async syncDevices(devices = null) {
    let devicesData;
    let client;
    let result;

    try {
      if (blank(devices)) {
        devices = await this.getClientDevices();
      }

      // No oAuth devices found
      if (blank(devices)) {
        await this.unregisterWebhook();
        return;
      }

      client = this.getFirstSavedOAuth2Client();

      this.log('Get devices from API');
      result = await client.getAllDevicesDetails();

      devicesData = [
        ...result.bridges || [],
        ...result.locks || [],
        ...result.keypads || [],
      ];

      if (blank(devicesData)) {
        this.devicesNotFound(devices);
        await this.unregisterWebhook();

        return;
      }

      await this.updateDevices(devices, devicesData, 'sync');
    } catch (err) {
      if (err.message !== 'No OAuth2 Client Found') {
        this.error('[Sync]', err.toString());
      }
    } finally {
      client = null;
      result = null;
      devices = null;
      devicesData = null;
    }
  }

  // Update devices for given driver
  async updateDevices(devices, data, trigger) {
    if (blank(devices) || blank(data)) return;

    let device;

    for (const deviceData of data) {
      /** @type Device */
      device = devices.find((device) => String(device.getSetting('tedee_id')) === String(deviceData.id));

      // Device not found
      if (!device) continue;

      // Synchronize device when received settings updated event
      if ('event' in deviceData && deviceData.event === 'device-settings-changed') {
        await device.sync();

        continue;
      }

      // Sync data
      await device.handleSyncData(deviceData, trigger);
    }

    devices = null;
    device = null;
    data = null;
  }

  /*
  | Webhook functions
  */

  // Register webhook
  async registerWebhook() {
    if (this.webhook) return;

    this.webhook = 'register';
    this.log('[Webhook] Registering');

    let identity;

    try {
      identity = await this.getUserIdentity();

      this.webhook = await this.homey.cloud.createWebhook(
        Homey.env.WEBHOOK_ID,
        Homey.env.WEBHOOK_SECRET, {
          $key: identity,
        },
      );

      this.webhook.on('message', this.onWebhookMessage.bind(this));

      this.log('[Webhook] Registered');
    } catch (err) {
      this.error('Webhook]', err.toString());
      this.webhook = null;
    } finally {
      identity = null;
    }
  }

  // Unregister webhook
  async unregisterWebhook() {
    if (!this.webhook) return;

    this.log('[Webhook] Unregistering');

    await this.webhook.unregister();
    this.webhook = null;

    this.log('[Webhook] Unregistered');
  }

  /*
  | Webhook events
  */

  // Webhook message received
  async onWebhookMessage({ body }) {
    this.log('[Webhook] Received', JSON.stringify(body));

    if (blank(body.data)) return;

    let devices;

    try {
      const { data } = body;

      data.event = body.event;
      data.id = data.deviceId;

      devices = await this.getClientDevices();

      await this.updateDevices(devices, [data], 'webhook');
    } catch (err) {
      this.error('[Webhook]', err.toString());
    } finally {
      devices = null;
    }
  }

  // Get user identity
  async getUserIdentity() {
    this.log('[Webhook] Identity lookup');

    const client = this.getFirstSavedOAuth2Client();

    const token = client.getToken().access_token;
    if (blank(token)) throw new Error('OAuth token is empty');

    const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    if (blank(decoded)) throw new Error('OAuth token (decoded) is empty');

    const identity = decoded.sub;
    if (blank(identity)) throw new Error(`OAuth token subject (sub) not found: ${decoded}`);

    this.log('[Webhook] Identity found:', identity);

    return identity;
  }

  /*
  | Timer functions
  */

  // Register timer
  registerTimer() {
    if (this.syncDevicesTimer) return;

    const interval = 1000 * 60 * this.constructor.SYNC_INTERVAL;

    this.syncDevicesTimer = this.homey.setInterval(this.syncDevices.bind(this), interval);

    this.log('[Timer] Registered');
  }

  // Unregister timer
  unregisterTimer() {
    if (!this.syncDevicesTimer) return;

    this.homey.clearInterval(this.syncDevicesTimer);

    this.syncDevicesTimer = null;

    this.log('[Timer] Unregistered');
  }

  /*
  | Support functions
  */

  // Given devices are not found
  devicesNotFound(devices) {
    if (blank(devices)) return;

    for (const device of devices) {
      device.setUnavailable(this.homey.__('errors.404')).catch(this.error);
    }
  }

  // Register flow cards
  registerFlowCards() {
    this.log('[FlowCards] Registering');

    // Action flow cards
    // ... then pull the spring ...
    this.homey.flow.getActionCard('open').registerRunListener(async ({ device }) => {
      await device.open();
    });

    // Condition flow cards
    // ... and is connected ...
    this.homey.flow.getConditionCard('connected').registerRunListener(async ({ device }) => {
      return device.getCapabilityValue('connected') === true;
    });

    // ... and is charging ...
    this.homey.flow.getConditionCard('charging').registerRunListener(async ({ device }) => {
      return device.getCapabilityValue('charging') === true;
    });

    // ... and update is available ...
    this.homey.flow.getConditionCard('update_available').registerRunListener(async ({ device }) => {
      return device.getCapabilityValue('update_available') === true;
    });

    this.log('[FlowCards] Registered');
  }

  // Return client devices
  async getClientDevices() {
    const sessions = this.getSavedOAuth2Sessions();

    if (blank(sessions)) {
      return [];
    }

    const sessionId = Object.keys(sessions)[0];

    return this.getOAuth2Devices({ sessionId });
  }

  // Register services
  async registerServices() {
    this.registerTimer();
    await this.registerWebhook();
  }

}

module.exports = App;
