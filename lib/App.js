'use strict';

const Homey = require('homey');
const { OAuth2App } = require('homey-oauth2app');
const { Log } = require('homey-log');
const Client = require('./Client');
const { blank, filled } = require('./Utils');

class App extends OAuth2App {

  static OAUTH2_CLIENT = Client;

  static SYNC_INTERVAL = 120;

  // Application initialized
  async onOAuth2Init() {
    // Sentry logging
    this.homeyLog = new Log({ homey: this.homey });

    this.homey.on('unload', () => this.unregisterServices.bind(this));

    // Register flow cards
    this.registerFlowCards();

    this.log('Initialized');
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
        this.unregisterWebhook();
        return;
      }

      /** @type Client */
      client = this.getFirstSavedOAuth2Client();
      result = await client.getAllDevicesDetails();

      devicesData = [
        ...result.bridges || [],
        ...result.locks || [],
        ...result.keypads || [],
      ];

      if (blank(devicesData)) {
        this.devicesNotFound(devices);
        this.unregisterWebhook();

        return;
      }

      await this.updateDevices(devices, devicesData);
    } catch (err) {
      if (err.message !== 'No OAuth2 Client Found') {
        this.error('Sync devices error:', err.message);
      }
    } finally {
      client = null;
      result = null;
      devices = null;
      devicesData = null;
    }
  }

  // Update devices for given driver
  async updateDevices(devices, data) {
    if (blank(devices) || blank(data)) return;

    let device;

    for (const deviceData of data) {
      /** @type Device */
      device = devices.find((device) => String(device.getSetting('tedee_id')) === String(deviceData.id));

      // Device not found
      if (!device) continue;

      // Synchronize device when received settings updated event
      if (filled(deviceData.event) && deviceData.event === 'device-settings-changed') {
        await device.sync();

        continue;
      }

      // Sync data
      await device.handleSyncData(deviceData);
    }

    devices = null;
    device = null;
    data = null;
  }

  /*
  | Services functions
  */

  // Register services
  registerServices() {
    this.registerTimer();
    this.registerWebhook().catch(this.error);
  }

  // Register timer
  registerTimer() {
    if (this.syncDevicesTimer) return;

    this.syncDevicesTimer = this.homey.setInterval(this.syncDevices.bind(this), (1000 * this.constructor.SYNC_INTERVAL));
  }

  // Register webhook
  async registerWebhook() {
    if (this.webhook) return;

    this.webhook = 'register';
    this.log('[Webhook] Registering...');

    // Wait one seconds
    await new Promise((resolve) => setTimeout(resolve, 1000));

    try {
      const identity = await this.getUserIdentity();
      if (blank(identity)) return;

      this.webhook = await this.homey.cloud.createWebhook(
        Homey.env.WEBHOOK_ID,
        Homey.env.WEBHOOK_SECRET, {
          $key: identity,
        },
      );

      this.webhook.on('message', this.onWebhookMessage.bind(this));

      this.log('[Webhook] Registered');
    } catch (err) {
      this.error('Register webhook error:', err.message);
      this.webhook = null;
    }
  }

  // Unregister services
  unregisterServices() {
    this.unregisterTimer();
    this.unregisterWebhook();
  }

  // Unregister timer
  unregisterTimer() {
    if (!this.syncDevicesTimer) return;

    this.homey.clearInterval(this.syncDevicesTimer);

    this.syncDevicesTimer = null;
  }

  // Unregister webhook
  unregisterWebhook() {
    if (!this.webhook) return;

    this.webhook.unregister().catch(this.error);
    this.webhook = null;

    this.log('[Webhook] Unregistered');
  }

  /*
  | Webhook events
  */

  // Webhook message received
  async onWebhookMessage({ body }) {
    this.log('[Webhook] Received:', JSON.stringify(body));

    if (blank(body.data)) return;

    let devices;

    try {
      const { data } = body;

      data.event = body.event;
      data.id = data.deviceId;

      devices = await this.getClientDevices();

      await this.updateDevices(devices, [data]);
    } catch (err) {
      this.error('Webhook error:', err.message);
    } finally {
      devices = null;
    }
  }

  // Get user identity
  async getUserIdentity() {
    this.log('[Webhook] Looking for user identity...');

    const client = await this.getFirstSavedOAuth2Client();
    if (blank(client)) throw new Error('OAuth client not found');

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

}

module.exports = App;
