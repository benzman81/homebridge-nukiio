var request = require("request");
var http = require('http');

global.NUKI_LOCK_ACTION_UNLOCK = "1";
global.NUKI_LOCK_ACTION_LOCK = "2";
global.NUKI_LOCK_ACTION_UNLATCH = "3";
global.NUKI_LOCK_ACTION_LOCK_N_GO = "4";
global.NUKI_LOCK_ACTION_LOCK_N_GO_UNLATCH = "5";

global.NUKI_LOCK_STATE_UNCALIBRATED = 0;
global.NUKI_LOCK_STATE_LOCKED = 1;
global.NUKI_LOCK_STATE_UNLOCKING = 2;
global.NUKI_LOCK_STATE_UNLOCKED = 3;
global.NUKI_LOCK_STATE_LOCKING = 4;
global.NUKI_LOCK_STATE_UNLATCHED = 5;
global.NUKI_LOCK_STATE_UNLOCKED_LOCK_N_GO = 6;
global.NUKI_LOCK_STATE_UNLATCHING = 7;
global.NUKI_LOCK_STATE_MOTOR_BLOCKED = 254;
global.NUKI_LOCK_STATE_UNDEFINED = 255;

var DEFAULT_REQUEST_TIMEOUT_LOCK_STATE = 15000;
var DEFAULT_REQUEST_TIMEOUT_LOCK_ACTION = 45000;
var DEFAULT_REQUEST_TIMEOUT_OTHER = 15000;
var DEFAULT_WEBHOOK_SERVER_PORT = 51827;
var DEFAULT_CACHE_DIRECTORY = "./.node-persist/storage";
var DEFAULT_PRIORITY = 99;
var REBOOT_WAIT_TIME = 45000;

var LOCK_STATE_MODE_REQUEST_LOCKSTATE = 0;
var LOCK_STATE_MODE_ONLY_CACHE = 1;
var LOCK_STATE_MODE_REQUEST_LASTKNOWNLOCKSTATE = 2;

function NukiBridge(log, bridgeUrl, apiToken, requestTimeoutLockState, requestTimeoutLockAction, requestTimeoutOther, cacheDirectory, lockStateMode, webHookServerIpOrName, webHookServerPort) {
  this.log = log;
  this.bridgeUrl = bridgeUrl;
  if (this.bridgeUrl.toLowerCase().lastIndexOf("http://", 0) === -1) {
    this.bridgeUrl = "http://" + this.bridgeUrl;
  }
  if (this.bridgeUrl.lastIndexOf("/") === this.bridgeUrl.length - 1) {
    this.bridgeUrl = this.bridgeUrl.slice(0, -1);
  }
  this.log("Initializing Nuki bridge '%s'...", this.bridgeUrl);
  this.apiToken = apiToken;
  this.requestTimeoutLockState = requestTimeoutLockState;
  this.requestTimeoutLockAction = requestTimeoutLockAction;
  this.requestTimeoutOther = requestTimeoutOther;
  this.cacheDirectory = cacheDirectory;
  this.lockStateMode = lockStateMode;
  this.webHookServerIpOrName = webHookServerIpOrName;
  this.webHookServerPort = webHookServerPort;
  if (this.requestTimeoutLockState == null || this.requestTimeoutLockState == "" || this.requestTimeoutLockState < 1) {
    this.requestTimeoutLockState = DEFAULT_REQUEST_TIMEOUT_LOCK_STATE;
  }
  if (this.requestTimeoutLockAction == null || this.requestTimeoutLockAction == "" || this.requestTimeoutLockAction < 1) {
    this.requestTimeoutLockAction = DEFAULT_REQUEST_TIMEOUT_LOCK_ACTION;
  }
  if (this.requestTimeoutOther == null || this.requestTimeoutOther == "" || this.requestTimeoutOther < 1) {
    this.requestTimeoutOther = DEFAULT_REQUEST_TIMEOUT_OTHER;
  }
  if (this.cacheDirectory == null || this.cacheDirectory == "") {
    this.cacheDirectory = DEFAULT_CACHE_DIRECTORY;
  }
  if (this.lockStateMode == null || this.lockStateMode == "") {
    this.lockStateMode = LOCK_STATE_MODE_REQUEST_LOCKSTATE;
  }
  if (this.webHookServerPort == null || this.webHookServerPort == "") {
    this.webHookServerPort = DEFAULT_WEBHOOK_SERVER_PORT;
  }

  if ((this.webHookServerIpOrName == null || this.webHookServerIpOrName == "") && this.lockStateMode === LOCK_STATE_MODE_ONLY_CACHE) {
    throw new Error("Lock state mode 1 can only be used with webhooks configured. Yout need to enter a valid webhook server ip/name or use lock state mode 0.");
  }

  this.storage = require('node-persist');
  this.storage.initSync({
    dir : this.cacheDirectory
  });

  this.runningRequest = false;
  this.queue = [];
  this.locks = [];

  if (this.webHookServerIpOrName && this.webHookServerIpOrName !== "") {
    this.webHookUrl = this.webHookServerIpOrName + ":" + this.webHookServerPort + "/";
    if (this.webHookUrl.toLowerCase().lastIndexOf("http://", 0) === -1) {
      this.webHookUrl = "http://" + this.webHookUrl;
    }
    this._createWebHookServer(this.log, this.webHookServerPort);
    this._addWebhookToBridge();
  }

  this.log("Initialized Nuki bridge.");
};

NukiBridge.prototype._createWebHookServer = function _createWebHookServer(log, webHookServerPort) {
  http.createServer((function(request, response) {
    var body = [];
    request.on('error', function(err) {
      log("[ERROR Nuki WebHook Server] Reason: %s.", err);
    }).on('data', function(chunk) {
      body.push(chunk);
    }).on('end', (function() {
      body = Buffer.concat(body).toString();

      response.on('error', function(err) {
        log("[ERROR Nuki WebHook Server] Reason: %s.", err);
      });

      response.statusCode = 200;
      response.setHeader('Content-Type', 'application/json');

      var json = JSON.parse(body);
      if (!json.nukiId || !json.state) {
        response.statusCode = 404;
        response.setHeader("Content-Type", "text/plain");
        var errorText = "[ERROR Nuki WebHook Server] No nukiId or state or batteryCritical in request.";
        log(errorText);
        response.write(errorText);
        response.end();
      }
      else {
        var nukiId = json.nukiId + "";
        var state = json.state;
        var batteryCritical = json.batteryCritical === true || json.batteryCritical === "true";
        var mode = json.mode;
        var lock = this._getLock(nukiId);
        if (lock == null) {
          response.setHeader("Content-Type", "text/plain");
          var infoText = "[INFO Nuki WebHook Server] No lock found for nukiId '" + nukiId + "'.";
          log(infoText);
          response.write(infoText);
          response.end();
        }
        else {
          var responseBody = {
            success : true
          };
          var isLocked = lock._isLocked(state);
          lock._setLockCache(isLocked, batteryCritical, mode);
          log("[INFO Nuki WebHook Server] Updated lock state from webhook to isLocked = '%s' (Nuki state '%s' ) for lock '%s' (instance id '%s') with batteryCritical = '%s' and mode = '%s'.", isLocked, state, lock.id, lock.instanceId, batteryCritical, mode);
          lock.webHookCallback(isLocked, batteryCritical, mode);
          response.write(JSON.stringify(responseBody));
          response.end();
        }
      }
    }).bind(this));
  }).bind(this)).listen(webHookServerPort, "0.0.0.0");
  this.log("Started server for webhooks on port '%s'.", webHookServerPort);
};

NukiBridge.prototype._addWebhookToBridge = function _addWebhookToBridge() {
  this.log("Adding webhook for plugin to bridge...");
  var callbackWebhookList = (function(err, json) {
    if (err) {
      throw new Error("Request for webhooks failed: " + err);
    }
    else if (json) {
      var callbacks = json.callbacks;
      var webhookExists = false;
      for (var i = 0; i < callbacks.length; i++) {
        var callback = callbacks[i];
        if (callback.url === this.webHookUrl) {
          webhookExists = true;
          break;
        }
      }
      if (webhookExists) {
        this.log("Webhook for plugin already exists.");
      }
      else {
        this._addCallback();
      }
    }
  }).bind(this);
  this._getCallbacks(callbackWebhookList);
};

NukiBridge.prototype._getCallbacks = function _getCallbacks(callback, doRequest) {
  if (!this.runningRequest && doRequest) {
    this._sendRequest("/callback/list", {
      token : this.apiToken
    }, this.requestTimeoutOther, callback);
  }
  else {
    this._addToQueue({
      callbackWebhookList : callback
    });
  }
};

NukiBridge.prototype._addCallback = function _addCallback(doRequest) {
  if (!this.runningRequest && doRequest) {
    var callback = (function(err, json) {
      if (err) {
        throw new Error("Adding webhook failed: " + err);
      }
      else {
        this.log("Webhook for plugin added.");
      }
    }).bind(this);
    this._sendRequest("/callback/add", {
      token : this.apiToken,
      url : this.webHookUrl
    }, this.requestTimeoutOther, callback);
  }
  else {
    this._addToQueue({
      callbackWebhookAdd : true
    });
  }
};

NukiBridge.prototype.reboot = function reboot(callback, doRequest) {
  if (!this.runningRequest && doRequest) {
    var callbackWrapper = (function(err, json) {
      setTimeout((function() {
        callback(err, json);
      }).bind(this), REBOOT_WAIT_TIME);
    }).bind(this);
    this._sendRequest("/reboot", {
      token : this.apiToken
    }, this.requestTimeoutOther, callbackWrapper);
  }
  else {
    this._addToQueue({
      callbackReboot : callback
    });
  }
};

NukiBridge.prototype.updateFirmware = function updateFirmware(callback, doRequest) {
  if (!this.runningRequest && doRequest) {
    var callbackWrapper = (function(err, json) {
      setTimeout((function() {
        callback(err, json);
      }).bind(this), REBOOT_WAIT_TIME);
    }).bind(this);
    this._sendRequest("/fwupdate", {
      token : this.apiToken
    }, this.requestTimeoutOther, callbackWrapper);
  }
  else {
    this._addToQueue({
      callbackFirmware : callback
    });
  }
};

NukiBridge.prototype.refreshAllLocks = function refreshAllLocks(callback) {
  var singleLockCallback = (function(params, err, json) {
    params.locksChecked = params.locksChecked + 1;
    if (params.locksChecked === params.locksToCheckNum) {
      callback();
    }
  }).bind(this, {
    locksToCheckNum : this.locks.length,
    locksChecked : 0
  });
  for (var i = 0; i < this.locks.length; i++) {
    var lockToCheck = this.locks[i];
    lockToCheck.isLocked(singleLockCallback, true);
  }
};

NukiBridge.prototype._addLock = function _addLock(nukiLock) {
  nukiLock.instanceId = this.locks.length;
  this.locks.push(nukiLock);
};

NukiBridge.prototype._getLock = function _getLock(id) {
  for (var i = 0; i < this.locks.length; i++) {
    var lock = this.locks[i];
    if (lock.id === id) {
      return lock;
    }
  }
  return null;
};

NukiBridge.prototype._lockState = function _lockState(nukiLock, callbacks /*
                                                                           * (err,
                                                                           * json)
                                                                           */, doRequest) {
  if (!this.runningRequest && doRequest) {
    var singleCallBack = (function(err, json) {
      for (var i = 0; i < callbacks.length; i++) {
        callbacks[i](err, json);
      }
    }).bind(this);
    this._sendRequest("/lockState", {
      token : this.apiToken,
      nukiId : nukiLock.id,
      deviceType : nukiLock.deviceType
    }, this.requestTimeoutLockState, singleCallBack);
  }
  else {
    this._addToQueue({
      nukiLock : nukiLock,
      callbacksLockState : callbacks
    });
  }
};

NukiBridge.prototype._lastKnownlockState = function _lastKnownlockState(nukiLock, callbacks /*
                                                                                             * (err,
                                                                                             * json)
                                                                                             */, doRequest) {
  if (!this.runningRequest && doRequest) {
    var singleCallBack = (function(err, json) {
      if (!err && !json) {
        err = new Error("Error retrieving last known lock state.");
      }
      if (err) {
        for (var j = 0; j < callbacks.length; j++) {
          callbacks[j](err, json);
        }
      }
      else {
        for (var k = 0; k < callbacks.length; k++) {
          var lastKnownlockStateCallback = callbacks[k];
          var callbackNukiId = lastKnownlockStateCallback.nukiLock.id;
          var lockErr = new Error("Error retrieving last known lock state for '" + callbackNukiId + "'.");
          var stateJson = null;
          for (var i = 0; i < json.length; i++) {
            var jsonLock = json[i];
            if (jsonLock.nukiId + "" === callbackNukiId) {
              stateJson = jsonLock.lastKnownState;
              lockErr = null;
              break;
            }
          }
          lastKnownlockStateCallback(lockErr, stateJson);
        }
      }
    }).bind(this);
    this._sendRequest("/list", {
      token : this.apiToken
    }, this.requestTimeoutOther, singleCallBack);
  }
  else {
    this._addToQueue({
      nukiLock : nukiLock,
      callbacksLastKnownLockState : callbacks
    });
  }
};

NukiBridge.prototype._lockAction = function _lockAction(nukiLock, lockAction, callback /*
                                                                                         * (err,
                                                                                         * json)
                                                                                         */, doRequest) {
  if (!this.runningRequest, doRequest) {
    this.log("Process lock action '%s' for Nuki lock '%s' (instance id '%s') on Nuki bridge '%s'.", lockAction, nukiLock.id, nukiLock.instanceId, this.bridgeUrl);
    this._sendRequest("/lockAction", {
      token : this.apiToken,
      nukiId : nukiLock.id,
      deviceType : nukiLock.deviceType,
      action : lockAction
    }, this.requestTimeoutLockAction, callback);
  }
  else {
    this._addToQueue({
      nukiLock : nukiLock,
      lockAction : lockAction,
      callback : callback
    });
  }
};

NukiBridge.prototype._sendRequest = function _sendRequest(entryPoint, queryObject, requestTimeout, callback /*
                                                                                                             * (err,
                                                                                                             * json)
                                                                                                             */) {
  this.log("Send request to Nuki bridge '%s' on '%s' with '%s'.", this.bridgeUrl, entryPoint, JSON.stringify(queryObject));
  this.runningRequest = true;
  request.get({
    url : this.bridgeUrl + entryPoint,
    qs : queryObject,
    timeout : requestTimeout
  }, (function(err, response, body) {
    var statusCode = response && response.statusCode ? response.statusCode : -1;
    this.log("Request to Nuki bridge '%s' finished with status code '%s' and body '%s'.", this.bridgeUrl, statusCode, body, err);
    if (!err && statusCode == 200) {
      var json = {};
      if (body !== "") {
        json = JSON.parse(body);
      }
      var success = json.success;
      if (json.hasOwnProperty('success')) {
        if (success == "true" || success == true) {
          callback(null, json);
        }
        else {
          var nukiUnsuccessfulError = new Error("Request to Nuki bridge was not succesful. (statusCode=200, nukiUnsuccessfulError=true, retryableError=true)");
          nukiUnsuccessfulError.nukiUnsuccessfulError = true;
          nukiUnsuccessfulError.retryableError = true;
          callback(nukiUnsuccessfulError);
        }
      }
      else {
        callback(null, json);
      }
    }
    else if (statusCode == 503) {
      var nukiRetryableError = new Error("Request to Nuki bridge was not succesful. (statusCode=503, nukiUnsuccessfulError=false, retryableError=true)");
      nukiRetryableError.nukiUnsuccessfulError = false;
      nukiRetryableError.retryableError = true;
      callback(nukiRetryableError);
    }
    else {
      callback(err || new Error("Request to Nuki bridge was not succesful."));
    }
    this.runningRequest = false;
    this._processNextQueueEntry();
  }).bind(this));
};

NukiBridge.prototype._addToQueue = function _addToQueue(queueEntry) {
  var wasReplaced = this._replaceQueueEntryForLockAction(queueEntry);
  var wasAddedToLastState = this._addLockStateRequestCallbacksToExisting(queueEntry);
  var wasAddedToLastKnownState = this._addLastKnownLockStateRequestCallbacksToExisting(queueEntry);
  if (!wasReplaced && !wasAddedToLastState && !wasAddedToLastKnownState) {
    this.queue.push(queueEntry);
  }

  this.queue.sort(function(queueEntry1, queueEntry2) {
    if (!queueEntry1.nukiLock || !queueEntry2.nukiLock) {
      return -1;
    }
    return queueEntry1.nukiLock.priority - queueEntry2.nukiLock.priority;
  });

  setTimeout((function() {
    if (!this.runningRequest) {
      this._processNextQueueEntry();
    }
  }).bind(this), 500);
};

NukiBridge.prototype._replaceQueueEntryForLockAction = function _replaceQueueEntryForLockAction(queueEntry) {
  var wasReplaced = false;
  for (var i = 0; i < this.queue.length; i++) {
    var alreadyQueuedEntry = this.queue[i];
    var sameLock = queueEntry.nukiLock && alreadyQueuedEntry.nukiLock && queueEntry.nukiLock.id == alreadyQueuedEntry.nukiLock.id;
    var bothLockAction = queueEntry.lockAction && alreadyQueuedEntry.lockAction;
    var needsReplace = sameLock && bothLockAction;
    if (needsReplace) {
      wasReplaced = true;
      this.queue[i] = queueEntry;
      alreadyQueuedEntry.callback(new Error("Request to Nuki bridge for locking was canceled due to newer lock request."));
    }
  }
  return wasReplaced;
};

NukiBridge.prototype._addLockStateRequestCallbacksToExisting = function _addLockStateRequestCallbacksToExisting(queueEntry) {
  var wasAdded = false;
  for (var i = 0; i < this.queue.length; i++) {
    var alreadyQueuedEntry = this.queue[i];
    var sameLock = queueEntry.nukiLock && alreadyQueuedEntry.nukiLock && queueEntry.nukiLock.id == alreadyQueuedEntry.nukiLock.id;
    var bothLockState = queueEntry.callbacksLockState && alreadyQueuedEntry.callbacksLockState;
    var addCallbacks = sameLock && bothLockState;
    if (addCallbacks) {
      wasAdded = true;
      alreadyQueuedEntry.callbacksLockState = alreadyQueuedEntry.callbacksLockState.concat(queueEntry.callbacksLockState);
    }
  }
  return wasAdded;
};

NukiBridge.prototype._addLastKnownLockStateRequestCallbacksToExisting = function _addLastKnownLockStateRequestCallbacksToExisting(queueEntry) {
  var wasAdded = false;
  for (var i = 0; i < this.queue.length; i++) {
    var alreadyQueuedEntry = this.queue[i];
    var bothLastKnownLockState = queueEntry.callbacksLastKnownLockState && alreadyQueuedEntry.callbacksLastKnownLockState;
    var addCallbacks = bothLastKnownLockState;
    if (addCallbacks) {
      wasAdded = true;
      alreadyQueuedEntry.callbacksLastKnownLockState = alreadyQueuedEntry.callbacksLastKnownLockState.concat(queueEntry.callbacksLastKnownLockState);
    }
  }
  return wasAdded;
};

NukiBridge.prototype._processNextQueueEntry = function _processNextQueueEntry() {
  if (this.queue.length > 0) {
    var queueEntry = this.queue.shift();
    var doRequest = true;
    if (queueEntry.nukiLock) {
      if (queueEntry.lockAction) {
        this._lockAction(queueEntry.nukiLock, queueEntry.lockAction, queueEntry.callback, doRequest);
      }
      else if (queueEntry.callbacksLockState) {
        this._lockState(queueEntry.nukiLock, queueEntry.callbacksLockState, doRequest);
      }
      else if (queueEntry.callbacksLastKnownLockState) {
        this._lastKnownlockState(queueEntry.nukiLock, queueEntry.callbacksLastKnownLockState, doRequest);
      }
    }
    else if (queueEntry.callbackWebhookList) {
      this._getCallbacks(queueEntry.callbackWebhookList, doRequest);
    }
    else if (queueEntry.callbackWebhookAdd) {
      this._addCallback(doRequest);
    }
    else if (queueEntry.callbackList) {
      this._getList(queueEntry.callbackList, doRequest);
    }
    else if (queueEntry.callbackReboot) {
      this.reboot(queueEntry.callbackReboot, doRequest);
    }
    else if (queueEntry.callbackFirmware) {
      this.updateFirmware(queueEntry.callbackFirmware, doRequest);
    }
  }
};

function NukiLock(log, nukiBridge, id, priority, deviceType, webHookCallback) {
  this.nukiBridge = nukiBridge;
  this.log = log;
  this.id = id;
  this.lockAction = NUKI_LOCK_ACTION_LOCK;
  this.unlockAction = NUKI_LOCK_ACTION_UNLOCK;
  this.unlatchAction = NUKI_LOCK_ACTION_UNLATCH;
  this.lockNGoAction = NUKI_LOCK_ACTION_LOCK_N_GO;
  this.lockNGoActionUnlatch = NUKI_LOCK_ACTION_LOCK_N_GO_UNLATCH;
  this.priority = priority;
  this.deviceType = deviceType;
  this.webHookCallback = webHookCallback;

  if (this.priority == null || this.priority == "") {
    this.priority = DEFAULT_PRIORITY;
  }

  this.nukiBridge._addLock(this);

  var callbackIsLocked = (function(err, json) {
    this.log("Initial is locked request finished.");
  }).bind(this);
  if (this.nukiBridge.lockStateMode === LOCK_STATE_MODE_ONLY_CACHE) {
    this.isLocked(callbackIsLocked, true);
  }
};

NukiLock.prototype.isLocked = function isLocked(callback /* (err, isLocked) */, forceRequest) {
  if (forceRequest || this.nukiBridge.lockStateMode === LOCK_STATE_MODE_REQUEST_LOCKSTATE || this.nukiBridge.lockStateMode === LOCK_STATE_MODE_REQUEST_LASTKNOWNLOCKSTATE) {
    var callbackWrapper = (function(err, json) {
      if (err) {
        var cachedIsLocked = this.getIsLockedCached();
        this.log("Request for lock state aborted. This is no problem and might happen due to canceled request or due to long response time of the Nuki bridge. Using cached value isLocked = '%s'.", cachedIsLocked);
        callback(null, cachedIsLocked);
      }
      else {
        var state = NUKI_LOCK_STATE_UNDEFINED;
        var batteryCritical = false;
        var mode = 2;
        if (json) {
          state = json.state;
          batteryCritical = json.batteryCritical;
          mode = json.mode;
        }
        var isLocked = this._isLocked(state);
        this.log("Lock state is isLocked = '%s' (Nuki state '%s' ) with battery critical = '%s' and mode = '%s'", isLocked, state, batteryCritical, mode);
        this._setLockCache(isLocked, batteryCritical, mode);
        callback(null, isLocked);
      }
    }).bind(this);
    callbackWrapper.nukiLock = this;
    if (this.nukiBridge.lockStateMode === LOCK_STATE_MODE_REQUEST_LASTKNOWNLOCKSTATE) {
      this.nukiBridge._lastKnownlockState(this, [ callbackWrapper ]);
    }
    else {
      this.nukiBridge._lockState(this, [ callbackWrapper ]);
    }
  }
  else {
    var cachedIsLocked = this.getIsLockedCached();
    this.log("Cached lock state is isLocked = '%s'.", cachedIsLocked);
    callback(null, cachedIsLocked);
  }
};

NukiLock.prototype.getLowBatt = function getLowBatt(callback /* (err, lowBattt) */) {
  callback(null, this._getIsBatteryLowCached());
};

NukiLock.prototype._isLocked = function _isLocked(state) {
  var isLocked = state == NUKI_LOCK_STATE_LOCKED || state == NUKI_LOCK_STATE_LOCKING || state == NUKI_LOCK_STATE_UNCALIBRATED || state == NUKI_LOCK_STATE_MOTOR_BLOCKED || state == NUKI_LOCK_STATE_UNDEFINED;
  return isLocked;
};

NukiLock.prototype.lock = function lock(callback) {
  var callbackWrapper = (function(err, json) {
    if (!err || !err.retryableError) {
      this._setLockCache(true);
    }
    callback(err, json);
  }).bind(this);
  this.nukiBridge._lockAction(this, this.lockAction, callbackWrapper);
};

NukiLock.prototype.unlock = function unlock(callback) {
  var callbackWrapper = (function(err, json) {
    if (!err || !err.retryableError) {
      this._setLockCache(false);
    }
    callback(err, json);
  }).bind(this);
  this.nukiBridge._lockAction(this, this.unlockAction, callbackWrapper);
};

NukiLock.prototype.unlatch = function unlatch(callback) {
  var callbackWrapper = (function(err, json) {
    if ((!err || !err.retryableError) && this.deviceType === 0) {
      this._setLockCache(false);
    }
    callback(err, json);
  }).bind(this);
  this.nukiBridge._lockAction(this, this.unlatchAction, callbackWrapper);
};

NukiLock.prototype.lockNGo = function lock(callback) {
  var callbackWrapper = (function(err, json) {
    if (!err || !err.retryableError) {
      this._setLockCache(undefined, undefined, 3);
    }
    callback(err, json);
  }).bind(this);
  this.nukiBridge._lockAction(this, this.lockNGoAction, callbackWrapper);
};

NukiLock.prototype.lockNGoUnlatch = function unlock(callback) {
  var callbackWrapper = (function(err, json) {
    if (!err || !err.retryableError) {
      this._setLockCache(undefined, undefined, 2);
    }
    callback(err, json);
  }).bind(this);
  this.nukiBridge._lockAction(this, this.lockNGoActionUnlatch, callbackWrapper);
};

NukiLock.prototype.getIsLockedCached = function getIsLockedCached() {
  var lockCache = this.nukiBridge.storage.getItemSync(this._getLockStorageKey());
  if (lockCache === undefined) {
    return true;
  }
  return lockCache.isLocked;
};

NukiLock.prototype._getIsBatteryLowCached = function _getIsBatteryLowCached() {
  var lockCache = this.nukiBridge.storage.getItemSync(this._getLockStorageKey());
  if (lockCache === undefined) {
    return false;
  }
  return lockCache.batteryCritical;
};

NukiLock.prototype.getModeCached = function getModeCached() {
  var lockCache = this.nukiBridge.storage.getItemSync(this._getLockStorageKey());
  if (lockCache === undefined) {
    return 2;
  }
  return lockCache.mode;
};

NukiLock.prototype._setLockCache = function _setLockCache(isLocked, batteryCritical, mode) {
  var newCache = {
    isLocked : this.getIsLockedCached(),
    batteryCritical : this._getIsBatteryLowCached(),
    mode : this.getModeCached()
  }
  if (isLocked !== undefined && isLocked !== null) {
    newCache.isLocked = isLocked;
  }
  if (batteryCritical !== undefined && batteryCritical !== null) {
    newCache.batteryCritical = batteryCritical;
  }
  if (mode !== undefined && mode !== null) {
    newCache.mode = mode;
  }
  this.nukiBridge.storage.setItemSync(this._getLockStorageKey(), newCache);
};

NukiLock.prototype._getLockStorageKey = function _getLockStorageKey() {
  return 'bridge-' + this.nukiBridge.bridgeUrl + '-lock-' + this.instanceId + '-' + this.id + '-cache';
};

module.exports = {
  NukiBridge : NukiBridge,
  NukiLock : NukiLock
};