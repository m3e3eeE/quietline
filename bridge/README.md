# Relay WhatsApp Bridge

This is the local Mac bridge that lets the Relay website ask OpenClaw to send WhatsApp messages.

It does not store WhatsApp credentials. It calls the existing local `openclaw message send --channel whatsapp` command, protected by a private bridge token.

## Run

```sh
export QUIETLINE_BRIDGE_TOKEN="replace-with-a-private-long-random-value"
export QUIETLINE_BRIDGE_DRY_RUN_DEFAULT=1
node bridge/quietline-bridge.mjs
```

Defaults:

- URL: `http://127.0.0.1:8787`
- Dry run: on
- Allowed web origins: `https://m3e3eee.github.io`, `http://localhost:8080`, and `http://127.0.0.1:8080`
- Static app: the bridge also serves Relay at its own URL, so phone testing can use one local address.

For same-Wi-Fi phone testing:

```sh
export QUIETLINE_BRIDGE_HOST=0.0.0.0
node bridge/quietline-bridge.mjs
```

Then open `http://<mac-lan-ip>:8787` on the phone.

For a real send test, start the bridge with dry-run disabled or turn off dry-run in the Relay UI:

```sh
export QUIETLINE_BRIDGE_DRY_RUN_DEFAULT=0
```

## Test

```sh
curl http://127.0.0.1:8787/health
curl -X POST http://127.0.0.1:8787/api/whatsapp/send \
  -H "authorization: Bearer $QUIETLINE_BRIDGE_TOKEN" \
  -H "content-type: application/json" \
  -d '{"target":"+31612345678","message":"Relay dry run","dryRun":true}'
```
