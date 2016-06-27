var request = require("request");
var Service, Characteristic;

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
    qs: { nukiId: this.lockID, token: this.apiToken }
  }, function(err, response, body) {
    
    if (!err && response.statusCode == 200) {
      var json = JSON.parse(body);
      var success = json.success;
      if(success == "true" || success == true) {
          var state = json.state;
          this.log("Lock state is %s", state);
          var locked = state == "1" || state == 1 || state == "5" || state == 5;
          var unlocked = state == "2" || state == 2 || state == "3" || state == 3 || state == "6" || state == 6;
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
    else {
      this.log("Error getting state (status code %s): %s", response.statusCode, err);
      callback(err);
    }
  }.bind(this));
}
  
NukiAccessory.prototype.setState = function(state, callback) {
  var newState = (state == Characteristic.LockTargetState.SECURED) ? "2" : "1";

  this.log("Set state to %s", newState);

  request.get({
    url: this.bridgeUrl+"/lockAction",
    qs: { nukiId: this.lockID, token: this.apiToken, action: newState}
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
    else {
      this.log("Error '%s' setting lock state. Response: %s", err, body);
      callback(err || new Error("Error setting lock state."));
    }
  }.bind(this));
},

NukiAccessory.prototype.getServices = function() {
  return [this.service];
}

