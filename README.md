# homebridge-nukiio
Nuki.io support for Homebridge: https://github.com/nfarina/homebridge 

Example config.json:

    {
      "accessories": [
        {
            "accessory": "Nuki",
            "bridge_url": "your-nuki-bridge-url",
            "name": "Front Door",
            "lock_id": "your-lock-id",
            "api_token" : "your-nuki-api-token",
            "lock_action" : "2",
            "unlock_action" : "1"
        }
      ]
    }

The plugin uses the Nuki API of the bridge. The API token can be configured via the Nuki app when enabling the API.
The plugin was build on Nuki API documentation v1.02. Valid values for lock action and unlock action can be found in the Nuki API documentation.