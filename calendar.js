// ===== School Calendar =====
// DepEd school calendar for SY 2026–2027 (DepEd Order No. 009, s. 2026), elementary-level activities,
// plus the school's own activities added by the Principal or Website Administrator (/api/calendar).
// The Principal or Website Administrator can edit, hide or restore any DepEd date from the dashboard
// (saved as an "override"), so this list only needs editing for a new school year. Dates are YYYY-MM-DD; "end" is optional.

const CAL_TYPES = {
  classes: { label: "Classes / Terms", color: "#14305c" },
  exam: { label: "Tests & Examinations", color: "#d9480f" },
  assess: { label: "Assessments", color: "#7048e8" },
  holiday: { label: "Holidays (no classes)", color: "#c92a2a" },
  break: { label: "Breaks", color: "#2b8a3e" },
  event: { label: "DepEd events", color: "#e8a200" },
  school: { label: "School activities", color: "#0c8599" },
};

const DEPED_CALENDAR = [
  // Enrollment and opening
  { start: "2026-05-04", end: "2026-05-29", title: "Oplan Balik Eskwela", type: "event" },
  { start: "2026-06-01", end: "2026-06-05", title: "Brigada Eskwela and enrollment", type: "event" },
  { start: "2026-06-08", title: "Opening of classes, SY 2026–2027", type: "classes" },
  { start: "2026-06-08", end: "2026-06-11", title: "Term 1 Opening Block", type: "classes" },
  { start: "2026-06-08", end: "2026-07-10", title: "BOSY assessments (CRLA, RMA, Phil-IRI)", type: "assess" },
  { start: "2026-06-08", end: "2026-07-03", title: "Mandatory learners' health assessment", type: "assess" },
  { start: "2026-06-22", end: "2026-06-26", title: "Phil ECD Checklist (BOSY), Kindergarten", type: "assess" },
  { start: "2026-06-12", title: "Independence Day", type: "holiday" },
  { start: "2026-06-23", end: "2026-06-24", title: "DepEd Founding Anniversary", type: "event" },
  { start: "2026-07-06", title: "Teacher-made summative test (Term 1)", type: "exam" },
  { start: "2026-07-13", end: "2026-07-17", title: "MFAT", type: "assess" },
  { start: "2026-07-20", end: "2026-07-24", title: "SELG elections", type: "event" },
  { start: "2026-07-28", title: "Teacher-made summative test (Term 1)", type: "exam" },
  { start: "2026-08-21", title: "Ninoy Aquino Day", type: "holiday" },
  { start: "2026-08-28", title: "Term 1 Examination", type: "exam" },
  { start: "2026-08-31", title: "National Heroes Day", type: "holiday" },
  { start: "2026-09-01", title: "Term 1 Examination", type: "exam" },
  { start: "2026-09-02", end: "2026-09-15", title: "Term 1 End-of-Term Block", type: "classes" },
  { start: "2026-09-05", end: "2026-10-05", title: "National Teachers' Month", type: "event" },
  { start: "2026-09-09", title: "PTA meeting and Term 1 report cards", type: "event" },
  { start: "2026-09-10", end: "2026-09-11", title: "INSET (teachers)", type: "event" },
  { start: "2026-09-10", end: "2026-09-15", title: "Learners' wellness break", type: "break" },
  { start: "2026-09-14", end: "2026-09-15", title: "Teachers' wellness break", type: "break" },
  { start: "2026-09-15", title: "End of Term 1", type: "classes" },
  // Term 2
  { start: "2026-09-16", title: "Start of Term 2", type: "classes" },
  { start: "2026-09-21", end: "2026-10-23", title: "MOSY assessments", type: "assess" },
  { start: "2026-10-05", title: "World Teachers' Day", type: "event" },
  { start: "2026-10-07", title: "Teacher-made summative test (Term 2)", type: "exam" },
  { start: "2026-10-29", title: "Teacher-made summative test (Term 2)", type: "exam" },
  { start: "2026-11-01", title: "All Saints' Day", type: "holiday" },
  { start: "2026-11-02", title: "All Souls' Day", type: "holiday" },
  { start: "2026-11-15", title: "PEPT", type: "assess" },
  { start: "2026-11-27", title: "Araw ng Pagbasa", type: "event" },
  { start: "2026-11-30", title: "Bonifacio Day", type: "holiday" },
  { start: "2026-12-03", end: "2026-12-04", title: "Term 2 Examination", type: "exam" },
  { start: "2026-12-07", end: "2026-12-18", title: "Term 2 End-of-Term Block", type: "classes" },
  { start: "2026-12-08", title: "Feast of the Immaculate Conception", type: "holiday" },
  { start: "2026-12-15", title: "PTA meeting and Term 2 progress reports", type: "event" },
  { start: "2026-12-16", title: "Year-end activity", type: "event" },
  { start: "2026-12-17", end: "2026-12-18", title: "Learners' wellness break / INSET", type: "break" },
  { start: "2026-12-18", title: "End of Term 2", type: "classes" },
  { start: "2026-12-19", end: "2026-12-31", title: "Year-end (Christmas) break", type: "break" },
  { start: "2026-12-24", title: "Christmas Eve", type: "holiday" },
  { start: "2026-12-25", title: "Christmas Day", type: "holiday" },
  { start: "2026-12-30", title: "Rizal Day", type: "holiday" },
  { start: "2026-12-31", title: "Last Day of the Year", type: "holiday" },
  // Term 3
  { start: "2027-01-01", title: "New Year's Day", type: "holiday" },
  { start: "2027-01-04", title: "Start of Term 3 (classes resume)", type: "classes" },
  { start: "2027-01-25", title: "Teacher-made summative test (Term 3)", type: "exam" },
  { start: "2027-01-30", end: "2027-02-26", title: "Early registration (incoming Kinder, Grade 1, transferees)", type: "event" },
  { start: "2027-02-01", end: "2027-03-12", title: "EOSY assessments", type: "assess" },
  { start: "2027-02-06", title: "Chinese New Year", type: "holiday" },
  { start: "2027-02-16", title: "Teacher-made summative test (Term 3)", type: "exam" },
  { start: "2027-03-01", end: "2027-03-05", title: "ELLNA, Grade 3", type: "assess" },
  { start: "2027-03-08", end: "2027-03-12", title: "NAT, Grade 6", type: "assess" },
  { start: "2027-03-15", end: "2027-03-16", title: "Term 3 Examination (Kinder and Grade 6)", type: "exam" },
  { start: "2027-03-15", end: "2027-03-19", title: "Phil ECD Checklist (EOSY), Kindergarten", type: "assess" },
  { start: "2027-03-17", end: "2027-03-23", title: "Academic deliberation (moving-up and graduating learners)", type: "event" },
  { start: "2027-03-22", end: "2027-03-23", title: "Term 3 Examination (other grades)", type: "exam" },
  { start: "2027-03-24", title: "Announcement of academic excellence awardees", type: "event" },
  { start: "2027-03-25", title: "Maundy Thursday", type: "holiday" },
  { start: "2027-03-26", title: "Good Friday", type: "holiday" },
  { start: "2027-03-27", title: "Black Saturday", type: "holiday" },
  { start: "2027-03-29", end: "2027-04-08", title: "Term 3 End-of-Term Block", type: "classes" },
  { start: "2027-04-02", title: "INSET (teachers)", type: "event" },
  { start: "2027-04-05", title: "INSET (teachers)", type: "event" },
  { start: "2027-04-06", end: "2027-04-07", title: "End-of-school-year rites (moving-up and graduation)", type: "event" },
  { start: "2027-04-08", title: "Last day of classes · PTA meeting and report cards", type: "classes" },
  { start: "2027-04-09", title: "Day of Valor", type: "holiday" },
  { start: "2027-04-09", end: "2027-05-09", title: "Teachers' end-of-school-year break", type: "break" },
  { start: "2027-05-01", title: "Labor Day", type: "holiday" },
];

// Stable id for each DepEd date, used by the dashboard's edits
const calSlug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
DEPED_CALENDAR.forEach((e) => (e.id = `d-${e.start}-${calSlug(e.title)}`));

// Combines DepEd dates with the school's saved items:
//  - an item with "deped" changes (or hides) that DepEd date
//  - any other item is a school activity (type "school" unless another type was chosen)
function calMerge(saved) {
  const over = Object.fromEntries(saved.filter((x) => x.deped).map((x) => [x.deped, x]));
  const deped = DEPED_CALENDAR.map((e) => {
    const o = over[e.id];
    if (!o) return { ...e, source: "DepEd" };
    if (o.hidden) return null;
    return { ...e, title: o.title || e.title, start: o.start || e.start, end: o.end ?? e.end, type: CAL_TYPES[o.type] ? o.type : e.type, note: o.note || "", source: "DepEd", edited: true };
  }).filter(Boolean);
  const school = saved.filter((x) => !x.deped).map((x) => ({ ...x, type: CAL_TYPES[x.type] ? x.type : "school", source: "School" }));
  return [...deped, ...school];
}

const MAIN_ORDER = ["holiday", "exam", "school", "event", "assess", "classes", "break"];
const calDays = (e) => Math.round((parseYmd(e.end || e.start) - parseYmd(e.start)) / 864e5) + 1;
const CAL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const calEsc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function calRange(e) {
  const a = parseYmd(e.start), b = parseYmd(e.end || e.start);
  const fmt = (d, y) => d.toLocaleDateString("en-PH", { month: "short", day: "numeric", ...(y ? { year: "numeric" } : {}) });
  return e.end && e.end !== e.start ? `${fmt(a)} – ${fmt(b, true)}` : fmt(a, true);
}

// Draws the calendar into `root` (DepEd dates + the school's own activities)
async function schoolCalendar(root) {
  let school = [];
  try { const r = await fetch("/api/calendar"); if (r.ok) school = await r.json(); } catch {}
  const all = calMerge(school);

  // Start on this month if it's within the school year, otherwise on June 2026
  const now = new Date();
  let cur = new Date(now.getFullYear(), now.getMonth(), 1);
  const first = new Date(2026, 4, 1), last = new Date(2027, 4, 1);
  try { const q = new URLSearchParams(location.search).get("month"); if (/^\d{4}-\d{2}$/.test(q || "")) cur = parseYmd(q + "-01"); } catch {}
  if (cur < first || cur > last) cur = new Date(2026, 5, 1);
  let picked = null;

  root.innerHTML = `
    <div class="cal-head">
      <button class="small-btn" data-cal="prev" aria-label="Previous month">‹ Prev</button>
      <h3 class="cal-title" aria-live="polite"></h3>
      <button class="small-btn" data-cal="next" aria-label="Next month">Next ›</button>
    </div>
    <div class="cal-jump"><button class="small-btn" data-cal="today">This month</button>
      <select aria-label="Choose a month">${Array.from({ length: 13 }, (_, i) => { const d = new Date(2026, 4 + i, 1); return `<option value="${ymd(d).slice(0, 7)}">${CAL_MONTHS[d.getMonth()]} ${d.getFullYear()}</option>`; }).join("")}</select></div>
    <div class="cal-grid" role="grid"></div>
    <div class="cal-legend">${Object.entries(CAL_TYPES).map(([k, t]) => `<span><i style="background:${t.color}"></i>${t.label}</span>`).join("")}</div>
    <div class="cal-list"></div>`;

  const grid = root.querySelector(".cal-grid"), list = root.querySelector(".cal-list"), sel = root.querySelector("select");
  const onDay = (key) => all.filter((e) => key >= e.start && key <= (e.end || e.start));
  const typeOrder = Object.keys(CAL_TYPES);

  function draw() {
    const y = cur.getFullYear(), m = cur.getMonth();
    root.querySelector(".cal-title").textContent = `${CAL_MONTHS[m]} ${y}`;
    sel.value = ymd(cur).slice(0, 7);
    const startPad = new Date(y, m, 1).getDay(), daysIn = new Date(y, m + 1, 0).getDate(), todayKey = ymd(now);
    let html = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => `<div class="cal-dow">${d}</div>`).join("");
    for (let i = 0; i < startPad; i++) html += `<div class="cal-day empty"></div>`;
    for (let d = 1; d <= daysIn; d++) {
      const key = ymd(new Date(y, m, d)), ev = onDay(key).sort((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type));
      const types = [...new Set(ev.map((e) => e.type))];
      // The day is colored by its most important short activity; long windows (e.g. a 5-week
      // assessment period) only add a dot, so single-day activities stay visible.
      const main = ev.filter((e) => calDays(e) <= 14)
        .sort((a, b) => MAIN_ORDER.indexOf(a.type) - MAIN_ORDER.indexOf(b.type) || calDays(a) - calDays(b))[0];
      const wk = new Date(y, m, d).getDay() % 6 === 0;
      html += `<button class="cal-day${main ? " has" : ""}${wk ? " wkend" : ""}${key === todayKey ? " today" : ""}${key === picked ? " picked" : ""}" data-day="${key}"
          ${main ? `style="--c:${CAL_TYPES[main.type].color}"` : ""} aria-label="${CAL_MONTHS[m]} ${d}${ev.length ? ": " + calEsc(ev.map((e) => e.title).join("; ")) : ""}">
        <span class="n">${d}</span>
        ${ev.length ? `<span class="t">${main ? calEsc(main.title) : ""}</span><span class="dots">${types.map((t) => `<i style="background:${CAL_TYPES[t].color}"></i>`).join("")}</span>` : ""}
      </button>`;
    }
    grid.innerHTML = html;

    const mStart = ymd(new Date(y, m, 1)), mEnd = ymd(new Date(y, m, daysIn));
    let items = all.filter((e) => e.start <= mEnd && (e.end || e.start) >= mStart);
    if (picked && picked >= mStart && picked <= mEnd) items = onDay(picked);
    items.sort((a, b) => a.start.localeCompare(b.start) || typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type));
    list.innerHTML = `<h4>${picked && picked >= mStart && picked <= mEnd ? `Activities on ${parseYmd(picked).toLocaleDateString("en-PH", { dateStyle: "long" })} <button class="small-btn" data-cal="all">Show whole month</button>` : `Activities in ${CAL_MONTHS[m]} ${y}`}</h4>` +
      (items.length ? `<ul>${items.map((e) => `<li><i style="background:${CAL_TYPES[e.type].color}"></i><span class="d">${calRange(e)}</span><span><strong>${calEsc(e.title)}</strong>${e.note ? `<br><small>${calEsc(e.note)}</small>` : ""}${e.source === "School" ? ` <small class="src">School activity</small>` : ""}</span></li>`).join("")}</ul>` : `<p class="empty">No activities listed for this month.</p>`);
  }

  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cal],[data-day]"); if (!b) return;
    const a = b.dataset.cal;
    if (a === "prev") { cur = new Date(cur.getFullYear(), cur.getMonth() - 1, 1); picked = null; }
    else if (a === "next") { cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1); picked = null; }
    else if (a === "today") { cur = new Date(now.getFullYear(), now.getMonth(), 1); picked = null; }
    else if (a === "all") picked = null;
    else if (b.dataset.day) picked = picked === b.dataset.day ? null : b.dataset.day;
    draw();
  });
  sel.addEventListener("change", () => { cur = parseYmd(sel.value + "-01"); picked = null; draw(); });
  draw();
}
