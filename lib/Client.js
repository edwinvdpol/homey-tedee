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

    const devices = await this._get(`/my/${uri}`);

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

  // Return all devices with detailed information
  async getAllDevicesDetails() {
    return this._get('/my/device/details');
  }

  // Return device data
  async getDevice(driver, id) {
    return this._get(`/my/${driver}/${id}`);
  }

  // Return revision data
  async getRevision(driver, id) {
    const result = await this.getDevice(driver, id);

    return result.revision;
  }

  /*
  | Device actions
  */

  // Update device settings
  async updateSettings(driver, id, settings) {
    let path = `/my/${driver}`;

    const json = {
      id,
      revision: await this.getRevision(driver, id),
      deviceSettings: settings,
    };

    if (driver === 'keypad') {
      path += `/${id}`;
      delete json.id;
    }

    this.log('PATCH', path, JSON.stringify(json));

    await this.patch({
      path,
      query: '',
      json,
      body: null,
      headers: {},
    });
  }

  /*
  | Lock actions
  */

  // Fetch lock state
  async getLockState(id) {
    const result = await this.getSyncLock(id);

    if (blank(result.lockProperties)) {
      throw new Error(this.homey.__('errors.50x'));
    }

    const { lockProperties } = result;

    if (blank(lockProperties.state)) {
      throw new Error(this.homey.__('errors.50x'));
    }

    return Number(lockProperties.state);
  }

  // Fetch lock sync
  async getSyncLock(id) {
    return this._get(`/my/lock/${id}/sync`);
  }

  // Send `lock` command for lock
  async lock(id) {
    const result = await this._post(`/my/lock/${id}/operation/lock`);

    if ('operationId' in result) {
      return result.operationId;
    }

    throw new Error(this.homey.__('errors.50x'));
  }

  // Send `unlock` command for lock
  async unlock(id, mode = 3) {
    const result = await this._post(`/my/lock/${id}/operation/unlock?mode=${mode}`);

    if ('operationId' in result) {
      return result.operationId;
    }

    throw new Error(this.homey.__('errors.50x'));
  }

  /*
  | Support functions
  */

  // Perform GET request
  async _get(path) {
    this.log('GET', path);

    return this.get({
      path,
      query: '',
      headers: {},
    });
  }

  // Perform POST request
  async _post(path) {
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

    const error = filled(body.ErrorMessages) && filled(body.ErrorMessages[0]) ? body.ErrorMessages[0] : null;

    // Client errors
    if (status === 401 || status === 403 || status === 404) {
      return new Error(this.homey.__(`errors.${status}`));
    }

    // Internal server error
    if (status >= 500 && status < 600) {
      return new Error(this.homey.__('errors.50x'));
    }

    // Custom error message
    if (error) {
      return new Error(error);
    }

    // Unknown error
    return new Error(this.homey.__('errors.unknown'));
  }

  // Handle result
  async onHandleResult({
    result, status, statusText, headers,
  }) {
    if (filled(result) && typeof result === 'object') {
      this.log('[Response]', JSON.stringify(result));

      return result.result || result;
    }

    this.error('[Response]', result);

    throw new Error(this.homey.__('errors.50x'));
  }

  // Request error
  async onRequestError({ err }) {
    this.error('[Request]', err.toString());

    throw new Error(this.homey.__('errors.network'));
  }

}

module.exports = Client;
