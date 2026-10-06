# YEC Phitsanulok: LINE registration page

`index.html` is the whole app: one static page, no build step. Opened without config it runs in **demo mode** (fake LINE user, nothing sent), so you can try it in any browser first.

## 1. Host the page (free, auto-updates from this repo)

**Netlify (recommended, works with this private repo)**
1. Sign in at https://app.netlify.com with your GitHub account.
2. **Add new site → Import an existing project → GitHub**, allow access to `bsmart-th/yec-liff-phitsanulok`, and pick it.
3. Leave the build command empty and set the publish directory to `/` (the repo root). Click **Deploy**.
4. Copy the `https://….netlify.app` URL. You can rename the site under Site configuration.

From then on, every change pushed to `main` goes live automatically.

**Or GitHub Pages** (only if the repo is made public, or the org is on a paid GitHub plan)
1. Repo **Settings → Pages → Source: Deploy from a branch**, branch `main`, folder `/ (root)`.
2. Your URL is `https://bsmart-th.github.io/yec-liff-phitsanulok/`.

## 2. Create the LINE Login channel and LIFF app

1. Go to https://developers.line.biz/console/ and log in with your LINE account.
2. Create a **Provider** (e.g. "YEC").
3. In the provider, create a new channel of type **LINE Login**. App type: **Web app**.
4. Open the channel → **LIFF** tab → **Add**:
   - Size: **Full**
   - Endpoint URL: the hosting URL from step 1
   - Scopes: tick **openid** and **profile**
   - Bot link feature: **On (Normal)** if you have a LINE Official Account and want to message users later; otherwise Off
5. Copy the **LIFF ID** (looks like `2001234567-AbCdEfGh`).
6. Set the channel to **Published** (top of the channel page). While it's "Developing", only you and listed testers can open it.

## 3. Plug in the config

At the top of the `<script>` in `index.html`:

```js
const CONFIG = {
  LIFF_ID: "2001234567-AbCdEfGh",     // from step 2
  SUBMIT_URL: "https://script.google.com/macros/s/…/exec", // from the Google Sheet step (next thread)
  MAX_MEMBERS: 20,
};
```

Commit and push to `main`; Netlify redeploys on its own. Share it as `https://liff.line.me/<LIFF_ID>`, e.g. in your LINE OA rich menu, a QR code, or a chat. Demo mode stays on until **both** values are set.

## 4. Changing the form fields

The placeholder questions live in the `FIELDS` object right under `CONFIG`:
- `person`: the individual, or the group's contact person
- `group`: group-level questions (team name)
- `member`: asked for each extra group member

Each field is `{ key, label, type, required }`. Types: `text`, `tel`, `email`, `select` (add `options: [...]`), `textarea`.

## For the backend (step 2)

The page POSTs JSON with `Content-Type: text/plain` (avoids a CORS preflight Apps Script can't answer):

```json
{ "action": "register", "lineUserId": "U…", "lineDisplayName": "…", "idToken": "…",
  "registration": { "type": "individual|group", "person": {…}, "group": {…}, "members": [{…}] } }
```
Expected reply: `{ "ok": true, "status": "pending" }` or `{ "ok": false, "error": "…" }`.

```json
{ "action": "status", "lineUserId": "U…", "idToken": "…" }
```
Expected reply: `{ "status": "none|pending|approved|rejected", "note": "optional reason", "registration": {…} }`.

`idToken` lets the backend confirm the user really is that LINE user (verify via `https://api.line.me/oauth2/v2.1/verify`), so nobody can register or read status on someone else's behalf.
