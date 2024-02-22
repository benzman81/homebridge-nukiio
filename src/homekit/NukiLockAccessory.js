const Constants = require('../Constants');

var NukiLock = require('../nuki/NukiLock');

var Service, Characteristic;

function NukiLockAccessory(ServiceParam, CharacteristicParam, log, config, nukiBridge, nukiBridgePlatform) {
  Service = ServiceParam;
  Characteristic = CharacteristicParam;

  this.log = log;
  this.id = config["id"];
  this.name = config["name"];
  this.usesDoorLatch = config["usesDoorLatch"] === true || false;
  this.usesDoorContactSensor = config["usesDoorContactSensor"] === true || false;
  this.preventLockingIfAlreadyLocked = config["preventLockingIfAlreadyLocked"] === true || false;
  this.nukiBridge = nukiBridge;
  this.nukiBridgePlatform = nukiBridgePlatform;
  this.deviceType = config["deviceType"];

  if (this.deviceType == null || this.deviceType == "") {
    this.deviceType = 0;
  }

  this.services = [];

  this.informationService = new Service.AccessoryInformation();
  this.informationService.setCharacteristic(Characteristic.Manufacturer, "Nuki.io").setCharacteristic(Characteristic.Model, "Nuki.io Lock").setCharacteristic(Characteristic.SerialNumber, "Nuki.io-Id " + this.id);
  this.services.push(this.informationService);

  this.lockServiceUnlock = new Service.LockMechanism(this.name, this.name);
  this.lockServiceUnlock.getCharacteristic(Characteristic.LockCurrentState).on('get', this.getState.bind(this));
  this.lockServiceUnlock.getCharacteristic(Characteristic.LockTargetState).on('get', this.getState.bind(this)).on('set', this.setState.bind(this));
  this.services.push(this.lockServiceUnlock);

  if (this.usesDoorLatch) {
    this.lockServiceAlwaysUnlatch = new Service.LockMechanism(this.name + " ALWAYS Unlatch", this.name + " ALWAYS Unlatch");
    this.lockServiceAlwaysUnlatch.getCharacteristic(Characteristic.LockCurrentState).on('get', this.getStateAlwaysUnlatch.bind(this));
    this.lockServiceAlwaysUnlatch.getCharacteristic(Characteristic.LockTargetState).on('get', this.getStateAlwaysUnlatch.bind(this)).on('set', this.setStateAlwaysUnlatch.bind(this));
    this.services.push(this.lockServiceAlwaysUnlatch);

    this.switchUnlatchAllowedService = new Service.Switch(this.name + " Unlatch Allowed");
    this.switchUnlatchAllowedService.getCharacteristic(Characteristic.On).on('get', this.getStateSwitchUnlatchAllowed.bind(this)).on('set', this.setStateSwitchUnlatchAllowed.bind(this));
    this.services.push(this.switchUnlatchAllowedService);
  }
  if (this.usesDoorContactSensor) {
    this.doorContactSensor = new Service.ContactSensor(this.name + " Contact Sensor");
    this.doorContactSensor.getCharacteristic(Characteristic.ContactSensorState).on('get', this.getStateContactSensor.bind(this));
    this.services.push(this.doorContactSensor);
  }

  this.battservice = new Service.BatteryService(this.name);
  this.battservice.getCharacteristic(Characteristic.BatteryLevel).on('get', this.getBattery.bind(this));
  this.battservice.getCharacteristic(Characteristic.ChargingState).on('get', this.getCharging.bind(this));
  this.battservice.getCharacteristic(Characteristic.StatusLowBattery).on('get', this.getLowBatt.bind(this));
  this.services.push(this.battservice);

  var webHookCallback = (function(isLocked, batteryCritical, batteryCharging, batteryChargeState, contactClosed, mode, ringactionState) {
    var newHomeKitStateLocked = isLocked ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED;
    var newHomeKitStateLockedTarget = isLocked ? Characteristic.LockTargetState.SECURED : Characteristic.LockTargetState.UNSECURED;
    var newHomeKitStateBatteryCritical = batteryCritical ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    var newHomeKitStateBatteryCharging = batteryCharging ? Characteristic.ChargingState.CHARGING : Characteristic.ChargingState.NOT_CHARGING;
    this.lockServiceUnlock.getCharacteristic(Characteristic.LockCurrentState).updateValue(newHomeKitStateLocked, undefined, Constants.CONTEXT_FROM_NUKI_BACKGROUND);
    this.lockServiceUnlock.getCharacteristic(Characteristic.LockTargetState).updateValue(newHomeKitStateLockedTarget, undefined, Constants.CONTEXT_FROM_NUKI_BACKGROUND);
    this.battservice.getCharacteristic(Characteristic.StatusLowBattery).updateValue(newHomeKitStateBatteryCritical, undefined, Constants.CONTEXT_FROM_NUKI_BACKGROUND);
    this.battservice.getCharacteristic(Characteristic.BatteryLevel).updateValue(batteryChargeState, undefined, Constants.CONTEXT_FROM_NUKI_BACKGROUND);
    this.battservice.getCharacteristic(Characteristic.ChargingState).updateValue(newHomeKitStateBatteryCharging, undefined, Constants.CONTEXT_FROM_NUKI_BACKGROUND);
    if (this.usesDoorContactSensor) {
      this.doorContactSensor.getCharacteristic(Characteristic.ContactSensorState).updateValue(contactClosed ? Characteristic.ContactSensorState.CONTACT_DETECTED : Characteristic.ContactSensorState.CONTACT_NOT_DETECTED, undefined, Constants.CONTEXT_FROM_NUKI_BACKGROUND);
    }
    this.log("HomeKit state change by webhook complete. New isLocked = '%s' and batteryCritical = '%s', battery charging = '%s', battery charge state = '%s' and contactClosed = '%s'.", isLocked, batteryCritical, batteryCharging, batteryChargeState, contactClosed);
  }).bind(this);

  this.nukiLock = new NukiLock(this.log, nukiBridge, this.id, config["priority"], this.deviceType, webHookCallback);

  // no notification when homebridge start/restart, set LockCurrentState and
  // LockTargetState before first getState
  var isLockedCached = this.nukiLock.getIsLockedCached();
  var lastHomeKitStateLockedCached = isLockedCached ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED;
  var lastHomeKitStateLockedTargetCached = isLockedCached ? Characteristic.LockTargetState.SECURED : Characteristic.LockTargetState.UNSECURED;
  this.lockServiceUnlock.getCharacteristic(Characteristic.LockTargetState).updateValue(lastHomeKitStateLockedTargetCached, undefined, null);
  this.lockServiceUnlock.getCharacteristic(Characteristic.LockCurrentState).updateValue(lastHomeKitStateLockedCached, undefined, null);
  if (this.usesDoorLatch) {
    this.lockServiceAlwaysUnlatch.getCharacteristic(Characteristic.LockTargetState).updateValue(Characteristic.LockTargetState.SECURED, undefined, null);
    this.lockServiceAlwaysUnlatch.getCharacteristic(Characteristic.LockCurrentState).updateValue(Characteristic.LockCurrentState.SECURED, undefined, null);

    var isUnlatchAllowed = this._isUnlatchAllowed();
    this.switchUnlatchAllowedService.getCharacteristic(Characteristic.On).updateValue(isUnlatchAllowed, undefined, null);
  }
  var isBatteryLowCached = this.nukiLock.getIsBatteryLowCached();
  var batteryChargingCached = this.nukiLock.getBatteryChargingCached();
  var batteryChargeStateCached = this.nukiLock.getBatteryChargeStateCached();
  this.battservice.getCharacteristic(Characteristic.StatusLowBattery).updateValue(isBatteryLowCached ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL, undefined, null);
  this.battservice.getCharacteristic(Characteristic.BatteryLevel).updateValue(batteryChargeStateCached, undefined, null);
  this.battservice.getCharacteristic(Characteristic.ChargingState).updateValue(batteryChargingCached ? Characteristic.ChargingState.CHARGING : Characteristic.ChargingState.NOT_CHARGING, undefined, null);
};

NukiLockAccessory.prototype.getState = function(callback) {
  var callbackIsLocked = (function(err, isLocked) {
    callback(err, isLocked ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED);
  }).bind(this);
  this.nukiLock.isLocked(callbackIsLocked);
};

NukiLockAccessory.prototype.getStateContactSensor = function(callback) {
  var callbackIsContactClosed = (function(err, isContactClosed) {
    callback(err, isContactClosed ? Characteristic.ContactSensorState.CONTACT_DETECTED : Characteristic.ContactSensorState.CONTACT_NOT_DETECTED);
  }).bind(this);
  this.nukiLock.isContactClosed(callbackIsContactClosed);
};

NukiLockAccessory.prototype.getStateAlwaysUnlatch = function(callback) {
  callback(null, Characteristic.LockCurrentState.SECURED);
};

NukiLockAccessory.prototype.setStateAlwaysUnlatch = function(homeKitState, callback, context) {
  var doLock = homeKitState == Characteristic.LockTargetState.SECURED;
  var isUnlatchAllowed = this._isUnlatchAllowed();
  if (doLock || !isUnlatchAllowed) {
    if (!doLock && !isUnlatchAllowed) {
      this.log("Unlatching is set to not be allowed so nothing is executed and state will be switched back.");
    }
    this.lockServiceAlwaysUnlatch.getCharacteristic(Characteristic.LockTargetState).updateValue(Characteristic.LockTargetState.SECURED, undefined, null);
    this.lockServiceAlwaysUnlatch.getCharacteristic(Characteristic.LockCurrentState).updateValue(Characteristic.LockCurrentState.SECURED, undefined, null);
    if (callback) {
      callback(null);
    }
  }
  else {
    var lockStateChangeCallback = (function(params, err, json) {
      if (err && err.retryableError && params.lockTry < this.nukiBridgePlatform.lockactionMaxtries) {
        this.log("An error occured processing lock action. Will retry now...");
        var currentLockTry = params.lockTry;
        params.lockTry = params.lockTry + 1;
        setTimeout((function() {
          this.nukiLock.unlatch(lockStateChangeCallback);
        }).bind(this), this.nukiBridgePlatform.lockactionRetryDelay * currentLockTry);
      }
      else {
        if (err) {
          if (params.lockTry == 1) {
            this.log("An error occured processing lock action. Reason: %s", err);
          }
          else {
            this.log("An error occured processing lock action after retrying multiple times. Reason: %s", err);
          }
        }
        this.lockServiceAlwaysUnlatch.getCharacteristic(Characteristic.LockTargetState).updateValue(Characteristic.LockTargetState.UNSECURED, undefined, null);
        this.lockServiceAlwaysUnlatch.getCharacteristic(Characteristic.LockCurrentState).updateValue(Characteristic.LockCurrentState.UNSECURED, undefined, null);
        callback(null);
        setTimeout((function() {
          this.lockServiceAlwaysUnlatch.getCharacteristic(Characteristic.LockTargetState).updateValue(Characteristic.LockTargetState.SECURED, undefined, Constants.CONTEXT_FROM_NUKI_BACKGROUND);
          this.lockServiceAlwaysUnlatch.getCharacteristic(Characteristic.LockCurrentState).updateValue(Characteristic.LockCurrentState.SECURED, undefined, Constants.CONTEXT_FROM_NUKI_BACKGROUND);
          this.log("HomeKit change for door latch back to locked state complete.");
        }).bind(this), 1000);
        this.log("HomeKit state change complete.");
      }
    }).bind(this, {
      lockTry : 1
    });

    this.nukiLock.unlatch(lockStateChangeCallback);
  }
};

NukiLockAccessory.prototype.setState = function(homeKitState, callback, context) {
  var doLock = homeKitState == Characteristic.LockTargetState.SECURED;
  var newHomeKitState = doLock ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED;
  var newHomeKitStateTarget = doLock ? Characteristic.LockTargetState.SECURED : Characteristic.LockTargetState.UNSECURED;

  var isLockedCached = this.nukiLock.getIsLockedCached();
  if(this.preventLockingIfAlreadyLocked && isLockedCached === doLock) {
    this.log("Prevented lock as preventLockingIfAlreadyLocked=true and lock is already locked.");
    this.lockServiceUnlock.getCharacteristic(Characteristic.LockTargetState).updateValue(newHomeKitStateTarget, undefined, null);
    this.lockServiceUnlock.getCharacteristic(Characteristic.LockCurrentState).updateValue(newHomeKitState, undefined, null);
    if (callback) {
      callback(null);
    }
    return;
  }

  var lockStateChangeCallback = (function(params, err, json) {
    if (err && err.retryableError) {
      if (params.lockTry < this.nukiBridgePlatform.lockactionMaxtries) {
        this.log("An error occured processing lock action. Will retry now...");
        var currentLockTry = params.lockTry;
        params.lockTry = params.lockTry + 1;
        setTimeout((function() {
          if (doLock) {
            this.nukiLock.lock(lockStateChangeCallback);
          }
          else {
            this.nukiLock.unlock(lockStateChangeCallback);
          }
        }).bind(this), this.nukiBridgePlatform.lockactionRetryDelay * currentLockTry);
      }
      else {
        this.lockServiceUnlock.getCharacteristic(Characteristic.LockTargetState).updateValue(newHomeKitStateTarget, undefined, null);
        this.lockServiceUnlock.getCharacteristic(Characteristic.LockCurrentState).updateValue(newHomeKitState, undefined, null);
        callback(err);
        this.log("An error occured processing lock action after retrying multiple times. Reason: %s", err);
      }
    }
    else {
      this.lockServiceUnlock.getCharacteristic(Characteristic.LockTargetState).updateValue(newHomeKitStateTarget, undefined, null);
      this.lockServiceUnlock.getCharacteristic(Characteristic.LockCurrentState).updateValue(newHomeKitState, undefined, null);
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
    this.lockServiceUnlock.getCharacteristic(Characteristic.LockTargetState).updateValue(newHomeKitStateTarget, undefined, null);
    this.lockServiceUnlock.getCharacteristic(Characteristic.LockCurrentState).updateValue(newHomeKitState, undefined, null);
    if (callback) {
      callback(null);
    }
    this.log("HomeKit state change complete from Background.");
  }
  else {
    if (doLock) {
      this.nukiLock.lock(lockStateChangeCallback);
    }
    else {
      this.nukiLock.unlock(lockStateChangeCallback);
    }
  }
};

NukiLockAccessory.prototype.getBattery = function(callback) {
  var getChargeStateCallback = (function(err, chargeState) {
    if (err) {
      this.log("An error occured retrieving battery status. Reason: %s", err);
      callback(err);
    }
    else {
      callback(null, chargeState);
    }
  }).bind(this);
  this.nukiLock.getChargeState(getChargeStateCallback);
};

NukiLockAccessory.prototype.getCharging = function(callback) {
  var getChargingCallback = (function(err, charging) {
    if (err) {
      this.log("An error occured retrieving battery status. Reason: %s", err);
      callback(err);
    }
    else {
      callback(null, charging ? Characteristic.ChargingState.CHARGING : Characteristic.ChargingState.NOT_CHARGING);
    }
  }).bind(this);
  this.nukiLock.getCharging(getChargingCallback);
};

NukiLockAccessory.prototype.getLowBatt = function(callback) {
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

NukiLockAccessory.prototype.getStateSwitchUnlatchAllowed = function(callback) {
  this.log("Getting current state for 'SwitchUnlatchAllowed'...");
  var state = this._isUnlatchAllowed();
  callback(null, state);
};

NukiLockAccessory.prototype.setStateSwitchUnlatchAllowed = function(powerOn, callback) {
  this.log("Switch state for 'SwitchUnlatchAllowed' to '%s'...", powerOn);
  this.nukiBridge.storage.setItemSync(this._getSwitchUnlatchAllowedStorageKey(), powerOn);
  callback(null);
};

NukiLockAccessory.prototype._isUnlatchAllowed = function() {
  var state = this.nukiBridge.storage.getItemSync(this._getSwitchUnlatchAllowedStorageKey());
  if (state === undefined) {
    state = true;
  }
  return state;
};

NukiLockAccessory.prototype._getSwitchUnlatchAllowedStorageKey = function() {
  return 'bridge-' + this.nukiBridge.bridgeUrl + '-lock-' + this.nukiLock.instanceId + '-' + this.nukiLock.id + '-switch-unlatch-allowed-cache';
};

NukiLockAccessory.prototype.getServices = function() {
  return this.services;
};

module.exports = NukiLockAccessory;