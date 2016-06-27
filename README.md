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
            "api_token" : "your-nuki-api-token"
        }
      ]
    }

The plugin uses the Nuki API of the bridge. The API token can be configured via the Nuki app when enabling the API.