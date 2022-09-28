'use strict';

module.exports = {
  DeviceType: {
    Bridge: 1,
    Lock: 2,
  },
  LockState: {
    Uncalibrated: 0,
    Calibrating: 1,
    Unlocked: 2,
    SemiLocked: 3,
    Unlocking: 4,
    Locking: 5,
    Locked: 6,
    Pulled: 7,
    Pulling: 8,
    Unknown: 9,
    Updating: 18,
  },
  OperationType: {
    Close: 0,
    Open: 1,
    Pull: 2,
  },
  UnlockMode: {
    Default: 0,
    /*
     * Force unlock value has find usage only when lock is in Unknown state.
     * It is responsible for making lock to go to Unlocked state no matter what.
     * It is force or emergency way to unlock the door.
     * Everybody that has access to lock can use this enum value.
     */
    ForceUnlock: 2,
    /*
     * Allows to unlock the lock without pulling the spring (when lock has auto pull spring enabled).
     */
    NoAutoPullSpring: 3,
    /*
     * Allows to perform two operations depends on current lock state.
     * When lock is in Locked state, it allows to unlock the lock (with pulling
     * the spring when lock has auto pull spring enabled).
     * When lock is in Unlocked state, it allows to perform pull spring.
     */
    UnlockOrPullSpring: 4,
  },
};
