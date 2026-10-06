# YEC Phitsanulok: LINE registration page

`index.html` is the whole app: one static page, no build step. Opened without config it runs in **demo mode** (fake LINE user, nothing sent), so you can try it in any browser first.

## 1. Host the page on GitHub Pages (free)

1. Make the repo public: **Settings → General → Danger Zone → Change visibility → Public**. Nothing in this repo is secret (the LIFF ID and Apps Script URL are public by design).
2. **Settings → Pages → Build and deployment**: Source **Deploy from a branch**, branch **main**, folder **/ (root)**, then **Save**.
3. After a minute the page is live at **https://bsmart-th.github.io/yec-liff-phitsanulok/**. Use this exact URL (with the trailing `/`) as the LIFF Endpoint URL in step 2.

Every push to `main` redeploys automatically. Free Pages easily handles a few hundred registrations.

> If the repo has to stay private: either upgrade the bsmart-th org to a paid GitHub plan (then step 2 above works as is), or link the repo to Netlify instead (app.netlify.com → Import from GitHub, no build command, publish directory `/`).

## 2. Create the LINE Login channel and LIFF app

1. Go to https://developers.line.biz/console/ and log in with your LINE account.
2. Create a **Provider** (e.g. "YEC").
3. In the provider, create a new channel of type **LINE Login**. App type: **Web app**.
4. Open the channel → **LIFF** tab → **Add**:
   - Size: **Full**
   - Endpoint URL: `https://bsmart-th.github.io/yec-liff-phitsanulok/`
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

Commit and push to `main`; GitHub Pages redeploys on its own. Share it as `https://liff.line.me/<LIFF_ID>`, e.g. in your LINE OA rich menu, a QR code, or a chat. Demo mode stays on until **both** values are set.

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
