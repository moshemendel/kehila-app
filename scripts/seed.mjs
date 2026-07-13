// One-time Firestore seed script — run with:  node scripts/seed.mjs
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, collection, addDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyC65pFWSyXz7vZrTdHQRLGXh3fg_Prov5g",
  authDomain: "kehila-app-386ab.firebaseapp.com",
  projectId: "kehila-app-386ab",
  storageBucket: "kehila-app-386ab.firebasestorage.app",
  messagingSenderId: "991729726938",
  appId: "1:991729726938:web:929b7f639020bf3cf5bce3",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ── Cities ────────────────────────────────────────────────────────────────────
const cities = [
  {
    id: 'city-1',
    name: "מודיעין עילית",
    country: 'Israel',
    timezone: 'Asia/Jerusalem',
    latitude: 31.934,
    longitude: 35.024,
  },
];

// ── Synagogues ────────────────────────────────────────────────────────────────
const synagogues = [
  {
    id: 'syn-1',
    cityId: 'city-1',
    name: 'בית כנסת הגדול',
    nusach: 'ashkenaz',
    address: 'רחוב הרב קוק 12',
    phone: '02-123-4567',
    rabbi: 'הרב משה כהן',
    gabbaiName: 'ישראל לוי',
    weeklySchedule: {
      sunday:    { shacharit: ['netz','06:30','07:45','08:30'], mincha: ['13:15','19:30'], maariv: ['20:00','21:00'] },
      monday:    { shacharit: ['netz','06:30','07:45'],         mincha: ['13:15','19:30'], maariv: ['20:00','21:00'] },
      tuesday:   { shacharit: ['netz','06:30','07:45'],         mincha: ['13:15','19:30'], maariv: ['20:00','21:00'] },
      wednesday: { shacharit: ['netz','06:30','07:45'],         mincha: ['13:15','19:30'], maariv: ['20:00','21:00'] },
      thursday:  { shacharit: ['netz','06:30','07:00','07:45'], mincha: ['13:15','19:30'], maariv: ['20:00','21:00'] },
      friday:    { shacharit: ['netz','06:30','07:45'],         mincha: ['13:15'],         maariv: [] },
      shabbat_mincha_friday: ['18:00'],
      shabbat_shacharit: ['07:00','08:30','09:00'],
      shabbat_mincha: ['17:30'],
    },
    shiurim: [
      { id: 'sh-1', title: 'דף יומי', rabbi: 'הרב כהן', dayOfWeek: 'daily',   time: '05:45', description: 'לפני שחרית' },
      { id: 'sh-2', title: 'שיעור הלכה', rabbi: 'הרב כהן', dayOfWeek: 'tuesday', time: '21:30' },
    ],
    notes: 'מזוגן. קידוש בכל שבת.',
    updatedAt: new Date(),
  },
  {
    id: 'syn-2',
    cityId: 'city-1',
    name: 'תפארת צבי',
    nusach: 'sefard',
    address: 'רחוב הרצל 5',
    phone: '02-987-6543',
    rabbi: 'הרב אברהם מזרחי',
    weeklySchedule: {
      sunday:    { shacharit: ['06:45','08:00'], mincha: ['19:45'], maariv: ['21:15'] },
      monday:    { shacharit: ['06:45','08:00'], mincha: ['19:45'], maariv: ['21:15'] },
      tuesday:   { shacharit: ['06:45','08:00'], mincha: ['19:45'], maariv: ['21:15'] },
      wednesday: { shacharit: ['06:45','08:00'], mincha: ['19:45'], maariv: ['21:15'] },
      thursday:  { shacharit: ['06:45','08:00'], mincha: ['19:45'], maariv: ['21:15'] },
      friday:    { shacharit: ['06:45','08:00'], mincha: ['13:30'], maariv: [] },
      shabbat_mincha_friday: ['17:45'],
      shabbat_shacharit: ['08:00','09:30'],
      shabbat_mincha: ['17:00'],
    },
    updatedAt: new Date(),
  },
];

// ── Restaurants ───────────────────────────────────────────────────────────────
const restaurants = [
  {
    id: 'rest-1',
    cityId: 'city-1',
    name: 'סטייקהאוס המלך',
    category: 'meat',
    address: 'רחוב הנשיא 3',
    phone: '02-555-1234',
    website: 'https://example.co.il',
    openingHours: {
      sunday: '12:00–23:00', monday: '12:00–23:00', tuesday: '12:00–23:00',
      wednesday: '12:00–23:00', thursday: '12:00–23:30', friday: '10:00–14:00', saturday: 'סגור',
    },
    kosherCertificates: [{
      id: 'cert-1',
      issuedBy: 'רבנות מודיעין עילית',
      certNumber: 'ML-2024-1872',
      kosherLevel: ['mehadrin','glatt'],
      validFrom: '2024-01-01',
      validUntil: '2026-12-31',
      isActive: true,
    }],
    updatedAt: new Date(),
  },
  {
    id: 'rest-2',
    cityId: 'city-1',
    name: 'קפה זהב',
    category: 'dairy',
    address: 'כיכר השוק 8',
    phone: '02-555-9876',
    openingHours: {
      sunday: '07:00–22:00', monday: '07:00–22:00', tuesday: '07:00–22:00',
      wednesday: '07:00–22:00', thursday: '07:00–22:00', friday: '07:00–13:30', saturday: 'סגור',
    },
    kosherCertificates: [{
      id: 'cert-2',
      issuedBy: 'רבנות מודיעין עילית',
      kosherLevel: ['mehadrin','chalav_israel'],
      validFrom: '2025-01-01',
      validUntil: '2025-12-31',
      isActive: true,
      notes: 'חלב ישראל בהשגחה מיוחדת',
    }],
    activeAlert: 'סגור השבוע — יפתח מחדש ביום ראשון י״ח באייר',
    updatedAt: new Date(),
  },
];

// ── Mikvaot ───────────────────────────────────────────────────────────────────
const mikvaot = [
  {
    id: 'mik-1',
    cityId: 'city-1',
    name: 'מקווה טהרה',
    type: 'women',
    address: 'רחוב שבטי ישראל 2',
    phone: '02-777-4321',
    openingHours: {
      sunday: '21:00–24:00', monday: '21:00–24:00', tuesday: '21:00–24:00',
      wednesday: '21:00–24:00', thursday: '21:00–24:00',
      friday: 'ערב שבת — בתיאום מראש', saturday: 'מוצאי שבת 21:30+',
    },
    requiresAppointment: true,
    appointmentPhone: '02-777-4321',
    notes: 'נדרשת הזמנה מראש. כניסה נגישה.',
    updatedAt: new Date(),
  },
  {
    id: 'mik-2',
    cityId: 'city-1',
    name: 'מקווה הגבורה',
    type: 'men',
    address: 'רחוב בן יהודה 14',
    phone: '02-777-8888',
    openingHours: {
      sunday: '06:00–10:00', monday: '06:00–10:00', tuesday: '06:00–10:00',
      wednesday: '06:00–10:00', thursday: '06:00–10:00',
      friday: '05:30–10:00', saturday: 'שחרית שבת: 06:30–10:00',
    },
    requiresAppointment: false,
    updatedAt: new Date(),
  },
];

// ── Events ────────────────────────────────────────────────────────────────────
const events = [
  {
    cityId: 'city-1',
    title: 'שיעור גדול — הרב ברגר',
    description: 'שיעור ציבורי בהלכות שבת עם הרב ברגר מבני ברק. כולם מוזמנים.',
    category: 'shiur',
    startDate: '2026-05-20T20:00:00',
    location: 'בית כנסת הגדול',
    organizer: 'כולל עבודת השם',
    isAlert: false,
    createdBy: 'admin',
    createdAt: new Date(),
  },
  {
    cityId: 'city-1',
    title: 'התראה: ניתוק מים ביום חמישי 08:00–14:00',
    description: 'העירייה תבצע עבודות תשתית. המקווה יהיה סגור בשעות אלו.',
    category: 'alert',
    startDate: '2026-05-14T08:00:00',
    endDate: '2026-05-14T14:00:00',
    isAlert: true,
    createdBy: 'admin',
    createdAt: new Date(),
  },
];

// ── Seed function ─────────────────────────────────────────────────────────────
async function seed() {
  console.log('🌱 Seeding Firestore...\n');

  for (const city of cities) {
    const { id, ...data } = city;
    await setDoc(doc(db, 'cities', id), data);
    console.log(`✓ City: ${data.name}`);
  }

  for (const syn of synagogues) {
    const { id, ...data } = syn;
    await setDoc(doc(db, 'synagogues', id), data);
    console.log(`✓ Synagogue: ${data.name}`);
  }

  for (const rest of restaurants) {
    const { id, ...data } = rest;
    await setDoc(doc(db, 'restaurants', id), data);
    console.log(`✓ Restaurant: ${data.name}`);
  }

  for (const mik of mikvaot) {
    const { id, ...data } = mik;
    await setDoc(doc(db, 'mikvaot', id), data);
    console.log(`✓ Mikveh: ${data.name}`);
  }

  for (const event of events) {
    const ref = await addDoc(collection(db, 'events'), event);
    console.log(`✓ Event: ${event.title} (${ref.id})`);
  }

  console.log('\n✅ Seed complete!');
  process.exit(0);
}

seed().catch((e) => { console.error('❌ Seed failed:', e); process.exit(1); });
