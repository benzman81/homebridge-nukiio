**NOTE: Since version 0.4.0 the configuration changed to platform. You must fix your configuration to match the new configuration format.**
***
# homebridge-nukiio
Nuki.io support for Homebridge: https://github.com/nfarina/homebridge 

#Current state
The plugin is currently under heavy development, as the plugin development started based on a dummy server faking a nuki Bridge. 
Now, since I received the hardware bridge, there has been a lot of issues that I am currently still working on. 
But in the end I always try to provide a "mostly" working version. Currently there is still an issue, where my hardware bridge is 
doing a restart when I open the Home-App once in a while and Doors with door latches do not work well. Both is in work.

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
                "webhook_port": 51827, // (optional, default: 51827)
                "locks": [
                    {
                        "id": "your-lock-id",
                        "name": "Front Door",
                        "lock_action" : "2", // (from Nuki API, optional, default: "2")
                        "unlock_action" : "1" // (from Nuki API, optional, default: "1")
                    }
                ]
            }
        ]
    }

Doors with door latches: If you set "lock_action" and "unlock_action" both to "3" you get an accessory that shows always locked state and always does an unlatch.

# Additional information
The plugin uses the Nuki API of the bridge. The API token can be configured via the Nuki app when enabling the API.
The plugin was build on Nuki API documentation v1.02. Valid values for lock action and unlock action can be found in the Nuki API documentation.