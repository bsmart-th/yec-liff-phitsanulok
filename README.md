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
  SUBMIT_URL: "https://script.google.com/macros/s/…/exec", // from section 5 below
};
```

Commit and push to `main`; GitHub Pages redeploys on its own. Share it as `https://liff.line.me/<LIFF_ID>` (YEC Phitsanulok: https://liff.line.me/2011950249-ekguOCPn), e.g. in your LINE OA rich menu, a QR code, or a chat. Demo mode stays on until **both** values are set.

## 4. Event details and form questions

Everything you'd edit is near the top of the `<script>` in `index.html`:

- **`EVENT`**: title, prices (`rates`), single-room extra, **bank account**, and the thank-you message. **Before opening registration, fill in the bank account and each rate's `note`** (its conditions or date range); they're placeholders in `[...]` now. Prices here feed the price list, the rate choices, the payment table and the "amount to pay" box, so change them only here.
- **`SECTIONS`**: the six sections of questions. Each question has `label` (what people see), `col` (its column name in the Google Sheet), `type` (`text`, `tel`, `email`, `number`, `date`, `time`, `textarea`, `radio`, `confirm`, `file`), `required`, and optional `help`.

The page works out the amount to pay from the rate plus the room choice (single room adds 1,200) and pre-fills the transfer amount; the person can change it, and the sheet keeps both (**ยอดที่ต้องชำระ** and **ยอดเงินที่โอน**) so they're easy to compare.

One registration per LINE account, matching "1 ท่านต่อ 1 คำตอบ": each participant registers from their own LINE.

## 5. Google Sheet backend (stores registrations, admin approves here)

The backend is `backend/Code.gs`, a Google Apps Script attached to a Google Sheet. Free, nothing to host.

1. Create a new Google Sheet (e.g. "YEC Registrations") with the Google account that should own the data.
2. **Extensions → Apps Script**. Delete what's in `Code.gs`, paste the whole of [`backend/Code.gs`](backend/Code.gs), and click **Save**.
3. **Project Settings** (gear icon) → **Script properties** → **Add script property**:
   - Property `LINE_CHANNEL_ID`, value = the **Channel ID** of your LINE Login channel (LINE Developers console → the channel → **Basic settings**). This lets the backend check every request really comes from that LINE user.
4. Back in the editor, pick `setup` in the function dropdown and click **Run**. Google asks for permission the first time (Review permissions → your account → Advanced → Go to project → Allow). This creates the **Registrations** tab and a Drive folder **YEC Registration Slips** for payment slips.
5. **Deploy → New deployment** → type **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
   Click **Deploy** and copy the **Web app URL** (ends in `/exec`).
6. Paste that URL as `SUBMIT_URL` in `index.html` (section 3), commit and push.

**If you change the script later**, paste the new `Code.gs`, run `setup` once more (it asks for any new permission, e.g. Google Drive for slips), then use **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. That keeps the same URL; a "New deployment" would give a new one.

### Approving registrations

Each sign-up is one row in **Registrations**, starting as `Pending`.
- Set **Status** to `Approved` or `Rejected` from the dropdown. **Reviewed at** fills itself in.
- **Note to applicant** is optional; for a rejection it's shown to the person as the reason.
- The person sees the new status the next time they open the page.
- **Payment slip** links to the uploaded slip in the **YEC Registration Slips** Drive folder. Only the sheet owner can open it unless you share the folder with the other admins.
- One registration per LINE account. To let someone register again, delete their row.
- Each form question gets its own column automatically, so changing the form later needs no sheet changes. A few columns are hidden on purpose (LINE user ID, the raw data the page reads back, and the unused Type / People / Members); leave them as they are.

Later add-on: a LINE message to the person when they're approved (needs a LINE Official Account linked to the LIFF channel).

## Backend API (for reference)

The page POSTs JSON with `Content-Type: text/plain` (avoids a CORS preflight Apps Script can't answer):

```json
{ "action": "register", "lineUserId": "U…", "lineDisplayName": "…", "idToken": "…",
  "registration": { "type": "individual", "person": { "<sheet column>": "answer", … },
                    "slip": { "name": "slip.jpg", "mimeType": "image/jpeg", "data": "<base64>" } } }
```
Expected reply: `{ "ok": true, "status": "pending" }` or `{ "ok": false, "error": "…" }`.

```json
{ "action": "status", "lineUserId": "U…", "idToken": "…" }
```
Expected reply: `{ "status": "none|pending|approved|rejected", "note": "optional reason", "registration": {…} }`.

`idToken` lets the backend confirm the user really is that LINE user (verify via `https://api.line.me/oauth2/v2.1/verify`), so nobody can register or read status on someone else's behalf.
