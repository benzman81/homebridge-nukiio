var nuki = require('./nukibridge');
var Service, Characteristic;

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  homebridge.registerPlatform("homebridge-nukiio", "NukiBridge", NukiBridgePlatform);
  homebridge.registerAccessory("homebridge-nukiio", "NukiLock", NukiLockAccessory);
  homebridge.registerAccessory("homebridge-nukiio", "NukiOpener", NukiOpenerAccessory);
  homebridge.registerAccessory("homebridge-nukiio", "NukiBridgeMaintainanceSwitch", NukiBridgeMaintainanceSwitchAccessory);
};

var CONTEXT_FROM_NUKI_BACKGROUND = "fromNukiBackground";
var DEFAULT_MAX_TRIES_FOR_LOCK_ACTIONS = 3;
var DEFAULT_DELAY_FOR_RETRY = 3000;

function NukiBridgePlatform(log, config) {
  this.log = log;
  this.nukiBridge = new nuki.NukiBridge(this.log, config["bridge_url"], config["api_token"], config["request_timeout_lockstate"], config["request_timeout_lockaction"], config["cache_directory"], config["lock_state_mode"], config["webhook_server_ip_or_name"], config["webhook_port"]);
  this.locks = config["locks"] || [];
  this.openers = config["openers"] || [];
  this.addMaintainanceButtons = config["add_maintainance_buttons"] || false;
  this.lockactionMaxtries = config["lockaction_maxtries"];
  this.lockactionRetryDelay = config["lockaction_retrydelay"];
  if (this.lockactionMaxtries == null || this.lockactionMaxtries == "" || this.lockactionMaxtries < 0) {
    this.lockactionMaxtries = DEFAULT_MAX_TRIES_FOR_LOCK_ACTIONS;
  }
  if (this.lockactionRetryDelay == null || this.lockactionRetryDelay == "" || this.lockactionRetryDelay < 500) {
    this.lockactionRetryDelay = DEFAULT_DELAY_FOR_RETRY;
  }
}

NukiBridgePlatform.prototype = {

  accessories : function(callback) {
    var accessories = [];
    var nukiDevices = [];
    for (var i = 0; i < this.locks.length; i++) {
      var lock = new NukiLockAccessory(this.log, this.locks[i], this.nukiBridge, this);
      accessories.push(lock);
      nukiDevices.push(lock);
    }
    for (var j = 0; j < this.openers.length; j++) {
      var opener = new NukiOpenerAccessory(this.log, this.openers[j], this.nukiBridge, this);
      accessories.push(opener);
      nukiDevices.push(opener);
    }
    if (this.addMaintainanceButtons) {
      accessories.push(new NukiBridgeMaintainanceSwitchAccessory(this.log, "maintainance-switch-reboot", "Nuki Bridge Reboot", this.nukiBridge, nukiDevices));
      accessories.push(new NukiBridgeMaintainanceSwitchAccessory(this.log, "maintainance-switch-fwupdate", "Nuki Bridge Firmware Update", this.nukiBridge, nukiDevices));
      accessories.push(new NukiBridgeMaintainanceSwitchAccessory(this.log, "maintainance-switch-refreshall", "Nuki Bridge Refresh All", this.nukiBridge, nukiDevices));
    }
    callback(accessories);
  }
}

// nuki lock

function NukiLockAccessory(log, config, nukiBridge, nukiBridgePlatform) {
  this.log = log;
  this.id = config["id"];
  this.name = config["name"];
  this.usesDoorLatch = config["usesDoorLatch"] || false;
  this.nukiBridge = nukiBridge;
  this.nukiBridgePlatform = nukiBridgePlatform;
  this.deviceType = 0;

  this.informationService = new Service.AccessoryInformation();
  this.informationService.setCharacteristic(Characteristic.Manufacturer, "Nuki.io").setCharacteristic(Characteristic.Model, "Nuki.io Lock").setCharacteristic(Characteristic.SerialNumber, "Nuki.io-Id " + this.id);

  this.lockServiceUnlock = new Service.LockMechanism(this.name, this.name);
  this.lockServiceUnlock.getCharacteristic(Characteristic.LockCurrentState).on('get', this.getState.bind(this));
  this.lockServiceUnlock.getCharacteristic(Characteristic.LockTargetState).on('get', this.getState.bind(this)).on('set', this.setState.bind(this, "unlock"));

  if (this.usesDoorLatch) {
    this.lockServiceUnlatch = new Service.LockMechanism(this.name + " Unlatch", this.name + " Unlatch");
    this.lockServiceUnlatch.getCharacteristic(Characteristic.LockCurrentState).on('get', this.getState.bind(this));
    this.lockServiceUnlatch.getCharacteristic(Characteristic.LockTargetState).on('get', this.getState.bind(this)).on('set', this.setState.bind(this, "unlatch"));

    this.lockServiceAlwaysUnlatch = new Service.LockMechanism(this.name + " ALWAYS Unlatch", this.name + " ALWAYS Unlatch");
    this.lockServiceAlwaysUnlatch.getCharacteristic(Characteristic.LockCurrentState).on('get', this.getStateAlwaysUnlatch.bind(this));
    this.lockServiceAlwaysUnlatch.getCharacteristic(Characteristic.LockTargetState).on('get', this.getStateAlwaysUnlatch.bind(this)).on('set', this.setStateAlwaysUnlatch.bind(this));
  }

  this.battservice = new Service.BatteryService(this.name);
  this.battservice.getCharacteristic(Characteristic.BatteryLevel).on('get', this.getBattery.bind(this));
  this.battservice.getCharacteristic(Characteristic.ChargingState).on('get', this.getCharging.bind(this));
  this.battservice.getCharacteristic(Characteristic.StatusLowBattery).on('get', this.getLowBatt.bind(this));

  var webHookCallback = (function(isLocked, batteryCritical) {
    var newHomeKitStateLocked = isLocked ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED;
    var newHomeKitStateLockedTarget = isLocked ? Characteristic.LockTargetState.SECURED : Characteristic.LockTargetState.UNSECURED;
    var newHomeKitStateBatteryCritical = batteryCritical ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
    this.lockServiceUnlock.getCharacteristic(Characteristic.LockCurrentState).updateValue(newHomeKitStateLocked, undefined, CONTEXT_FROM_NUKI_BACKGROUND);
    this.lockServiceUnlock.getCharacteristic(Characteristic.LockTargetState).updateValue(newHomeKitStateLockedTarget, undefined, CONTEXT_FROM_NUKI_BACKGROUND);
    if (this.usesDoorLatch) {
      this.lockServiceUnlatch.getCharacteristic(Characteristic.LockCurrentState).updateValue(newHomeKitStateLocked, undefined, CONTEXT_FROM_NUKI_BACKGROUND);
      this.lockServiceUnlatch.getCharacteristic(Characteristic.LockTargetState).updateValue(newHomeKitStateLockedTarget, undefined, CONTEXT_FROM_NUKI_BACKGROUND);
    }
    this.battservice.getCharacteristic(Characteristic.StatusLowBattery).updateValue(newHomeKitStateBatteryCritical, undefined, CONTEXT_FROM_NUKI_BACKGROUND);
    this.log("HomeKit state change by webhook complete. New isLocked = '%s' and batteryCritical = '%s'.", isLocked, batteryCritical);
  }).bind(this);

  this.nukiLock = new nuki.NukiLock(this.log, nukiBridge, this.id, config["priority"], this.deviceType, webHookCallback);

  // no notification when homebridge start/restart, set LockCurrentState and
  // LockTargetState before first getState
  var isLockedCached = this.nukiLock.getIsLockedCached();
  var lastHomeKitStateLockedCached = isLockedCached ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED;
  var lastHomeKitStateLockedTargetCached = isLockedCached ? Characteristic.LockTargetState.SECURED : Characteristic.LockTargetState.UNSECURED;
  this.lockServiceUnlock.getCharacteristic(Characteristic.LockTargetState).updateValue(lastHomeKitStateLockedTargetCached, undefined, null);
  this.lockServiceUnlock.getCharacteristic(Characteristic.LockCurrentState).updateValue(lastHomeKitStateLockedCached, undefined, null);
  if (this.usesDoorLatch) {
    this.lockServiceUnlatch.getCharacteristic(Characteristic.LockTargetState).updateValue(lastHomeKitStateLockedTargetCached, undefined, null);
    this.lockServiceUnlatch.getCharacteristic(Characteristic.LockCurrentState).updateValue(lastHomeKitStateLockedCached, undefined, null);
    this.lockServiceAlwaysUnlatch.getCharacteristic(Characteristic.LockTargetState).updateValue(Characteristic.LockTargetState.SECURED, undefined, null);
    this.lockServiceAlwaysUnlatch.getCharacteristic(Characteristic.LockCurrentState).updateValue(Characteristic.LockCurrentState.SECURED, undefined, null);
  }
};

NukiLockAccessory.prototype.getState = function(callback) {
  var callbackIsLocked = (function(err, isLocked) {
    callback(err, isLocked ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED);
  }).bind(this);
  this.nukiLock.isLocked(callbackIsLocked);
};

NukiLockAccessory.prototype.getStateAlwaysUnlatch = function(callback) {
  callback(null, Characteristic.LockCurrentState.SECURED);
};

NukiLockAccessory.prototype.setStateAlwaysUnlatch = function(homeKitState, callback, context) {
  var doLock = homeKitState == Characteristic.LockTargetState.SECURED;
  if (doLock) {
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
          this.lockServiceAlwaysUnlatch.getCharacteristic(Characteristic.LockTargetState).updateValue(Characteristic.LockTargetState.SECURED, undefined, CONTEXT_FROM_NUKI_BACKGROUND);
          this.lockServiceAlwaysUnlatch.getCharacteristic(Characteristic.LockCurrentState).updateValue(Characteristic.LockCurrentState.SECURED, undefined, CONTEXT_FROM_NUKI_BACKGROUND);
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

NukiLockAccessory.prototype.setState = function(unlockType, homeKitState, callback, context) {
  var doLock = homeKitState == Characteristic.LockTargetState.SECURED;
  var newHomeKitState = doLock ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED;
  var newHomeKitStateTarget = doLock ? Characteristic.LockTargetState.SECURED : Characteristic.LockTargetState.UNSECURED;
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
          else if (unlockType === "unlatch") {
            this.nukiLock.unlatch(lockStateChangeCallback);
          }
          else {
            this.nukiLock.unlock(lockStateChangeCallback);
          }
        }).bind(this), this.nukiBridgePlatform.lockactionRetryDelay * currentLockTry);
      }
      else {
        this.lockServiceUnlock.getCharacteristic(Characteristic.LockTargetState).updateValue(newHomeKitStateTarget, undefined, null);
        this.lockServiceUnlock.getCharacteristic(Characteristic.LockCurrentState).updateValue(newHomeKitState, undefined, null);
        if (this.usesDoorLatch) {
          this.lockServiceUnlatch.getCharacteristic(Characteristic.LockTargetState).updateValue(newHomeKitStateTarget, undefined, null);
          this.lockServiceUnlatch.getCharacteristic(Characteristic.LockCurrentState).updateValue(newHomeKitState, undefined, null);
        }
        callback(err);
        this.log("An error occured processing lock action after retrying multiple times. Reason: %s", err);
      }
    }
    else {
      this.lockServiceUnlock.getCharacteristic(Characteristic.LockTargetState).updateValue(newHomeKitStateTarget, undefined, null);
      this.lockServiceUnlock.getCharacteristic(Characteristic.LockCurrentState).updateValue(newHomeKitState, undefined, null);
      if (this.usesDoorLatch) {
        this.lockServiceUnlatch.getCharacteristic(Characteristic.LockTargetState).updateValue(newHomeKitStateTarget, undefined, null);
        this.lockServiceUnlatch.getCharacteristic(Characteristic.LockCurrentState).updateValue(newHomeKitState, undefined, null);
      }
      callback(null);
      if (err) {
        this.log("An error occured processing lock action. Reason: %s", err);
      }
    }
    this.log("HomeKit state change complete.");
  }).bind(this, {
    lockTry : 1
  });

  if (context === CONTEXT_FROM_NUKI_BACKGROUND) {
    this.lockServiceUnlock.getCharacteristic(Characteristic.LockTargetState).updateValue(newHomeKitStateTarget, undefined, null);
    this.lockServiceUnlock.getCharacteristic(Characteristic.LockCurrentState).updateValue(newHomeKitState, undefined, null);
    if (this.usesDoorLatch) {
      this.lockServiceUnlatch.getCharacteristic(Characteristic.LockTargetState).updateValue(newHomeKitStateTarget, undefined, null);
      this.lockServiceUnlatch.getCharacteristic(Characteristic.LockCurrentState).updateValue(newHomeKitState, undefined, null);
    }
    if (callback) {
      callback(null);
    }
    this.log("HomeKit state change complete from Background.");
  }
  else {
    if (doLock) {
      this.nukiLock.lock(lockStateChangeCallback);
    }
    else if (unlockType === "unlatch") {
      this.nukiLock.unlatch(lockStateChangeCallback);
    }
    else {
      this.nukiLock.unlock(lockStateChangeCallback);
    }
  }
};

NukiLockAccessory.prototype.getBattery = function(callback) {
  callback(null, 100);
};

NukiLockAccessory.prototype.getCharging = function(callback) {
  callback(null, Characteristic.ChargingState.NOT_CHARGEABLE);
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

NukiLockAccessory.prototype.getServices = function() {
  if (this.usesDoorLatch) {
    return [ this.lockServiceUnlock, this.lockServiceUnlatch, this.lockServiceAlwaysUnlatch, this.informationService, this.battservice ];
  }
  return [ this.lockServiceUnlock, this.informationService, this.battservice ];
};

// nuki opener
function NukiOpenerAccessory(log, config, nukiBridge, nukiBridgePlatform) {
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

  var webHookCallback = (function(isRingToOpenLocked, batteryCritical, mode) {
    var newHomeKitStateRingToOpenLocked = isRingToOpenLocked ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED;
    var newHomeKitStateRingToOpenLockedTarget = isRingToOpenLocked ? Characteristic.LockTargetState.SECURED : Characteristic.LockTargetState.UNSECURED;
    this.lockServiceRingToOpen.getCharacteristic(Characteristic.LockCurrentState).updateValue(newHomeKitStateRingToOpenLocked, undefined, CONTEXT_FROM_NUKI_BACKGROUND);
    this.lockServiceRingToOpen.getCharacteristic(Characteristic.LockTargetState).updateValue(newHomeKitStateRingToOpenLockedTarget, undefined, CONTEXT_FROM_NUKI_BACKGROUND);

    var isContinuousMode = mode === 3;
    var newHomeKitStateContinuousMode = isContinuousMode ? Characteristic.LockCurrentState.UNSECURED : Characteristic.LockCurrentState.SECURED;
    var newHomeKitStateContinuousModeTarget = isContinuousMode ? Characteristic.LockTargetState.UNSECURED : Characteristic.LockTargetState.SECURED;
    this.lockServiceContinuousMode.getCharacteristic(Characteristic.LockCurrentState).updateValue(newHomeKitStateContinuousMode, undefined, CONTEXT_FROM_NUKI_BACKGROUND);
    this.lockServiceContinuousMode.getCharacteristic(Characteristic.LockTargetState).updateValue(newHomeKitStateContinuousModeTarget, undefined, CONTEXT_FROM_NUKI_BACKGROUND);

    var newHomeKitStateBatteryCritical = batteryCritical ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    this.battservice.getCharacteristic(Characteristic.StatusLowBattery).updateValue(newHomeKitStateBatteryCritical, undefined, CONTEXT_FROM_NUKI_BACKGROUND);
    this.log("HomeKit state change by webhook complete. New isRingToOpenLocked = '%s' and batteryCritical = '%s' and mode = '%s'.", isRingToOpenLocked, batteryCritical, mode);
  }).bind(this);

  this.nukiLock = new nuki.NukiLock(this.log, nukiBridge, this.id, config["priority"], this.deviceType, webHookCallback);

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
          this.lockServiceOpen.getCharacteristic(Characteristic.LockTargetState).updateValue(Characteristic.LockTargetState.SECURED, undefined, CONTEXT_FROM_NUKI_BACKGROUND);
          this.lockServiceOpen.getCharacteristic(Characteristic.LockCurrentState).updateValue(Characteristic.LockCurrentState.SECURED, undefined, CONTEXT_FROM_NUKI_BACKGROUND);
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
        if (unlockType === "lockngo") {
          this.lockServiceContinuousMode.getCharacteristic(Characteristic.LockTargetState).updateValue(newHomeKitStateTarget, undefined, null);
          this.lockServiceContinuousMode.getCharacteristic(Characteristic.LockCurrentState).updateValue(newHomeKitState, undefined, null);
        }
        else {
          this.lockServiceRingToOpen.getCharacteristic(Characteristic.LockTargetState).updateValue(newHomeKitStateTarget, undefined, null);
          this.lockServiceRingToOpen.getCharacteristic(Characteristic.LockCurrentState).updateValue(newHomeKitState, undefined, null);
        }
        callback(err);
        this.log("An error occured processing lock action after retrying multiple times. Reason: %s", err);
      }
    }
    else {
      if (unlockType === "lockngo") {
        this.lockServiceContinuousMode.getCharacteristic(Characteristic.LockTargetState).updateValue(newHomeKitStateTarget, undefined, null);
        this.lockServiceContinuousMode.getCharacteristic(Characteristic.LockCurrentState).updateValue(newHomeKitState, undefined, null);
      }
      else {
        this.lockServiceRingToOpen.getCharacteristic(Characteristic.LockTargetState).updateValue(newHomeKitStateTarget, undefined, null);
        this.lockServiceRingToOpen.getCharacteristic(Characteristic.LockCurrentState).updateValue(newHomeKitState, undefined, null);
      }
      callback(null);
      if (err) {
        this.log("An error occured processing lock action. Reason: %s", err);
      }
    }
    this.log("HomeKit state change complete.");
  }).bind(this, {
    lockTry : 1
  });

  if (context === CONTEXT_FROM_NUKI_BACKGROUND) {
    if (unlockType === "lockngo") {
      this.lockServiceContinuousMode.getCharacteristic(Characteristic.LockTargetState).updateValue(newHomeKitStateTarget, undefined, null);
      this.lockServiceContinuousMode.getCharacteristic(Characteristic.LockCurrentState).updateValue(newHomeKitState, undefined, null);
    }
    else {
      this.lockServiceRingToOpen.getCharacteristic(Characteristic.LockTargetState).updateValue(newHomeKitStateTarget, undefined, null);
      this.lockServiceRingToOpen.getCharacteristic(Characteristic.LockCurrentState).updateValue(newHomeKitState, undefined, null);
    }
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

// nuki maintainance

function NukiBridgeMaintainanceSwitchAccessory(log, id, name, nukiBridge, nukiLockAccessories) {
  this.log = log;
  this.id = id;
  this.name = name;
  this.nukiBridge = nukiBridge;
  this.nukiLockAccessories = nukiLockAccessories;

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
          this.switchService.getCharacteristic(Characteristic.On).updateValue(false, undefined, CONTEXT_FROM_NUKI_BACKGROUND);
        }).bind(this), 2500);
      }).bind(this);
      this.nukiBridge.reboot(callbackWrapper);
    }
    else if (this.id === "maintainance-switch-fwupdate") {
      var callbackWrapper = (function(err, json) {
        callback(null);
        setTimeout((function() {
          this.switchService.getCharacteristic(Characteristic.On).updateValue(false, undefined, CONTEXT_FROM_NUKI_BACKGROUND);
        }).bind(this), 2500);
      }).bind(this);
      this.nukiBridge.updateFirmware(callbackWrapper);
    }
    else if (this.id === "maintainance-switch-refreshall") {
      var callbackWrapper = (function(err, json) {
        callback(null);
        setTimeout((function() {
          this.switchService.getCharacteristic(Characteristic.On).updateValue(false, undefined, CONTEXT_FROM_NUKI_BACKGROUND);
        }).bind(this), 2500);
        for (var i = 0; i < this.nukiLockAccessories.length; i++) {
          var nukiLockAccessory = this.nukiLockAccessories[i];
          var isLockedCached = nukiLockAccessory.nukiLock.getIsLockedCached();
          var newHomeKitStateLocked = isLockedCached ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED;
          nukiLockAccessory.lockServiceUnlock.getCharacteristic(Characteristic.LockCurrentState).updateValue(newHomeKitStateLocked, undefined, CONTEXT_FROM_NUKI_BACKGROUND);
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