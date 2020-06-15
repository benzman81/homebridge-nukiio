const Constants = require('../Constants');

var NukiLock = require('../nuki/NukiLock');

var Service, Characteristic;

function NukiOpenerAccessory(ServiceParam, CharacteristicParam, log, config, nukiBridge, nukiBridgePlatform) {
  Service = ServiceParam;
  Characteristic = CharacteristicParam;

  this.log = log;
  this.id = config["id"];
  this.name = config["name"];
  this.nukiBridge = nukiBridge;
  this.nukiBridgePlatform = nukiBridgePlatform;
  this.deviceType = 2;

  this.informationService = new Service.AccessoryInformation();
  this.informationService.setCharacteristic(Characteristic.Manufacturer, "Nuki.io").setCharacteristic(Characteristic.Model, "Nuki.io Opener").setCharacteristic(Characteristic.SerialNumber, "Nuki.io-Id " + this.id);

  this.lockServiceOpen = new Service.LockMechanism(this.name, this.name);
  this.lockServiceOpen.getCharacteristic(Characteristic.LockCurrentState).on('get', this.getStateAlwaysUnlatch.bind(this));
  this.lockServiceOpen.getCharacteristic(Characteristic.LockTargetState).on('get', this.getStateAlwaysUnlatch.bind(this)).on('set', this.setStateAlwaysUnlatch.bind(this));

  this.lockServiceRingToOpen = new Service.LockMechanism("Ring To Open " + this.name, "Ring To Open " + this.name);
  this.lockServiceRingToOpen.getCharacteristic(Characteristic.LockCurrentState).on('get', this.getStateRingToOpen.bind(this));
  this.lockServiceRingToOpen.getCharacteristic(Characteristic.LockTargetState).on('get', this.getStateRingToOpen.bind(this)).on('set', this.setState.bind(this, "unlock"));

  this.lockServiceContinuousMode = new Service.LockMechanism("Continous Mode " + this.name, "Continous Mode " + this.name);
  this.lockServiceContinuousMode.getCharacteristic(Characteristic.LockCurrentState).on('get', this.getStateContinuousMode.bind(this));
  this.lockServiceContinuousMode.getCharacteristic(Characteristic.LockTargetState).on('get', this.getStateContinuousMode.bind(this)).on('set', this.setState.bind(this, "lockngo"));

  this.battservice = new Service.BatteryService(this.name);
  this.battservice.getCharacteristic(Characteristic.BatteryLevel).on('get', this.getBattery.bind(this));
  this.battservice.getCharacteristic(Characteristic.ChargingState).on('get', this.getCharging.bind(this));
  this.battservice.getCharacteristic(Characteristic.StatusLowBattery).on('get', this.getLowBatt.bind(this));

  var webHookCallback = (function(isRingToOpenLocked, batteryCritical, contactClosed, mode) {
    var isContinuousMode = mode === 3;
    var newHomeKitStateContinuousMode = isContinuousMode ? Characteristic.LockCurrentState.UNSECURED : Characteristic.LockCurrentState.SECURED;
    var newHomeKitStateContinuousModeTarget = isContinuousMode ? Characteristic.LockTargetState.UNSECURED : Characteristic.LockTargetState.SECURED;
    this.lockServiceContinuousMode.getCharacteristic(Characteristic.LockCurrentState).updateValue(newHomeKitStateContinuousMode, undefined, Constants.CONTEXT_FROM_NUKI_BACKGROUND);
    this.lockServiceContinuousMode.getCharacteristic(Characteristic.LockTargetState).updateValue(newHomeKitStateContinuousModeTarget, undefined, Constants.CONTEXT_FROM_NUKI_BACKGROUND);

    if (isContinuousMode) {
      isRingToOpenLocked = false;
    }
    var newHomeKitStateRingToOpenLocked = isRingToOpenLocked ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED;
    var newHomeKitStateRingToOpenLockedTarget = isRingToOpenLocked ? Characteristic.LockTargetState.SECURED : Characteristic.LockTargetState.UNSECURED;
    this.lockServiceRingToOpen.getCharacteristic(Characteristic.LockCurrentState).updateValue(newHomeKitStateRingToOpenLocked, undefined, Constants.CONTEXT_FROM_NUKI_BACKGROUND);
    this.lockServiceRingToOpen.getCharacteristic(Characteristic.LockTargetState).updateValue(newHomeKitStateRingToOpenLockedTarget, undefined, Constants.CONTEXT_FROM_NUKI_BACKGROUND);

    var newHomeKitStateBatteryCritical = batteryCritical ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    this.battservice.getCharacteristic(Characteristic.StatusLowBattery).updateValue(newHomeKitStateBatteryCritical, undefined, Constants.CONTEXT_FROM_NUKI_BACKGROUND);
    this.log("HomeKit state change by webhook complete. New isRingToOpenLocked = '%s' and batteryCritical = '%s' and mode = '%s'.", isRingToOpenLocked, batteryCritical, mode);
  }).bind(this);

  this.nukiLock = new NukiLock(this.log, nukiBridge, this.id, config["priority"], this.deviceType, webHookCallback);

  // no notification when homebridge start/restart, set LockCurrentState and
  // LockTargetState before first getState

  var isRingToOpenLockedCached = this.nukiLock.getIsLockedCached();
  var lastHomeKitStateRingToOpenCached = isRingToOpenLockedCached ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED;
  var lastHomeKitStateRingToOpenTargetCached = isRingToOpenLockedCached ? Characteristic.LockTargetState.SECURED : Characteristic.LockTargetState.UNSECURED;
  this.lockServiceRingToOpen.getCharacteristic(Characteristic.LockTargetState).updateValue(lastHomeKitStateRingToOpenTargetCached, undefined, null);
  this.lockServiceRingToOpen.getCharacteristic(Characteristic.LockCurrentState).updateValue(lastHomeKitStateRingToOpenCached, undefined, null);

  var modeCached = this.nukiLock.getModeCached();
  var isContinuousModeCached = modeCached === 3;
  var lastHomeKitStateContinuousModeCached = isContinuousModeCached ? Characteristic.LockCurrentState.UNSECURED : Characteristic.LockCurrentState.SECURED;
  var lastHomeKitStateContinuousModeTargetCached = isContinuousModeCached ? Characteristic.LockTargetState.UNSECURED : Characteristic.LockTargetState.SECURED;
  this.lockServiceContinuousMode.getCharacteristic(Characteristic.LockTargetState).updateValue(lastHomeKitStateContinuousModeTargetCached, undefined, null);
  this.lockServiceContinuousMode.getCharacteristic(Characteristic.LockCurrentState).updateValue(lastHomeKitStateContinuousModeCached, undefined, null);

  this.lockServiceOpen.getCharacteristic(Characteristic.LockTargetState).updateValue(Characteristic.LockTargetState.SECURED, undefined, null);
  this.lockServiceOpen.getCharacteristic(Characteristic.LockCurrentState).updateValue(Characteristic.LockCurrentState.SECURED, undefined, null);
};

NukiOpenerAccessory.prototype.getStateRingToOpen = function(callback) {
  var callbackIsLocked = (function(err, isLocked) {
    var modeCached = this.nukiLock.getModeCached();
    var isContinuousModeCached = modeCached === 3;
    if (isContinuousModeCached) {
      isLocked = false;
    }
    callback(err, isLocked ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED);
  }).bind(this);
  this.nukiLock.isLocked(callbackIsLocked);
};

NukiOpenerAccessory.prototype.getStateContinuousMode = function(callback) {
  var callbackIsLocked = (function(err, isLocked) {
    var modeCached = this.nukiLock.getModeCached();
    var isContinuousModeCached = modeCached === 3;
    callback(err, isContinuousModeCached ? Characteristic.LockCurrentState.UNSECURED : Characteristic.LockCurrentState.SECURED);
  }).bind(this);
  this.nukiLock.isLocked(callbackIsLocked);
};

NukiOpenerAccessory.prototype.getStateAlwaysUnlatch = function(callback) {
  callback(null, Characteristic.LockCurrentState.SECURED);
};

NukiOpenerAccessory.prototype.setStateAlwaysUnlatch = function(homeKitState, callback, context) {
  var doLock = homeKitState == Characteristic.LockTargetState.SECURED;
  if (doLock) {
    this.lockServiceOpen.getCharacteristic(Characteristic.LockTargetState).updateValue(Characteristic.LockTargetState.SECURED, undefined, null);
    this.lockServiceOpen.getCharacteristic(Characteristic.LockCurrentState).updateValue(Characteristic.LockCurrentState.SECURED, undefined, null);
    if (callback) {
      callback(null);
    }
  }
  else {
    var lockStateChangeCallback = (function(params, err, json) {
      if (err && err.retryableError && params.lockTry < this.nukiBridgePlatform.lockactionMaxtries) {
        this.log("An error occured processing open action. Will retry now...");
        var currentLockTry = params.lockTry;
        params.lockTry = params.lockTry + 1;
        setTimeout((function() {
          this.nukiLock.unlatch(lockStateChangeCallback);
        }).bind(this), this.nukiBridgePlatform.lockactionRetryDelay * currentLockTry);
      }
      else {
        if (err) {
          if (params.lockTry == 1) {
            this.log("An error occured processing open action. Reason: %s", err);
          }
          else {
            this.log("An error occured processing open action after retrying multiple times. Reason: %s", err);
          }
        }
        this.lockServiceOpen.getCharacteristic(Characteristic.LockTargetState).updateValue(Characteristic.LockTargetState.UNSECURED, undefined, null);
        this.lockServiceOpen.getCharacteristic(Characteristic.LockCurrentState).updateValue(Characteristic.LockCurrentState.UNSECURED, undefined, null);
        callback(null);
        setTimeout((function() {
          this.lockServiceOpen.getCharacteristic(Characteristic.LockTargetState).updateValue(Characteristic.LockTargetState.SECURED, undefined, Constants.CONTEXT_FROM_NUKI_BACKGROUND);
          this.lockServiceOpen.getCharacteristic(Characteristic.LockCurrentState).updateValue(Characteristic.LockCurrentState.SECURED, undefined, Constants.CONTEXT_FROM_NUKI_BACKGROUND);
          this.log("HomeKit change for door opener back to locked state complete.");
        }).bind(this), 1000);
        this.log("HomeKit state change complete.");
      }
    }).bind(this, {
      lockTry : 1
    });

    this.nukiLock.unlatch(lockStateChangeCallback);
  }
};

NukiOpenerAccessory.prototype.setState = function(unlockType, homeKitState, callback, context) {
  var doLock = homeKitState == Characteristic.LockTargetState.SECURED;
  var newHomeKitState = doLock ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED;
  var newHomeKitStateTarget = doLock ? Characteristic.LockTargetState.SECURED : Characteristic.LockTargetState.UNSECURED;
  // this.log("S E T S T A T E: unlockType = %s, doLock = %s,homeKitState = %s",
  // unlockType, doLock, homeKitState);
  if (unlockType !== "lockngo") {
    var modeCached = this.nukiLock.getModeCached();
    var isContinuousModeCached = modeCached === 3;
    if (isContinuousModeCached) {
      if (doLock) {
        this.lockServiceRingToOpen.getCharacteristic(Characteristic.LockTargetState).updateValue(Characteristic.LockTargetState.SECURED, undefined, null);
        this.lockServiceRingToOpen.getCharacteristic(Characteristic.LockCurrentState).updateValue(Characteristic.LockCurrentState.SECURED, undefined, null);
        callback(null);
        setTimeout((function() {
          this.lockServiceRingToOpen.getCharacteristic(Characteristic.LockTargetState).updateValue(Characteristic.LockTargetState.UNSECURED, undefined, Constants.CONTEXT_FROM_NUKI_BACKGROUND);
          this.lockServiceRingToOpen.getCharacteristic(Characteristic.LockCurrentState).updateValue(Characteristic.LockCurrentState.UNSECURED, undefined, Constants.CONTEXT_FROM_NUKI_BACKGROUND);
          this.log("HomeKit change for ring to open back to unlock state complete as continous mode is still active.");
        }).bind(this), 1000);
      }
      else {
        callback(null);
      }
      return;
    }
  }

  var updateStates = (function(unlockType, doLock, newHomeKitState, newHomeKitStateTarget) {
    if (unlockType === "lockngo") {
      this.lockServiceContinuousMode.getCharacteristic(Characteristic.LockTargetState).updateValue(newHomeKitStateTarget, undefined, null);
      this.lockServiceContinuousMode.getCharacteristic(Characteristic.LockCurrentState).updateValue(newHomeKitState, undefined, null);
      if (!doLock || this.nukiLock.getIsLockedCached()) {
        setTimeout((function() {
          this.lockServiceRingToOpen.getCharacteristic(Characteristic.LockTargetState).updateValue(newHomeKitStateTarget, undefined, Constants.CONTEXT_FROM_NUKI_BACKGROUND);
          this.lockServiceRingToOpen.getCharacteristic(Characteristic.LockCurrentState).updateValue(newHomeKitState, undefined, Constants.CONTEXT_FROM_NUKI_BACKGROUND);
          this.log("HomeKit change for ring to open back to unlock state complete as continous mode is still active.");
        }).bind(this), 1000);
      }
    }
    else {
      this.lockServiceRingToOpen.getCharacteristic(Characteristic.LockTargetState).updateValue(newHomeKitStateTarget, undefined, null);
      this.lockServiceRingToOpen.getCharacteristic(Characteristic.LockCurrentState).updateValue(newHomeKitState, undefined, null);
    }
  }).bind(this);

  var lockStateChangeCallback = (function(params, err, json) {
    if (err && err.retryableError) {
      if (params.lockTry < this.nukiBridgePlatform.lockactionMaxtries) {
        this.log("An error occured processing lock action. Will retry now...");
        var currentLockTry = params.lockTry;
        params.lockTry = params.lockTry + 1;
        setTimeout((function() {
          if (unlockType === "lockngo") {
            if (doLock) {
              this.nukiLock.lockNGoUnlatch(lockStateChangeCallback);
            }
            else {
              this.nukiLock.lockNGo(lockStateChangeCallback);
            }
          }
          else {
            if (doLock) {
              this.nukiLock.lock(lockStateChangeCallback);
            }
            else {
              this.nukiLock.unlock(lockStateChangeCallback);
            }
          }
        }).bind(this), this.nukiBridgePlatform.lockactionRetryDelay * currentLockTry);
      }
      else {
        updateStates(unlockType, doLock, newHomeKitState, newHomeKitStateTarget);
        callback(err);
        this.log("An error occured processing lock action after retrying multiple times. Reason: %s", err);
      }
    }
    else {
      updateStates(unlockType, doLock, newHomeKitState, newHomeKitStateTarget);
      callback(null);
      if (err) {
        this.log("An error occured processing lock action. Reason: %s", err);
      }
    }
    this.log("HomeKit state change complete.");
  }).bind(this, {
    lockTry : 1
  });

  if (context === Constants.CONTEXT_FROM_NUKI_BACKGROUND) {
    updateStates(unlockType, doLock, newHomeKitState, newHomeKitStateTarget);
    if (callback) {
      callback(null);
    }
    this.log("HomeKit state change complete from Background.");
  }
  else {
    if (unlockType === "lockngo") {
      if (doLock) {
        this.nukiLock.lockNGoUnlatch(lockStateChangeCallback);
      }
      else {
        this.nukiLock.lockNGo(lockStateChangeCallback);
      }
    }
    else {
      if (doLock) {
        this.nukiLock.lock(lockStateChangeCallback);
      }
      else {
        this.nukiLock.unlock(lockStateChangeCallback);
      }
    }
  }
};

NukiOpenerAccessory.prototype.getBattery = function(callback) {
  callback(null, 100);
};

NukiOpenerAccessory.prototype.getCharging = function(callback) {
  callback(null, Characteristic.ChargingState.NOT_CHARGEABLE);
};

NukiOpenerAccessory.prototype.getLowBatt = function(callback) {
  var getLowBattCallback = (function(err, lowBattery) {
    if (err) {
      this.log("An error occured retrieving battery status. Reason: %s", err);
      callback(err);
    }
    else {
      callback(null, lowBattery ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);
    }
  }).bind(this);
  this.nukiLock.getLowBatt(getLowBattCallback);
};

NukiOpenerAccessory.prototype.getServices = function() {
  return [ this.lockServiceOpen, this.lockServiceRingToOpen, this.lockServiceContinuousMode, this.informationService, this.battservice ];
};

module.exports = NukiOpenerAccessory;