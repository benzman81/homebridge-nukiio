**NOTE: Since version 0.4.0 the configuration changed to platform. You must fix your configuration to match the new configuration format.**
***
# homebridge-nukiio
Nuki.io support for Homebridge: https://github.com/nfarina/homebridge 

# Current state
The plugin is currently under heavy development, as it needs to be better balanced with the hardware brige. 
There is still some restart issue of the bridge that seemed to be fixed by firmware update 1.2.9 but wasn't.

# Configuration
Example config.json:

    {
        "platforms": [
            {
                "platform": "NukiBridge",
                "bridge_url": "your-nuki-bridge-url",
                "api_token" : "your-nuki-api-token",
                "request_timeout_lockstate": 5000, // (in ms, optional, default: 5000)
                "request_timeout_lockaction": 30000, // (in ms, optional, default: 30000)
                "cache_directory": "./.node-persist/storage", // (optional, default: "./.node-persist/storage")
                "webhook_server_ip_or_name": "xxx.xxx.xxx.xxx", // (optional)
                "webhook_port": 51827, // (optional, default: 51827)
                "lock_state_mode": 0, // (see below, optional, default: 0)
                "add_maintainance_buttons": false, // (optional, default: false, if set to true, than three switches will be added as accessory to do reboot, firmware update, and to refresh all locks state)
                "locks": [
                    {
                        "id": "your-lock-id",
                        "name": "Front Door",
                        "lock_action" : "2", // (from Nuki API, optional, default: "2")
                        "unlock_action" : "1", // (from Nuki API, optional, default: "1")
                        "priority" : 1 // (optional, default: 99 [locks with higher priority {lower number} will be proccessed first])
                    }
                ]
            }
        ]
    }

## Configure lock state mode
You can choose one of the following values to determine how to retrieve the state of the locks:

|Value| Description|
|-|-|
|0 (default)| Lock states are requested from the bridge via /lockState. This means, that the bridge always connects to each lock via Bluetooth to retrieve an always up-to-date lock state. This mode takes a lot of time for retrieving the lock state when using more than one lock, as this can not be processed in parallel|
|1| Only use internal cached values by the plugin. These values get their state by using the webhooks of the bridge, so you need to active them. This mode is the fastest as no request are send to the bridge but of course has the drawback that the cache might not always be correct.|
|2| Lock states are requested from the bridge via /list using a last known lock state cached by Nuki bridge. This means, that the bridge does not connect to any lock via Bluetooth to retrieve lock state. This mode is faster than mode "0" but still makes requests to the bridge. If multiple locks request the lockstate in parallel than only one request is sent to bridge for all locks. The drawback is, that the last known state might not always be correct. (not supported until Nuki releases firmware update)|

*Note: Currently I use mode "1" for my two locks. Although the state might not be correct in a few cases, I prefer this as the state are shown very fast in HomeKit. Once the firmware is out, I will switch to mode "2" to see if that speed is acceptable for me.

## Use Nuki Webhook
Usually the plugin makes calls to Nuki bridge to get the state of a lock. Since Nuki supports Webhooks it is possible for Nuki to push a lock state on the fly to the plugin.
If the configuration parameter "webhook_server_ip_or_name" is set, than the plugin registers a Webhook in Nuki automatically if not already set to use it for lock state update and cache.

*Note: An automatically added Webhook does not get removed ever, so you need to do it manually if you don't need it anymore.*

## Doors with door latches
If you own a door with a door latch, than you can add the same lock twices. On the second entry you set "lock_action" and "unlock_action" to "3".
This way you get an additional lock accessory that shows always locked state and always does an unlatch. The additional lock will not change its battery status to save bridge calls since the other lock will already show correct battery status.

# Additional information
The plugin uses the Nuki API of the bridge. The API token can be configured via the Nuki app when enabling the API.
The plugin was build on Nuki API documentation v1.0.3. Valid values for lock action and unlock action can be found in the Nuki API documentation.