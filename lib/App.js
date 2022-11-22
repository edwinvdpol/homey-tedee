'use strict';

const Homey = require('homey');
const { OAuth2App } = require('homey-oauth2app');
const { Log } = require('homey-log');
const Client = require('./Client');
const { blank } = require('./Utils');
const { DeviceType } = require('./Enums');

class App extends OAuth2App {

  static OAUTH2_CLIENT = Client;

  static SYNC_INTERVAL_LOCKS = 10;
  static SYNC_INTERVAL_FULL = 180;

  // Application initialized
  async onOAuth2Init() {
    // Sentry logging
    this.homeyLog = new Log({ homey: this.homey });

    this.homey.on('unload', () => this.unregisterWebhook.bind(this));

    // Register flow cards
    this.registerFlowCards();

    this.log('Initialized');
  }

  // Register services
  async registerServices(driverId) {
    await this.registerWebhook();
    await this.registerTimers(driverId);
  }

  // Unregister webhook
  unregisterWebhook() {
    if (!this.webhook) return;

    this.webhook.unregister().catch(this.error);
    this.webhook = null;

    this.log('Webhook unregistered');
  }

  // Register timers
  async registerTimers(driverId) {
    if (!this.syncDevicesTimer) {
      this.log('Register devices timer');
      this.syncDevicesTimer = this.homey.setInterval(this.syncDevices.bind(this), (1000 * this.constructor.SYNC_INTERVAL_FULL));
    }

    if (this.syncLockTimer) return;
    if (driverId !== 'lock') return;

    // Wait 3 seconds and register the locks timer so the timers are not run at the same time
    await new Promise((resolve) => setTimeout(resolve, 3000));

    this.log('Register locks timer');
    this.syncLockTimer = this.homey.setInterval(this.syncLocks.bind(this), (1000 * this.constructor.SYNC_INTERVAL_LOCKS));
  }

  /*
  | Synchronization functions
  */

  // Synchronize devices
  async syncDevices() {
    try {
      /** @type Client */
      const client = await this.getFirstSavedOAuth2Client();

      if (blank(client)) return;

      const result = await client.getAllDevicesDetails();

      if (blank(result)) return;

      // Update bridges
      if (Array.isArray(result.bridges)) {
        await this.updateDevices('bridge', result.bridges);
      }

      // Update keypads
      if (Array.isArray(result.keypads)) {
        await this.updateDevices('keypad', result.keypads);
      }

      // Update locks
      if (Array.isArray(result.locks)) {
        await this.updateDevices('lock', result.locks);
      }
    } catch (err) {
      if (err.message !== 'No OAuth2 Client Found') {
        this.error('Sync devices error:', err.message);
      }
    }
  }

  // Synchronize locks
  async syncLocks() {
    try {
      /** @type Client */
      const client = await this.getFirstSavedOAuth2Client();

      if (blank(client)) return;

      const result = await client.getSyncLocks();

      if (blank(result)) return;

      await this.updateDevices('lock', result);
    } catch (err) {
      if (err.message !== 'No OAuth2 Client Found') {
        this.error('Sync locks error:', err.message);
      }
    }
  }

  /*
  | Update functions
  */

  // Update devices for given driver
  async updateDevices(driverName, data) {
    if (blank(driverName) || blank(data)) return;

    const driver = this.homey.drivers.getDriver(driverName);
    const devices = driver.getDevices();

    for (const deviceData of data) {
      /** @type Device */
      const device = devices.find((device) => String(device.getSetting('tedee_id')) === String(deviceData.id));

      if (!device) continue;

      if (driverName === 'lock' && device.monitor.isRunning()) {
        continue;
      }

      // Sync data
      await device.handleSyncData(deviceData).catch(this.error);
    }
  }

  /*
  | Webhook functions
  */

  // Register webhook
  async registerWebhook() {
    if (this.webhook) return;

    this.webhook = 'register';
    this.log('Registering webhook');

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

      this.log('Webhook registered');
    } catch (err) {
      this.error('Register webhook error:', err.message);
      this.webhook = null;
    }
  }

  // Webhook message received
  async onWebhookMessage({ body }) {
    this.log('Webhook message received:', JSON.stringify(body));

    if (blank(body.data)) return;

    try {
      const { data } = body;

      data.event = body.event;
      data.id = data.deviceId;

      const driverName = DeviceType[data.deviceType];

      if (blank(driverName)) {
        this.error('Unknown device type:', data);
        return;
      }

      await this.updateDevices(driverName, [data]);
    } catch (err) {
      this.error('Webhook message error:', err.message);
    }
  }

  // Get user identity
  async getUserIdentity() {
    this.log('Get user identity');

    const client = await this.getFirstSavedOAuth2Client();
    if (blank(client)) throw new Error('OAuth client not found');

    const token = client.getToken().access_token;
    if (blank(token)) throw new Error('OAuth token is empty');

    const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    if (blank(decoded)) throw new Error('OAuth token (decoded) is empty');

    const identity = decoded.sub;
    if (blank(identity)) throw new Error(`OAuth token subject (sub) not found: ${decoded}`);

    this.log('Identity found:', identity);

    return identity;
  }

  /*
  | Support functions
  */

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

}

module.exports = App;
