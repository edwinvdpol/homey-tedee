'use strict';

const Homey = require('homey');
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

  // Initialized
  async onInit() {
    this.log('Client initialized');
  }

  // Uninitialized
  async onUninit() {
    this.log('Client uninitialized');
  }

  // Request failed
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

  // Request error
  async onRequestError({err}) {
    this.error('Request error', err);

    throw new Error(this.homey.__('error.50x'));
  }

  /*
  |-----------------------------------------------------------------------------
  | Client actions
  |-----------------------------------------------------------------------------
  */

  // Fetch bridge data from tedee API
  async getBridge(deviceId) {
    this.log(`Fetching bridge ${deviceId}`);

    const response = await this.get({path: `/my/bridge/${deviceId}`});

    return response.result;
  }

  // Fetch all devices without details from tedee API
  async getDevices() {
    this.log('Fetching all devices');

    const response = await this.get({path: '/my/device'});

    return response.result;
  }

  // Fetch all devices with details from tedee API (full update / pairing)
  async getDevicesDetails() {
    this.log('Fetching all devices with details');

    const response = await this.get({path: '/my/device/details'});

    return [...response.result.bridges, ...response.result.locks];
  }

  // Fetch lock data from tedee API
  async getLock(deviceId) {
    this.log(`Fetching lock ${deviceId}`);

    const response = await this.get({path: `/my/lock/${deviceId}`});

    return response.result;
  }

  // Fetch lock state from tedee API
  async getLockState(deviceId) {
    this.log(`Fetching lock state for ${deviceId}`);

    const response = await this.get({path: `/my/lock/${deviceId}/sync`});

    return response.result.lockProperties.state;
  }

  // Fetch operation from tedee API
  async getOperation(operationId) {
    this.log(`Fetching operation ${operationId}`);

    const response = await this.get({path: `/my/device/operation/${operationId}`});

    this.log('API response', JSON.stringify(response));

    return response.result;
  }

  // Fetch lock sync from tedee API
  async getSyncLock(deviceId) {
    const response = await this.get({path: `/my/lock/${deviceId}/sync`});

    return response.result;
  }

  // Fetch sync data of all locks from tedee API (delta update)
  async getSyncLocks() {
    const response = await this.get({path: `/my/lock/sync`});

    return response.result;
  }

  // Send `close` command for lock to tedee API
  async close(deviceId) {
    this.log(`Closing lock ${deviceId}`);

    const response = await this.post({
      path: '/my/lock/close',
      json: { 'deviceId': deviceId }
    });

    this.log('API response', JSON.stringify(response));

    return response.result.operationId;
  }

  // Send `pull spring` command for lock to tedee API
  async pullSpring(deviceId) {
    this.log(`Pulling spring of lock ${deviceId}`);

    const response = await this.post({
      path: '/my/lock/pull-spring',
      json: { 'deviceId': deviceId }
    });

    this.log('API response', JSON.stringify(response));

    return response.result.operationId;
  }

  // Send `open` command for lock to tedee API
  async open(deviceId) {
    this.log(`Opening lock ${deviceId}`);

    const response = await this.post({
      path: '/my/lock/open',
      json: { 'deviceId': deviceId }
    });

    this.log('API response', JSON.stringify(response));

    return response.result.operationId;
  }

}

module.exports = Client;
