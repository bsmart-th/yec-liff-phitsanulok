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
  SUBMIT_URL: "https://script.google.com/macros/s/…/exec", // from section 5 below
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

## 5. Google Sheet backend (stores registrations, admin approves here)

The backend is `backend/Code.gs`, a Google Apps Script attached to a Google Sheet. Free, nothing to host.

1. Create a new Google Sheet (e.g. "YEC Registrations") with the Google account that should own the data.
2. **Extensions → Apps Script**. Delete what's in `Code.gs`, paste the whole of [`backend/Code.gs`](backend/Code.gs), and click **Save**.
3. **Project Settings** (gear icon) → **Script properties** → **Add script property**:
   - Property `LINE_CHANNEL_ID`, value = the **Channel ID** of your LINE Login channel (LINE Developers console → the channel → **Basic settings**). This lets the backend check every request really comes from that LINE user.
4. Back in the editor, pick `setup` in the function dropdown and click **Run**. Google asks for permission the first time (Review permissions → your account → Advanced → Go to project → Allow). This creates the **Registrations** tab.
5. **Deploy → New deployment** → type **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
   Click **Deploy** and copy the **Web app URL** (ends in `/exec`).
6. Paste that URL as `SUBMIT_URL` in `index.html` (section 3), commit and push.

**If you change the script later**, use **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. That keeps the same URL; a "New deployment" would give a new one.

### Approving registrations

Each sign-up is one row in **Registrations**, starting as `Pending`.
- Set **Status** to `Approved` or `Rejected` from the dropdown. **Reviewed at** fills itself in.
- **Note to applicant** is optional; for a rejection it's shown to the person as the reason.
- The person sees the new status the next time they open the page.
- Groups are one row: the contact person's answers are in their own columns, other members are listed in **Members**, and **People** is the head count.
- One registration per LINE account. To let someone register again, delete their row.
- Each form question gets its own column automatically, so changing the form later needs no sheet changes. Two columns are hidden on purpose (LINE user ID and the raw data the page reads back); leave them as they are.

Later add-on: a LINE message to the person when they're approved (needs a LINE Official Account linked to the LIFF channel).

## Backend API (for reference)

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
