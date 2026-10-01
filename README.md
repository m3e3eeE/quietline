# QuietLine

A static GitHub Pages prototype for a calmer messaging system: direct and group chats without feeds, likes, stories, follower counts, or algorithmic discovery.

This prototype stores normal demo messages in browser `localStorage` so the interface can be tried immediately on GitHub Pages. The Live Room uses public Nostr relays for free room messaging. WhatsApp support is handled by a local Mac bridge that calls OpenClaw, so no private tokens are stored in the GitHub Pages site.

## Run Locally

Open `index.html` directly in a browser, or serve the folder:

```sh
python3 -m http.server 8080
```

## WhatsApp Bridge

QuietLine can send WhatsApp messages through a local OpenClaw bridge on the Mac that already has WhatsApp linked.

```sh
export QUIETLINE_BRIDGE_TOKEN="replace-with-a-private-long-random-value"
export QUIETLINE_BRIDGE_DRY_RUN_DEFAULT=1
node bridge/quietline-bridge.mjs
```

In QuietLine, open Connectors, enter the bridge URL and token, then create a WhatsApp chat with an E.164 phone number like `+31612345678`.

Keep dry-run on until the first real send is approved.

For same-Wi-Fi phone testing, run the bridge with `QUIETLINE_BRIDGE_HOST=0.0.0.0` and open `http://<mac-lan-ip>:8787` on the phone. This avoids browser mixed-content blocking between GitHub Pages HTTPS and a local HTTP bridge.
