const Constants = require('../Constants');

var Service, Characteristic;

function NukiBridgeMaintainanceSwitchAccessory(log, id, name, nukiBridge, nukiLockAccessories, nukiOpenerAccessories) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  this.log = log;
  this.id = id;
  this.name = name;
  this.nukiBridge = nukiBridge;
  this.nukiLockAccessories = nukiLockAccessories;
  this.nukiOpenerAccessories = nukiOpenerAccessories;

  this.switchService = new Service.Switch(this.name);
  this.switchService.getCharacteristic(Characteristic.On).on('get', this.getState.bind(this)).on('set', this.setState.bind(this));

  this.informationService = new Service.AccessoryInformation();
  this.informationService.setCharacteristic(Characteristic.Manufacturer, "Nuki.io").setCharacteristic(Characteristic.Model, "Nuki.io Maintainance Switch").setCharacteristic(Characteristic.SerialNumber, "Nuki.io-Id " + this.id);
}

NukiBridgeMaintainanceSwitchAccessory.prototype.getState = function(callback) {
  this.log("Getting current state for '%s'...", this.id);
  var state = this.nukiBridge.storage.getItemSync('bridge-' + this.nukiBridge.bridgeUrl + '-' + this.id + '-cache');
  if (state === undefined) {
    state = false;
  }
  callback(null, state);
};

NukiBridgeMaintainanceSwitchAccessory.prototype.setState = function(powerOn, callback) {
  this.log("Switch state for '%s' to '%s'...", this.id, powerOn);
  this.nukiBridge.storage.setItemSync('bridge-' + this.nukiBridge.bridgeUrl + '-' + this.id + '-cache', false);
  if (powerOn) {
    if (this.id === "maintainance-switch-reboot") {
      var callbackWrapper = (function(err, json) {
        callback(null);
        setTimeout((function() {
          this.switchService.getCharacteristic(Characteristic.On).updateValue(false, undefined, Constants.CONTEXT_FROM_NUKI_BACKGROUND);
        }).bind(this), 2500);
      }).bind(this);
      this.nukiBridge.reboot(callbackWrapper);
    }
    else if (this.id === "maintainance-switch-fwupdate") {
      var callbackWrapper = (function(err, json) {
        callback(null);
        setTimeout((function() {
          this.switchService.getCharacteristic(Characteristic.On).updateValue(false, undefined, Constants.CONTEXT_FROM_NUKI_BACKGROUND);
        }).bind(this), 2500);
      }).bind(this);
      this.nukiBridge.updateFirmware(callbackWrapper);
    }
    else if (this.id === "maintainance-switch-refreshall") {
      var callbackWrapper = (function(err, json) {
        callback(null);
        setTimeout((function() {
          this.switchService.getCharacteristic(Characteristic.On).updateValue(false, undefined, Constants.CONTEXT_FROM_NUKI_BACKGROUND);
        }).bind(this), 2500);
        for (var i = 0; i < this.nukiLockAccessories.length; i++) {
          var nukiLockAccessory = this.nukiLockAccessories[i];
          var isLockedCached = nukiLockAccessory.nukiLock.getIsLockedCached();
          var newHomeKitStateLocked = isLockedCached ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED;
          var newHomeKitStateLockedTarget = isLockedCached ? Characteristic.LockTargetState.SECURED : Characteristic.LockTargetState.UNSECURED;
          nukiLockAccessory.lockServiceUnlock.getCharacteristic(Characteristic.LockCurrentState).updateValue(newHomeKitStateLocked, undefined, Constants.CONTEXT_FROM_NUKI_BACKGROUND);
          nukiLockAccessory.lockServiceUnlock.getCharacteristic(Characteristic.LockTargetState).updateValue(newHomeKitStateLockedTarget, undefined, Constants.CONTEXT_FROM_NUKI_BACKGROUND);
        }
        for (var i = 0; i < this.nukiOpenerAccessories.length; i++) {
          var nukiOpenerAccessory = this.nukiOpenerAccessories[i];

          var modeCached = nukiOpenerAccessory.nukiLock.getModeCached();
          var isContinuousModeCached = modeCached === 3;
          var lastHomeKitStateContinuousModeCached = isContinuousModeCached ? Characteristic.LockCurrentState.UNSECURED : Characteristic.LockCurrentState.SECURED;
          var lastHomeKitStateContinuousModeTargetCached = isContinuousModeCached ? Characteristic.LockTargetState.UNSECURED : Characteristic.LockTargetState.SECURED;
          nukiOpenerAccessory.lockServiceContinuousMode.getCharacteristic(Characteristic.LockCurrentState).updateValue(lastHomeKitStateContinuousModeCached, undefined, Constants.CONTEXT_FROM_NUKI_BACKGROUND);
          nukiOpenerAccessory.lockServiceContinuousMode.getCharacteristic(Characteristic.LockTargetState).updateValue(lastHomeKitStateContinuousModeTargetCached, undefined, Constants.CONTEXT_FROM_NUKI_BACKGROUND);

          var isRingToOpenLockedCached = nukiOpenerAccessory.nukiLock.getIsLockedCached();
          if (isContinuousModeCached) {
            isRingToOpenLockedCached = false;
          }
          var lastHomeKitStateRingToOpenCached = isRingToOpenLockedCached ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED;
          var lastHomeKitStateRingToOpenTargetCached = isRingToOpenLockedCached ? Characteristic.LockTargetState.SECURED : Characteristic.LockTargetState.UNSECURED;
          nukiOpenerAccessory.lockServiceRingToOpen.getCharacteristic(Characteristic.LockCurrentState).updateValue(lastHomeKitStateRingToOpenCached, undefined, Constants.CONTEXT_FROM_NUKI_BACKGROUND);
          nukiOpenerAccessory.lockServiceRingToOpen.getCharacteristic(Characteristic.LockTargetState).updateValue(lastHomeKitStateRingToOpenTargetCached, undefined, Constants.CONTEXT_FROM_NUKI_BACKGROUND);

          nukiOpenerAccessory.lockServiceOpen.getCharacteristic(Characteristic.LockCurrentState).updateValue(Characteristic.LockCurrentState.SECURED, undefined, Constants.CONTEXT_FROM_NUKI_BACKGROUND);
          nukiOpenerAccessory.lockServiceOpen.getCharacteristic(Characteristic.LockTargetState).updateValue(Characteristic.LockTargetState.SECURED, undefined, Constants.CONTEXT_FROM_NUKI_BACKGROUND);
        }
      }).bind(this);
      this.nukiBridge.refreshAllLocks(callbackWrapper);
    }
  }
  else {
    callback(null);
  }
};

NukiBridgeMaintainanceSwitchAccessory.prototype.getServices = function() {
  return [ this.switchService, this.informationService ];
};

module.exports = NukiBridgeMaintainanceSwitchAccessory;