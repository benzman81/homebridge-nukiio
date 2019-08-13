var nuki = require('./nukibridge');
var Service, Characteristic;

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  homebridge.registerPlatform("homebridge-nukiio", "NukiBridge", NukiBridgePlatform);
  homebridge.registerAccessory("homebridge-nukiio", "NukiLock", NukiLockAccessory);
  homebridge.registerAccessory("homebridge-nukiio", "NukiBridgeMaintainanceSwitch", NukiBridgeMaintainanceSwitchAccessory);
};

var CONTEXT_FROM_NUKI_BACKGROUND = "fromNukiBackground";

function NukiBridgePlatform(log, config) {
  this.log = log;
  this.nukiBridge = new nuki.NukiBridge(this.log, config["bridge_url"], config["api_token"], config["request_timeout_lockstate"], config["request_timeout_lockaction"], config["cache_directory"], config["lock_state_mode"], config["webhook_server_ip_or_name"], config["webhook_port"]);
  this.locksConfig = config["locks"] || [];
  this.locksList = [];
  this.addMaintainanceButtons = config["add_maintainance_buttons"] || false;

  this.webHookCallback = (function(isLocked, batteryCritical) {
    for(var l = 0; l < this.locksList.length; l++) {
      this.locksList[l].onStateChanged(isLocked, batteryCritical);
    }
  }).bind(this);

}

NukiBridgePlatform.prototype = {
  accessories : function(callback) {
    var accessories = [];
    var locks = [];

    for (var i = 0; i < this.locksConfig.length; i++) {

      var nukiLock = new nuki.NukiLock(this.log, this.nukiBridge, this.locksConfig[i]['id'], this.locksConfig[i]["priority"], this.webHookCallback);

      var lock = new NukiLockAccessory(this.log, this.locksConfig[i], this.nukiBridge, nukiLock);
      accessories.push(lock);
      locks.push(lock);
      this.locksList.push(lock);

      if (this.locksConfig[i].usesDoorLatch) {
        var lockUnlatch = new NukiLockUnlatchAccessory(this.log, this.locksConfig[i], this.nukiBridge, nukiLock);
        accessories.push(lockUnlatch);
        this.locksList.push(lockUnlatch);
        var lockAlwaysUnlatch = new NukiLockAlwaysUnlatchAccessory(this.log, this.locksConfig[i], this.nukiBridge, nukiLock);
        accessories.push(lockAlwaysUnlatch);
        this.locksList.push(lockAlwaysUnlatch);
      }
    }
    if (this.addMaintainanceButtons) {
      accessories.push(new NukiBridgeMaintainanceSwitchAccessory(this.log, "maintainance-switch-reboot", "Nuki Bridge Reboot", this.nukiBridge, locks));
      accessories.push(new NukiBridgeMaintainanceSwitchAccessory(this.log, "maintainance-switch-fwupdate", "Nuki Bridge Firmware Update", this.nukiBridge, locks));
      accessories.push(new NukiBridgeMaintainanceSwitchAccessory(this.log, "maintainance-switch-refreshall", "Nuki Bridge Refresh All", this.nukiBridge, locks));
    }
    callback(accessories);
  }
}

function NukiLockAccessory(log, config, nukiBridge, nukiLock) {
  this.log = log;
  this.id = config["id"];
  this.name = config["name"];
  this.usesDoorLatch = config["usesDoorLatch"] || false;
  this.nukiBridge = nukiBridge;
  this.nukiLock = nukiLock;

  this.informationService = new Service.AccessoryInformation();
  this.informationService.setCharacteristic(Characteristic.Manufacturer, "Nuki.io").setCharacteristic(Characteristic.Model, "Nuki.io Lock").setCharacteristic(Characteristic.SerialNumber, "Nuki.io-Id " + this.id);

  this.lockServiceUnlock = new Service.LockMechanism(this.name, this.name);
  this.lockServiceUnlock.getCharacteristic(Characteristic.LockCurrentState).on('get', this.getState.bind(this));
  this.lockServiceUnlock.getCharacteristic(Characteristic.LockTargetState).on('get', this.getState.bind(this)).on('set', this.setState.bind(this, "unlock"));

  this.battservice = new Service.BatteryService(this.name);
  this.battservice.getCharacteristic(Characteristic.BatteryLevel).on('get', this.getBattery.bind(this));
  this.battservice.getCharacteristic(Characteristic.ChargingState).on('get', this.getCharging.bind(this));
  this.battservice.getCharacteristic(Characteristic.StatusLowBattery).on('get', this.getLowBatt.bind(this));

  // no notification when homebridge start/restart, set LockCurrentState and
  // LockTargetState before first getState
  var isLockedCached = this.nukiLock.getIsLockedCached();
  var lastHomeKitStateLockedCached = isLockedCached ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED;
  var lastHomeKitStateLockedTargetCached = isLockedCached ? Characteristic.LockTargetState.SECURED : Characteristic.LockTargetState.UNSECURED;
  this.lockServiceUnlock.getCharacteristic(Characteristic.LockTargetState).updateValue(lastHomeKitStateLockedTargetCached, undefined, null);
  this.lockServiceUnlock.getCharacteristic(Characteristic.LockCurrentState).updateValue(lastHomeKitStateLockedCached, undefined, null);
};

function NukiLockUnlatchAccessory(log, config, nukiBridge, nukiLock) {
  this.log = log;
  this.id = config["id"];
  this.name = config["name"] + " Unlatch";
  this.usesDoorLatch = config["usesDoorLatch"] || false;
  this.nukiBridge = nukiBridge;
  this.nukiLock = nukiLock;

  this.informationServiceUnlatch = new Service.AccessoryInformation();
  this.informationServiceUnlatch.setCharacteristic(Characteristic.Manufacturer, "Nuki.io").setCharacteristic(Characteristic.Model, "Nuki.io Lock").setCharacteristic(Characteristic.SerialNumber, "Nuki.io-Id " + this.id + " Unlatch");

  this.lockServiceUnlatch = new Service.LockMechanism(this.name, this.name);
  this.lockServiceUnlatch.getCharacteristic(Characteristic.LockCurrentState).on('get', this.getState.bind(this));
  this.lockServiceUnlatch.getCharacteristic(Characteristic.LockTargetState).on('get', this.getState.bind(this)).on('set', this.setState.bind(this, "unlatch"));

  this.battserviceUnlatch = new Service.BatteryService(this.name, this.name);
  this.battserviceUnlatch.getCharacteristic(Characteristic.BatteryLevel).on('get', this.getBattery.bind(this));
  this.battserviceUnlatch.getCharacteristic(Characteristic.ChargingState).on('get', this.getCharging.bind(this));
  this.battserviceUnlatch.getCharacteristic(Characteristic.StatusLowBattery).on('get', this.getLowBatt.bind(this));

  // no notification when homebridge start/restart, set LockCurrentState and
  // LockTargetState before first getState
  var isLockedCached = this.nukiLock.getIsLockedCached();
  var lastHomeKitStateLockedCached = isLockedCached ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED;
  var lastHomeKitStateLockedTargetCached = isLockedCached ? Characteristic.LockTargetState.SECURED : Characteristic.LockTargetState.UNSECURED;
  this.lockServiceUnlatch.getCharacteristic(Characteristic.LockTargetState).updateValue(lastHomeKitStateLockedTargetCached, undefined, null);
  this.lockServiceUnlatch.getCharacteristic(Characteristic.LockCurrentState).updateValue(lastHomeKitStateLockedCached, undefined, null);
};

function NukiLockAlwaysUnlatchAccessory(log, config, nukiBridge, nukiLock) {
  this.log = log;
  this.id = config["id"];
  this.name = config["name"] + " Always Unlatch";
  this.usesDoorLatch = config["usesDoorLatch"] || false;
  this.nukiBridge = nukiBridge;
  this.nukiLock = nukiLock;

  this.informationServiceAlwaysUnlatch = new Service.AccessoryInformation();
  this.informationServiceAlwaysUnlatch.setCharacteristic(Characteristic.Manufacturer, "Nuki.io").setCharacteristic(Characteristic.Model, "Nuki.io Lock").setCharacteristic(Characteristic.SerialNumber, "Nuki.io-Id " + this.id + " Always Unlatch");

  this.lockServiceAlwaysUnlatch = new Service.Outlet(this.name);
  this.lockServiceAlwaysUnlatch.getCharacteristic(Characteristic.On).on('get', this.getStateAlwaysUnlatch.bind(this)).on('set', this.setStateAlwaysUnlatch.bind(this));

  //this.lockServiceAlwaysUnlatch = new Service.LockMechanism(this.name, this.name);
  //this.lockServiceAlwaysUnlatch.getCharacteristic(Characteristic.LockCurrentState).on('get', this.getStateAlwaysUnlatch.bind(this));
  //this.lockServiceAlwaysUnlatch.getCharacteristic(Characteristic.LockTargetState).on('get', this.getStateAlwaysUnlatch.bind(this)).on('set', this.setStateAlwaysUnlatch.bind(this));

  this.battserviceAlwaysUnlatch = new Service.BatteryService(this.name, this.name);
  this.battserviceAlwaysUnlatch.getCharacteristic(Characteristic.BatteryLevel).on('get', this.getBattery.bind(this));
  this.battserviceAlwaysUnlatch.getCharacteristic(Characteristic.ChargingState).on('get', this.getCharging.bind(this));
  this.battserviceAlwaysUnlatch.getCharacteristic(Characteristic.StatusLowBattery).on('get', this.getLowBatt.bind(this));

  // no notification when homebridge start/restart, set LockCurrentState and
  // LockTargetState before first getState
  //this.lockServiceAlwaysUnlatch.getCharacteristic(Characteristic.LockTargetState).updateValue(Characteristic.LockTargetState.SECURED, undefined, null);
  //this.lockServiceAlwaysUnlatch.getCharacteristic(Characteristic.LockCurrentState).updateValue(Characteristic.LockCurrentState.SECURED, undefined, null);
  this.lockServiceAlwaysUnlatch.getCharacteristic(Characteristic.On).updateValue(false, undefined, null);
};

NukiLockAccessory.prototype.getState = function(callback) {
  var callbackIsLocked = (function(err, isLocked) {
    callback(err, isLocked ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED);
  }).bind(this);
  this.nukiLock.isLocked(callbackIsLocked);
};
NukiLockUnlatchAccessory.prototype.getState = NukiLockAccessory.prototype.getState

NukiLockAlwaysUnlatchAccessory.prototype.getStateAlwaysUnlatch = function(callback) {
  callback(null, false);
};

NukiLockAccessory.prototype.setState = function(unlockType, homeKitState, callback, context) {
  var doLock = homeKitState == Characteristic.LockTargetState.SECURED;
  var newHomeKitState = doLock ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED;
  var newHomeKitStateTarget = doLock ? Characteristic.LockTargetState.SECURED : Characteristic.LockTargetState.UNSECURED;
  var lockStateChangeCallback = (function(params, err, json) {
    if (err && err.nukiUnsuccessfulError) {
      if (params.lockTry < 2) {
        this.log("An error occured processing lock action. Will retry now...");
        params.lockTry = params.lockTry + 1;
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
      else {
        if (unlockType === "unlock") {
          this.lockServiceUnlock.getCharacteristic(Characteristic.LockTargetState).updateValue(newHomeKitStateTarget, undefined, null);
          this.lockServiceUnlock.getCharacteristic(Characteristic.LockCurrentState).updateValue(newHomeKitState, undefined, null);
        }
        if (unlockType === "unlatch") {
          this.lockServiceUnlatch.getCharacteristic(Characteristic.LockTargetState).updateValue(newHomeKitStateTarget, undefined, null);
          this.lockServiceUnlatch.getCharacteristic(Characteristic.LockCurrentState).updateValue(newHomeKitState, undefined, null);
        }
        callback(err);
        this.log("An error occured processing lock action after retrying multiple times. Reason: %s", err);
      }
    }
    else {
      if (unlockType === "unlock") {
        this.lockServiceUnlock.getCharacteristic(Characteristic.LockTargetState).updateValue(newHomeKitStateTarget, undefined, null);
        this.lockServiceUnlock.getCharacteristic(Characteristic.LockCurrentState).updateValue(newHomeKitState, undefined, null);
      }
      if (unlockType === "unlatch") {
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
    if (unlockType === "unlock") {
      this.lockServiceUnlock.getCharacteristic(Characteristic.LockTargetState).updateValue(newHomeKitStateTarget, undefined, null);
      this.lockServiceUnlock.getCharacteristic(Characteristic.LockCurrentState).updateValue(newHomeKitState, undefined, null);
    }
    if (unlockType === "unlatch") {
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
NukiLockUnlatchAccessory.prototype.setState = NukiLockAccessory.prototype.setState



NukiLockAlwaysUnlatchAccessory.prototype.setStateAlwaysUnlatch = function(homeKitState, callback, context) {
  var doLock = homeKitState == Characteristic.LockTargetState.SECURED;
  if (doLock) {
    //this.lockServiceAlwaysUnlatch.getCharacteristic(Characteristic.LockTargetState).updateValue(Characteristic.LockTargetState.SECURED, undefined, null);
    //this.lockServiceAlwaysUnlatch.getCharacteristic(Characteristic.LockCurrentState).updateValue(Characteristic.LockCurrentState.SECURED, undefined, null);
    this.lockServiceAlwaysUnlatch.getCharacteristic(Characteristic.On).updateValue(false, undefined, null);
    if (callback) {
      callback(null);
    }
  }
  else {
    var lockStateChangeCallback = (function(params, err, json) {
      if (err && err.nukiUnsuccessfulError && params.lockTry < 2) {
        this.log("An error occured processing lock action. Will retry now...");
        params.lockTry = params.lockTry + 1;
        this.nukiLock.unlatch(lockStateChangeCallback);
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
        //this.lockServiceAlwaysUnlatch.getCharacteristic(Characteristic.LockTargetState).updateValue(Characteristic.LockTargetState.UNSECURED, undefined, null);
        //this.lockServiceAlwaysUnlatch.getCharacteristic(Characteristic.LockCurrentState).updateValue(Characteristic.LockCurrentState.UNSECURED, undefined, null);
        this.lockServiceAlwaysUnlatch.getCharacteristic(Characteristic.On).updateValue(true, undefined, null);
        callback(null);
        setTimeout((function() {
          //this.lockServiceAlwaysUnlatch.getCharacteristic(Characteristic.LockTargetState).updateValue(Characteristic.LockTargetState.SECURED, undefined, CONTEXT_FROM_NUKI_BACKGROUND);
          //this.lockServiceAlwaysUnlatch.getCharacteristic(Characteristic.LockCurrentState).updateValue(Characteristic.LockCurrentState.SECURED, undefined, CONTEXT_FROM_NUKI_BACKGROUND);
          this.lockServiceAlwaysUnlatch.getCharacteristic(Characteristic.On).updateValue(false, undefined, CONTEXT_FROM_NUKI_BACKGROUND);
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

NukiLockAccessory.prototype.getBattery = function(callback) {
  callback(null, 100);
};
NukiLockUnlatchAccessory.prototype.getBattery = NukiLockAccessory.prototype.getBattery
NukiLockAlwaysUnlatchAccessory.prototype.getBattery = NukiLockAccessory.prototype.getBattery

NukiLockAccessory.prototype.getCharging = function(callback) {
  callback(null, Characteristic.ChargingState.NOT_CHARGEABLE);
};
NukiLockUnlatchAccessory.prototype.getCharging = NukiLockAccessory.prototype.getCharging
NukiLockAlwaysUnlatchAccessory.prototype.getCharging = NukiLockAccessory.prototype.getCharging

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
NukiLockUnlatchAccessory.prototype.getLowBatt = NukiLockAccessory.prototype.getLowBatt
NukiLockAlwaysUnlatchAccessory.prototype.getLowBatt = NukiLockAccessory.prototype.getLowBatt

NukiLockAccessory.prototype.onStateChanged = function(isLocked, batteryCritical) {
    var newHomeKitStateLocked = isLocked ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED;
    var newHomeKitStateLockedTarget = isLocked ? Characteristic.LockTargetState.SECURED : Characteristic.LockTargetState.UNSECURED;
    var newHomeKitStateBatteryCritical = batteryCritical ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
    this.lockServiceUnlock.getCharacteristic(Characteristic.LockCurrentState).updateValue(newHomeKitStateLocked, undefined, CONTEXT_FROM_NUKI_BACKGROUND);
    this.lockServiceUnlock.getCharacteristic(Characteristic.LockTargetState).updateValue(newHomeKitStateLockedTarget, undefined, CONTEXT_FROM_NUKI_BACKGROUND);
    this.battservice.getCharacteristic(Characteristic.StatusLowBattery).updateValue(newHomeKitStateBatteryCritical, undefined, CONTEXT_FROM_NUKI_BACKGROUND);
    this.log("HomeKit state change %s by webhook complete. New isLocked = '%s' and batteryCritical = '%s'.", this.name, isLocked, batteryCritical);
};

NukiLockUnlatchAccessory.prototype.onStateChanged = function(isLocked, batteryCritical) {
    var newHomeKitStateLocked = isLocked ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED;
    var newHomeKitStateLockedTarget = isLocked ? Characteristic.LockTargetState.SECURED : Characteristic.LockTargetState.UNSECURED;
    var newHomeKitStateBatteryCritical = batteryCritical ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
    this.lockServiceUnlatch.getCharacteristic(Characteristic.LockCurrentState).updateValue(newHomeKitStateLocked, undefined, CONTEXT_FROM_NUKI_BACKGROUND);
    this.lockServiceUnlatch.getCharacteristic(Characteristic.LockTargetState).updateValue(newHomeKitStateLockedTarget, undefined, CONTEXT_FROM_NUKI_BACKGROUND);
    this.battserviceUnlatch.getCharacteristic(Characteristic.StatusLowBattery).updateValue(newHomeKitStateBatteryCritical, undefined, CONTEXT_FROM_NUKI_BACKGROUND);
    this.log("HomeKit state change %s by webhook complete. New isLocked = '%s' and batteryCritical = '%s'.", this.name, isLocked, batteryCritical);
};

NukiLockAlwaysUnlatchAccessory.prototype.onStateChanged = function(isLocked, batteryCritical) {
    var newHomeKitStateBatteryCritical = batteryCritical ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
    this.lockServiceAlwaysUnlatch.getCharacteristic(Characteristic.LockTargetState).updateValue(Characteristic.LockTargetState.SECURED, undefined, null);
    this.lockServiceAlwaysUnlatch.getCharacteristic(Characteristic.LockCurrentState).updateValue(Characteristic.LockCurrentState.SECURED, undefined, null);
    this.battserviceAlwaysUnlatch.getCharacteristic(Characteristic.StatusLowBattery).updateValue(newHomeKitStateBatteryCritical, undefined, CONTEXT_FROM_NUKI_BACKGROUND);
    this.log("HomeKit state change %s by webhook complete. New batteryCritical = '%s'.", this.name, batteryCritical);
};

NukiLockAccessory.prototype.getServices = function() {
  return [ this.lockServiceUnlock, this.informationService, this.battservice ];
};
NukiLockUnlatchAccessory.prototype.getServices = function() {
    return [ this.lockServiceUnlatch, this.informationServiceUnlatch, this.battserviceUnlatch ];
};
NukiLockAlwaysUnlatchAccessory.prototype.getServices = function() {
    return [ this.lockServiceAlwaysUnlatch, this.informationServiceAlwaysUnlatch, this.battserviceAlwaysUnlatch ];
};

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