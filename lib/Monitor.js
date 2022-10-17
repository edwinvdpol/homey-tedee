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
    if (this.timer) {
      this.device.homey.clearTimeout(this.timer);
    }

    this.timer = null;
    this.openTriggered = false;
    this.numberOfTries = 0;
    this.operationId = null;
    this.type = 'State';

    this.state = 'ready';
  }

  // Run
  async run(operationId = null) {
    // Already running
    if (this.isRunning()) return;

    this.state = 'running';

    // Start reset timer (10 seconds)
    this.timer = this.device.homey.setTimeout(this.reset.bind(this), (1000 * 10));

    this.operationId = operationId;
    this.type = this.operationId ? 'Operation' : 'State';

    this.log('Running...');

    await (async () => {
      while (this.state === 'running') {
        try {
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
        } catch (err) {
          this.error(err.message);
          await this.reset();

          throw new Error(this.device.homey.__('errors.response'));
        }
      }
    })();
  }

  // Handle operation monitor
  async handleOperationMonitor() {
    if (!this.isRunning()) return;

    const operation = await this.device.oAuth2Client.getOperation(this.operationId);

    // Increment number of tries
    this.numberOfTries++;

    // Log current state
    this.log(`Operation status is '${operation.status}' (${this.numberOfTries}/5)`);

    // Successful
    if (Number(operation.result) === 0) {
      await this.reset();

      return;
    }

    // Stop operation monitor at 5 or more tries
    if (this.numberOfTries > 4) {
      throw new Error('Stopping, too many tries');
    }

    // Operation monitor is not completed (pending)
    if (operation.status === 'PENDING') return;

    throw new Error('Operation failed');
  }

  // Handle state monitor
  async handleStateMonitor() {
    if (!this.isRunning()) return;

    const state = await this.device.oAuth2Client.getLockState(this.device.getSetting('tedee_id'));

    // Increment number of tries
    this.numberOfTries++;

    // Log current state
    this.log(`Lock is ${LockStateNames[state]} (${this.numberOfTries}/6)`);

    // State is pulling or pulled
    if (state === LockState.Pulling || state === LockState.Pulled) {
      if (!this.openTriggered) {
        this.device.triggerOpened().catch(this.error);
      }

      this.openTriggered = true;
    }

    // Stop state monitor at 6 or more tries
    if (this.numberOfTries > 5) {
      throw new Error('Stopping, too many tries');
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
