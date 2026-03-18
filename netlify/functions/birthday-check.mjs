// Netlify Scheduled Function — runs every day at 8am SA time (6am UTC)
// Reads Google Sheet, checks today's birthdays, sends OneSignal push notifications

const ONESIGNAL_APP_ID = "c9ed7601-b352-46fc-a8a4-be8abb4cf650";
const ONESIGNAL_API_KEY = process.env.ONESIGNAL_API_KEY;
const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQkT7f-mh_GDS_rmdOf-7LFCWlQom1haqkIKpxNLiqmARUlLrQ88BG9B_tgvNhhrw/pub?gid=48598000&single=true&output=csv";

export const config = {
  schedule: "0 6 * * *" // 6am UTC = 8am South Africa time
};

export default async function() {
  try {
    console.log("[LFY] Birthday check running...");

    // 1. Fetch the Google Sheet CSV
    const res = await fetch(SHEET_URL);
    const csv = await res.text();
    const rows = parseCSV(csv);

    if (rows.length < 2) {
      console.log("[LFY] No data found in sheet");
      return;
    }

    // 2. Find column indexes from header row
    const headers = rows[0].map(h => h.trim());
    const idx = {
      name:    findCol(headers, ['P1_Name','p1_name','Parent1Name','ParentName']),
      id:      findCol(headers, ['P1_ID','p1_id','P1ID','ParentID']),
      cell:    findCol(headers, ['P1_Cell','p1_cell','P1Cell','ParentCell']),
      student: findCol(headers, ['StudentName','studentname','Student']),
      cls:     findCol(headers, ['Class','class']),
      p2name:  findCol(headers, ['P2_Name','p2_name']),
      p2id:    findCol(headers, ['P2_ID','p2_id']),
      p2cell:  findCol(headers, ['P2_Cell','p2_cell']),
    };

    // 3. Get today's date in SA time
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Johannesburg" }));
    const todayM = now.getMonth() + 1;
    const todayD = now.getDate();

    // 4. Find today's birthdays
    const birthdays = [];
    const seen = new Set();

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 2) continue;

      // Check P1
      const p1id = get(row, idx.id);
      const p1bd = parseBirthday(p1id);
      if (p1bd && p1bd.month === todayM && p1bd.day === todayD && !seen.has(p1id)) {
        seen.add(p1id);
        birthdays.push({
          name: get(row, idx.name),
          phone: get(row, idx.cell),
          student: get(row, idx.student),
          cls: get(row, idx.cls),
          year: p1bd.year
        });
      }

      // Check P2
      const p2id = get(row, idx.p2id);
      const p2bd = parseBirthday(p2id);
      if (p2bd && p2bd.month === todayM && p2bd.day === todayD && !seen.has(p2id)) {
        seen.add(p2id);
        birthdays.push({
          name: get(row, idx.p2name),
          phone: get(row, idx.p2cell),
          student: get(row, idx.student),
          cls: get(row, idx.cls),
          year: p2bd.year
        });
      }
    }

    console.log(`[LFY] Found ${birthdays.length} birthday(s) today`);

    // 5. Send a notification for each birthday
    for (const p of birthdays) {
      if (!p.name) continue;
      const age = p.year ? ` — turns ${now.getFullYear() - p.year} today! 🎉` : '';
      const student = p.student ? ` · Parent of ${p.student}${p.cls ? ' ('+p.cls+')' : ''}` : '';
      const phone = p.phone ? ` · 📱 ${p.phone}` : '';

      await sendNotification(
        `🎂 ${p.name}'s Birthday Today!`,
        `${p.name}${age}${student}${phone}`
      );
    }

    if (birthdays.length === 0) {
      console.log("[LFY] No birthdays today — no notifications sent");
    }

  } catch(err) {
    console.error("[LFY] Error:", err);
  }
}

async function sendNotification(title, body) {
  const res = await fetch("https://onesignal.com/api/v1/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${ONESIGNAL_API_KEY}`
    },
    body: JSON.stringify({
      app_id: ONESIGNAL_APP_ID,
      included_segments: ["Total Subscriptions"],
      headings: { en: title },
      contents: { en: body },
      web_url: "https://lfybirthdayreminder.netlify.app"
    })
  });
  const data = await res.json();
  console.log("[LFY] Notification sent:", JSON.stringify(data));
}

// ── Helpers ──

function get(row, idx) {
  return idx >= 0 && row[idx] ? String(row[idx]).trim() : '';
}

function findCol(headers, names) {
  for (const n of names) {
    const i = headers.findIndex(h => h.toLowerCase() === n.toLowerCase());
    if (i >= 0) return i;
  }
  return -1;
}

function parseBirthday(id) {
  if (!id || id.length < 6) return null;
  const digits = id.replace(/\D/g, '');
  if (digits.length < 6) return null;
  let yy = parseInt(digits.substring(0, 2));
  const mm = parseInt(digits.substring(2, 4));
  const dd = parseInt(digits.substring(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const currentYear = new Date().getFullYear();
  const year = (2000 + yy) > currentYear ? 1900 + yy : 2000 + yy;
  return { month: mm, day: dd, year };
}

function parseCSV(txt) {
  return txt.trim().split(/\r?\n/).map(line => {
    const row = []; let cell = '', q = false;
    for (const c of line) {
      if (c === '"') { q = !q; }
      else if (c === ',' && !q) { row.push(cell.trim()); cell = ''; }
      else { cell += c; }
    }
    row.push(cell.trim());
    return row;
  });
}
