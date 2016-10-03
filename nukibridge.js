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

var DEFAULT_REQUEST_TIMEOUT_LOCK_STATE = 5000;
var DEFAULT_REQUEST_TIMEOUT_LOCK_ACTION = 30000;
var DEFAULT_WEBHOOK_SERVER_PORT = 51827;
var DEFAULT_CACHE_DIRECTORY = "./.node-persist/storage";

function NukiBridge(log, bridgeUrl, apiToken, requestTimeoutLockState, requestTimeoutLockAction, cacheDirectory, webHookServerIpOrName, webHookServerPort) {
    this.log = log;
    this.log("Initializing Nuki bridge '%s'...", bridgeUrl);
    this.bridgeUrl = bridgeUrl;
    this.apiToken = apiToken;
    this.requestTimeoutLockState = requestTimeoutLockState;
    this.requestTimeoutLockAction = requestTimeoutLockAction;
    this.cacheDirectory = cacheDirectory;
    this.webHookServerIpOrName = webHookServerIpOrName;
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
    
    if(this.webHookServerIpOrName && this.webHookServerIpOrName !== "") {
        this.webHookUrl = "http://"+this.webHookServerIpOrName+":"+this.webHookServerPort+"/";
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
            if(!json.nukiId || !json.state) {
                response.statusCode = 404;
                response.setHeader("Content-Type", "text/plain");
                var errorText = "[ERROR Nuki WebHook Server] No nukiId or state or batteryCritical in request.";
                log(errorText);
                response.write(errorText);
                response.end();
            }
            else {
                var nukiId = json.nukiId+"";
                var state = json.state;
                var batteryCritical = json.batteryCritical===true || json.batteryCritical==="true";
                var ignoreDoorsWithDoorLatches = true;
                var lock = this._getLock(nukiId, ignoreDoorsWithDoorLatches);
                if(lock == null) {
                    response.setHeader("Content-Type", "text/plain");
                    var infoText = "[INFO Nuki WebHook Server] No lock found for nukiId '"+nukiId+"'.";
                    log(infoText);
                    response.write(infoText);
                    response.end();
                }
                else {            
                    var responseBody = {
                        success: true
                    };
                    if(!lock.isDoorLatch()) {
                        var isLocked = lock._isLocked(state);
                        lock._setLockCache(isLocked, batteryCritical);  
                        log("[INFO Nuki WebHook Server] Updated lock state from webhook to isLocked = '%s' (Nuki state '%s' ) for lock '%s' (instance id '%s') with batteryCritical = '%s'.", isLocked, state, lock.id, lock.instanceId, batteryCritical);
                        lock.webHookCallback(isLocked, batteryCritical);
                    }                      
                    response.write(JSON.stringify(responseBody));
                    response.end();
                }
            }
        }).bind(this));
    }).bind(this)).listen(webHookServerPort);    
    this.log("Started server for webhooks on port '%s'.", webHookServerPort);
};

NukiBridge.prototype._addWebhookToBridge = function _addWebhookToBridge() {
    this.log("Adding webhook for plugin to bridge...");
    var callbackList = (function(err, json) {
        if(err) {
            throw new Error("Request for webhooks failed: "+err);
        }
        else if(json) {
            var callbacks = json.callbacks;
            var webhookExists = false;
            for (var i = 0; i < callbacks.length; i++) {
                var callback = callbacks[i];
                if(callback.url === this.webHookUrl) {
                    webhookExists = true;
                    break;
                }
            }
            if(webhookExists) {
                this.log("Webhook for plugin already exists.", err);
            }
            else {
                this._addCallback();
            }
        }
    }).bind(this);
    this._getCallbacks(callbackList);
};

NukiBridge.prototype._getCallbacks = function _getCallbacks(callback) {
    if(!this.runningRequest) {
        this._sendRequest(
            "/callback/list",
            { token: this.apiToken},
            this.requestTimeoutLockAction,
            callback
        );
    }
    else {
        this._addToQueue({callbackList: callbackList});
    }
};

NukiBridge.prototype._addCallback = function _addCallback() {
    if(!this.runningRequest) {
        var callback = (function(err, json) {
            if(err) {
                throw new Error("Adding webhook failed: "+err);
            }
            else {
                this.log("Webhook for plugin added.", err);
            }
        }).bind(this);
        this._sendRequest(
            "/callback/add",
            { token: this.apiToken, url: this.webHookUrl},
            this.requestTimeoutLockAction,
            callback
        );
    }
    else {
        this._addToQueue({callbackAdd: true});
    }
};

NukiBridge.prototype.addLock = function addLock(nukiLock) {
    nukiLock.instanceId = this.locks.length;
    this.locks.push(nukiLock);
};

NukiBridge.prototype._getLock = function _getLock(id, ignoreDoorsWithDoorLatches) {
    for (var i = 0; i < this.locks.length; i++) {
        var lock = this.locks[i];
        if(lock.isDoorLatch() && ignoreDoorsWithDoorLatches) {
            continue;
        }
        if(lock.id === id) {
            return lock;
        }
    }
    return null;
};

NukiBridge.prototype.lockState = function lockState(nukiLock, callback /*(err, json)*/) {
    if(!this.runningRequest) {
        this._sendRequest(
            "/lockState",
            { token: this.apiToken, nukiId: nukiLock.id},
            this.requestTimeoutLockState,
            callback
        );
    }
    else {
        this._addToQueue({nukiLock: nukiLock, callback: callback});
    }
};

NukiBridge.prototype.lockAction = function lockAction(nukiLock, lockAction, callback /*(err, json)*/) {
    if(!this.runningRequest) {
        this.log("Process lock action '%s' for Nuki lock '%s' (instance id '%s') on Nuki bridge '%s'.", lockAction, nukiLock.id, nukiLock.instanceId, this.bridgeUrl);
        this._sendRequest(
            "/lockAction",
            { token: this.apiToken, nukiId: nukiLock.id, action: lockAction},
            this.requestTimeoutLockAction,
            callback
        );
    }
    else {
        this._addToQueue({nukiLock: nukiLock, lockAction: lockAction, callback: callback});
    }
};

NukiBridge.prototype._sendRequest = function _sendRequest(entryPoint, queryObject, requestTimeout, callback /*(err, json)*/) {
    this.log("Send request to Nuki bridge '%s' on '%s' with '%s'.", this.bridgeUrl, entryPoint, JSON.stringify(queryObject));
    this.runningRequest = true;
    request.get({
        url: this.bridgeUrl+entryPoint,
        qs: queryObject,
        timeout: requestTimeout
    }, (function(err, response, body) {
        var statusCode = response && response.statusCode ? response.statusCode: -1;
        this.log("Request to Nuki bridge '%s' finished with status code '%s' and body '%s'.", this.bridgeUrl, statusCode, body, err);
        if (!err && statusCode == 200) {
            var json = JSON.parse(body);
            var success = json.success;
            if(success) {
                if(success == "true" || success == true) {
                    callback(null, json);
                }
                else {
                    callback(new Error("Request to Nuki bridge was not succesful."));
                }
            }
            else {
                callback(null, json);
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
    if(queueEntry.nukiLock) {
        for (var i = 0; i < this.queue.length; i++) {
            var alreadyQueuedEntry = this.queue[i];
            var sameLock = queueEntry.nukiLock.id == alreadyQueuedEntry.nukiLock.id;
            var bothLockAction = queueEntry.lockAction && alreadyQueuedEntry.lockAction;
            var bothLockState = !queueEntry.lockAction && !alreadyQueuedEntry.lockAction;
            var needsReplace = sameLock && (bothLockAction || bothLockState);
            if(needsReplace) {
                wasReplaced = true;
                this.queue[i] = queueEntry;
                alreadyQueuedEntry.callback(new Error("Request to Nuki bridge was canceled due to newer requests of same type."));
            }
        }
    }
    if(!wasReplaced) {
        this.queue.push(queueEntry);
    }
};

NukiBridge.prototype._processNextQueueEntry = function _processNextQueueEntry() {
    if(this.queue.length > 0) {
        var queueEntry = this.queue.shift();
        if(queueEntry.nukiLock) {
            if(queueEntry.lockAction) {
                this.lockAction(queueEntry.nukiLock, queueEntry.lockAction, queueEntry.callback);
            }
            else {
                this.lockState(queueEntry.nukiLock, queueEntry.callback);
            }
        }
        else if (queueEntry.callbackList) {
            this._getCallbacks(queueEntry.callbackList);
        }
        else if (queueEntry.callbackAdd) {
            this._addCallback();
        }
    }
};

function NukiLock(log, nukiBridge, id, lockAction, unlockAction, webHookCallback) {
    this.nukiBridge = nukiBridge;
    this.log = log;
    this.id = id;
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
                var batteryCritical = false;
                if(json) {
                    state = json.state;
                    batteryCritical = json.batteryCritical;
                }
                var isLocked = this._isLocked(state);
                this.log("Lock state is isLocked = '%s' (Nuki state '%s' ) with battery critical = '%s'", isLocked, state, batteryCritical);
                this._setLockCache(isLocked, batteryCritical);
                callback(null, isLocked);
            }
        }).bind(this);
        this.nukiBridge.lockState(this, callbackWrapper);
    }
};

NukiLock.prototype.getLowBatt = function getLowBatt(callback /*(err, lowBattt)*/) {
    callback(null, this._getIsBatteryLowCached());
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
        this._setLockCache(true);
        this.nukiBridge.lockAction(this, this.lockAction, callback);
    }
};

NukiLock.prototype.unlock = function unlock(callback) {
    this._setLockCache(false);
    this.nukiBridge.lockAction(this, this.unlockAction, callback);
};

NukiLock.prototype._getIsLockedCached = function _getIsLockedCached() {
    if(this.isDoorLatch()) {
        return true;
    }
    var lockCache = this.nukiBridge.storage.getItemSync(this._getLockStorageKey());
    if(lockCache === undefined) {
        return true;
    }
    return lockCache.isLocked;
};

NukiLock.prototype._getIsBatteryLowCached = function _getIsBatteryLowCached() {
    if(this.isDoorLatch()) {
        return false;
    }
    var lockCache = this.nukiBridge.storage.getItemSync(this._getLockStorageKey());
    if(lockCache === undefined) {
        return false;
    }
    return lockCache.batteryCritical;
};

NukiLock.prototype._setLockCache = function _setLockCache(isLocked, batteryCritical) {
    if(!this.isDoorLatch()) {
        var newCache = {
            isLocked: this._getIsLockedCached(),
            batteryCritical: this._getIsBatteryLowCached()
        }
        if(isLocked !== undefined && isLocked !== null) {
            newCache.isLocked = isLocked;
        }
        if(batteryCritical !== undefined && batteryCritical !== null) {
            newCache.batteryCritical = batteryCritical;
        }
        this.nukiBridge.storage.setItemSync(this._getLockStorageKey(), newCache);
    }
};

NukiLock.prototype._getLockStorageKey = function _getLockStorageKey() {
    return 'bridge-'+this.nukiBridge.bridgeUrl+'-lock-'+this.instanceId+'-'+this.id+'-cache';
};

module.exports = {NukiBridge: NukiBridge, NukiLock: NukiLock};