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
  this.nukiBridge = new NukiBridge(this.log, config["bridge_url"], config["api_token"], config["request_timeout_lockstate"], config["request_timeout_lockaction"], config["request_timeout_other"], config["cache_directory"], config["lock_state_mode"], config["webhook_server_ip_or_name"], config["webhook_port"]);
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
  for (var i = 0; i < this.locks.length; i++) {
    var lock = new NukiLockAccessory(Service, Characteristic, this.log, this.locks[i], this.nukiBridge, this);
    accessories.push(lock);
    nukiLocks.push(lock);
  }
  var nukiOpeners = [];
  for (var j = 0; j < this.openers.length; j++) {
    var opener = new NukiOpenerAccessory(Service, Characteristic, this.log, this.openers[j], this.nukiBridge, this);
    accessories.push(opener);
    nukiOpeners.push(opener);
  }
  if (this.addMaintainanceButtons) {
    accessories.push(new NukiBridgeMaintainanceSwitchAccessory(Service, Characteristic, this.log, "maintainance-switch-reboot", "Nuki Bridge Reboot", this.nukiBridge, nukiLocks, nukiOpeners));
    accessories.push(new NukiBridgeMaintainanceSwitchAccessory(Service, Characteristic, this.log, "maintainance-switch-fwupdate", "Nuki Bridge Firmware Update", this.nukiBridge, nukiLocks, nukiOpeners));
    accessories.push(new NukiBridgeMaintainanceSwitchAccessory(Service, Characteristic, this.log, "maintainance-switch-refreshall", "Nuki Bridge Refresh All", this.nukiBridge, nukiLocks, nukiOpeners));
  }
  callback(accessories);
};

module.exports = NukiBridgePlatform;