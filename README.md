**NOTE: Since version 0.4.0 the configuration changed to platform. You must fix your configuration to match the new configuration format.**
***
# homebridge-nukiio
Nuki.io support for Homebridge: https://github.com/nfarina/homebridge 

#Current state
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
                "lock_state_mode": 0, // (optional, default: 0, 0 = request bridge for state, 1 = only uses cached values [only possible with active webhooks] )
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

Doors with door latches: If you own a door with a door latch, than you can add the same lock twices. On the second entry you set "lock_action" and "unlock_action" to "3".
This way you get an additional lock accessory that shows always locked state and always does an unlatch. The additional lock will not change its battery status to save bridge calls since the other lock will already show correct battery status.

# Use Nuki Webhook
Usually the plugin makes calls to nuki bridge to get the state of a lock. Since Nuki supports Webhooks it is possible for Nuki to push a lock state on the fly to the plugin.
If the configuration parameter "webhook_server_ip_or_name" is set, than the plugin registers a Webhook in Nuki automatically if not already set to use it for lock state update and caches it.
If the configuration parameter "lock_state_mode" is set to 0, than there are still requests going out to the bridge for requesting state update and the Webhook only pushes the new state
to HomeKit changes of the loock not done with HomeKit (i.e. pushin hardware button or using the Nuki app). If the configuration parameter "lock_state_mode" is set to 1, than there
will be no requests send to the bridge for requesting the state. Only the cache is returned that is maintained by the webhooks.

* Note: An automatically added Webhook does not get removed ever, so you need to do it manually if you don't need it anymore.*

# Additional information
The plugin uses the Nuki API of the bridge. The API token can be configured via the Nuki app when enabling the API.
The plugin was build on Nuki API documentation v1.0.3. Valid values for lock action and unlock action can be found in the Nuki API documentation.