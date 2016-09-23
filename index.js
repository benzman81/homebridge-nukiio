var nukibridge = require('./nukibridge');
var Service, Characteristic;

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory("homebridge-nukiio", "Nuki", NukiAccessory);
};

function NukiAccessory(log, config) {
    this.log = log;
    this.name = config["name"];
    this.apiToken = config["api_token"];
    this.lockID = config["lock_id"];
    this.bridgeUrl = config["bridge_url"];
    this.lockAction = config["lock_action"];
    this.unlockAction = config["unlock_action"];
    this.requestTimeout = config["request_timeout"];
    this.cacheDirectory = config["cache_directory"];
    if(this.lockAction == null || this.lockAction == "") {
        this.lockAction = nukibridge.LOCK_ACTION_LOCK;
    }
    if(this.unlockAction == null || this.unlockAction == "") {
        this.unlockAction = nukibridge.LOCK_ACTION_UNLOCK;
    }

    nukibridge.init(this.log, this.bridgeUrl, this.apiToken, this.requestTimeout, this.cacheDirectory);

    this.service = new Service.LockMechanism(this.name);

    this.service
        .getCharacteristic(Characteristic.LockCurrentState)
        .on('get', this.getState.bind(this));

    this.service
        .getCharacteristic(Characteristic.LockTargetState)
        .on('get', this.getState.bind(this))
        .on('set', this.setState.bind(this));
};

NukiAccessory.prototype.getState = function(callback) {
    this.log("Getting current state...");
    var isDoorLatch = this.lockAction == nukibridge.LOCK_ACTION_UNLATCH && this.lockAction == this.unlockAction;
    if(isDoorLatch) {
        this.log("Lock state for door latch is always 'locked'.");
        var locked = true;
        callback(null, locked);
    }
    else {
        nukibridge.lockState(
            this.lockID, 
            (function(json){
                var state = nukibridge.LOCK_STATE_UNDEFINED;
                if(json) {
                    state = json.state;
                }
                this.log("Lock state is %s", state);
                var locked = 
                    state == nukibridge.LOCK_STATE_LOCKED || 
                    state == nukibridge.LOCK_STATE_LOCKING || 
                    state == nukibridge.LOCK_STATE_UNCALIBRATED || 
                    state == nukibridge.LOCK_STATE_MOTOR_BLOCKED || 
                    state == nukibridge.LOCK_STATE_UNDEFINED;
                callback(null, locked);
            }).bind(this),
            (function(err){
                this.log("An error occured requesting lock state.");
                callback(err);
            }).bind(this)
        );
    }
};
  
NukiAccessory.prototype.setState = function(state, callback) {
    var lockAction = (state == Characteristic.LockTargetState.SECURED) ? this.lockAction : this.unlockAction;

    nukibridge.lockAction(
        this.lockID, 
        lockAction,
        (function(json){
            var newState = Characteristic.LockCurrentState.SECURED;
            var isDoorLatch = this.lockAction == nukibridge.LOCK_ACTION_UNLATCH && this.lockAction == this.unlockAction;
            if(!isDoorLatch) {
                newState = (state == Characteristic.LockTargetState.SECURED) ?
                    Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED;
            }
            this.log("State change complete.");
            this.service
                .setCharacteristic(Characteristic.LockCurrentState, newState);
            callback(null);
        }).bind(this),
        (function(err){
            this.log("An error occured processing lock action.");
            callback(err);
        }).bind(this)
    );
};

NukiAccessory.prototype.getServices = function() {
  return [this.service];
};