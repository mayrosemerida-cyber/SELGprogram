import { store } from "./store.mjs";

// Default text shown until the admin fills in Site Settings
export const DEFAULTS = {
  schoolName: "Romblon East Central School",
  schoolShort: "REC",
  division: "Schools Division of Romblon",
  address: "Barangay Capaclan, Romblon, Romblon",
  schoolId: "111386",
  phone: "",
  email: "111386@deped.gov.ph",
  officeHours: "Monday to Friday, 7:30 AM – 4:30 PM",
  facebook: "https://www.facebook.com/",
  mapQuery: "Romblon East Central School, Capaclan, Romblon, Romblon",
  colorPrimary: "#14305c",
  colorAccent: "#f2b631",
  heroEyebrow: "Welcome to Romblon East Central School",
  heroTitle: "Nurturing young minds to *learn, lead* and serve.",
  heroText: "A caring public elementary school where every learner is known, supported and encouraged to grow.",
  statLearners: "—", statTeachers: "—", statGrades: "K–6", statFounded: "—",
  historyTitle: "Serving the learners of Capaclan, Romblon",
  history: "Write a short history of your school here: when it was founded, how it has grown, and what makes it special to the community.",
  vision: "Paste your school's (or DepEd's) vision statement here.",
  mission: "Paste your school's (or DepEd's) mission statement here.",
  milestones: "2026 | Launched the school website and the online Learner Portal.",
  headName: "Christian I. Rotoni",
  headTitle: "Principal / School Head",
  headMessage: "A short welcome message from the school head goes here.",
  selgAbout: "The Supreme Elementary Learner Government represents the learners of our school. Its officers plan projects, lead school programs, and give learners a voice.",
  selgYear: "SY 2026–2027",
  sf9Region: "MIMAROPA REGION",
  sf9District: "District of Romblon",
  sf9Town: "Romblon, Romblon",
  dpoName: "School Data Protection Officer",
  privacyUpdated: "October 2026",
  paperName: "Taga-Silangan",
  paperTagline: "The Official School Publication of Romblon East Central School",
  paperFacebook: "",
  idTitle: "PUPIL IDENTIFICATION CARD",
  idAddress: "Brgy. Capaclan Romblon, Romblon\n5500 Romblon, Romblon, Philippines",
  idHeadTitle: "School Principal-III",
  idRules: "This ID CARD is NON-TRANSFERABLE.\nThis ID CARD should be worn every time the students enters the school premises.\nIf ID CARD is found, please return to the Principal's Office.",
  logoKey: "", heroImageKey: "", schoolPhotoKey: "", headPhotoKey: "", idBgKey: "", paperLogoKey: "", paperBgKey: "",
};

export const TEXT_KEYS = Object.keys(DEFAULTS).filter((k) => !k.endsWith("Key"));
export const IMAGE_KEYS = ["logoKey", "heroImageKey", "schoolPhotoKey", "headPhotoKey", "idBgKey", "paperLogoKey", "paperBgKey"];
// The Taga-Silangan adviser may change only these
export const PAPER_TEXT_KEYS = ["paperName", "paperTagline", "paperFacebook"];
export const PAPER_IMAGE_KEYS = ["paperLogoKey", "paperBgKey"];

export async function getSettings() {
  const saved = (await store("settings").get("site", { type: "json" })) || {};
  // Older env-var setup still works as a fallback
  const env = {
    ...(process.env.SCHOOL_NAME && { schoolName: process.env.SCHOOL_NAME }),
    ...(process.env.SCHOOL_ADDRESS && { address: process.env.SCHOOL_ADDRESS }),
    ...(process.env.SCHOOL_HEAD && { headName: process.env.SCHOOL_HEAD }),
    ...(process.env.SCHOOL_ID && { schoolId: process.env.SCHOOL_ID }),
  };
  return { ...DEFAULTS, ...env, ...saved };
}
