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
    const response = await this.get({path: `/my/bridge/${deviceId}`});

    return response.result;
  }

  // Fetch all devices with details from tedee API (full update / pairing)
  async getDevices() {
    const response = await this.get({path: '/my/device/details'});

    return [...response.result.bridges, ...response.result.locks];
  }

  // Fetch lock data from tedee API
  async getLock(deviceId) {
    const response = await this.get({path: `/my/lock/${deviceId}`});

    return response.result;
  }

  // Fetch lock state from tedee API
  async getLockState(deviceId) {
    const response = await this.get({path: `/my/lock/${deviceId}/sync`});

    return response.result.lockProperties.state;
  }

  // Fetch sync data of all locks from tedee API (delta update)
  async getSyncLocks() {
    const response = await this.get({path: `/my/lock/sync`});

    return response.result;
  }

  // Send `close` command for lock to tedee API
  async close(deviceId) {
    return this.post({
      path: '/my/lock/close',
      json: { 'deviceId': deviceId }
    });
  }

  // Send `pull spring` command for lock to tedee API
  async pullSpring(deviceId) {
    return this.post({
      path: '/my/lock/pull-spring',
      json: { 'deviceId': deviceId }
    });
  }

  // Send `open` command for lock to tedee API
  async open(deviceId) {
    return this.post({
      path: '/my/lock/open',
      json: { 'deviceId': deviceId }
    });
  }

}

module.exports = Client;
