'use strict';

const { LockState, LockStateNames } = require('./Enums');

class Monitor {

  // Constructor
  constructor({ device }) {
    this.device = device;

    // Reset
    this.reset().catch(this.error);
  }

  /*
  | Action functions
  */

  // Stop / reset
  async reset() {
    this.state = 'ready';
    this.openTriggered = false;
    this.numberOfTries = 0;
    this.operationId = null;
    this.type = 'State';

    this.log('Reset');
  }

  // Run
  async run(operationId = null) {
    // Already running
    if (this.isRunning()) return;

    this.operationId = operationId;
    this.state = 'running';

    this.type = this.operationId ? 'Operation' : 'State';

    this.log('Running...');

    await (async () => {
      while (this.state === 'running') {
        await new Promise((resolve) => setTimeout(resolve, 900));

        // Operation monitor
        if (this.type === 'Operation') {
          await this.handleOperationMonitor();
        }

        const monitor = this.operationId ? 'Operation' : 'State';

        if (monitor !== this.type) {
          this.type = monitor;

          this.numberOfTries = 0;

          this.log('Switched');
        }

        // State monitor
        if (this.type === 'State') {
          await this.handleStateMonitor();
        }
      }
    })();
  }

  // Handle state monitor
  async handleOperationMonitor() {
    const operation = await this.device.oAuth2Client.getOperation(this.operationId);

    // Increment number of tries
    this.numberOfTries++;

    // Log current state
    this.log(`Operation status is '${operation.status}' (${this.numberOfTries})`);

    // Successful
    if (operation.result === 0) {
      this.log('Operation successful');

      await this.reset();

      return;
    }

    // Stop operation monitor at 5 or more tries
    if (this.numberOfTries > 4) {
      await this.errorReset('Stopping, to many tries', 'errors.response');
    }

    // Operation monitor is not completed (pending)
    if (operation.status === 'PENDING') return;

    await this.errorReset('Operation failed', 'errors.response');
  }

  // Handle state monitor
  async handleStateMonitor() {
    const data = await this.device.getSyncData();

    // Increment number of tries
    this.numberOfTries++;

    const state = Number(data.lockProperties.state);

    // Log current state
    this.log(`Lock is ${LockStateNames[state]} (${state})`);

    // State is pulling or pulled
    if (state === LockState.Pulling || state === LockState.Pulled) {
      if (!this.openTriggered) {
        await this.device.triggerOpened();
      }

      this.openTriggered = true;
    }

    // Update device
    await this.device.handleSyncData(data);

    // Stop state monitor at 6 or more tries
    if (this.numberOfTries > 5) {
      await this.errorReset('Stopping state monitor, to many tries', 'errors.response');
    }

    // Check if monitor is still needed
    if (!this.shouldRun(state)) {
      await this.reset();
    }
  }

  /*
  | State functions
  */

  // Return whether the monitor is running.
  isRunning() {
    return this.state === 'running';
  }

  // Verify if the monitor needs to run or continue
  shouldRun(stateId) {
    return this.device.getAvailable()
      && (stateId === LockState.Locking
        || stateId === LockState.Unlocking
        || stateId === LockState.Pulled
        || stateId === LockState.Pulling);
  }

  /*
  | Support functions
  */

  async errorReset(message, locale) {
    await this.reset();

    await this.device.errorIdle(message, locale);
  }

  /*
  | Log functions
  */

  error(...args) {
    this.device.error(`[${this.type} Monitor]`, ...args);
  }

  log(...args) {
    this.device.log(`[${this.type} Monitor]`, ...args);
  }

}

module.exports = Monitor;
