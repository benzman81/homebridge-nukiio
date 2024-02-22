[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

**NOTE: Since version 0.10.0 Only two locks are exposed. One that just does lock/unlock (without pulling the latch), and one that always is
displayed as locked and pulls the door latch on unlock. This way done from personal experience where only these two are only needed. Other behavoirs
could be done using scenes. Since one lock was removed you need to adapt your existing scenes/automations that used this lock. You will now also get a switch in
the lock to enable/disbale unlatching, so you can use automations to switch to desired state (i.e. based on location or time). This was implemented
to prevent accidental unlatch of door.**

**NOTE: Since version 0.7.0 the configuration keys for lock and unlock actions are no longer supported, for now. Use 'usesDoorLatch' for doors with door latch.**

**NOTE: Since version 0.4.0 the configuration changed to platform. You must fix your configuration to match the new configuration format.**

***
# homebridge-nukiio
Nuki.io support for Homebridge: https://github.com/nfarina/homebridge that supports Nuki Lock and Nuki Opener.

# Current state
Seems to work solid. Feel free to create new issues in github for any problems.

# Requirements
You need the following information from your bridge for the configuration:
- You must activate the developer mode on you bridge
- The URL to your bridge, IP and port can be configured when setting up the bridge in the Nuki App, example http://10.0.0.1:8080
- The API token, can be configured when setting up the bridge in the Nuki App
- The nuki id of your locks/opener, can be found when calling http://your-nuki-bridge-url/list?token=your-nuki-api-token in a browser

# Configuration
Example config.json:

    {
        "platforms": [
            {
                "platform": "NukiBridge",
                "bridge_url": "your-nuki-bridge-url",
                "api_token" : "your-nuki-api-token",
                "api_token_hashed": true, // (optional, default: false)
                "request_timeout_lockstate": 30000, // (in ms, optional, default: 15000)
                "request_timeout_lockaction": 60000, // (in ms, optional, default: 45000)
                "request_timeout_other": 30000, // (in ms, optional, default: 15000)
                "cache_directory": ".myFolder/.node-persist/storage", // (optional, default is in hombridge storage path '.homebridge-nukiio')
                "webhook_server_ip_or_name": "xxx.xxx.xxx.xxx", // (optional, must be the IP/Hostname of the server running homebridge)
                "webhook_port": 51827, // (optional, default: 51827, must be a free port on the server running homebridge, NOT the same as homebridge)
                "lock_state_mode": 0, // (see below, optional, default: 0)
                "lockaction_maxtries": 3, // (optional, default: 3)
                "lockaction_retrydelay": 3000, // (in ms, optional, default: 3000)
                "add_maintainance_buttons": false, // (optional, default: false, if set to true, than three switches will be added as accessory to do reboot, firmware update, and to refresh all locks state)
                "locks": [
                    {
                        "id": "your-lock-nukiid",
                        "name": "Front Door",
                        "usesDoorLatch" : true, // (default: false)
                        "usesDoorContactSensor" : true, // (default: false)
                        "preventLockingIfAlreadyLocked" : true, // (default: false)
                        "priority" : 1, // (optional, default: 99 [locks with higher priority {lower number} will be proccessed first])
                        "deviceType" : 0 // (default: 0, 0 = Nuki Smart Lock 1.0/2.0, 3 = Nuki Smart Door, 4 = Nuki Smart Lock 3.0 (Pro))
                    }
                ],
                "openers": [
                    {
                        "id": "your-opener-nukiid",
                        "name": "Main Opener",
                        "disableRingToOpen": false,
                        "disableContinuousMode": false,
                        "priority" : 1 // (optional, default: 99 [openers with higher priority {lower number} will be proccessed first])
                    }
                ]
            }
        ]
    }

## Cache directory storage (cache_directory)
The cache directory is used to cache the state of the locks. It must point to a **valid** and **empty** directory and the user that runs homebridge must have **write access**.

## Configure lock state mode
You can choose one of the following values to determine how to retrieve the state of the locks:

|Value| Description|
|-|-|
|0 (default)| Lock states are requested from the bridge via /lockState. This means, that the bridge always connects to each lock via Bluetooth to retrieve an always up-to-date lock state. This mode takes a lot of time for retrieving the lock state when using more than one lock, as this can not be processed in parallel|
|1| Only use internal cached values by the plugin. These values get their state by using the webhooks of the bridge, so you need to active them. This mode is the fastest as no request are send to the bridge but of course has the drawback that the cache might not always be correct.|
|2| Lock states are requested from the bridge via /list using a last known lock state cached by Nuki bridge. This means, that the bridge does not connect to any lock via Bluetooth to retrieve lock state. This mode is faster than mode "0" but still makes requests to the bridge. If multiple locks request the lockstate in parallel than only one request is sent to bridge for all locks. The drawback is, that the last known state might not always be correct.|

## Use Nuki Webhook
Usually the plugin makes calls to Nuki bridge to get the state of a lock. Since Nuki supports Webhooks it is possible for Nuki to push a lock state on the fly to the plugin.
If the configuration parameter "webhook_server_ip_or_name" is set, than the plugin registers a Webhook in Nuki automatically if not already set to use it for lock state update and cache.

*Note: An automatically added Webhook does not get removed ever, so you need to do it manually if you don't need it anymore.*

## Doors with door latches
You can define if a door uses a door latch by setting 'usesDoorLatch' to true. If you do so, than two locks will be added to homekit. One that unlocks the door without
pulling the door latch ("lockname") and one that always is displayed as locked and pulls the door latch on unlock ("lockname ALWAYS Unlatch").
You will now also get a switch in the lock to enable/disbale unlatching so you can use automations to switch to desired state (i.e. based on location or time).
This was implemented to prevent accidental unlatch of door.

## preventLockingIfAlreadyLocked
This setting is usefull if you have a lock that is set to turn only 360 degrees instead of 720. Setting preventLockingIfAlreadyLocked to true avoids a second lock action so that the lock
will never lock to 720. Use this setting carefully as this might not lock your lock if a wrong state is present in homebridge for any reason.

## Nuki Opener
If you configure a Nuki opener you will get three lock accessories and one button. One lock to open the door, one to de/activate RingToOpen and one to de/activate ContinousMode.
If the lock accessory for RingToOpen is secured then RingToOpen is inactive, other wise it is active.
If the lock accessory for ContinousMode is secured then ContinousMode is inactive, other wise it is active.
The button can be used to deactivate doorbell ring.

# Errors
For errors on lock actions a configured number of retries with delay will be done. You can set the parameters 'lockaction_maxtries' and 'lockaction_retrydelay' to meet your needs.

# Additional information
The plugin uses the Nuki API of the bridge. The API token can be configured via the Nuki app when enabling the API.
The plugin was build on Nuki API documentation v1.9.0. Valid values for lock action and unlock action can be found in the Nuki API documentation.
