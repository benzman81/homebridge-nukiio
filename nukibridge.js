var request = require("request");
var http = require('http');
var https = require('https');
var storage = require('node-persist');

this.LOCK_ACTION_UNLOCK = "1";
this.LOCK_ACTION_LOCK = "2";
this.LOCK_ACTION_UNLATCH = "3";
this.LOCK_ACTION_LOCK_N_GO = "4";
this.LOCK_ACTION_LOCK_N_GO_UNLATCH = "5";

this.LOCK_STATE_UNCALIBRATED = 0;
this.LOCK_STATE_LOCKED = 1;
this.LOCK_STATE_UNLOCKED = 2;
this.LOCK_STATE_UNLOCKED_LOCK_N_GO = 3;
this.LOCK_STATE_UNLATCHED = 4;
this.LOCK_STATE_LOCKING = 5;
this.LOCK_STATE_UNLOCKING = 6;
this.LOCK_STATE_UNLATCHING = 7;
this.LOCK_STATE_MOTOR_BLOCKED = 254;
this.LOCK_STATE_UNDEFINED = 255;

this.DEFAULT_REQUEST_TIMEOUT = 60000;
this.DEFAULT_CACHE_DIRECTORY = "./.node-persist./storage";

http.globalAgent.maxSockets = 1;
https.globalAgent.maxSockets = 1;

this.runningRequest = false;
this.queue = [];

this.init = function(log, bridgeUrl, apiToken, requestTimeout, cacheDirectory) {
    this.log = log;
    this.log("Initializing Nuki bridge...");
    this.bridgeUrl = bridgeUrl;
    this.apiToken = apiToken;
    this.requestTimeout = requestTimeout;
    this.cacheDirectory = cacheDirectory;
    if(this.requestTimeout == null || this.requestTimeout == "" || this.requestTimeout < 1) {
        this.requestTimeout = this.DEFAULT_REQUEST_TIMEOUT;
    }
    if(this.cacheDirectory == null || this.cacheDirectory == "") {
        this.cacheDirectory = this.DEFAULT_CACHE_DIRECTORY;
    }
    storage.initSync({dir:this.cacheDirectory});
    this.log("Initialized Nuki bridge.");
}


this.lockState = function(lockId, successfulCallback, failedCallback) {
    this.log("Requesting lock state for lock %s.", lockId);
    if(!this.runningRequest) {
        var successfulCallbackWrapper = (function(json) {
            var state = json.state;
            storage.setItemSync('nuki-lock-state-'+lockId, state);
            successfulCallback(json);
        }).bind(this);
        var failedCallbackWrapper = (function(err) {
            if(err && err.code === 'ETIMEDOUT') {
                var cachedState = storage.getItemSync('nuki-lock-state-'+lockId);
                if(!cachedState) {
                    cachedState = this.LOCK_STATE_LOCKED;
                }
                this.log("Read timeout occured requesting lock state. This might happen due to long response time of the Nuki bridge. Using cached state %s.", cachedState);
                successfulCallback({state: cachedState});
            }
            else {
                failedCallback(err);
            }
        }).bind(this);
        this._sendRequest(
            "/lockState",
            { token: this.apiToken, nukiId: lockId},
            successfulCallbackWrapper,
            failedCallbackWrapper
        );
    }
    else {
        this._addToQueue({lockId: lockId, successfulCallback: successfulCallback, failedCallback: failedCallback});
    }
}

this.lockAction = function(lockId, lockAction, successfulCallback, failedCallback) {
    this.log("Process lock action %s for lock %s.", lockAction, lockId);
    if(!this.runningRequest) {
        var newState = this.LOCK_STATE_LOCKED;
        if(lockAction == this.LOCK_ACTION_UNLOCK || lockAction == this.LOCK_ACTION_UNLATCH) {
            newState = this.LOCK_STATE_UNLOCKED;
        }
        storage.setItemSync('nuki-lock-state-'+lockId, newState);
        var failedCallbackWrapper = (function(err) {
            if(err && err.code === 'ETIMEDOUT') {
                this.log("Read timeout occured processing lock action. This might happen due to long response time of the Nuki bridge. Assuming everthing went well.");
                successfulCallback({});
            }
            else {
                failedCallback(err);
            }
        }).bind(this);
        this._sendRequest(
            "/lockAction",
            { token: this.apiToken, nukiId: lockId, action: lockAction},
            successfulCallback,
            failedCallback
        );
    }
    else {
        this._addToQueue({lockId: lockId, lockAction: lockAction, successfulCallback: successfulCallback, failedCallback: failedCallback});
    }
}

this._sendRequest = function(entryPoint, queryObject, successfulCallback, failedCallback) {
    this.log("Send request to Nuki bridge to %s with %s.", entryPoint, JSON.stringify(queryObject));
    this.runningRequest = true;
    request.get({
        url: this.bridgeUrl+entryPoint,
        qs: queryObject,
        timeout: this.requestTimeout
    }, (function(err, response, body) {
        this.log("Request to Nuki bridge finished.");
        if (!err && response.statusCode == 200) {
            var json = JSON.parse(body);
            var success = json.success;
            if(success == "true" || success == true) {
                successfulCallback(json);
            }
            else {
                failedCallback(new Error("Request to Nuki bridge was not succesful."));
            }
        }
        else {  
            failedCallback(err || new Error("Request to Nuki bridge was not succesful."));
        }
        this.runningRequest = false;
        this._processNextQueueEntry();
    }).bind(this));
}

this._addToQueue = function(queueEntry) {
    this.log("Adding queue entry %s to current queue %s", JSON.stringify(queueEntry), JSON.stringify(this.queue));
    if(this.queue.length > 0) {
        var needsRemove = function(filterEntry){
            var sameLock = queueEntry.lockId == filterEntry.lockId;
            var bothLockAction = queueEntry.lockAction && filterEntry.lockAction;
            var bothLockState = !queueEntry.lockAction && !filterEntry.lockAction;
            var needsRemove = sameLock && (bothLockAction || bothLockState);
            return needsRemove;
        };
        var newQueue = this.queue.filter(function(filterEntry){
            return !needsRemove(filterEntry);
        });
        var removedQueue = this.queue.filter(needsRemove); 
        removedQueue.forEach((function(item, index){
            if(!item.lockAction) {
                var cachedState = storage.getItemSync('nuki-lock-state-'+item.lockId);
                if(!cachedState) {
                    cachedState = this.LOCK_STATE_LOCKED;
                }
                this.log("Request to Nuki bridge was canceled due to newer requests of same type. Using cached state %s.", cachedState);
                item.successfulCallback({state: cachedState});
            }
            else {
                item.failedCallback(new Error("Request to Nuki bridge was canceled due to newer requests of same type."));
            }
        }).bind(this));
        this.queue = newQueue;
    }
    this.queue.push(queueEntry);
    this.log("New queue is %s", JSON.stringify(this.queue));
}

this._processNextQueueEntry = function() {
    if(this.queue.length > 0) {
        var queueEntry = this.queue.shift();
        this.log("Processing next queue entry %s.", JSON.stringify(queueEntry));
        if(queueEntry.lockAction) {
            this.lockAction(queueEntry.lockId, queueEntry.lockAction, queueEntry.successfulCallback, queueEntry.failedCallback);
        }
        else {
            this.lockState(queueEntry.lockId, queueEntry.successfulCallback, queueEntry.failedCallback);
        }
    }
}