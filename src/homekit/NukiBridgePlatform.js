const Constants = require('../Constants');

var NukiBridgeMaintainanceSwitchAccessory = require('./NukiBridgeMaintainanceSwitchAccessory');
var NukiOpenerAccessory = require('./NukiOpenerAccessory');
var NukiLockAccessory = require('./NukiLockAccessory');

var NukiBridge = require('../nuki/NukiBridge');

var Service, Characteristic;

function NukiBridgePlatform(log, config, homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  this.log = log;

  var bridge_url = config["bridge_url"];
  var api_token = config["api_token"];
  var api_token_hashed = config["api_token_hashed"] || false;

  if(!bridge_url || bridge_url === "" || !api_token || api_token === "") {
    this.log("Nuki platform config is incomplete. You need to set 'bridge_url' and 'api_token'.");
    return;
  }

  this.nukiBridge = new NukiBridge(homebridge, this.log, bridge_url, api_token, api_token_hashed, config["request_timeout_lockstate"], config["request_timeout_lockaction"], config["request_timeout_other"], config["cache_directory"], config["lock_state_mode"], config["webhook_server_ip_or_name"], config["webhook_port"]);
  this.locks = config["locks"] || [];
  this.openers = config["openers"] || [];
  this.addMaintainanceButtons = config["add_maintainance_buttons"] || false;
  this.lockactionMaxtries = config["lockaction_maxtries"];
  this.lockactionRetryDelay = config["lockaction_retrydelay"];
  if (this.lockactionMaxtries == null || this.lockactionMaxtries == "" || this.lockactionMaxtries < 0) {
    this.lockactionMaxtries = Constants.DEFAULT_MAX_TRIES_FOR_LOCK_ACTIONS;
  }
  if (this.lockactionRetryDelay == null || this.lockactionRetryDelay == "" || this.lockactionRetryDelay < 500) {
    this.lockactionRetryDelay = Constants.DEFAULT_DELAY_FOR_RETRY;
  }
};

NukiBridgePlatform.prototype.accessories = function(callback) {
  var accessories = [];
  var nukiLocks = [];
  if(this.locks) {
    for (var i = 0; i < this.locks.length; i++) {
      var lockConfig = this.locks[i];
      if(!lockConfig["id"] || lockConfig["id"] === "" || !lockConfig["name"] || lockConfig["name"] === "") {
        this.log("Lock config '%s' is incomplete. You need to set 'id' and 'name'.", i);
        continue;
      }
      var lock = new NukiLockAccessory(Service, Characteristic, this.log, lockConfig, this.nukiBridge, this);
      accessories.push(lock);
      nukiLocks.push(lock);
    }
  }
  var nukiOpeners = [];
  if(this.openers) {
    for (var j = 0; j < this.openers.length; j++) {
      var openerConfig = this.openers[j];
      if(!openerConfig["id"] || openerConfig["id"] === "" || !openerConfig["name"] || openerConfig["name"] === "") {
        this.log("Opener config '%s' is incomplete. You need to set 'id' and 'name'.", j);
        continue;
      }
      var opener = new NukiOpenerAccessory(Service, Characteristic, this.log, openerConfig, this.nukiBridge, this);
      accessories.push(opener);
      nukiOpeners.push(opener);
    }
  }
  if (this.addMaintainanceButtons) {
    accessories.push(new NukiBridgeMaintainanceSwitchAccessory(Service, Characteristic, this.log, "maintainance-switch-reboot", "Nuki Bridge Reboot", this.nukiBridge, nukiLocks, nukiOpeners));
    accessories.push(new NukiBridgeMaintainanceSwitchAccessory(Service, Characteristic, this.log, "maintainance-switch-fwupdate", "Nuki Bridge Firmware Update", this.nukiBridge, nukiLocks, nukiOpeners));
    accessories.push(new NukiBridgeMaintainanceSwitchAccessory(Service, Characteristic, this.log, "maintainance-switch-refreshall", "Nuki Bridge Refresh All", this.nukiBridge, nukiLocks, nukiOpeners));
  }
  callback(accessories);
};

module.exports = NukiBridgePlatform;