'use strict';

class Flow {

  // Constructor
  constructor({ homey }) {
    this.homey = homey;
  }

  // Register flow cards
  async register() {
    try {
      await this._registerActionFlowCards();
      await this._registerConditionFlowCards();
    } catch (err) {
      this.homey.error(`Could not register flow cards: ${err.message}`);
    }
  }

  // Register action flow cards
  async _registerActionFlowCards() {
    // ... then pull the spring ...
    this.homey.flow.getActionCard('open').registerRunListener(async ({ device }) => {
      await device.pullSpring();
    });
  }

  // Register condition flow cards
  async _registerConditionFlowCards() {
    // ... and is charging ...
    this.homey.flow.getConditionCard('charging').registerRunListener(async ({ device }) => {
      return device.getCapabilityValue('charging') === true;
    });

    // ... and is connected ...
    this.homey.flow.getConditionCard('connected').registerRunListener(async ({ device }) => {
      return device.getCapabilityValue('connected') === true;
    });

    // ... and update is available ...
    this.homey.flow.getConditionCard('update_available').registerRunListener(async ({ device }) => {
      return device.getCapabilityValue('update_available') === true;
    });
  }

}

module.exports = Flow;
