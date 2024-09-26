'use strict';

const { OAuth2Client } = require('homey-oauth2app');
const { blank, filled } = require('./Utils');
const { DeviceType } = require('./Enums');

class Client extends OAuth2Client {

  static API_URL = 'https://api.tedee.com/api/v1.30';
  static TOKEN_URL = 'https://tedee.b2clogin.com/tedee.onmicrosoft.com/B2C_1A_Signup_Signin_With_Kmsi/oauth2/v2.0/token';
  static AUTHORIZATION_URL = 'https://tedee.b2clogin.com/tedee.onmicrosoft.com/B2C_1A_Signup_Signin_With_Kmsi/oauth2/v2.0/authorize';
  static SCOPES = [
    'offline_access',
    'https://tedee.onmicrosoft.com/api/user_impersonation',
    'https://tedee.onmicrosoft.com/api/Device.ReadWrite',
    'https://tedee.onmicrosoft.com/api/Lock.Operate',
  ];

  /*
  | Device discovery functions
  */

  // Discover devices of given type
  async discoverDevices(type) {
    const uri = type === 'go' ? 'lock' : type;

    const devices = await this._get(uri);

    // Return only lock devices
    if (type === 'lock') {
      return devices.filter((device) => device.type === DeviceType.Lock);
    }

    // Return only lock GO devices
    if (type === 'go') {
      return devices.filter((device) => device.type === DeviceType.LockGo);
    }

    return devices;
  }

  /*
  | Device functions
  */

  // Return devices with detailed information
  async getDevices() {
    const result = await this._get('device/details');

    return [
      ...result.bridges || [],
      ...result.locks || [],
      ...result.keypads || [],
    ];
  }

  // Return revision data
  async getRevision(driver, id) {
    const result = await this._get(`${driver}/${id}`);

    return result.revision;
  }

  /*
  | Device actions
  */

  // Update device settings
  async updateSettings(driver, id, settings) {
    let path = driver;
    let json;

    if (driver === 'bridge') {
      settings.id = id;
      json = settings;
    } else {
      json = {
        id,
        revision: await this.getRevision(driver, id),
        deviceSettings: settings,
      };
    }

    if (driver === 'keypad') {
      path += `/${id}`;
      delete json.id;
    }

    return this._patch(path, json);
  }

  /*
  | Lock actions
  */

  // Fetch lock state
  async getLockState(id) {
    const result = await this.getSyncLock(id);

    if (!('lockProperties' in result)) {
      throw new Error(this.homey.__('error.50x'));
    }

    const { lockProperties } = result;

    if (!('state' in lockProperties)) {
      throw new Error(this.homey.__('error.50x'));
    }

    return Number(lockProperties.state);
  }

  // Fetch lock sync
  async getSyncLock(id) {
    return this._get(`lock/${id}/sync`);
  }

  // Send `lock` command for lock
  async lock(id) {
    const result = await this._post(`lock/${id}/operation/lock`);

    if (!('operationId' in result)) {
      throw new Error(this.homey.__('error.50x'));
    }
  }

  // Send `unlock` command for lock
  async unlock(id, mode = 3) {
    const result = await this._post(`lock/${id}/operation/unlock?mode=${mode}`);

    if (!('operationId' in result)) {
      throw new Error(this.homey.__('error.50x'));
    }
  }

  /*
  | Support functions
  */

  // Perform GET request
  async _get(path) {
    path = `/my/${path}`;

    this.log('GET', path);

    return this.get({
      path,
      query: '',
      headers: {},
    });
  }

  // Perform PATCH request
  async _patch(path, json = null) {
    path = `/my/${path}`;

    this.log('PATCH', path, JSON.stringify(json));

    return this.patch({
      path,
      query: '',
      json,
      body: null,
      headers: {},
    });
  }

  // Perform POST request
  async _post(path) {
    path = `/my/${path}`;

    this.log('POST', path);

    return this.post({
      path,
      query: '',
      json: null,
      body: null,
      headers: {},
    });
  }

  /*
  | Client events
  */

  // Client initialized
  async onInit() {
    this.log('Initialized');
  }

  // Client destroyed
  async onUninit() {
    this.log('Destroyed');
  }

  // Request response is not OK
  async onHandleNotOK({
    body, status, statusText, headers,
  }) {
    this.error('Request not OK', JSON.stringify({
      body,
      status,
      statusText,
      headers,
    }));

    let error;

    // Client errors
    if (status === 401 || status === 403 || status === 404) {
      error = new Error(this.homey.__(`error.${status}`));
    }

    // Internal server error
    if (status >= 500 && status < 600) {
      error = new Error(this.homey.__('error.50x'));
    }

    // Custom error message
    if (filled(body.ErrorMessages) && filled(body.ErrorMessages[0])) {
      error = new Error(body.ErrorMessages[0]);
    }

    // Unknown error
    if (blank(error)) {
      error = new Error(this.homey.__('error.unknown'));
    }

    error.status = status;
    error.statusText = statusText;

    return error;
  }

  // Handle result
  async onHandleResult({
    result, status, statusText, headers,
  }) {
    if (filled(result) && typeof result === 'object') {
      return result.result || result;
    }

    if (blank(result)) {
      return null;
    }

    this.error('[Response]', result);

    throw new Error(this.homey.__('error.50x'));
  }

  // Request error
  async onRequestError({ err }) {
    this.error('[Request]', err.toString());

    throw new Error(this.homey.__('error.network'));
  }

}

module.exports = Client;
