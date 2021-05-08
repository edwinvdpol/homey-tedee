'use strict';

const {OAuth2Client} = require('homey-oauth2app');

class Client extends OAuth2Client {

  static API_URL = 'https://api.tedee.com/api/v1.17';
  static TOKEN_URL = 'https://tedee.b2clogin.com/tedee.onmicrosoft.com/B2C_1A_Signup_Signin_With_Kmsi/oauth2/v2.0/token';
  static AUTHORIZATION_URL = 'https://tedee.b2clogin.com/tedee.onmicrosoft.com/B2C_1A_Signup_Signin_With_Kmsi/oauth2/v2.0/authorize';
  static SCOPES = [
    'offline_access',
    'https://tedee.onmicrosoft.com/api/user_impersonation',
    'https://tedee.onmicrosoft.com/api/Device.ReadWrite',
    'https://tedee.onmicrosoft.com/api/Lock.Operate'
  ];

  /*
  |-----------------------------------------------------------------------------
  | Client events
  |-----------------------------------------------------------------------------
  */

  /**
   * Client is initialized.
   *
   * @async
   * @returns {Promise<void>}
   */
  async onInit() {
    this.log('Client initialized');
  }

  /**
   * Client is uninitialized.
   *
   * @async
   * @returns {Promise<void>}
   */
  async onUninit() {
    this.log('Client uninitialized');
  }

  /**
   * Request failed.
   *
   * @async
   * @param {string|void} body - The response body
   * @param {number} status - The HTTP status code
   * @returns {Promise<Error>}
   */
  async onHandleNotOK({body, status}) {
    this.error('Request failed', body);

    switch (status) {
      case 401:
        return new Error(this.homey.__('error.401'));
      case 404:
        return new Error(this.homey.__('error.404'));
      default:
        return new Error(this.homey.__('error.50x'));
    }
  }

  /**
   * Request error.
   *
   * @async
   * @param {Error} err
   * @returns {Promise<void>}
   * @throws {Error}
   */
  async onRequestError({err}) {
    this.error('Request', err);

    throw new Error(this.homey.__('error.50x'));
  }

  /*
  |-----------------------------------------------------------------------------
  | Client actions
  |-----------------------------------------------------------------------------
  */

  /**
   * Fetch bridge data from tedee API.
   *
   * @async
   * @param {number} deviceId - The Tedee device ID
   * @returns {Promise<Object>} - The API response result
   */
  async getBridge(deviceId) {
    this.log(`Fetching bridge ${deviceId}`);

    const response = await this.get({path: `/my/bridge/${deviceId}`});

    this.log('API response', JSON.stringify(response));

    return response.result;
  }

  /**
   * Fetch all devices without details from tedee API.
   *
   * @async
   * @returns {Promise<Object>} - The API response result
   */
  async getDevices() {
    this.log('Fetching all devices');

    const response = await this.get({path: '/my/device'});

    return response.result;
  }

  /**
   * Fetch all devices with details from tedee API (full update / pairing).
   *
   * @async
   * @returns {Promise<Object>} - Merged available bridges and locks
   */
  async getDevicesDetails() {
    this.log('Fetching all devices with details');

    const response = await this.get({path: '/my/device/details'});

    return [...response.result.bridges, ...response.result.locks];
  }

  /**
   * Fetch lock data from tedee API.
   *
   * @async
   * @param {number} deviceId - The Tedee device ID
   * @returns {Promise<Object>} - The API response result
   */
  async getLock(deviceId) {
    this.log(`Fetching lock ${deviceId}`);

    const response = await this.get({path: `/my/lock/${deviceId}`});

    this.log('API response', JSON.stringify(response));

    return response.result;
  }

  /**
   * Fetch lock state from tedee API.
   *
   * @async
   * @param {number} deviceId - The Tedee device ID
   * @returns {Promise<number>}
   */
  async getLockState(deviceId) {
    this.log(`Fetching lock state for ${deviceId}`);

    const result = await this.getSyncLock(deviceId);

    return result.lockProperties.state;
  }

  /**
   * Fetch operation from tedee API.
   *
   * @async
   * @param {string} operationId - The operation ID
   * @returns {Promise<Object>} - The API response result
   * @throws {Error}
   */
  async getOperation(operationId) {
    if (operationId.length === 0) {
      this.error('Operation ID is blank');

      throw new Error(this.homey.__('error.response'));
    }

    this.log(`Fetching operation ${operationId}`);

    const response = await this.get({path: `/my/device/operation/${operationId}`});

    this.log('API response', JSON.stringify(response));

    return response.result;
  }

  /**
   * Fetch revision for lock from tedee API.
   *
   * @async
   * @param {number} deviceId - The Tedee device ID
   * @returns {Promise<number>} - The revision number
   */
  async getRevision(deviceId) {
    const result = await this.getLock(deviceId);

    return result.revision;
  }

  /**
   * Fetch lock sync from tedee API.
   *
   * @async
   * @param {number} deviceId - The Tedee device ID
   * @returns {Promise<Object>} - The API response result
   */
  async getSyncLock(deviceId) {
    const response = await this.get({path: `/my/lock/${deviceId}/sync`});

    return response.result;
  }

  /**
   * Fetch sync data of all locks from tedee API (delta update).
   *
   * @async
   * @returns {Promise<Object>} - The API response result
   */
  async getSyncLocks() {
    const response = await this.get({path: '/my/lock/sync'});

    return response.result;
  }

  /**
   * Send `close` command for lock to tedee API.
   *
   * @async
   * @param {number} deviceId - The Tedee device ID
   * @returns {Promise<string>} - The operation ID
   * @throws {Error}
   */
  async close(deviceId) {
    this.log(`Closing lock ${deviceId}`);

    const response = await this.post({
      path: '/my/lock/close',
      json: { deviceId: deviceId }
    });

    this.log('API response', JSON.stringify(response));

    if (response.result.hasOwnProperty('operationId')) {
      return response.result.operationId;
    }

    throw new Error(this.homey.__('error.response'));
  }

  /**
   * Send `pull spring` command for lock to tedee API.
   *
   * @async
   * @param {number} deviceId - The Tedee device ID
   * @returns {Promise<string>} - The operation ID
   * @throws {Error}
   */
  async pullSpring(deviceId) {
    this.log(`Pulling spring of lock ${deviceId}`);

    const response = await this.post({
      path: '/my/lock/pull-spring',
      json: { deviceId: deviceId }
    });

    this.log('API response', JSON.stringify(response));

    if (response.result.hasOwnProperty('operationId')) {
      return response.result.operationId;
    }

    throw new Error(this.homey.__('error.response'));
  }

  /**
   * Send `open` command for lock to tedee API.
   *
   * @async
   * @param {number} deviceId - The Tedee device ID
   * @returns {Promise<string>} - The operation ID
   * @throws {Error}
   */
  async open(deviceId) {
    this.log(`Opening lock ${deviceId}`);

    const response = await this.post({
      path: '/my/lock/open',
      json: { deviceId: deviceId }
    });

    this.log('API response', JSON.stringify(response));

    if (response.result.hasOwnProperty('operationId')) {
      return response.result.operationId;
    }

    throw new Error(this.homey.__('error.response'));
  }

  /**
   * Update lock settings.
   *
   * @async
   * @param {number} deviceId - The Tedee device ID
   * @param {object} deviceSettings - The settings that need to be updated
   * @returns {Promise<Object>} - The API response result
   */
  async updateLockSettings(deviceId, deviceSettings) {
    this.log(`Updating lock settings ${deviceId}`, deviceSettings);

    const response = await this.patch({
      path: '/my/lock',
      json: {
        id: deviceId,
        revision: await this.getRevision(deviceId),
        deviceSettings: deviceSettings
      }
    });

    this.log('API response', JSON.stringify(response));

    return response.result;
  }

  // PATCH request
  async patch({path, query, json, body, headers}) {
    return this._queueRequest({
      method: 'PATCH',
      path,
      query,
      json,
      body,
      headers,
    });
  }
}

module.exports = Client;
