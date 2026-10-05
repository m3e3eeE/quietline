# Relay

A static GitHub Pages prototype for a unified messaging system: direct and group chats from multiple services in one place.

This prototype stores normal demo messages in browser `localStorage` so the interface can be tried immediately on GitHub Pages. The Live Room uses public Nostr relays for free room messaging. WhatsApp support is handled by a local Mac bridge that calls OpenClaw, so no private tokens are stored in the GitHub Pages site.

## Native Relay Accounts

Relay now includes the app-side foundation for its own passwordless accounts and private direct messages. It is intentionally inactive until a Supabase project is configured.

1. Create a Supabase project and run [`supabase/schema.sql`](supabase/schema.sql) in its SQL Editor.
2. In Supabase Auth, enable Email magic links and set the production site URL plus redirect URL to the Relay Pages address.
3. Put the project's **public** URL and **anon** key in `relay-config.js`. Never put a service-role key in the website or repository.

Once configured, people can create Relay accounts from the app, start a direct conversation with another person's Relay handle, and exchange native messages. Existing third-party connectors remain separate adapters.

## Run Locally

Open `index.html` directly in a browser, or serve the folder:

```sh
python3 -m http.server 8080
```

## WhatsApp Bridge

Relay can send WhatsApp messages through a local OpenClaw bridge on the Mac that already has WhatsApp linked.

```sh
export QUIETLINE_BRIDGE_TOKEN="replace-with-a-private-long-random-value"
export QUIETLINE_BRIDGE_DRY_RUN_DEFAULT=1
node bridge/quietline-bridge.mjs
```

In Relay, open Connectors, enter the bridge URL and token, then create a WhatsApp chat with an E.164 phone number like `+31612345678`.

Keep dry-run on until the first real send is approved.

For same-Wi-Fi phone testing, run the bridge with `QUIETLINE_BRIDGE_HOST=0.0.0.0` and open `http://<mac-lan-ip>:8787` on the phone. This avoids browser mixed-content blocking between GitHub Pages HTTPS and a local HTTP bridge.
