'use strict';

const Driver = require('/lib/Driver');

class LockDriver extends Driver {

  /*
  |-----------------------------------------------------------------------------
  | Driver events
  |-----------------------------------------------------------------------------
  */

  /**
   * Driver initialized.
   *
   * @async
   * @returns {Promise<void>}
   */
  async onOAuth2Init() {
    this._flowTriggerOpened = this.homey.flow.getDeviceTriggerCard('opened');
  }

  /*
  |-----------------------------------------------------------------------------
  | Flow card triggers
  |-----------------------------------------------------------------------------
  */

  /**
   * Opened trigger.
   *
   * @async
   * @param {Device} device
   * @returns {Promise<any | void>}
   */
  async triggerOpened(device) {
    if (device.alreadyTriggered('opened')) {
      return;
    }

    return this._flowTriggerOpened.trigger(device, {})
        .then(async () => {
          device.addTriggered('opened');
        })
        .catch(this.error);
  }

}

module.exports = LockDriver;
