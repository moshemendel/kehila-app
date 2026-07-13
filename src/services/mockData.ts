// Mock data for UI development — replace with Firebase reads in production
import { Synagogue, Restaurant, Mikveh, CommunityEvent, City } from "../types";

export const mockCity: City = {
  id: "city-1",
  name: "Modi'in Illit",
  country: "Israel",
  timezone: "Asia/Jerusalem",
  latitude: 31.934,
  longitude: 35.024,
};

export const mockSynagogues: Synagogue[] = [
  {
    id: "syn-1",
    cityId: "city-1",
    name: "בית כנסת הגדול",
    nusach: ["ashkenaz"],
    address: { he: "רחוב הרב קוק 12", en: "Rehov HaRav Kook 12" },
    latitude: 31.789606, // Mock coordinates for demonstration
    longitude: 35.31008, // Mock coordinates for demonstration
    phone: "02-123-4567",
    rabbiName: "הרב משה כהן",
    rabbiPhone: "054-6091569",
    gabbaiName: "ישראל לוי",
    gabbaiPhone: "054-6091568",
    weeklySchedule: {
      shacharit: [
        { time: "נץ", days: [1, 2, 3, 4, 5, 6] },
        { time: "06:30", days: [1, 2, 3, 4, 5, 6] },
        { time: "07:45", days: [1, 2, 3, 4, 5, 6] },
        { time: "08:30", days: [7] },
      ],
      mincha: [
        { time: "13:15", days: [1, 2, 3, 4, 5, 6, 7] },
        { time: "19:30", days: [1, 2, 3, 4, 5] },
      ],
      maariv: [
        { time: "20:00", days: [1, 2, 3, 4, 5, 6] },
        { time: "21:00", days: [1, 2, 3, 4, 5, 6] },
      ],
      shiurim: [
        {
          id: "sh-1",
          title: "דף יומי",
          rabbi: "הרב כהן",
          days: [1, 2, 3, 4, 5],
          time: "05:45",
          description: "לפני שחרית",
        },
        {
          id: "sh-2",
          title: "שיעור הלכה",
          rabbi: "הרב כהן",
          days: [5],
          time: "21:30",
        },
      ],
    },
    shabbatSchedule: {
      minchaFriday: [
        { time: "20:00", notes: " שעה וחצי לפני השקיעה" },
        { time: "20:00", notes: "כחצי שעה לפני השקיעה" },
      ],
      shacharit: [
        { time: "נץ", notes: "שעה לפני נץ החמה" },
        { time: "7:30", notes: "קידוש לאחר התפילה" },
      ],
      mincha: [{ time: "13:15" }, { time: "17:45" }],
      shiurim: [
        {
          id: "sh-3",
          title: "תהילים לילדים",
          rabbi: "הרב משה",
          days: [7],
          time: "16:00",
          description: "הרבה הפתעות לילדים",
        },
        {
          id: "sh-4",
          title: "גמרא מסכת מגילה",
          rabbi: "הרב משה",
          days: [7],
          time: "16:30",
          description: "הרבה הפתעות לילדים",
        },
      ],
      notes: "ממוזג. קידוש כל שבת.",
    },
    wazeLink: "https://waze.com/ul/hsv9hge05b",
    navigationNote: "אחר הכניסה הראשית, פונים שמאלה ומיד פונים ימינה",
  },
  {
    id: "syn-2",
    cityId: "city-1",
    name: "תפארת צבי",
    nusach: ["sefard"],
    address: { he: "רחוב הרצל 5" },
    phone: "02-987-6543",
    rabbi: "הרב אברהם מזרחי",
    weeklySchedule: {
      shacharit: [
        { time: "06:45", days: [1, 2, 3, 4, 5, 6] },
        { time: "08:00", days: [1, 2, 3, 4, 5, 6] },
      ],
      mincha: [
        { time: "19:45", days: [1, 2, 3, 4, 5] },
        { time: "13:30", days: [6] },
      ],
      maariv: [{ time: "21:15", days: [1, 2, 3, 4, 5] }],
    },
  },
];

export const mockRestaurants: Restaurant[] = [
  {
    id: "rest-1",
    cityId: "city-1",
    name: "Steakhouse HaMelech",
    category: "meat",
    address: "Rechov HaNasi 3",
    phone: "02-555-1234",
    website: "https://hamelechteak.co.il",
    openingHours: {
      sunday: "12:00–23:00",
      monday: "12:00–23:00",
      tuesday: "12:00–23:00",
      wednesday: "12:00–23:00",
      thursday: "12:00–23:30",
      friday: "10:00–14:00",
      saturday: "Closed",
    },
    kosherCertificates: [
      {
        id: "cert-1",
        issuedBy: "Rabbinate of Modi'in Illit",
        certNumber: "ML-2024-1872",
        kosherLevel: ["mehadrin", "glatt"],
        validFrom: "2024-01-01",
        validUntil: "2026-12-31",
        isActive: true,
      },
    ],
    activeAlert: undefined,
  },
  {
    id: "rest-2",
    cityId: "city-1",
    name: "Café Zahav",
    category: "dairy",
    address: "Kikar HaShuk 8",
    phone: "02-555-9876",
    openingHours: {
      sunday: "07:00–22:00",
      monday: "07:00–22:00",
      tuesday: "07:00–22:00",
      wednesday: "07:00–22:00",
      thursday: "07:00–22:00",
      friday: "07:00–13:30",
      saturday: "Closed",
    },
    kosherCertificates: [
      {
        id: "cert-2",
        issuedBy: "Rabbinate of Modi'in Illit",
        kosherLevel: ["mehadrin", "chalav_israel"],
        validFrom: "2025-01-01",
        validUntil: "2025-12-31",
        isActive: true,
        notes: "Chalav Yisrael strictly observed",
      },
    ],
    activeAlert: "Closed this week — will reopen Sunday 18/5",
  },
];

export const mockMikvaot: Mikveh[] = [
  {
    id: "mik-1",
    cityId: "city-1",
    name: "Mikveh Taharah",
    type: "women",
    address: "Rechov Shivtei Yisrael 2",
    phone: "02-777-4321",
    openingHours: {
      sunday: "21:00–24:00",
      monday: "21:00–24:00",
      tuesday: "21:00–24:00",
      wednesday: "21:00–24:00",
      thursday: "21:00–24:00",
      friday: "Erev Shabbat — by appointment",
      saturday: "Motzei Shabbat 21:30+",
    },
    requiresAppointment: true,
    appointmentPhone: "02-777-4321",
    notes: "Call ahead for appointment. Accessible entrance available.",
  },
  {
    id: "mik-2",
    cityId: "city-1",
    name: "Mikveh HaGvura",
    type: "men",
    address: "Rechov Ben Yehuda 14",
    phone: "02-777-8888",
    openingHours: {
      sunday: "06:00–10:00",
      monday: "06:00–10:00",
      tuesday: "06:00–10:00",
      wednesday: "06:00–10:00",
      thursday: "06:00–10:00",
      friday: "05:30–10:00",
      saturday: "Shabbat morning: 06:30–10:00",
    },
    requiresAppointment: false,
  },
];

export const mockEvents: CommunityEvent[] = [
  {
    id: "ev-1",
    cityId: "city-1",
    title: "Grand Shiur — Rav Berger",
    description:
      "Public shiur on the laws of Shabbat with Rav Berger from Bnei Brak. All welcome.",
    category: "shiur",
    startDate: "2026-05-15T20:00:00",
    location: "Beit Knesset HaGadol",
    organizer: "Kollel Avodas Hashem",
    isAlert: false,
    createdBy: "admin",
    createdAt: new Date(),
  },
  {
    id: "ev-2",
    cityId: "city-1",
    title: "ALERT: Water cut scheduled Thursday 8:00–14:00",
    description:
      "The municipality has scheduled a water maintenance cut on Thursday. Mikveh will be CLOSED during these hours.",
    category: "alert",
    startDate: "2026-05-14T08:00:00",
    endDate: "2026-05-14T14:00:00",
    isAlert: true,
    createdBy: "admin",
    createdAt: new Date(),
  },
  {
    id: "ev-3",
    cityId: "city-1",
    title: "Community Lag BaOmer Bonfire",
    description:
      "Join us for the annual community bonfire celebration. Music, food, and activities for all ages.",
    category: "community",
    startDate: "2026-05-25T20:00:00",
    location: "Central Park",
    organizer: "City Religious Council",
    isAlert: false,
    createdBy: "admin",
    createdAt: new Date(),
  },
];
