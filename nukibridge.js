var request = require("request");
var http = require('http');
var https = require('https');
var url = require('url');

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

var DEFAULT_REQUEST_TIMEOUT_LOCK_STATE = 5000;
var DEFAULT_REQUEST_TIMEOUT_LOCK_ACTION = 30000;
var DEFAULT_WEBHOOK_SERVER_PORT = 51827;
var DEFAULT_CACHE_DIRECTORY = "./.node-persist/storage";

var instances = [];

this.getInstance = function(constructorLog, bridgeUrl, apiToken, requestTimeoutLockState, requestTimeoutLockAction, cacheDirectory, webHookServerPort) {
    var instanceArray = instances.filter(function(nukiBridge){
        return nukiBridge.bridgeUrl == bridgeUrl;
    });
    if(instanceArray.length == 1) {
        return instanceArray[0];
    }
    else {
        var newBridge = new NukiBridge(constructorLog, instances.length, bridgeUrl, apiToken, requestTimeoutLockState, requestTimeoutLockAction, cacheDirectory, webHookServerPort);
        instances.push(newBridge);
        return newBridge;
    }
};

function NukiBridge(constructorLog, instanceId, bridgeUrl, apiToken, requestTimeoutLockState, requestTimeoutLockAction, cacheDirectory, webHookServerPort) {
    constructorLog("Initializing Nuki bridge '%s' (instance id '%s')...", bridgeUrl, instanceId);
    this.instanceId = instanceId;
    this.bridgeUrl = bridgeUrl;
    this.apiToken = apiToken;
    this.requestTimeoutLockState = requestTimeoutLockState;
    this.requestTimeoutLockAction = requestTimeoutLockAction;
    this.cacheDirectory = cacheDirectory;
    this.webHookServerPort = webHookServerPort;
    if(this.requestTimeoutLockState == null || this.requestTimeoutLockState == "" || this.requestTimeoutLockState < 1) {
        this.requestTimeoutLockState = DEFAULT_REQUEST_TIMEOUT_LOCK_STATE;
    }
    if(this.requestTimeoutLockAction == null || this.requestTimeoutLockAction == "" || this.requestTimeoutLockAction < 1) {
        this.requestTimeoutLockAction = DEFAULT_REQUEST_TIMEOUT_LOCK_ACTION;
    }
    if(this.cacheDirectory == null || this.cacheDirectory == "") {
        this.cacheDirectory = DEFAULT_CACHE_DIRECTORY;
    }
    if(this.webHookServerPort == null || this.webHookServerPort == "") {
        this.webHookServerPort = DEFAULT_WEBHOOK_SERVER_PORT;
    }
    this.storage = require('node-persist');
    this.storage.initSync({dir:this.cacheDirectory});
    
    this.runningRequest = false;
    this.queue = [];
    this.locks = [];
    
    this._createWebHookServer(constructorLog, this.webHookServerPort);
    
    constructorLog("Initialized Nuki bridge (instance id '%s').", instanceId);
};

NukiBridge.prototype._createWebHookServer = function _createWebHookServer(constructorLog, webHookServerPort) {
    http.createServer((function(request, response) {
        var theUrl = request.url;
        var theUrlParts = url.parse(theUrl, true);
        var theUrlParams = theUrlParts.query;
        var body = [];
        request.on('error', function(err) {
            console.error("[ERROR Nuki WebHook Server] Reason: %s.", err);
        }).on('data', function(chunk) {
            body.push(chunk);
        }).on('end', (function() {
            body = Buffer.concat(body).toString();

            response.on('error', function(err) {
                console.error("[ERROR Nuki WebHook Server] Reason: %s.", err);
            });

            response.statusCode = 200;
            response.setHeader('Content-Type', 'application/json');

            if(!theUrlParams.nukiId || !theUrlParams.state) {
                response.statusCode = 404;
                response.setHeader("Content-Type", "text/plain");
                var errorText = "[ERROR Nuki WebHook Server] No nukiId or state in request.";
                console.error(errorText);
                response.write(errorText);
                response.end();
            }
            else {
                var nukiId = theUrlParams.nukiId;
                var state = theUrlParams.state;
                var ignoreDoorsWithDoorLatches = true;
                var lock = this._getLock(nukiId, ignoreDoorsWithDoorLatches);
                if(lock == null) {
                    response.statusCode = 404;
                    response.setHeader("Content-Type", "text/plain");
                    var errorText = "[ERROR Nuki WebHook Server] No lock found for nukiId '"+nukiId+"'.";
                    console.error(errorText);
                    response.write(errorText);
                    response.end();
                }
                else {            
                    var responseBody = {
                        success: true
                    };
                    if(!lock.isDoorLatch()) {
                        var isLocked = lock._isLocked(state);
                        lock._setIsLockedCache(isLocked);  
                        console.log("[INFO Nuki WebHook Server] Updated lock state from webhook to isLocked = '%s' (Nuki state '%s' ) for lock '%s'.", isLocked, state, lock.instanceId);
                        lock.webHookCallback(isLocked);
                    }                      
                    response.write(JSON.stringify(responseBody));
                    response.end();
                }
            }
        }).bind(this));
    }).bind(this)).listen(webHookServerPort);    
    constructorLog("Started server for webhooks on port '%s'.", webHookServerPort);
};

NukiBridge.prototype.addLock = function addLock(nukiLock) {
    nukiLock.instanceId = this.locks.length;
    this.locks.push(nukiLock);
};

NukiBridge.prototype._getLock = function _getLock(lockId, ignoreDoorsWithDoorLatches) {
    for (var i = 0; i < this.locks.length; i++) {
        var lock = this.locks[i];
        if(lock.isDoorLatch() && ignoreDoorsWithDoorLatches) {
            continue;
        }
        if(lock.lockId === lockId) {
            return lock;
        }
    }
    return null;
};

NukiBridge.prototype.lockState = function lockState(nukiLock, callback /*(err, json)*/) {
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
    nukiLock.log("Send request to Nuki bridge '%s' on '%s' with '%s'.", this.instanceId, entryPoint, JSON.stringify(queryObject));
    this.runningRequest = true;
    request.get({
        url: this.bridgeUrl+entryPoint,
        qs: queryObject,
        timeout: requestTimeout
    }, (function(err, response, body) {
        var statusCode = response && response.statusCode ? response.statusCode: -1;
        nukiLock.log("Request to Nuki bridge '%s' finished with status code '%s' and body '%s'.", this.instanceId, statusCode, body);
        if (!err && statusCode == 200) {
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

function NukiLock(log, nukiBridge, lockId, lockAction, unlockAction, webHookCallback) {
    this.nukiBridge = nukiBridge;
    this.log = log;
    this.lockId = lockId;
    this.lockAction = lockAction;
    this.unlockAction = unlockAction;
    this.webHookCallback = webHookCallback;
    
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
                this.log("Request for lock state aborted. This is no problem and might happen due to canceled request or due to long response time of the Nuki bridge. Using cached value isLocked = '%s'.", cachedIsLocked);
                callback(null, cachedIsLocked);
            }
            else {
                var state = NUKI_LOCK_STATE_UNDEFINED;
                if(json) {
                    state = json.state;
                }
                var isLocked = this._isLocked(state);
                this.log("Lock state is isLocked = '%s' (Nuki state '%s' )", isLocked, state);
                this._setIsLockedCache(isLocked);
                callback(null, isLocked);
            }
        }).bind(this);
        this.nukiBridge.lockState(this, callbackWrapper);
    }
};

NukiLock.prototype._isLocked = function _isLocked(state) {
    var isLocked = 
        state == NUKI_LOCK_STATE_LOCKED || 
        state == NUKI_LOCK_STATE_LOCKING || 
        state == NUKI_LOCK_STATE_UNCALIBRATED || 
        state == NUKI_LOCK_STATE_MOTOR_BLOCKED || 
        state == NUKI_LOCK_STATE_UNDEFINED;
    return isLocked;
};

NukiLock.prototype.lock = function lock(callback) {
    if(this.isDoorLatch()) {
        this.log("Doors with door latch never process action to lock as these locks are always locked.");
        callback(null);
    }
    else{
        this._setIsLockedCache(true);
        this.nukiBridge.lockAction(this, this.lockAction, callback);
    }
};

NukiLock.prototype.unlock = function unlock(callback) {
    this._setIsLockedCache(false);
    this.nukiBridge.lockAction(this, this.unlockAction, callback);
};

NukiLock.prototype._getIsLockedCached = function _getIsLockedCached() {
    if(this.isDoorLatch()) {
        return true;
    }
    var cachedIsLocked = this.nukiBridge.storage.getItemSync(this._getIsLockedStorageKey());
    if(cachedIsLocked === undefined) {
        return true;
    }
    return cachedIsLocked;
};

NukiLock.prototype._setIsLockedCache = function _setIsLockedCache(isLocked) {
    if(!this.isDoorLatch()) {
        this.nukiBridge.storage.setItemSync(this._getIsLockedStorageKey(), isLocked);
    }
};

NukiLock.prototype._getIsLockedStorageKey = function _getIsLockedStorageKey() {
    return 'bridge-'+this.nukiBridge.instanceId+'-lock-'+this.instanceId+'-islocked';
};

module.exports = {getInstance: this.getInstance, NukiLock: NukiLock};