# APP_PORT so next dev does not inherit the API's PORT

Setting PORT for the Nest API (3001 by default) also lands on `next dev`, because turbo.json passThroughEnv includes PORT. On a machine where 3000 or 3001 is already taken, the app and API then fight over one port.

Give the app its own APP_PORT (default 3000). `next dev --port ${APP_PORT:-3000}` wins over PORT, so the two processes can sit on different ports without forking the compose file or the Next script for each install.
