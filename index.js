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

function NukiBridgePlatform(log, config){
    this.log = log;
    this.nukiBridge = new nuki.NukiBridge(
        this.log, 
        config["bridge_url"], 
        config["api_token"], 
        config["request_timeout_lockstate"],
        config["request_timeout_lockaction"], 
        config["cache_directory"], 
        config["lock_state_mode"], 
        config["webhook_server_ip_or_name"], 
        config["webhook_port"]
    );
    this.locks = config["locks"] || [];
    this.addMaintainanceButtons = config["add_maintainance_buttons"] || false;
}

NukiBridgePlatform.prototype = {

    accessories: function(callback) {
        var accessories = [];
        var locks = [];
        for(var i = 0; i < this.locks.length; i++){
            var lock = new NukiLockAccessory(this.log, this.locks[i], this.nukiBridge);
            accessories.push(lock);
            locks.push(lock);
        }
        if(this.addMaintainanceButtons) {
            accessories.push(new NukiBridgeMaintainanceSwitchAccessory(this.log, "maintainance-switch-reboot", "Nuki Bridge Reboot", this.nukiBridge, locks));
            accessories.push(new NukiBridgeMaintainanceSwitchAccessory(this.log, "maintainance-switch-fwupdate", "Nuki Bridge Firmware Update", this.nukiBridge, locks));
            accessories.push(new NukiBridgeMaintainanceSwitchAccessory(this.log, "maintainance-switch-refreshall", "Nuki Bridge Refresh All", this.nukiBridge, locks));
        }
        callback(accessories);
    }
}

function NukiLockAccessory(log, config, nukiBridge) {
    this.log = log;
    this.id = config["id"];
    this.name = config["name"];
    this.nukiBridge = nukiBridge;
    
    this.informationService = new Service.AccessoryInformation();
    this.informationService
        .setCharacteristic(Characteristic.Manufacturer, "Nuki.io")
        .setCharacteristic(Characteristic.Model, "Nuki.io Lock")
        .setCharacteristic(Characteristic.SerialNumber, "Nuki.io-Id "+this.id);
    
    this.lockService = new Service.LockMechanism(this.name);
    this.lockService
        .getCharacteristic(Characteristic.LockCurrentState)
        .on('get', this.getState.bind(this));
    this.lockService
        .getCharacteristic(Characteristic.LockTargetState)
        .on('get', this.getState.bind(this))
        .on('set', this.setState.bind(this));

    this.battservice = new Service.BatteryService(this.name);
    this.battservice
        .getCharacteristic(Characteristic.BatteryLevel)
        .on('get', this.getBattery.bind(this));
    this.battservice
        .getCharacteristic(Characteristic.ChargingState)
        .on('get', this.getCharging.bind(this));
    this.battservice
        .getCharacteristic(Characteristic.StatusLowBattery)
        .on('get', this.getLowBatt.bind(this));
        
    var webHookCallback = (function(isLocked, batteryCritical) {
        var newHomeKitStateLocked = isLocked ? Characteristic.LockTargetState.SECURED : Characteristic.LockTargetState.UNSECURED;
        var newHomeKitStateBatteryCritical = batteryCritical ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
        this.lockService.getCharacteristic(Characteristic.LockTargetState).setValue(newHomeKitStateLocked, undefined, CONTEXT_FROM_NUKI_BACKGROUND); 
        this.battservice.getCharacteristic(Characteristic.StatusLowBattery).setValue(newHomeKitStateBatteryCritical, undefined, CONTEXT_FROM_NUKI_BACKGROUND);
        this.log("HomeKit state change by webhook complete. New isLocked = '%s' and batteryCritical = '%s'.", isLocked, batteryCritical);
    }).bind(this);
    this.nukiLock = new nuki.NukiLock(this.log, nukiBridge, this.id, config["lock_action"], config["unlock_action"], config["priority"], webHookCallback);
};

NukiLockAccessory.prototype.getState = function(callback) {
    this.log("Getting current state...");
    this.nukiLock.isLocked(callback);
};
  
NukiLockAccessory.prototype.setState = function(homeKitState, callback, context) {
    var doLock = homeKitState == Characteristic.LockTargetState.SECURED;
    var newHomeKitState = doLock ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED;
    if(this.nukiLock.isDoorLatch() && doLock) {
        this.lockService.setCharacteristic(Characteristic.LockCurrentState, newHomeKitState);
        callback(null);
    }
    else {   
        var lockStateChangeCallback = (function(err, json){
            if(err) {
                this.log("An error occured processing lock action. State will be unkown. Reason: %s", err);
                this.lockService.setCharacteristic(Characteristic.LockCurrentState, Characteristic.LockCurrentState.UNKNOWN);   
            }
            else {
                this.lockService.setCharacteristic(Characteristic.LockCurrentState, newHomeKitState);
                
                if(this.nukiLock.isDoorLatch() && !doLock) {
                    setTimeout((function(){
                        this.lockService.getCharacteristic(Characteristic.LockTargetState).setValue(Characteristic.LockTargetState.SECURED, undefined, CONTEXT_FROM_NUKI_BACKGROUND);
                        this.log("HomeKit change for door latch back to locked state complete.");
                    }).bind(this), 1000);
                }
            }
            callback(null);
            this.log("HomeKit state change complete.");
        }).bind(this);
        
        if(context === CONTEXT_FROM_NUKI_BACKGROUND) {
            this.lockService.setCharacteristic(Characteristic.LockCurrentState, newHomeKitState);
            if(callback) {
                callback(null);
            }
            this.log("HomeKit state change complete from Background.");
        }
        else {
            if(doLock) {
                this.nukiLock.lock(lockStateChangeCallback);
            }
            else {
                this.nukiLock.unlock(lockStateChangeCallback);
            }
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
    var getLowBattCallback = (function(err, lowBattery){
        if(err) {
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
  return [this.lockService, this.informationService, this.battservice];
};

function NukiBridgeMaintainanceSwitchAccessory(log, id, name, nukiBridge, nukiLockAccessories) {
    this.log = log;
    this.id = id;
    this.name = name;
    this.nukiBridge = nukiBridge;
    this.nukiLockAccessories = nukiLockAccessories;
    
    this.switchService = new Service.Switch(this.name);
    this.switchService
        .getCharacteristic(Characteristic.On)
        .on('get', this.getState.bind(this))
        .on('set', this.setState.bind(this));
    
    this.informationService = new Service.AccessoryInformation();
    this.informationService
        .setCharacteristic(Characteristic.Manufacturer, "Nuki.io")
        .setCharacteristic(Characteristic.Model, "Nuki.io Maintainance Switch")
        .setCharacteristic(Characteristic.SerialNumber, "Nuki.io-Id "+this.id);
}

NukiBridgeMaintainanceSwitchAccessory.prototype.getState = function(callback) {
    this.log("Getting current state for '%s'...", this.id);
    var state = this.nukiBridge.storage.getItemSync('bridge-'+this.nukiBridge.bridgeUrl+'-'+this.id+'-cache');
    if(state === undefined) {
        state = false;
    }
    callback(null, state);
};

NukiBridgeMaintainanceSwitchAccessory.prototype.setState = function(powerOn, callback) {
    this.log("Switch state for '%s' to '%s'...", this.id, powerOn);
    this.nukiBridge.storage.setItemSync('bridge-'+this.nukiBridge.bridgeUrl+'-'+this.id+'-cache', false);
    if(powerOn) {
        if(this.id === "maintainance-switch-reboot") {
            var callbackWrapper = (function(err, json) {
                callback(null);
                setTimeout((function(){ 
                    this.switchService.getCharacteristic(Characteristic.On)
                        .setValue(false, undefined, CONTEXT_FROM_NUKI_BACKGROUND);
                }).bind(this), 2500);
            }).bind(this);
            this.nukiBridge.reboot(callbackWrapper);
        }
        else if(this.id === "maintainance-switch-fwupdate") {
            var callbackWrapper = (function(err, json) {
                callback(null);
                setTimeout((function(){ 
                    this.switchService.getCharacteristic(Characteristic.On)
                        .setValue(false, undefined, CONTEXT_FROM_NUKI_BACKGROUND);
                }).bind(this), 2500);
            }).bind(this);
            this.nukiBridge.updateFirmware(callbackWrapper);
        }
        else if(this.id === "maintainance-switch-refreshall") {
            var callbackWrapper = (function(err, json) {
                callback(null);
                setTimeout((function(){ 
                    this.switchService.getCharacteristic(Characteristic.On)
                        .setValue(false, undefined, CONTEXT_FROM_NUKI_BACKGROUND);
                }).bind(this), 2500);
                for (var i = 0; i < this.nukiLockAccessories.length; i++) {
                    var nukiLockAccessory = this.nukiLockAccessories[i];
                    var isLockedCached = nukiLockAccessory.nukiLock.getIsLockedCached();
                    var newHomeKitStateLocked = isLockedCached ? Characteristic.LockTargetState.SECURED : Characteristic.LockTargetState.UNSECURED;
                    nukiLockAccessory.lockService.getCharacteristic(Characteristic.LockTargetState).setValue(newHomeKitStateLocked, undefined, CONTEXT_FROM_NUKI_BACKGROUND);
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
  return [this.switchService, this.informationService];
};