export type GemachCategory =
  | 'clothing' | 'baby' | 'medical' | 'food' | 'books'
  | 'wedding' | 'household' | 'tools' | 'other';

export interface Gemach {
  id: string;
  cityId: string;
  name: string;
  category: GemachCategory;
  description?: string;
  neighborhood?: string;
  contactName?: string;
  phone?: string;
  hours?: string;
  isActive: boolean;
  createdAt: any;
}

export interface PendingGemach {
  id: string;
  cityId: string;
  name: string;
  category: GemachCategory;
  description?: string;
  neighborhood?: string;
  contactName: string;
  phone: string;
  hours?: string;
  submittedBy?: string;
  submittedByName?: string;
  submittedAt: any;
  status: 'pending' | 'approved' | 'rejected';
}

export type UserRole =
  | "user"
  | "gabbai"
  | "business_manager"
  | "kosher_manager"
  | "event_manager"
  | "eruv_manager"
  | "city_admin"
  | "dev"
  | "super_admin";

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  cityId: string;
  // The city this account actually administers (for manager roles) — separate from
  // cityId, which is just a personal "what city am I browsing" preference that anyone
  // (including managers) can freely switch without affecting their admin scope.
  homeCityId?: string;
  role: UserRole;
  roles?: UserRole[];
  managedSynagogueIds?: string[];
  managedRestaurantIds?: string[];
  createdAt: Date;
}

export interface NusachOption {
  key: string;
  label: string;
}

export interface City {
  id: string;
  name: string;
  country: string;
  timezone: string;
  latitude: number;
  longitude: number;
  elevation?: number; // meters above sea level — used for daily mountain-angle terrain scan
  nusachOptions?: NusachOption[];
  neighborhoods?: string[];
}

// Zmanim anchors for relative prayer time slots
export type ZmanimAnchor =
  | 'netz'
  | 'shkia'
  | 'chatzot'
  | 'plagHamincha'
  | 'minchaGedola'
  | 'minchaKetana';

// Storage format: one time entry that applies to specific days
// days: 1=Sunday, 2=Monday, ..., 6=Friday, 7=Shabbat
// When anchor is set, the time is computed from zmanim (offsetMin minutes after/before the anchor).
export interface PrayerTimeSlot {
  time: string;          // "HH:MM" for fixed; empty string for relative slots
  anchor?: ZmanimAnchor; // if set, derive time from today's zmanim
  offsetMin?: number;    // minutes offset from anchor (positive=after, negative=before), default 0
  proportional?: boolean; // if true, offsetMin is in sha'ot zmaniyot / 60 (halachic minutes)
  days?: number[];
  notes?: string | null;
}

// Runtime/display type: today's times as flat string arrays
export interface PrayerTimes {
  netz?: string;
  shacharit: string[];
  mincha: string[];
  maariv: string[];
}

export interface WeeklySchedule {
  shacharit: PrayerTimeSlot[];
  mincha: PrayerTimeSlot[];
  maariv: PrayerTimeSlot[];
  shiurim?: Shiur[];
  notes?: string;
}
export interface ShabbatSchedule {
  minchaFriday?: PrayerTimeSlot[];
  shacharit?: PrayerTimeSlot[];
  mincha?: PrayerTimeSlot[];
  maariv?: PrayerTimeSlot[];
  shiurim?: Shiur[];
  notes?: string;
}
export interface SpecialEvent {
  name: string;
  date: string; // ISO date
  prayerTimes: PrayerTimes;
}

export interface Shiur {
  id: string;
  title: string;
  rabbi: string;
  days: number[] | "daily"; // 1=Sunday, 2=Monday, ..., 7=Shabbat or 'daily'
  time: string;
  description?: string;
}

export interface Synagogue {
  id: string;
  cityId: string;
  neighborhood?: string;
  name: string;
  nusach: string[];
  address: { he?: string; en?: string };
  latitude?: number;
  longitude?: number;
  phone?: string;
  rabbi?: string;
  rabbiName?: string;
  rabbiPhone?: string;
  gabbaiName?: string;
  gabbaiPhone?: string;
  wazeLink?: string;
  navigationNote?: string;
  weeklySchedule: WeeklySchedule;
  shabbatSchedule?: ShabbatSchedule;
  specialEvents?: SpecialEvent[];
  shiurim?: Shiur[];
  notes?: string;
  imageUrl?: string;              // primary / mood image
  images?: string[];              // additional gallery images
  synagogueEvents?: SynagogueAnnouncement[]; // gabay-posted events/announcements
  updatedAt?: Date;
}

// ---- Kosher Restaurants ----

export type KosherLevel =
  | "mehadrin"
  | "regular"
  | "chalav_israel"
  | "bishul_israel"
  | "glatt";

// Every kosher business has a mandatory local-rabbinate certificate (primary);
// third-party badatzim are optional additions on top of it.
export type CertifierType = "local_rabbanut" | "badatz";

export interface KosherCertificate {
  id: string;
  certifierType?: CertifierType; // 'local_rabbanut' = the mandatory primary cert
  issuedBy: string; // body name, e.g. "רבנות מעלה אדומים" or 'בד"ץ בית יוסף'
  certNumber?: string;
  kosherLevel: KosherLevel[];
  validFrom: string; // ISO date
  validUntil: string; // ISO date
  isActive: boolean;
  notes?: string;
  imageUrl?: string;
}

export interface OpeningHours {
  sunday?: string;
  monday?: string;
  tuesday?: string;
  wednesday?: string;
  thursday?: string;
  friday?: string;
  saturday?: string;
}

export type BusinessType = "serving" | "factory"; // dine-in vs production (bakery/dairy/factory)

export interface Restaurant {
  id: string;
  cityId: string;
  name: string;
  category: string;        // legacy single value (kept = categories[0] for back-compat)
  categories?: string[];   // multi-choice kashrut types: meat | dairy | pareve | vegan | cafe | bakery
  businessType?: BusinessType; // serving (בית אוכל) vs factory (מפעל) — defaults to serving
  neighborhood?: string;
  address: string;
  phone?: string;
  website?: string;
  description?: string;        // optional business description / about text
  openingHours: OpeningHours;
  kosherCertificates: KosherCertificate[];
  latitude?: number;
  longitude?: number;
  imageUrl?: string;           // primary / legacy single image
  images?: string[];           // additional gallery images (uploaded by manager)
  contacts?: { name: string; phone?: string }[];
  mashgiachName?: string;
  mashgiachPhone?: string;
  isHidden?: boolean;   // true when rabbanut cert is deactivated — hidden from public
  isOpen?: boolean;
  activeAlert?: string;
  updatedAt?: Date;
}

// ---- Mikveh ----

export type MikvehType = "women" | "men" | "both";

// ── Appointment scheduling ────────────────────────────────────────────────────

export type DayKey =
  | 'sunday' | 'monday' | 'tuesday' | 'wednesday'
  | 'thursday' | 'friday' | 'saturday';

export interface DaySlotConfig {
  enabled: boolean;
  start: string;   // "HH:MM"
  end: string;     // "HH:MM"
}

/** Stored inline in the Mikveh document */
export interface AppointmentConfig {
  slotDurationMin: number;
  schedule: Partial<Record<DayKey, DaySlotConfig>>;
}

/** One appointment document — subcollection: mikvaot/{id}/appointments/{apptId} */
export interface MikvehAppointment {
  id: string;
  mikvehId: string;
  userId: string;
  date: string;    // YYYY-MM-DD
  time: string;    // HH:MM — start time
  slotsCount?: number; // consecutive base slots occupied (1 = single, 2 = double/"tailing"); absent = 1
  status: 'booked' | 'cancelled';
  createdAt: any;
}

// ─────────────────────────────────────────────────────────────────────────────

export interface Mikveh {
  id: string;
  cityId: string;
  name: string;
  type: MikvehType;
  neighborhood?: string;
  address: string;
  phone?: string;
  openingHours: OpeningHours;
  requiresAppointment: boolean;
  appointmentPhone?: string;
  appointmentConfig?: AppointmentConfig;  // online booking schedule
  contacts?: { name: string; phone?: string }[];
  notes?: string;
  description?: string;
  imageUrl?: string;          // primary / mood image
  images?: string[];          // additional gallery images
  latitude?: number;
  longitude?: number;
  updatedAt?: Date;
}

// ---- Kashrut updates (a dedicated feed, separate from community events) ----

export interface KashrutUpdate {
  id: string;
  cityId: string;
  businessId: string;
  businessName: string;
  direction: "up" | "down";
  certType?: "local_rabbanut" | "badatz"; // which cert changed
  tags: string[];                         // what changed (human-readable labels)
  note?: string;                          // e.g. "כשרות הרבנות בתוקף" when badatz removed
  createdAt: any;
  expiresAt?: any;                        // Firestore Timestamp — auto-deleted by TTL policy
}

// ---- Community Events ----

export type EventCategory =
  | "shiur"
  | "community"
  | "youth"
  | "charity"
  | "holiday"
  | "announcement"
  | "alert";

// ---- Synagogue-level announcements (stored in the synagogue doc, no approval needed) ----
// When submittedForApproval=true a copy is also sent to pending_events for city-wide publishing.

export interface SynagogueAnnouncement {
  id: string;
  title: string;
  description: string;
  category: EventCategory;
  startDate: string;   // ISO datetime
  location?: string;
  isAlert: boolean;
  createdAt: string;   // ISO datetime (client-generated)
}

export interface CommunityEvent {
  id: string;
  cityId: string;
  title: string;
  description: string;
  category: EventCategory;
  startDate: string; // ISO datetime
  endDate?: string;
  location?: string;
  latitude?: number;  // event venue coordinates (for Waze navigation)
  longitude?: number;
  organizer?: string;
  imageUrl?: string;
  synagogueId?: string; // linked synagogue — enables navigation to its detail page
  isAlert: boolean; // urgent/pinned announcements
  createdBy: string; // uid
  createdAt: Date;
  expiresAt?: any;  // Firestore Timestamp — auto-deleted by TTL policy
}

// ---- Pending (Gabay-submitted) Events ----
// A gabay creates this; city admin reviews and can approve → CommunityEvent.

export interface PendingCommunityEvent {
  id: string;
  cityId: string;
  synagogueId: string;
  synagogueName?: string;    // denormalized for admin display
  submittedBy: string;       // uid
  submittedByName?: string;  // denormalized for admin display
  submittedAt: any;          // Firestore Timestamp
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  // Core event fields (same as CommunityEvent):
  title: string;
  description: string;
  category: EventCategory;
  startDate: string;
  endDate?: string;
  location?: string;
  organizer?: string;
  isAlert: boolean;
}

// ---- Navigation types ----

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Search: undefined;
  Synagogues: undefined;
  PrayerTimes: undefined;
  Zmanim: undefined;
  Restaurants: undefined;
  Mikveh: undefined;
  Events: undefined;
  Eruv: undefined;
  Gemach: undefined;
  Profile: undefined;
};

export interface EruvCoordinate {
  latitude: number;
  longitude: number;
}

export interface EruvStatus {
  id: string;
  status: 'valid' | 'invalid' | 'unknown';
  polygon?: EruvCoordinate[];                 // legacy single polygon (read-only compat)
  polygons?: { points: EruvCoordinate[] }[];  // multi-polygon support (new canonical field)
  updatedAt: any;
  updatedBy: string;
  notes?: string;
}

export interface EruvReport {
  id: string;
  cityId: string;
  userId: string;
  userDisplayName?: string;
  type: 'breach' | 'question';
  description: string;
  userLocation?: EruvCoordinate;
  imageUrl?: string;
  status: 'open' | 'resolved';
  resolvedBy?: string;
  resolvedAt?: any;
  createdAt: any;
}

export type AdminStackParamList = {
  AdminHome: undefined;
  ManageSynagogue: { synagogueId: string };
  ManageRestaurant: { restaurantId: string };
  ManageKosher: { restaurantId: string };
  ManageEvents: undefined;
  CreateEvent: undefined;
  ManageEruv: undefined;
  UserManagement: undefined;
  ManageCities: undefined;
};
