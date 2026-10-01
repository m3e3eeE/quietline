# QuietLine

A static GitHub Pages prototype for a calmer messaging system: direct and group chats without feeds, likes, stories, follower counts, or algorithmic discovery.

This prototype is intentionally local-only. Messages are stored in browser `localStorage` so the interface can be tried immediately on GitHub Pages. A production version would need an encrypted backend, account system, delivery service, and push notifications.

## Run Locally

Open `index.html` directly in a browser, or serve the folder:

```sh
python3 -m http.server 8080
```
