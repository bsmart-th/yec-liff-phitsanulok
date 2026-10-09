/**
 * YEC Phitsanulok registration backend (Google Apps Script, bound to a Google Sheet).
 *
 * The LIFF page POSTs JSON (as text/plain) to this web app:
 *   { action: "register", lineUserId, lineDisplayName, idToken, registration }  -> { ok, status }
 *     registration.slip = { name, mimeType, data (base64) } is the payment slip; it is saved
 *     to a Google Drive folder and its link goes in the "Payment slip" column.
 *   { action: "status",   lineUserId, idToken }                                  -> { status, note, registration }
 *
 * Admins review in the "Registrations" sheet: set Status to Approved or Rejected
 * (optionally write a Note to applicant). The applicant sees it next time they open the page.
 *
 * Setup: see README.md, section "Google Sheet backend".
 */

const SHEET_NAME = "Registrations";
const SLIP_FOLDER_NAME = "YEC Registration Slips"; // created in the owner's Drive on first upload
const SLIP_MAX_BYTES = 8 * 1024 * 1024;
const STATUSES = ["Pending", "Approved", "Rejected"];

// Fixed columns. Form fields get their own columns, inserted before "Data (JSON)" as they appear.
const COL = {
  submittedAt: "Submitted at",
  status: "Status",
  note: "Note to applicant",
  reviewedAt: "Reviewed at",
  type: "Type",
  people: "People",
  lineName: "LINE name",
  lineUserId: "LINE user ID",
  members: "Members",
  slip: "Payment slip",
  json: "Data (JSON)",
};
const FIXED_HEADERS = Object.values(COL);

/* ============================== Web app ============================== */

function doPost(e) {
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const userId = verifyUser_(req.idToken, req.lineUserId);
    if (req.action === "register") return json_(register_(userId, req));
    if (req.action === "status") return json_(getStatus_(userId));
    return json_({ ok: false, error: "คำขอไม่ถูกต้อง" });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function doGet() {
  return json_({ ok: true, service: "YEC registration backend" });
}

/* ============================== Actions ============================== */

function register_(userId, req) {
  const reg = req.registration;
  if (!reg || !reg.person || (reg.type !== "individual" && reg.type !== "group")) {
    throw new Error("ข้อมูลการลงทะเบียนไม่ถูกต้อง");
  }
  const slip = reg.slip;
  delete reg.slip; // keep the file out of the JSON column
  if (reg.type !== "group") { delete reg.group; delete reg.members; }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000); // serialize writes so a double-tap can't create two rows
  try {
    const sheet = getSheet_();
    if (findRow_(sheet, userId)) {
      return { ok: false, error: "บัญชี LINE นี้ลงทะเบียนไว้แล้ว" };
    }
    const slipUrl = slip ? saveSlip_(slip, reg.person, userId) : "";

    const fields = Object.assign({}, reg.person, reg.group || {});
    const headers = ensureColumns_(sheet, Object.keys(fields).concat(COL.slip)); // older sheets lack the slip column
    const members = reg.members || [];

    const values = {};
    values[COL.submittedAt] = new Date();
    values[COL.status] = "Pending";
    values[COL.type] = reg.type === "group" ? "Group" : "Individual";
    values[COL.people] = 1 + members.length;
    values[COL.lineName] = req.lineDisplayName || "";
    values[COL.lineUserId] = userId;
    values[COL.members] = members
      .map((m, i) => (i + 1) + ") " + Object.values(m).filter(String).join(", "))
      .join("\n");
    values[COL.slip] = slipUrl;
    values[COL.json] = JSON.stringify(reg);
    Object.keys(fields).forEach(k => { values[k] = fields[k]; });

    const row = sheet.getLastRow() + 1;
    sheet.getRange(row, 1, 1, headers.length).setValues([headers.map(h => cell_(values[h]))]);
    sheet.getRange(row, 1).setNumberFormat("yyyy-mm-dd hh:mm");
    return { ok: true, status: "pending" };
  } finally {
    lock.releaseLock();
  }
}

function getStatus_(userId) {
  const sheet = getSheet_();
  const row = findRow_(sheet, userId);
  if (!row) return { status: "none" };
  const headers = headers_(sheet);
  const data = sheet.getRange(row, 1, 1, headers.length).getValues()[0];
  const get = name => data[headers.indexOf(name)];
  let registration = null;
  try { registration = JSON.parse(get(COL.json)); } catch (e) {}
  const status = String(get(COL.status) || "Pending").trim().toLowerCase();
  return {
    status: ["pending", "approved", "rejected"].indexOf(status) >= 0 ? status : "pending",
    note: String(get(COL.note) || ""),
    registration: registration,
  };
}

/* ============================ Payment slip ============================ */

// Saves the slip into the slips folder (private to the sheet owner) and returns its link.
function saveSlip_(slip, person, userId) {
  const okType = /^image\/(jpeg|png|webp|heic|heif)$/.test(slip.mimeType) || slip.mimeType === "application/pdf";
  if (!okType || !slip.data) throw new Error("ไฟล์หลักฐานการโอนต้องเป็นรูปภาพหรือ PDF");
  const bytes = Utilities.base64Decode(slip.data);
  if (bytes.length > SLIP_MAX_BYTES) throw new Error("ไฟล์หลักฐานการโอนใหญ่เกินไป");

  const name = String((person && person["ชื่อ–นามสกุล"]) || "").replace(/[\\/:*?"<>|]/g, "").slice(0, 60);
  const ext = slip.mimeType === "application/pdf" ? ".pdf" : slip.mimeType === "image/jpeg" ? ".jpg" : "." + slip.mimeType.split("/")[1];
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd-HHmmss");
  const fileName = stamp + " " + (name || "slip") + " " + userId.slice(-6) + ext;

  const file = slipFolder_().createFile(Utilities.newBlob(bytes, slip.mimeType, fileName));
  return file.getUrl();
}

function slipFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty("SLIP_FOLDER_ID");
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* deleted: make a new one */ }
  }
  const folder = DriveApp.createFolder(SLIP_FOLDER_NAME);
  props.setProperty("SLIP_FOLDER_ID", folder.getId());
  return folder;
}

/* ======================= LINE identity check ======================= */

// Confirms the ID token was issued by LINE for our channel, and returns the real LINE user ID.
function verifyUser_(idToken, claimedUserId) {
  const channelId = PropertiesService.getScriptProperties().getProperty("LINE_CHANNEL_ID");
  if (!channelId) throw new Error("Backend not configured: set LINE_CHANNEL_ID in Script properties");
  if (!idToken) throw new Error("ไม่พบข้อมูลการเข้าสู่ระบบ LINE กรุณาปิดแล้วเปิดหน้านี้ใหม่");

  const res = UrlFetchApp.fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "post",
    payload: { id_token: idToken, client_id: channelId },
    muteHttpExceptions: true,
  });
  const body = JSON.parse(res.getContentText() || "{}");
  if (res.getResponseCode() !== 200 || !body.sub) {
    throw new Error("การเข้าสู่ระบบ LINE หมดอายุ กรุณาปิดแล้วเปิดหน้านี้ใหม่");
  }
  if (claimedUserId && claimedUserId !== body.sub) throw new Error("ข้อมูลบัญชี LINE ไม่ตรงกัน");
  return body.sub;
}

/* ============================== Sheet ============================== */

function getSheet_() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error("Sheet '" + SHEET_NAME + "' not found. Run setup() once in the script editor");
  return sheet;
}

function headers_(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
}

function findRow_(sheet, userId) {
  const col = headers_(sheet).indexOf(COL.lineUserId) + 1;
  if (sheet.getLastRow() < 2) return 0;
  const cell = sheet.getRange(2, col, sheet.getLastRow() - 1, 1)
    .createTextFinder(userId).matchEntireCell(true).findNext();
  return cell ? cell.getRow() : 0;
}

// Adds a column (before "Data (JSON)") for any form field the sheet doesn't have yet.
function ensureColumns_(sheet, keys) {
  let headers = headers_(sheet);
  keys.forEach(k => {
    if (headers.indexOf(k) >= 0) return;
    const at = headers.indexOf(COL.json) + 1;
    sheet.insertColumnAfter(at - 1); // copies the visible column on the left, not the hidden JSON one
    sheet.getRange(1, at).setValue(k);
    headers = headers_(sheet);
  });
  return headers;
}

// Strings get a leading ' so Sheets keeps them as typed: phone 081... stays 081..., and
// text starting with = can't run as a formula. The ' is hidden and not returned when read.
function cell_(v) {
  if (v === undefined || v === null || v === "") return "";
  return typeof v === "string" ? "'" + v : v;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ========================= Admin helpers ========================= */

// Run once from the editor: creates the sheet, header row, Status dropdown and colors.
function setup() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME, 0);
  if (sheet.getLastColumn() === 0) {
    sheet.getRange(1, 1, 1, FIXED_HEADERS.length).setValues([FIXED_HEADERS]);
  }
  const headers = headers_(sheet);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#e8f5e9");
  sheet.setFrozenRows(1);

  const statusCol = headers.indexOf(COL.status) + 1;
  const statusRange = sheet.getRange(2, statusCol, sheet.getMaxRows() - 1, 1);
  statusRange.setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).setAllowInvalid(false).build()
  );
  const colors = { Pending: "#fff3cd", Approved: "#d4edda", Rejected: "#f8d7da" };
  sheet.setConditionalFormatRules(STATUSES.map(s =>
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(s).setBackground(colors[s])
      .setRanges([statusRange]).build()
  ));
  slipFolder_(); // creates the slips folder now, so Drive permission is granted during setup
  // Not used by the one-person-per-form YEC form; kept so older rows still line up.
  [COL.type, COL.people, COL.members].forEach(h => sheet.hideColumns(headers.indexOf(h) + 1));
  sheet.hideColumns(headers.indexOf(COL.lineUserId) + 1);
  sheet.hideColumns(headers.indexOf(COL.json) + 1);
}

// Simple trigger: stamps "Reviewed at" when an admin changes a Status.
function onEdit(e) {
  const sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET_NAME || e.range.getRow() < 2) return;
  const headers = headers_(sheet);
  if (e.range.getColumn() !== headers.indexOf(COL.status) + 1 || e.range.getNumRows() !== 1) return;
  const stamp = sheet.getRange(e.range.getRow(), headers.indexOf(COL.reviewedAt) + 1);
  stamp.setNumberFormat("yyyy-mm-dd hh:mm").setValue(!e.value || e.value === "Pending" ? "" : new Date());
}
