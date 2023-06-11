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

  // Return all devices with detailed information
  async getAllDevicesDetails() {
    const path = '/my/device/details';

    this.log('GET', path);

    return this.get({
      path,
      query: '',
      headers: {},
    });
  }

  // Return device data
  async getDevice(driver, id) {
    const path = `/my/${driver}/${id}`;

    this.log('GET', path);

    return this.get({
      path,
      query: '',
      headers: {},
    });
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

    throw new Error(this.homey.__('errors.50x'));
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

    throw new Error(this.homey.__('errors.50x'));
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
      this.log('Response', JSON.stringify(result));

      return result.result || result;
    }

    this.error('Invalid response', result);

    throw new Error(this.homey.__('errors.50x'));
  }

  // Request error
  async onRequestError({ err }) {
    this.error('Request error', err.message);

    throw new Error(this.homey.__('errors.network'));
  }

}

module.exports = Client;
