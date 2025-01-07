'use strict';

const Homey = require('homey');
const { OAuth2App } = require('homey-oauth2app');
const { Log } = require('@drenso/homey-log');
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

    // Register unload event listener
    this.homey.on('unload', () => this.onOAuth2Uninit());

    // Set default data
    this.setDefaults();

    // Register flow cards
    this.registerFlowCards();

    this.log('Initialized');
  }

  // Application destroyed
  async onOAuth2Uninit() {
    // Unregister timer
    this.unregisterTimer();

    // Unregister webhook
    await this.unregisterWebhook();

    // Clear data
    this.setDefaults();

    this.log('Destroyed');
  }

  /*
  | Synchronization functions
  */

  // Synchronize
  async sync(id = null) {
    if (this.syncing) return;
    this.syncing = true;

    let client;

    try {
      // Get client
      client = await this.getSavedOAuth2Client();

      this.log('[Sync] Started');

      // Unregister timer
      this.unregisterTimer();

      // Synchronize data
      if (blank(this.devices) || blank(id)) {
        await this.syncData(client);
      }

      // Synchronize devices
      this.homey.emit('sync');

      // Register webhook
      await this.registerWebhook(client);
    } catch (err) {
      if (err.message !== 'No OAuth2 Client Found') {
        this.error('[Sync]', err.toString());

        return;
      }

      // Unregister webhook
      await this.unregisterWebhook();

      // Clear data
      this.setDefaults();
    } finally {
      // Register timer
      this.registerTimer();

      this.syncing = false;
      client = null;
    }
  }

  // Synchronize API data
  async syncData(client) {
    let devices = await client.getDevices();

    this.devices = {};

    if (blank(devices)) return;

    devices.forEach((item) => {
      this.devices[item.id] = item;
    });

    devices = null;
  }

  /*
  | Webhook functions
  */

  // Register webhook
  async registerWebhook(client) {
    if (this.webhook) return;
    this.webhook = 'register';

    let identity;

    try {
      this.log('[Webhook] Registering');

      identity = await this.getUserIdentity(client);

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

    try {
      this.log('[Webhook] Unregistering');

      await this.webhook.unregister();
    } catch (err) {
      this.error('[Webhook]', err.toString());
    } finally {
      this.webhook = null;

      this.log('[Webhook] Unregistered');
    }
  }

  /*
  | Webhook events
  */

  // Webhook message received
  async onWebhookMessage({ body }) {
    if (blank(body.data)) return;

    try {
      this.log('[Webhook] Received', JSON.stringify(body));

      const { data } = body;

      // Synchronize devices when received settings updated event
      if (body.event === 'device-settings-changed') {
        await this.sync();

        return;
      }

      this.devices[data.deviceId].event = data;

      this.homey.emit('sync');
    } catch (err) {
      this.error('[Webhook]', err.toString());
    } finally {
      body = null;
    }
  }

  // Get user identity
  async getUserIdentity(client) {
    this.log('[Identity] Lookup');

    const token = client.getToken().access_token;
    if (blank(token)) throw new Error('OAuth token is empty');

    const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    if (blank(decoded)) throw new Error('OAuth token (decoded) is empty');

    const identity = decoded.sub;
    if (blank(identity)) throw new Error(`OAuth token subject (sub) not found: ${decoded}`);

    this.log('[Identity] Found:', identity);

    return identity;
  }

  /*
  | Timer functions
  */

  // Register timer
  registerTimer() {
    if (this.syncTimer) return;

    const interval = 1000 * 60 * this.constructor.SYNC_INTERVAL;

    this.syncTimer = this.homey.setInterval(this.sync.bind(this), interval);
  }

  // Unregister timer
  unregisterTimer() {
    if (!this.syncTimer) return;

    this.homey.clearInterval(this.syncTimer);

    this.syncTimer = null;
  }

  /*
  | Support functions
  */

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

  // Return OAuth2 client
  async getSavedOAuth2Client() {
    try {
      return this.getFirstSavedOAuth2Client();
    } catch (err) {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      return this.getFirstSavedOAuth2Client();
    }
  }

  // Set default data
  setDefaults() {
    this.syncing = null;
    this.devices = null;
  }

}

module.exports = App;
