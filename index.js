var nuki = require('./nukibridge');
var Service, Characteristic;

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerPlatform("homebridge-nukiio", "NukiBridge", NukiBridgePlatform);
    homebridge.registerAccessory("homebridge-nukiio", "NukiLock", NukiLockAccessory);
};

function NukiBridgePlatform(log, config){
    this.log = log;
    this.nukiBridge = new nuki.NukiBridge(
        this.log, 
        config["bridge_url"], 
        config["api_token"], 
        config["request_timeout_lockstate"],
        config["request_timeout_lockaction"], 
        config["cache_directory"], 
        config["webhook_port"]
    );
    this.locks = config["locks"] || [];
}

NukiBridgePlatform.prototype = {

    accessories: function(callback) {
        var accessories = [];
        for(var i = 0; i < this.locks.length; i++){
            var lock = new NukiLockAccessory(this.log, this.locks[i], this.nukiBridge);
            accessories.push(lock);
        }
        var accessoriesCount = accessories.length;
        
        callback(accessories);
    }
}

function NukiLockAccessory(log, config, nukiBridge) {
    this.log = log;
    this.name = config["name"];
    this.nukiBridge = nukiBridge;
    
    this.service = new Service.LockMechanism(this.name);

    this.service
        .getCharacteristic(Characteristic.LockCurrentState)
        .on('get', this.getState.bind(this));

    this.service
        .getCharacteristic(Characteristic.LockTargetState)
        .on('get', this.getState.bind(this))
        .on('set', this.setState.bind(this));

    var webHookCallback = (function(isLocked) {
        var newHomeKitState = isLocked ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED;
        this.service.getCharacteristic(Characteristic.LockCurrentState).setValue(newHomeKitState);
        this.log("HomeKit state change by webhook complete. New isLocked = '%s'.", isLocked);
    }).bind(this);
    this.nukiLock = new nuki.NukiLock(this.log, nukiBridge, config["id"], config["lock_action"], config["unlock_action"], webHookCallback);
};

NukiLockAccessory.prototype.getState = function(callback) {
    this.log("Getting current state...");
    this.nukiLock.isLocked(callback);
};
  
NukiLockAccessory.prototype.setState = function(homeKitState, callback) {
    var update = (homeKitState == Characteristic.LockTargetState.SECURED) ? true : false;
    var lockStateChangeCallback = (function(err, json){
        if(err) {
            this.log("An error occured processing lock action. Reason: %s", err);
            callback(err);
        }
        else {
            var newHomeKitState = (homeKitState == Characteristic.LockTargetState.SECURED) ?
                Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED;
            this.log("HomeKit state change complete.");
            this.service.setCharacteristic(Characteristic.LockCurrentState, newHomeKitState);
            
            if(!update && this.nukiLock.isDoorLatch()) {
                setTimeout((function(){
                    this.log("HomeKit change for door latch back to locked state complete.");
                    this.service.getCharacteristic(Characteristic.LockCurrentState).setValue(Characteristic.LockCurrentState.SECURED);
                    update = true;  
                }).bind(this), 1000);
            }
            
            callback(null);
        }
    }).bind(this);
    
    var doLock = homeKitState == Characteristic.LockTargetState.SECURED;
    if(doLock) {
        this.nukiLock.lock(lockStateChangeCallback);
    }
    else {
        this.nukiLock.unlock(lockStateChangeCallback);
    }
};

NukiLockAccessory.prototype.getServices = function() {
  return [this.service];
};