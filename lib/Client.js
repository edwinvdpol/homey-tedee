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
    this.error('Request failed:', err.message);

    throw new Error(this.homey.__('error.50x'));
  }

  /*
  |-----------------------------------------------------------------------------
  | Synchronize actions
  |-----------------------------------------------------------------------------
  */

  /**
   * Sync bridge data from tedee API.
   *
   * @async
   * @param {number} deviceId - The Tedee device ID
   * @returns {Promise<void>}
   */
  async syncBridge(deviceId) {
    this.log(`Fetching bridge ${deviceId} from API`);

    const response = await this.get({
      path: `/my/bridge/${deviceId}`
    });

    this.log(`Bridge ${deviceId} API response:`, JSON.stringify(response));

    const data = response.result;

    this.homey.emit(`tedee:sync:${data.id}`, data);
  }

  /**
   * Sync device from tedee API.
   *
   * @async
   * @param {string} driverId - The Homey driver ID
   * @param {number} deviceId - The Tedee device ID
   * @returns {Promise<void>}
   */
  async syncDevice(driverId, deviceId) {
    if (driverId === 'lock') {
      return this.syncLock(deviceId);
    }

    return this.syncBridge(deviceId);
  }

  /**
   * Sync devices for driver with details from tedee API.
   *
   * @async
   * @returns {Promise<Object>} - The API response result
   */
  async syncDevices() {
    const response = await this.get({
      path: '/my/device/details'
    });

    const devices = [...response.result.bridges, ...response.result.locks];

    devices.forEach(data => {
      this.homey.emit(`tedee:sync:${data.id}`, data);
    });
  }

  /**
   * Sync bridge data from tedee API.
   *
   * @async
   * @param {number} deviceId - The Tedee device ID
   * @returns {Promise<void>}
   */
  async syncLock(deviceId) {
    this.log(`Synchronize lock ${deviceId}`);

    const data = await this.getLock(deviceId);

    this.homey.emit(`tedee:sync:${data.id}`, data);
  }

  /**
   * Sync data of all locks from tedee API (delta update).
   *
   * @async
   * @returns {Promise<Object>} - The API response result
   */
  async syncLocks() {
    const response = await this.get({
      path: '/my/lock/sync'
    });

    response.result.forEach(data => {
      this.homey.emit(`tedee:sync:${data.id}`, data);
    });
  }

  /*
  |-----------------------------------------------------------------------------
  | Client actions
  |-----------------------------------------------------------------------------
  */

  /**
   * Fetch devices for driver with details from tedee API.
   *
   * @async
   * @param {string} driverId - The Homey driver ID
   * @returns {Promise<Object>} - The API response result
   */
  async getDevicesDetails(driverId) {
    this.log(`Fetching ${driverId} devices with details from API`);

    const response = await this.get({
      path: `/my/${driverId}`
    });

    return response.result;
  }

  /**
   * Fetch lock data from tedee API.
   *
   * @async
   * @param {number} deviceId - The Tedee device ID
   * @returns {Promise<Object>} - The API response result
   */
  async getLock(deviceId) {
    this.log(`Fetching lock ${deviceId} from API`);

    const response = await this.get({
      path: `/my/lock/${deviceId}`
    });

    this.log(`Lock ${deviceId} API response:`, JSON.stringify(response));

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
    this.log(`Fetching lock state for ${deviceId} from API`);

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

    this.log(`Fetching operation ${operationId} from API`);

    const response = await this.get({
      path: `/my/device/operation/${operationId}`
    });

    this.log(`Operation ${operationId} API response:`, JSON.stringify(response));

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
    const response = await this.get({
      path: `/my/lock/${deviceId}/sync`
    });

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
    this.log(`Sending "close" lock ${deviceId} to API`);

    const response = await this.post({
      path: '/my/lock/close',
      json: { deviceId: deviceId }
    });

    this.log(`Close ${deviceId} API response:`, JSON.stringify(response));

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
    this.log(`Sending "pull-spring" for lock ${deviceId} to API`);

    const response = await this.post({
      path: '/my/lock/pull-spring',
      json: { deviceId: deviceId }
    });

    this.log(`Pull spring ${deviceId} API response:`, JSON.stringify(response));

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
    this.log(`Sending "open" lock ${deviceId} to API`);

    const response = await this.post({
      path: '/my/lock/open',
      json: { deviceId: deviceId }
    });

    this.log(`Open ${deviceId} API response:`, JSON.stringify(response));

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
   * @returns {Promise<void>}
   */
  async updateLockSettings(deviceId, deviceSettings) {
    this.log(`Updating lock settings ${deviceId}:`, JSON.stringify(deviceSettings));

    const response = await this.patch({
      path: '/my/lock',
      json: {
        id: deviceId,
        revision: await this.getRevision(deviceId),
        deviceSettings: deviceSettings
      }
    });

    this.log(`Lock settings ${deviceId} API response:`, JSON.stringify(response));
  }

}

module.exports = Client;
