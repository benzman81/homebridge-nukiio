var NukiBridgeMaintainanceSwitchAccessory = require('./src/homekit/NukiBridgeMaintainanceSwitchAccessory');
var NukiOpenerAccessory = require('./src/homekit/NukiOpenerAccessory');
var NukiLockAccessory = require('./src/homekit/NukiLockAccessory');
var NukiBridgePlatform = require('./src/homekit/NukiBridgePlatform');

module.exports = function(homebridge) {
  homebridge.registerPlatform("homebridge-nukiio", "NukiBridge", NukiBridgePlatform);
  homebridge.registerAccessory("homebridge-nukiio", "NukiLock", NukiLockAccessory);
  homebridge.registerAccessory("homebridge-nukiio", "NukiOpener", NukiOpenerAccessory);
  homebridge.registerAccessory("homebridge-nukiio", "NukiBridgeMaintainanceSwitch", NukiBridgeMaintainanceSwitchAccessory);
};