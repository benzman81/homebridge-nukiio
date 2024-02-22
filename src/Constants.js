module.exports = {
  NUKI_LOCK_ACTION_UNLOCK : "1",
  NUKI_LOCK_ACTION_LOCK : "2",
  NUKI_LOCK_ACTION_UNLATCH : "3",
  NUKI_LOCK_ACTION_LOCK_N_GO : "4",
  NUKI_LOCK_ACTION_LOCK_N_GO_UNLATCH : "5",

  NUKI_LOCK_STATE_UNCALIBRATED : 0,
  NUKI_LOCK_STATE_LOCKED : 1,
  NUKI_LOCK_STATE_UNLOCKING : 2,
  NUKI_LOCK_STATE_UNLOCKED : 3,
  NUKI_LOCK_STATE_LOCKING : 4,
  NUKI_LOCK_STATE_UNLATCHED : 5,
  NUKI_LOCK_STATE_UNLOCKED_LOCK_N_GO : 6,
  NUKI_LOCK_STATE_UNLATCHING : 7,
  NUKI_LOCK_STATE_MOTOR_BLOCKED : 254,
  NUKI_LOCK_STATE_UNDEFINED : 255,

  DEFAULT_REQUEST_TIMEOUT_LOCK_STATE : 15000,
  DEFAULT_REQUEST_TIMEOUT_LOCK_ACTION : 45000,
  DEFAULT_REQUEST_TIMEOUT_OTHER : 15000,
  DEFAULT_WEBHOOK_SERVER_PORT : 51827,
  DEFAULT_CACHE_DIRECTORY_NAME : ".homebridge-nukiio",
  DEFAULT_PRIORITY : 99,
  REBOOT_WAIT_TIME : 45000,

  DUMMY_BRIDGE_FOR_OPENER : false,

  LOCK_STATE_MODE_REQUEST_LOCKSTATE : 0,
  LOCK_STATE_MODE_ONLY_CACHE : 1,
  LOCK_STATE_MODE_REQUEST_LASTKNOWNLOCKSTATE : 2,

  CONTEXT_FROM_NUKI_BACKGROUND : "fromNukiBackground",

  DEFAULT_MAX_TRIES_FOR_LOCK_ACTIONS : 3,
  DEFAULT_DELAY_FOR_RETRY : 3000,

  BATTERY_FULL : 100,
  BATTERY_LOW : 5
};