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

  // Discover given devices of given type
  async discoverDevices(type) {
    const uri = type === 'go' ? 'lock' : type;
    const path = `/my/${uri}`;

    this.log('GET', path);

    const response = await this.get({
      path,
      query: '',
      headers: {},
    });

    // Return only lock devices
    if (type === 'lock') {
      return response.filter((device) => device.type === DeviceType.Lock);
    }

    // Return only lock GO devices
    if (type === 'go') {
      return response.filter((device) => device.type === DeviceType.LockGo);
    }

    return response;
  }

  /*
  | Device functions
  */

  // Fetch all devices with detailed information
  async getAllDevicesDetails() {
    const path = '/my/device/details';

    this.log('GET', path);

    return this.get({
      path,
      query: '',
      headers: {},
    });
  }

  // Fetch device data from tedee API
  async getDevice(driver, id) {
    const path = `/my/${driver}/${id}`;

    this.log('GET', path);

    return this.get({
      path,
      query: '',
      headers: {},
    });
  }

  // Fetch revision data from tedee API
  async getRevision(driver, id) {
    const result = await this.getDevice(driver, id);

    return result.revision;
  }

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

  // Fetch lock state from tedee API
  async getLockState(id) {
    const result = await this.getSyncLock(id);

    if (blank(result.lockProperties)) {
      throw new Error(this.homey.__('errors.response'));
    }

    const { lockProperties } = result;

    if (blank(lockProperties.state)) {
      throw new Error(this.homey.__('errors.response'));
    }

    return Number(lockProperties.state);
  }

  // Fetch lock sync from tedee API
  async getSyncLock(id) {
    const path = `/my/lock/${id}/sync`;

    this.log('GET', path);

    return this.get({
      path,
      query: '',
      headers: {},
    });
  }

  // Send `lock` command for lock
  async lock(id) {
    const path = `/my/lock/${id}/operation/lock`;

    this.log('POST', path);

    const response = await this.post({
      path,
      query: '',
      json: null,
      body: null,
      headers: {},
    });

    if (filled(response.operationId)) {
      return response.operationId;
    }

    throw new Error(this.homey.__('errors.response'));
  }

  // Send `unlock` command for lock
  async unlock(id, mode = 3) {
    const path = `/my/lock/${id}/operation/unlock?mode=${mode}`;

    this.log('POST', path);

    const response = await this.post({
      path,
      query: '',
      json: null,
      body: null,
      headers: {},
    });

    if (filled(response.operationId)) {
      return response.operationId;
    }

    throw new Error(this.homey.__('errors.response'));
  }

  /*
  | Client events
  */

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

    // Unauthorized
    if (status === 401) {
      return new Error(this.homey.__('errors.401'));
    }

    // Device / page not found
    if (status === 404) {
      return new Error(this.homey.__('errors.404'));
    }

    // API internal server error
    if (status >= 500 && status < 600) {
      return new Error(this.homey.__('errors.50x'));
    }

    // Custom error message
    if (error) {
      return new Error(error);
    }

    // Invalid response
    return new Error(this.homey.__('errors.response'));
  }

  // Handle result
  async onHandleResult({
    result, status, statusText, headers,
  }) {
    if (filled(result) && typeof result === 'object') {
      this.log('Response:', JSON.stringify(result));

      return result.result || result;
    }

    this.error('Invalid API response:', result);

    throw new Error(this.homey.__('errors.response'));
  }

  // Request error
  async onRequestError({ err }) {
    this.error('Request error:', err.message);

    throw new Error(this.homey.__('errors.response'));
  }

}

module.exports = Client;
