# Romblon East Central School: website guide

**School ID:** 111386 · **Address:** Barangay Capaclan, Romblon, Romblon · **Email:** 111386@deped.gov.ph

## What's on the website

| Page | Who uses it |
|---|---|
| Home, About, Contact, Resources | Everyone |
| **Announcements & Schedules** (contest winners, exam schedules, posters) | Everyone. Teachers post; the Principal approves |
| **Org Chart** (organizational chart + school committees) | Everyone. The Principal or Website Administrator edits |
| **Sections** (sections by grade level and advisers) | Everyone. The Principal or Website Administrator edits |
| **SELG** (officers & advisers with photos, activities, PDF reports) | Everyone. The SELG Adviser and student officers post |
| **Taga-Silangan** (stories by section + PDF issues to read/download) | Everyone |
| **Learner Portal** (`portal.html`) | Learners: e-School ID, report cards, grades, class posts, excuse letters |
| **Taga-Silangan Newsroom** (`newsroom.html`) | Writers, editors, coordinators: separate login |
| **Staff Dashboard** (`admin.html`) | Principal, Website Administrator and teachers |

---

## 1. Put it online (about 20 minutes, no installs needed)

The site has sign-ins and private records, so it runs on Netlify with Netlify Functions. Netlify's drag-and-drop page does **not** run those. Use GitHub:

1. Create a free account at **github.com** → **New repository** → **Private** → name it `recs-website` → **Create**.
2. Click **uploading an existing file**, drag in **everything inside this folder** (not the folder itself), then **Commit changes**.
3. Go to **app.netlify.com** → **Add new site → Import an existing project → GitHub** → choose `recs-website` → **Deploy**.
   (To keep your current address, open your existing site → **Site configuration → Build & deploy → Link repository**.)
4. In Netlify: **Site configuration → Environment variables**, add:

| Variable | What to put |
|---|---|
| `ADMIN_PASSWORD` | Password for the built-in **admin** account, the **Website Administrator** (12+ characters) |
| `SESSION_SECRET` | Any long random text, 32+ characters |

5. **Deploys → Trigger deploy → Deploy site**.
6. If the site had a password before (the 401 error), turn it off: **Site configuration → Access & security → Visitor access**.

## 2. First-day setup

The **Principal** and the **Website Administrator** have separate accounts.

1. The Website Administrator signs in with username **admin** and the `ADMIN_PASSWORD`.
2. The Principal clicks **Request an account** on the staff sign-in page (or the Administrator creates it under **👥 Staff**). The Administrator approves it and ticks the **Principal** role.
3. From then on, the Principal signs in with their own username and password. Leave approvals, announcement approvals, service credits and plantilla appear only in the Principal's account.

Then:

1. **🎨 Site Settings** (Administrator): upload the school logo, choose colors, check the details (already filled in for RECS), add vision/mission and the school head's name (printed on IDs).
2. **👥 Staff** (Administrator or Principal): teachers click **Request an account** on the sign-in page. Approve them here and tick their roles. You can also create accounts yourself.
3. **🏫 Sections**: add every section (grade + name) and choose its **class adviser**. Or let teachers do it themselves: a teacher with no class yet opens **My Class** and uploads their School Form 1 (see below).
4. **🧭 Org Chart**: add people with photos by level (1 = top), and the school committees.
5. **📑 Service Credits & Plantilla** (Principal): add each teacher's plantilla item and starting service credits (one by one or from a spreadsheet).

## 3. Roles

| Role | Can do |
|---|---|
| **Principal** | Approves announcements and uploads, approves leave (not their own), service credits and plantilla, sees every class, staff accounts, sections, org chart, Activity Log. Can also help with SELG and Taga-Silangan |
| **AO / ADAS (Service Credits)** | Adds, uploads and removes service credits and updates plantilla items for all teachers; sees approved leave for recording. Does **not** approve leave |
| **Website Administrator** | Staff accounts, sections, org chart, **Site Settings** (design), Activity Log, sees every class. Does **not** approve leave or announcements. Only the Administrator can give the Administrator role, and no one can change their own Principal/Administrator role |
| **Class Adviser** (assigned under Sections) | Their section: upload SF1, class list, transfer/unenroll, class announcements & assignments, grades, report cards, excuse letters, access codes, e-School IDs |
| **Taga-Silangan Adviser** | Newsroom accounts and coordinators, review & publish, PDF issues and download counts |
| **SELG Adviser** | SELG officers & advisers with photos, activities and PDF reports, gives student officers posting access, approves their posts |
| **Teacher** (everyone) | Post announcements (approved by the Principal), apply for leave, see their service credits and plantilla |

## 4. How things work

**Teachers set up their own class from SF1.** Any teacher opens **🏫 My Class** → uploads their SF1 Excel file. The website reads the grade level, section, school year and learners, shows a preview, then creates the section with that teacher as adviser and adds the learners. If the section already has another adviser, it stops and asks them to see the Principal. Learners already in another teacher's section are skipped (their adviser transfers them). A teacher with more than one class uses **＋ Another class from SF1**. Every setup appears in the Activity Log, and the Principal can change advisers under Sections.

**School Form 1 → class list.** My Class → School Form 1 → upload the SF1 Excel file from LIS. The site reads LRN, name, sex, birthdate, guardian and address, shows a preview, then adds the learners and keeps the SF1 on file. No SF1? Use the class list template.

**Access codes.** Every learner gets a 6-character access code. My Class → Class list → **Access codes (CSV)**. Give each parent their code on a slip. **New code** replaces a lost one.

**e-School ID.** Made automatically in the RECS Pupil Identification Card layout (2.5 × 3.5 in): front with photo, logo, LRN, name and the Principal's name; back with the rules, the Curriculum Grade / School Year / Adviser's Initial table (school years filled in from the learner's grade), a QR code of the LRN, and the emergency contact. Change the title, address lines, Principal's title, rules and the school-building background photo under **Site Settings → e-School ID**; the Principal's name comes from **School head's name**. Learners download it from the portal; advisers can download it with the **ID** button.

**Report cards (SF9).** My Class → **Report Cards (SF9)** → upload the same SF9 Excel workbook you already use (with the TERM 1/2/3 SUMMARY and ATTENDANCE RECORD SUMMARY sheets). The website reads each learner's T1–T3 grades (including Music & Arts and PE & Health), days present and class days, and fills in their Learner's Performance Report automatically. Upload the workbook again after each term. Then tick the term under **Release to learners**. Learners see only released terms. Add teacher's comments and Certificate of Transfer details with **Comments**. Final grades, remarks and the general average are computed when all three terms are in. Learners can print or save their report card as PDF. Optional: upload signed/scanned copies named by LRN.

**Excuse letters.** A learner clicks **Excuse Letter** in the portal. The adviser sees a red badge on **My Class**, approves or disapproves, and the learner sees the result.

**Transfer / unenroll.** In the class list: move to another section, mark as transferred out (with school) or dropped, or re-enroll. Records are kept.

**Leave and service credits.** Teachers apply under **My Leave & Credits**. The Principal sees a badge on **Leave Approvals**. When the Principal approves a leave charged to service credits, the days are deducted automatically. If there aren't enough credits, the extra days are marked "without pay".

**School Calendar.** On the Announcements page (and the **📅 School Calendar** button on the Home page). It shows one month at a time with **Prev / Next** and a month picker; days with activities are highlighted by type (classes/terms, tests, assessments, holidays, breaks, DepEd events, school activities); click a day to see its activities. The DepEd dates for SY 2026–2027 (DepEd Order No. 009, s. 2026; elementary activities only) are in `calendar.js`. In the dashboard under **📅 School Calendar**, the Principal or Website Administrator can add, edit and delete the school's own activities (choosing the kind/color, e.g. a town fiesta as a holiday), and **Edit**, **Hide** or **Restore** any DepEd date (for example when DepEd or the Division moves a date). Edited DepEd dates show the original for reference.

**Announcements.** Teachers upload a JPG/PNG poster (e.g. contest winners, exam schedule). The Principal approves it in **Approvals**, then it appears on the website.

**SELG.** The SELG Adviser posts activities with photos and PDF reports, and lists officers and advisers with photos for the school year. Officers given access can post from the Learner Portal. Their posts wait for the adviser's approval.

**Taga-Silangan.** Sections: News, Editorial, Feature, Science and Technology, Sports, Entertainment.
1. The adviser creates **Newsroom accounts** (writer, editor or coordinator) and assigns each coordinator the section(s) they check.
2. Writers and editors sign in at the **Newsroom** (separate from the Learner Portal) and submit their work.
3. The coordinator of that section checks it, corrects it, then sends it to the adviser or returns it with a note.
4. The adviser publishes it online.
5. **Page design & Facebook** (Taga-Silangan tab): the adviser (or Principal) uploads the paper's own logo and a banner background photo, and pastes the link of the Taga-Silangan Facebook **Page**. Its latest public posts then appear on the Taga-Silangan page automatically (Facebook Pages only, not personal profiles or groups). Full issues are uploaded as PDF (up to 80 MB). The adviser and Principal see the **number of downloads** for each issue.

**Activity Log.** The Principal and the Website Administrator see who did what, on every page and portal, and can download it as CSV.

**Phone and computer notifications (free).** Each person opens **My account → 📱 Notifications** on their phone or computer and taps **Turn on notifications** (once per device). They then get an alert, like a text message, even when the website is closed:
- Principal: a teacher files leave; an announcement waits for approval
- Teacher: their leave is approved or not
- AO / ADAS: a leave is approved (to update the records)
- Class adviser: a learner sends an excuse letter
- Principal and Website Administrator: someone requests a staff account

Android: use Chrome. iPhone/iPad (iOS 16.4+): open the site in Safari → Share → **Add to Home Screen**, open it from that icon, then turn on notifications. No email or SMS service is needed. (Email or SMS alerts can be added later with a paid or free-tier service.)

## 5. Privacy and security

**Two-step sign-in.** Under **My account**, the Principal (and any teacher) can turn on two-step sign-in with a free phone app (Google Authenticator or Microsoft Authenticator). Save the 8 recovery codes it shows. If a teacher loses their phone, the Principal or Website Administrator can click **Reset 2-step** in the Staff tab. If the Website Administrator (built-in **admin**) loses both phone and recovery codes: in Netlify add the variable `DISABLE_2FA_FOR` = `admin`, redeploy, sign in, set up two-step again, then delete that variable and redeploy.

**Passwords** must be at least 10 characters with letters and numbers, and can't contain the person's name, username or common words. Use the same rule for `ADMIN_PASSWORD`; the dashboard warns you if it's weak.

**Privacy Notice** (`privacy.html`) is linked at the bottom of every page. Have your Data Protection Officer review it, and set their name under **Site Settings → Privacy Notice**.


Learner records, grades, report cards and teachers' leave and plantilla are personal data under the **Data Privacy Act of 2012 (RA 10173)**.

- Follow your division's data privacy guidance and get the parents' consent as required.
- Private files are never public: learners see only their own records, advisers only their own sections, teachers only their own leave and credits.
- 5 wrong passwords or codes → locked for 15 minutes. Staff are signed out after 12 hours, learners after 2 hours.
- Use strong passwords, keep the GitHub repository **Private**, disable accounts of staff who transfer.
- At the end of the school year, remove learners who have left.

## Editing the layout

**Site Settings** changes the logo, colors, names, text and photos. To change page layouts, edit the `.html` files on GitHub (click a file → ✏️). Every save redeploys the site.

## Limits

- Notifications appear as badges in the dashboard. Email/SMS alerts would need a paid service.
- Single uploads (photos, report cards, attachments) up to 4.5 MB; newspaper PDFs up to 80 MB.
- Files are stored in **Netlify Blobs**. Check your Netlify plan's storage and bandwidth as the school year goes on.
