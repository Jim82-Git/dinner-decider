# Enable a shared family list

Dinner Decider's frontend is hosted on GitHub Pages. The family list is stored by a separate Python API in SQLite. The API must run on a server with a persistent disk and a public HTTPS address; GitHub Pages cannot run SQLite or host the API.

## 1. Deploy the API

The repository includes a Docker Compose deployment with the API, a persistent SQLite volume, and Caddy for HTTPS.

1. Choose a VPS or other Docker host with a persistent volume, install Docker Engine with the Compose plugin, and point a DNS name (for example, `dinner-api.example.com`) at the server.
2. Copy the repository's API deployment files (`Dockerfile`, `docker-compose.yml`, `Caddyfile`, `server.py`) to the host.
3. Create a `.env` file from [`.env.example`](./.env.example). Set `API_DOMAIN` to the DNS name you configured and leave `ALLOWED_ORIGINS` as the exact GitHub Pages origin, `https://jim82-git.github.io`. Do not add a path or trailing slash.
4. Ensure ports 80 and 443 are reachable from the internet, then start the service:

   ```sh
   docker compose up -d --build
   docker compose ps
   ```

   Caddy obtains and renews the HTTPS certificate. Check `https://YOUR_API_DOMAIN/health` returns `{"status":"ok"}`.

The `dinner-decider-data` Docker volume contains the SQLite database. Keep this volume persistent and include it in your server backups. Do not deploy on an ephemeral filesystem. To change the allowed website origin, update `ALLOWED_ORIGINS` and restart the API.

## 2. Configure and publish the frontend

Edit [`config.js`](./config.js) and set the HTTPS address of the API:

```js
window.DINNER_DECIDER_CONFIG = Object.freeze({
  apiBaseUrl: "https://dinner-api.example.com",
});
```

Commit and push the change to `main`. GitHub Actions deploys the frontend to GitHub Pages. The API address is public configuration; do not put credentials or database secrets in this file.

## 3. Create and share your family list

1. Open the deployed Dinner Decider site and choose **Share family list**.
2. The app creates a private SQLite-backed list and copies its invitation link.
3. Send the complete link to family members. Anyone with the link can read, edit, or clear the list.

The invitation contains a random secret in the URL fragment. Keep it private. To revoke access, stop the API and remove that list's row from the `family_lists` table in SQLite; the app does not currently provide a revoke button. Creating a new list does not copy the old one.

## Data, privacy, and troubleshooting

- Local lists remain in the current browser only. A shared list is stored in the API's SQLite database, not in GitHub.
- Everyone must open the same private invitation link. Opening the main site without it uses the local list for that browser.
- Saves are sent immediately; open family lists check for updates about every 12 seconds.
- Simultaneous edits are detected. The app asks whether to use the latest family version or keep the pending local version.
- Anyone with the private invitation link has full edit access. There are no accounts, individual permissions, or link recovery. Treat the link as a password.
- The API stores a hash of the invitation secret, not the secret itself. HTTPS protects it in transit. The browser sends the secret in an `X-Family-Key` request header and keeps it in the URL fragment, which is not sent in the page request.
- If the app reports that shared storage is not configured, confirm that `config.js` has the API's HTTPS URL and that the Pages deployment completed.
- If requests are blocked, confirm the API health check, HTTPS certificate, DNS, firewall ports 80/443, and `ALLOWED_ORIGINS`.
- If data disappears after a restart, confirm Docker's `dinner-decider-data` volume is attached and persistent.
- Never expose the SQLite file directly on the internet or mount it into a public static-site directory.

## Open the app locally on Windows

The frontend can be served without Python. From the repository root, run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\serve-local.ps1
```

Keep that PowerShell window open and visit `http://127.0.0.1:5500/`. Press Ctrl+C in the PowerShell window to stop the site server. The frontend works in local-list mode without the API.

## Run the shared-list API locally

Python 3.10 or later is required for shared lists. With Python installed, start the API in a second PowerShell window from the repository root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\run-api-local.ps1
```

The local page server automatically points the app to this API; the published `config.js` is not changed. The database file is created at `data\dinner-decider.sqlite3` after the first shared list is made. Use DB Browser for SQLite to open that file and inspect the `family_lists` table. Avoid editing the file while the API is running.

Run the API tests with:

```sh
python -m unittest discover -s tests
```
