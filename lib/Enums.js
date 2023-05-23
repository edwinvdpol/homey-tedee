'use strict';

module.exports = {
  DeviceType: {
    Bridge: 1,
    Lock: 2,
    Keypad: 3,
    LockGo: 4,
    Gate: 5,
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
  LockStateNames: {
    0: 'uncalibrated',
    1: 'calibrating',
    2: 'unlocked',
    3: 'semiLocked',
    4: 'unlocking',
    5: 'locking',
    6: 'locked',
    7: 'pulled',
    8: 'pulling',
    9: 'unknown',
    18: 'updating',
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
  UnlockModeNames: {
    0: 'default',
    2: 'force unlock',
    3: 'no auto pull spring',
    4: 'unlock or pull spring',
  },
};
