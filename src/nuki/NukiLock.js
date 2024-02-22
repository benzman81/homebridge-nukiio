const Constants = require('../Constants');

function NukiLock(log, nukiBridge, id, priority, deviceType, webHookCallback) {
  this.nukiBridge = nukiBridge;
  this.log = log;
  this.id = id;
  this.lockAction = Constants.NUKI_LOCK_ACTION_LOCK;
  this.unlockAction = Constants.NUKI_LOCK_ACTION_UNLOCK;
  this.unlatchAction = Constants.NUKI_LOCK_ACTION_UNLATCH;
  this.lockNGoAction = Constants.NUKI_LOCK_ACTION_LOCK_N_GO;
  this.lockNGoActionUnlatch = Constants.NUKI_LOCK_ACTION_LOCK_N_GO_UNLATCH;
  this.priority = priority;
  this.deviceType = deviceType;
  this.webHookCallback = webHookCallback;

  if (this.priority == null || this.priority == "") {
    this.priority = Constants.DEFAULT_PRIORITY;
  }

  this.nukiBridge._addLock(this);

  var callbackIsLocked = (function(err, json) {
    this.log("Initial is locked request finished.");
  }).bind(this);
  if (this.nukiBridge.lockStateMode === Constants.LOCK_STATE_MODE_ONLY_CACHE) {
    this.isLocked(callbackIsLocked, true);
  }
};

NukiLock.prototype.isLocked = function isLocked(callback /* (err, isLocked) */, forceRequest) {
  if (forceRequest || this.nukiBridge.lockStateMode === Constants.LOCK_STATE_MODE_REQUEST_LOCKSTATE || this.nukiBridge.lockStateMode === Constants.LOCK_STATE_MODE_REQUEST_LASTKNOWNLOCKSTATE) {
    var callbackWrapper = (function(err, json) {
      if (err) {
        var cachedIsLocked = this.getIsLockedCached();
        this.log("Request for lock state aborted. This is no problem and might happen due to canceled request or due to long response time of the Nuki bridge. Using cached value isLocked = '%s'.", cachedIsLocked);
        callback(null, cachedIsLocked);
      }
      else {
        var state = Constants.NUKI_LOCK_STATE_UNDEFINED;
        var batteryCritical = false;
        var batteryCharging = false;
        var batteryChargeState = 100;
        var contactClosed = true;
        var mode = 2;
        if (json) {
          state = json.state;
          batteryCritical = json.batteryCritical;
          batteryCharging = json.batteryCharging === true;
          batteryChargeState = json.batteryChargeState ? json.batteryChargeState: batteryCritical ? Constants.BATTERY_LOW : Constants.BATTERY_FULL;
          contactClosed = json.doorsensorState !== 3;
          mode = json.mode;
        }
        var isLocked = this._isLocked(state);
        this.log("Lock state is isLocked = '%s' (Nuki state '%s' ) with battery critical = '%s', battery charging = '%s', battery charge state = '%s', contactClosed = '%s' and mode = '%s'", isLocked, state, batteryCritical, batteryCharging, batteryChargeState, contactClosed, mode);
        this._setLockCache(isLocked, batteryCritical, batteryCharging, batteryChargeState, contactClosed, mode);
        callback(null, isLocked);
      }
    }).bind(this);
    callbackWrapper.nukiLock = this;
    if (this.nukiBridge.lockStateMode === Constants.LOCK_STATE_MODE_REQUEST_LASTKNOWNLOCKSTATE) {
      this.nukiBridge._lastKnownlockState(this, [ callbackWrapper ]);
    }
    else {
      this.nukiBridge._lockState(this, [ callbackWrapper ]);
    }
  }
  else {
    var cachedIsLocked = this.getIsLockedCached();
    this.log("Cached lock state is isLocked = '%s'.", cachedIsLocked);
    callback(null, cachedIsLocked);
  }
};

NukiLock.prototype.isContactClosed = function isContactClosed(callback /* (err, isContactClosed) */) {
  var callbackIsLocked = (function(err, islocked) {
    callback(err, this._getIsContactClosed());
  }).bind(this);
  this.isLocked(callbackIsLocked);
};

NukiLock.prototype.getLowBatt = function getLowBatt(callback /* (err, lowBattt) */) {
  callback(null, this.getIsBatteryLowCached());
};

NukiLock.prototype.getCharging = function getCharging(callback /* (err, charging) */) {
  callback(null, this.getBatteryChargingCached());
};

NukiLock.prototype.getChargeState = function getChargeState(callback /* (err, chargeState) */) {
  callback(null, this.getBatteryChargeStateCached());
};

NukiLock.prototype._isLocked = function _isLocked(state) {
  var isLocked = state == Constants.NUKI_LOCK_STATE_LOCKED || state == Constants.NUKI_LOCK_STATE_LOCKING || state == Constants.NUKI_LOCK_STATE_UNCALIBRATED || state == Constants.NUKI_LOCK_STATE_MOTOR_BLOCKED || state == Constants.NUKI_LOCK_STATE_UNDEFINED;
  return isLocked;
};

NukiLock.prototype.lock = function lock(callback) {
  var callbackWrapper = (function(err, json) {
    if (!err || !err.retryableError) {
      this._setLockCache(true);
    }
    callback(err, json);
  }).bind(this);
  this.nukiBridge._lockAction(this, this.lockAction, callbackWrapper);
};

NukiLock.prototype.unlock = function unlock(callback) {
  var callbackWrapper = (function(err, json) {
    if (!err || !err.retryableError) {
      this._setLockCache(false);
    }
    callback(err, json);
  }).bind(this);
  this.log("Temp debug log: function unlock called.");
  this.nukiBridge._lockAction(this, this.unlockAction, callbackWrapper);
};

NukiLock.prototype.unlatch = function unlatch(callback) {
  var callbackWrapper = (function(err, json) {
    if ((!err || !err.retryableError) && this.deviceType === 0) {
      this._setLockCache(false);
    }
    callback(err, json);
  }).bind(this);
  this.log("Temp debug log: function unlatch called.");
  this.nukiBridge._lockAction(this, this.unlatchAction, callbackWrapper);
};

NukiLock.prototype.lockNGo = function lock(callback) {
  var callbackWrapper = (function(err, json) {
    if (!err || !err.retryableError) {
      this._setLockCache(undefined, undefined, 3);
    }
    callback(err, json);
  }).bind(this);
  this.nukiBridge._lockAction(this, this.lockNGoAction, callbackWrapper);
};

NukiLock.prototype.lockNGoUnlatch = function unlock(callback) {
  var callbackWrapper = (function(err, json) {
    if (!err || !err.retryableError) {
      this._setLockCache(undefined, undefined, 2);
    }
    callback(err, json);
  }).bind(this);
  this.nukiBridge._lockAction(this, this.lockNGoActionUnlatch, callbackWrapper);
};

NukiLock.prototype.getIsLockedCached = function getIsLockedCached() {
  var lockCache = this.nukiBridge.storage.getItemSync(this._getLockStorageKey());
  if (lockCache === undefined) {
    return true;
  }
  return lockCache.isLocked;
};

NukiLock.prototype._getIsContactClosed = function _getIsContactClosed() {
  var lockCache = this.nukiBridge.storage.getItemSync(this._getLockStorageKey());
  if (lockCache === undefined) {
    return true;
  }
  return lockCache.contactClosed;
};

NukiLock.prototype.getIsBatteryLowCached = function getIsBatteryLowCached() {
  var lockCache = this.nukiBridge.storage.getItemSync(this._getLockStorageKey());
  if (lockCache === undefined) {
    return false;
  }
  return lockCache.batteryCritical;
};

NukiLock.prototype.getBatteryChargingCached = function getBatteryChargingCached() {
  var lockCache = this.nukiBridge.storage.getItemSync(this._getLockStorageKey());
  if (lockCache === undefined) {
    return false;
  }
  return lockCache.batteryCharging;
};

NukiLock.prototype.getBatteryChargeStateCached = function getBatteryChargeStateCached() {
  var lockCache = this.nukiBridge.storage.getItemSync(this._getLockStorageKey());
  if (lockCache === undefined) {
    return false;
  }
  return lockCache.batteryChargeState;
};

NukiLock.prototype.getModeCached = function getModeCached() {
  var lockCache = this.nukiBridge.storage.getItemSync(this._getLockStorageKey());
  if (lockCache === undefined) {
    return 2;
  }
  return lockCache.mode;
};

NukiLock.prototype._setLockCache = function _setLockCache(isLocked, batteryCritical, batteryCharging, batteryChargeState, contactClosed, mode) {
  var newCache = {
    isLocked : this.getIsLockedCached(),
    batteryCritical : this.getIsBatteryLowCached(),
    batteryCharging : this.getBatteryChargingCached(),
    batteryChargeState : this.getBatteryChargeStateCached(),
    contactClosed : this._getIsContactClosed(),
    mode : this.getModeCached()
  }
  if (isLocked !== undefined && isLocked !== null) {
    newCache.isLocked = isLocked;
  }
  if (batteryCritical !== undefined && batteryCritical !== null) {
    newCache.batteryCritical = batteryCritical;
  }
  if (batteryCharging !== undefined && batteryCharging !== null) {
    newCache.batteryCharging = batteryCharging;
  }
  if (batteryChargeState !== undefined && batteryChargeState !== null) {
    newCache.batteryChargeState = batteryChargeState;
  }
  if (contactClosed !== undefined && contactClosed !== null) {
    newCache.contactClosed = contactClosed;
  }
  if (mode !== undefined && mode !== null) {
    newCache.mode = mode;
  }
  this.nukiBridge.storage.setItemSync(this._getLockStorageKey(), newCache);
};

NukiLock.prototype._getLockStorageKey = function _getLockStorageKey() {
  return 'bridge-' + this.nukiBridge.bridgeUrl + '-lock-' + this.instanceId + '-' + this.id + '-cache';
};

module.exports = NukiLock;