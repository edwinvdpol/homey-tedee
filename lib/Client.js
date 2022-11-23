'use strict';

const { OAuth2Client } = require('homey-oauth2app');
const { blank, filled } = require('./Utils');
const { UnlockModeNames } = require('./Enums');

class Client extends OAuth2Client {

  static API_URL = 'https://api.tedee.com/api/v1.28';
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
    this.log(`Fetching ${type} devices with details`);

    const response = await this.get({
      path: `/my/${type}`,
      query: '',
      headers: {},
    });

    return response.result;
  }

  /*
  | Device functions
  */

  // Fetch all devices with detailed information
  async getAllDevicesDetails() {
    this.log('Fetching devices with details');

    const response = await this.get({
      path: '/my/device/details',
      query: '',
      headers: {},
    });

    return response.result;
  }

  // Fetch device data from tedee API
  async getDevice(driver, id) {
    this.log(`Fetching ${driver} ${id}`);

    const response = await this.get({
      path: `/my/${driver}/${id}`,
      query: '',
      headers: {},
    });

    this.log(`${driver} ${id} response:`, JSON.stringify(response));

    return response.result;
  }

  // Fetch revision data from tedee API
  async getRevision(driver, id) {
    const result = await this.getDevice(driver, id);

    return result.revision;
  }

  // Update device settings
  async updateSettings(driver, id, settings) {
    this.log(`Updating ${driver} settings (${id}):`, JSON.stringify(settings));

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

    const response = await this.patch({
      path,
      query: '',
      json,
      body: null,
      headers: {},
    });

    this.log(`Update ${driver} settings response (${id}):`, JSON.stringify(response));
  }

  /*
  | Lock actions
  */

  // Fetch lock state from tedee API
  async getLockState(id) {
    this.log(`Fetching lock state for ${id}`);

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
    const response = await this.get({
      path: `/my/lock/${id}/sync`,
      query: '',
      headers: {},
    });

    return response.result;
  }

  // Send `lock` command for lock
  async lock(id) {
    this.log(`Sending "lock" command for lock ${id}`);

    const response = await this.post({
      path: `/my/lock/${id}/operation/lock`,
      query: '',
      json: null,
      body: null,
      headers: {},
    });

    this.log(`Lock ${id} response:`, JSON.stringify(response));

    if (filled(response.result) && filled(response.result.operationId)) {
      return response.result.operationId;
    }

    throw new Error(this.homey.__('errors.response'));
  }

  // Send `unlock` command for lock
  async unlock(id, mode = 3) {
    this.log(`Sending "unlock" command for lock ${id} (${UnlockModeNames[mode]})`);

    const response = await this.post({
      path: `/my/lock/${id}/operation/unlock?mode=${mode}`,
      query: '',
      json: null,
      body: null,
      headers: {},
    });

    this.log(`Unlock ${id} response:`, JSON.stringify(response));

    if (filled(response.result) && filled(response.result.operationId)) {
      return response.result.operationId;
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
      return result;
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
