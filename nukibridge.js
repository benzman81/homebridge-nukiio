var request = require("request");
var http = require('http');
var https = require('https');

global.NUKI_LOCK_ACTION_UNLOCK = "1";
global.NUKI_LOCK_ACTION_LOCK = "2";
global.NUKI_LOCK_ACTION_UNLATCH = "3";
global.NUKI_LOCK_ACTION_LOCK_N_GO = "4";
global.NUKI_LOCK_ACTION_LOCK_N_GO_UNLATCH = "5";

global.NUKI_LOCK_STATE_UNCALIBRATED = 0;
global.NUKI_LOCK_STATE_LOCKED = 1;
global.NUKI_LOCK_STATE_UNLOCKED = 2;
global.NUKI_LOCK_STATE_UNLOCKED_LOCK_N_GO = 3;
global.NUKI_LOCK_STATE_UNLATCHED = 4;
global.NUKI_LOCK_STATE_LOCKING = 5;
global.NUKI_LOCK_STATE_UNLOCKING = 6;
global.NUKI_LOCK_STATE_UNLATCHING = 7;
global.NUKI_LOCK_STATE_MOTOR_BLOCKED = 254;
global.NUKI_LOCK_STATE_UNDEFINED = 255;

var MORE_LOGGING = false;
var DEFAULT_REQUEST_TIMEOUT_LOCK_STATE = 5000;
var DEFAULT_REQUEST_TIMEOUT_LOCK_ACTION = 30000;
var DEFAULT_CACHE_DIRECTORY = "./.node-persist/storage";

var instances = [];

this.getInstance = function(constructorLog, bridgeUrl, apiToken, requestTimeoutLockState, requestTimeoutLockAction, cacheDirectory) {
    var instanceArray = instances.filter(function(nukiBridge){
        return nukiBridge.bridgeUrl == bridgeUrl;
    });
    if(instanceArray.length == 1) {
        return instanceArray[0];
    }
    else {
        var newBridge = new NukiBridge(constructorLog, instances.length, bridgeUrl, apiToken, requestTimeoutLockState, requestTimeoutLockAction, cacheDirectory);
        instances.push(newBridge);
        return newBridge;
    }
};

function NukiBridge(constructorLog, instanceId, bridgeUrl, apiToken, requestTimeoutLockState, requestTimeoutLockAction, cacheDirectory) {
    constructorLog("Initializing Nuki bridge '%s' (instance id '%s')...", bridgeUrl, instanceId);
    this.instanceId = instanceId;
    this.bridgeUrl = bridgeUrl;
    this.apiToken = apiToken;
    this.requestTimeoutLockState = requestTimeoutLockState;
    this.requestTimeoutLockAction = requestTimeoutLockAction;
    this.cacheDirectory = cacheDirectory;
    if(this.requestTimeoutLockState == null || this.requestTimeoutLockState == "" || this.requestTimeoutLockState < 1) {
        this.requestTimeoutLockState = DEFAULT_REQUEST_TIMEOUT_LOCK_STATE;
    }
    if(this.requestTimeoutLockAction == null || this.requestTimeoutLockAction == "" || this.requestTimeoutLockAction < 1) {
        this.requestTimeoutLockAction = DEFAULT_REQUEST_TIMEOUT_LOCK_ACTION;
    }
    if(this.cacheDirectory == null || this.cacheDirectory == "") {
        this.cacheDirectory = DEFAULT_CACHE_DIRECTORY;
    }
    this.storage = require('node-persist');
    this.storage.initSync({dir:this.cacheDirectory});
    
    this.runningRequest = false;
    this.queue = [];
    this.locks = [];
    
    constructorLog("Initialized Nuki bridge (instance id '%s').", instanceId);
};

NukiBridge.prototype.addLock = function addLock(nukiLock) {
    nukiLock.instanceId = this.locks.length;
    this.locks.push(nukiLock);
};

NukiBridge.prototype.lockState = function lockState(nukiLock, callback /*(err, json)*/) {
    if(MORE_LOGGING) {
        nukiLock.log("Requesting lock state for Nuki lock '%s' of Nuki bridge '%s'.", nukiLock.instanceId, this.instanceId);
    }
    if(!this.runningRequest) {
        this._sendRequest(
            nukiLock,
            "/lockState",
            { token: this.apiToken, nukiId: nukiLock.lockId},
            this.requestTimeoutLockState,
            callback
        );
    }
    else {
        this._addToQueue({nukiLock: nukiLock, callback: callback});
    }
};

NukiBridge.prototype.lockAction = function lockAction(nukiLock, lockAction, callback /*(err, json)*/) {
    nukiLock.log("Process lock action '%s' for Nuki lock '%s' of Nuki bridge '%s'.", lockAction, nukiLock.instanceId, this.instanceId);
    if(!this.runningRequest) {
        this._sendRequest(
            nukiLock,
            "/lockAction",
            { token: this.apiToken, nukiId: nukiLock.lockId, action: lockAction},
            this.requestTimeoutLockAction,
            callback
        );
    }
    else {
        this._addToQueue({nukiLock: nukiLock, lockAction: lockAction, callback: callback});
    }
};

NukiBridge.prototype._sendRequest = function _sendRequest(nukiLock, entryPoint, queryObject, requestTimeout, callback /*(err, json)*/) {
    if(MORE_LOGGING) {
        nukiLock.log("Send request to Nuki bridge '%s' on '%s' with '%s'.", this.instanceId, entryPoint, JSON.stringify(queryObject));
    }
    this.runningRequest = true;
    request.get({
        url: this.bridgeUrl+entryPoint,
        qs: queryObject,
        timeout: requestTimeout
    }, (function(err, response, body) {
        if(MORE_LOGGING) {
            nukiLock.log("Request to Nuki bridge '%s' finished.", this.instanceId);
        }
        if (!err && response.statusCode == 200) {
            var json = JSON.parse(body);
            var success = json.success;
            if(success == "true" || success == true) {
                callback(null, json);
            }
            else {
                callback(new Error("Request to Nuki bridge was not succesful."));
            }
        }
        else {  
            callback(err || new Error("Request to Nuki bridge was not succesful."));
        }
        this.runningRequest = false;
        this._processNextQueueEntry();
    }).bind(this));
};

NukiBridge.prototype._addToQueue = function _addToQueue(queueEntry) {
    var wasReplaced = false;
    for (var i = 0; i < this.queue.length; i++) {
        var alreadyQueuedEntry = this.queue[i];
        var sameLock = queueEntry.nukiLock.lockId == alreadyQueuedEntry.nukiLock.lockId;
        var bothLockAction = queueEntry.lockAction && alreadyQueuedEntry.lockAction;
        var bothLockState = !queueEntry.lockAction && !alreadyQueuedEntry.lockAction;
        var needsReplace = sameLock && (bothLockAction || bothLockState);
        if(needsReplace) {
            wasReplaced = true;
            this.queue[i] = queueEntry;
            alreadyQueuedEntry.callback(new Error("Request to Nuki bridge was canceled due to newer requests of same type."));
        }
    }
    if(!wasReplaced) {
        this.queue.push(queueEntry);
    }
};

NukiBridge.prototype._processNextQueueEntry = function _processNextQueueEntry() {
    if(this.queue.length > 0) {
        var queueEntry = this.queue.shift();
        if(queueEntry.lockAction) {
            this.lockAction(queueEntry.nukiLock, queueEntry.lockAction, queueEntry.callback);
        }
        else {
            this.lockState(queueEntry.nukiLock, queueEntry.callback);
        }
    }
};

function NukiLock(log, nukiBridge, lockId, lockAction, unlockAction) {
    this.nukiBridge = nukiBridge;
    this.log = log;
    this.lockId = lockId;
    this.lockAction = lockAction;
    this.unlockAction = unlockAction;
    
    if(this.lockAction == null || this.lockAction == "") {
        this.lockAction = NUKI_LOCK_ACTION_LOCK;
    }
    if(this.unlockAction == null || this.unlockAction == "") {
        this.unlockAction = NUKI_LOCK_ACTION_UNLOCK;
    }
    
    this.nukiBridge.addLock(this);
};

NukiLock.prototype.isDoorLatch = function isDoorLatch() {
    return this.lockAction == NUKI_LOCK_ACTION_UNLATCH && this.lockAction == this.unlockAction;
};

NukiLock.prototype.isLocked = function isLocked(callback /*(err, isLocked)*/) {
    if(this.isDoorLatch()) {
        this.log("Lock state for door latch is always 'locked'.");
        var locked = true;
        callback(null, locked);
    }
    else {
        var callbackWrapper = (function(err, json) {
            if(err) {
                var cachedIsLocked = this._getIsLockedCached();
                this.log("Error occured requesting lock state. This might happen due to canceled request or due to long response time of the Nuki bridge. Using cached value isLocked = '%s'.", cachedIsLocked);
                callback(null, cachedIsLocked);
            }
            else {
                var state = NUKI_LOCK_STATE_UNDEFINED;
                if(json) {
                    state = json.state;
                }
                var isLocked = 
                    state == NUKI_LOCK_STATE_LOCKED || 
                    state == NUKI_LOCK_STATE_LOCKING || 
                    state == NUKI_LOCK_STATE_UNCALIBRATED || 
                    state == NUKI_LOCK_STATE_MOTOR_BLOCKED || 
                    state == NUKI_LOCK_STATE_UNDEFINED;
                this.log("Lock state is isLocked = '%s' (Nuki state '%s' )", isLocked, state);
                this._setIsLockedCache(isLocked);
                callback(null, isLocked);
            }
        }).bind(this);
        this.nukiBridge.lockState(this, callbackWrapper);
    }
};

NukiLock.prototype.lock = function lock(callback) {
    this._setIsLockedCache(true);
    this.nukiBridge.lockAction(this, this.lockAction, callback);
};

NukiLock.prototype.unlock = function unlock(callback) {
    this._setIsLockedCache(false);
    this.nukiBridge.lockAction(this, this.unlockAction, callback);
};

NukiLock.prototype._getIsLockedCached = function _getIsLockedCached() {
    var cachedIsLocked = this.nukiBridge.storage.getItemSync(this._getIsLockedStorageKey());
    if(cachedIsLocked === undefined) {
        return true;
    }
    return cachedIsLocked;
};

NukiLock.prototype._setIsLockedCache = function _setIsLockedCache(isLocked) {
    this.nukiBridge.storage.setItemSync(this._getIsLockedStorageKey(), isLocked);
};

NukiLock.prototype._getIsLockedStorageKey = function _getIsLockedStorageKey() {
    return 'bridge-'+this.nukiBridge.instanceId+'-lock-'+this.instanceId+'-islocked';
};

module.exports = {getInstance: this.getInstance, NukiLock: NukiLock};