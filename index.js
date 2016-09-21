var request = require("request");
var http = require('http');
var https = require('https');
var storage = require('node-persist');
var Service, Characteristic;

storage.initSync();

http.globalAgent.maxSockets = 1;
https.globalAgent.maxSockets = 1;

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  homebridge.registerAccessory("homebridge-nukiio", "Nuki", NukiAccessory);
}

function NukiAccessory(log, config) {
  this.log = log;
  this.name = config["name"];
  this.apiToken = config["api_token"];
  this.lockID = config["lock_id"];
  this.bridgeUrl = config["bridge_url"];
  this.lockAction = config["lock_action"];
  this.unlockAction = config["unlock_action"];
  this.requestTimeout = config["request_timeout"];
  if(this.lockAction == null || this.lockAction == "") {
      this.lockAction = "2";
  }
  if(this.unlockAction == null || this.unlockAction == "") {
      this.unlockAction = "1";
  }
  if(this.requestTimeout == null || this.requestTimeout == ""|| this.requestTimeout < 1) {
      this.requestTimeout = 10000;
  }
  
  this.service = new Service.LockMechanism(this.name);
  
  this.service
    .getCharacteristic(Characteristic.LockCurrentState)
    .on('get', this.getState.bind(this));
  
  this.service
    .getCharacteristic(Characteristic.LockTargetState)
    .on('get', this.getState.bind(this))
    .on('set', this.setState.bind(this));
}

NukiAccessory.prototype.getState = function(callback) {
  this.log("Getting current state...");
  
  request.get({
    url: this.bridgeUrl+"/lockState",
    qs: { nukiId: this.lockID, token: this.apiToken },
    timeout: this.requestTimeout
  }, function(err, response, body) {
    
    if (!err && response.statusCode == 200) {
      var json = JSON.parse(body);
      var success = json.success;
      if(success == "true" || success == true) {
          var state = json.state;
          this.log("Lock state is %s", state);
          var locked = state == 1 || state == 5;
          var unlocked = state == 2 || state == 3 || state == 4 || state == 6 || state == 7;
          storage.setItemSync('nuki-lock-state-'+this.lockID, state);
          if(locked || unlocked) {
            callback(null, locked);
          }
          else {
              this.log("Invalid state for homekit.");
              callback(new Error("Invalid state for homekit."));
          }
      }
      else {
          this.log("Getting state was not succesful.");
          callback(new Error("Getting state was not succesful."));
      }
    }
    else if(err && err.code === 'ETIMEDOUT') {
      this.log("Read timeout occured getting current state. This might happen due to long response time of the lock. Using cached state.");
      var cachedState = storage.getItemSync('nuki-lock-state-'+this.lockID);
      if(!cachedState) {
          cachedState = 1;
      }
      var locked = cachedState == 1 || cachedState == 5;
      var unlocked = cachedState == 2 || cachedState == 3 || cachedState == 4 || cachedState == 6 || cachedState == 7;
      if(locked || unlocked) {
        callback(null, locked);
      }
      else {
          this.log("Invalid cached state "+cachedState+" for homekit.");
          callback(new Error("Invalid cached state "+cachedState+" for homekit."));
      }
    }
    else {
      this.log("Error '%s' getting lock state. Response: %s", err, body);
      callback(err);
    }
  }.bind(this));
}
  
NukiAccessory.prototype.setState = function(state, callback) {
  var newState = (state == Characteristic.LockTargetState.SECURED) ? this.lockAction : this.unlockAction;

  storage.setItemSync('nuki-lock-state-'+this.lockID, newState);
  
  this.log("Set state to %s", newState);

  request.get({
    url: this.bridgeUrl+"/lockAction",
    qs: { nukiId: this.lockID, token: this.apiToken, action: newState},
    timeout: this.requestTimeout
  }, function(err, response, body) {

    if (!err && response.statusCode == 200) {
      var json = JSON.parse(body);
      var success = json.success;
      if(success == "true" || success == true) {
          this.log("State change complete.");
          
          var currentState = (state == Characteristic.LockTargetState.SECURED) ?
            Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED;
          
          this.service
            .setCharacteristic(Characteristic.LockCurrentState, currentState);
          
          callback(null);
      }
      else {
          this.log("Setting state was not succesful.");
          callback(new Error("Setting state was not succesful."));
      }
    }
    else if(err && err.code === 'ETIMEDOUT') {
      this.log("Read timeout occured setting new state. This might happen due to long response time of the lock.");
      callback(null);
    }
    else {
      this.log("Error '%s' setting lock state. Response: %s", err, body);
      callback(err || new Error("Error setting lock state."));
    }
  }.bind(this));
},

NukiAccessory.prototype.getServices = function() {
  return [this.service];
}

