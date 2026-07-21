# Kehila Pilot Test Plan — מעלה אדומים

Tracks manual QA before launching the pilot. Check items off as you test them (`- [x]`); when something fails, don't check it — instead add a `- [ ] 🐛 <short description>` line right under the failing item so it stays visible, and reference the fix commit there once resolved.

Test on a real device with the `preview` (or `development`) build, signed in with a real (non-demo) account unless a step says otherwise.

Run `npm run test-plan` and open **http://localhost:4850** for an interactive checklist with live per-section progress bars — clicking a box there writes straight back to this file, so it's always accurate whether you check things off here or there.

---

## 1. Auth & onboarding

- [x] Register with email — new account gets to `CompleteCityScreen` if no city set <!-- note:after%20sign%20in%20navigate%20to%20main%20screen -->
- [x] Register with Google Sign-In — new account created correctly, `cityId` not left empty <!-- note:after%20sign%20in%20navigate%20to%20main%20screen -->
- [x] Login with existing email account <!-- note:after%20sign%20in%20navigate%20to%20main%20screen -->
- [x] Login with Google — existing account signs in, no duplicate user doc created <!-- note:after%20sign%20in%20navigate%20to%20main%20screen -->
- [x] Continue as guest — guest gets a real (non-null) anonymous auth token, can browse <!-- note:after%20sign%20in%20navigate%20to%20main%20screen -->
- [x] Guest → switch city — persists locally (not Firestore), survives app restart
- [x] Guest → register/upgrade to real account (if this flow exists — verify) <!-- note:when%20tap%20on%20%D7%94%D7%AA%D7%97%D7%91%D7%A8%2F%D7%94%D7%A8%D7%A9%D7%9E%D7%94%20it's%20navigate%20to%20sign-in%20screen%20with%20option%20to%20register -->
- [x] Wrong password shows a clear error, doesn't crash
- [x] Logout — push token cleared, returns to login screen
- [x] Cold-restart the app while logged in — session persists, no re-login required
- [x] `CompleteCityScreen` — can't be dismissed without picking a city (for non-guest, non-demo users)

## 2. Home screen

- [x] Header shows correct Hebrew date, day name, city name, and greeting for time of day
- [x] Quick-links row shows all 9 icons, scrolls smoothly (remember: swipe **left-to-right** to reveal more items in this RTL list) <!-- note:maybe%20dismiss%20profile%20icon%20and%20allow%20taping%20the%20user%20name%20to%20enter%20profile%20screen -->
- [x] Each quick-link navigates to the correct screen
- [x] "התפילה הבאה" (next prayer) card shows the correct upcoming prayer and countdown
- [x] Kashrut updates banner shows correct unread count badge, tapping opens the feed
- [x] Shabbat candle-lighting card shows correct times for the current week
- [x] City-mismatch GPS prompt appears when device location differs from account city (test by mocking location or traveling) — dismiss persists, doesn't re-prompt every launch <!-- note:take%20time%20to%20show -->
- [x] Pull-to-refresh (if present) updates data

## 3. Synagogues

- [x] List loads, shows distance-sorted order when location permission granted
- [x] Filter/search within list works
- [x] Detail screen shows address, contact, weekly + Shabbat prayer schedule, shiurim
- [x] Map/location opens correctly (external maps app or in-app map)
- [x] Favorite/save a synagogue (if supported)

## 4. Prayer times & Zmanim

- [x] Prayer times screen shows today's שחרית/מנחה/ערבית times correctly for the city
- [x] Zmanim screen shows halachic times (netz, shkia, etc.) matching the city's coordinates
- [ ] Zmanim settings — changing calculation method/opinion updates displayed times
- [x] Favorite a specific minyan (star icon on a synagogue's prayer slot, `SynagogueDetailScreen`) — controls which minyanim get notification reminders, does not affect Home's "next prayer" card <!-- note:don't%20need%20it%20for%20now -->
- [x] Notification opt-in for a prayer time — reminder fires at the configured offset (see §12) — fixed two real bugs: missing required `type` field on the notification trigger (every call was silently throwing, nothing was ever scheduled) and a misplaced `channelId`. Known remaining limitation: doesn't fire if the app was force-stopped/swiped from Recents — see "Known limitations" at the bottom of this file.

## 5. Kashrut & restaurants

- [x] Restaurant list loads, category filters work (meat/dairy/pareve/vegan/cafe/bakery) <!-- note:add%20'clean'%20to%20reset%20all%20filters%20instead%20one%20at%20a%20time -->
- [x] Restaurant detail shows correct kosher certificate(s), levels, mashgiach info <!-- note:the%20cert%20is%20A4%20page%20size%20and%20the%20uploader%20cuts%20the%20image.%20add%20option%20for%20camera%20capturing. -->
- [x] Kashrut updates feed (KashrutUpdatesScreen) shows historical changes, correct Hebrew phrasing per entry
- [x] A hidden/suspended restaurant (rabbanut deactivated) is clearly flagged and not shown as a normal listing

## 6. Mikveh & appointments

- [x] Mikveh list loads with correct hours/contact info
- [ ] Mikveh detail screen shows appointment availability
- [x] Book an appointment — slot reserved, confirmation shown <!-- note:reworked%20-%20toggle%20is%20now%20%22%D7%98%D7%91%D7%99%D7%9C%D7%94%20%D7%91%D7%9C%D7%91%D7%93%22%20vs%20%22%D7%94%D7%9B%D7%A0%D7%94%20%D7%91%D7%9E%D7%A7%D7%95%D7%95%D7%94%22%2C%20both%20manager-configurable%20(parallel%20tracks%20%2B%20prep%20multiplier%20instead%20of%20hardcoded%201%2F2%D7%97) -->
- [x] Double-booking the same slot is prevented <!-- note:availability%20is%20now%20capacity-based%20(overlap%20count%20vs%20parallelTracks)%2C%20not%20a%20simple%20boolean%20-->
- [x] Opening hours unified — defined once on the mikveh screen (flexible day-grouped blocks), appointment settings just read from it <!-- note:new%20-%20replaces%20the%20old%20separate%20free-text%20openingHours%20%2B%20duplicate%20appointment%20schedule%20editor -->
- [x] Cancel an appointment (if supported)

## 7. Eruv

- [x] Eruv status (כשר/פגום) displays correctly and matches what admin last set
- [x] Eruv map renders the boundary polygon correctly
- [x] Submit an eruv report (if user-facing reporting exists)
- [x] Status change triggers a push notification (see §12)

## 8. Events

- [x] Events list shows upcoming events, correctly sorted by date <!-- note:fixed%20-%20push%20now%20only%20sent%20for%20isAlert%20events%2C%20from%20both%20app%20and%20console.%20sorted%20by%20day%20but%20not%20time%20in%20day -->
- [x] Event detail shows full description, location, time
- [x] RSVP / favorite an event (if supported) <!-- note:I%20think%20we%20said%20it's%20not%20available%20for%20now%20because%20we%20need%20to%20build%20backend%20to%20push%20nutifications -->
- [x] New event triggers a push notification (see §12) <!-- note:fixed%20-%20mobile%20approve%20flow%20and%20console%20(create%20%2B%20approve)%20now%20send%20push%2C%20gated%20to%20isAlert%20events%20only -->
- [x] Pending (gabbai-submitted) events don't show publicly until approved <!-- note:fixed%20-%20approve%20now%20sends%20push%20(isAlert%20events%20only) -->

## 9. Gemach

- [ ] Gemach list loads
- [ ] Submit a new gemach listing — appears in admin's pending queue, not live immediately
- [ ] Approved gemach listing appears publicly

## 10. Search

- [ ] Global search returns relevant results across synagogues/restaurants/events/etc.
- [ ] Empty query / no-results state handled gracefully

## 11. Profile & settings

- [ ] Profile shows correct name, email, role badge (e.g. "מנהל על")
- [ ] "מנהל על" / admin button only shows for admin-role accounts, correctly routes to the management menu
- [ ] Language button shows the "coming soon" message (not a silent no-op)
- [ ] Switch city (for a real account, not guest) works and persists
- [ ] Logout works from this screen

## 12. Push notifications

For each, confirm the notification **actually arrives on a physical device with the app backgrounded or closed** — not just that Firestore gets written to:

- [ ] Eruv status change → push received
- [ ] Kashrut cancellation/upgrade → push received (recently fixed — retest to confirm the fix holds on a fresh `preview` build, not just the dev-client)
- [ ] New event published → push received
- [ ] Prayer-time reminder (local notification, not push) fires at the configured offset
- [ ] Tapping a notification deep-links to the right screen
- [ ] Notification permission denial handled gracefully (app doesn't crash, just no pushes)
- [ ] Uninstall/reinstall — stale push token cleaned up server-side (`DeviceNotRegistered` pruning)

## 13. Shabbat lock

- [ ] Identify exactly which screens/actions lock during Shabbat (read the `useShabbatLock`/`getShabbatLock` logic if unsure) and verify each one
- [ ] Lock engages at the correct candle-lighting time and releases at the correct הבדלה time
- [ ] Locked state is clearly communicated to the user (not just a silent failure)

## 14. Mobile admin screens (bottom-sheet "ניהול" menu)

- [ ] `ManageSynagogueScreen` — create/edit/delete a synagogue
- [ ] `ManageRestaurantScreen` / `ManageKosherScreen` — create/edit a restaurant, toggle certs (see §12 for the push-notification retest), publish confirmation modal shows the right changes
- [ ] `ManageMikvehScreen` — create/edit mikveh, hours
- [ ] `ManageAppointmentsScreen` — view/manage bookings
- [ ] `ManageEruvScreen` — update status, edit polygon, push fires
- [ ] `ManageEventsScreen` — create/edit/delete event, approve pending gabbai submissions
- [ ] `ManageGemachScreen` — approve/reject pending gemach submissions
- [ ] `ManageCitiesScreen` — city settings editable by the right roles only
- [ ] `UserManagementScreen` — assign/change roles, assign managed businesses/synagogues to a `business_manager`/`gabbai`
- [ ] Biometric/PIN gate — entering any management screen prompts once, doesn't re-prompt within the 5-minute window, re-prompts after it expires

## 15. Admin web dashboard (kehila-admin)

- [ ] Login works, session persists on refresh
- [ ] `Dashboard` — key stats/overview correct
- [ ] `CitiesPage` / `CitiesMapPage` — city list and map view correct
- [ ] `CityDashboard` / `CitySettingsPage` — per-city overview and settings
- [ ] `SynagoguesPage` / `SynagogueDetailPage` — CRUD works
- [ ] `businessesPage` — CRUD works, kashrut cert change detection + push fires (recently fixed — retest)
- [ ] `MikvehPage` — CRUD works
- [ ] `EruvPage` — status update + push fires
- [ ] `EventsPage` — CRUD works
- [ ] `GemachPage` — approve/reject pending submissions
- [ ] `UsersPage` — role assignment works, matches mobile `UserManagementScreen` behavior
- [ ] `NotificationsPage` — manual push send works, targeting (city/role/channel) works correctly
- [ ] `AnalyticsPage` / `StatsPage` — data displayed matches actual usage (spot-check a known event)

## 16. Roles & permissions

Sign in (or use `UserManagementScreen`/`UsersPage` to grant temporarily) as each role and confirm access matches expectations — especially that a scoped role **cannot** touch things outside its scope:

- [ ] `guest` — read-only browsing, no management access
- [ ] `user` — same as guest plus profile/favorites, no management access
- [ ] `gabbai` — can manage only their assigned synagogue(s)
- [ ] `kosher_manager` — can manage kashrut city-wide, nothing else
- [ ] `business_manager` — can manage only their assigned business(es)
- [ ] `event_manager` — can manage events city-wide
- [ ] `eruv_manager` — can manage eruv status/polygon city-wide
- [ ] `city_admin` — full management access, but scoped to their `homeCityId` only (cannot touch another city's data)
- [ ] `super_admin` / `dev` — unscoped, full access across all cities

## 17. Cross-cutting

- [ ] RTL layout correct throughout — no mirrored icons/misaligned text, especially on screens added/changed recently
- [ ] Hebrew text renders correctly everywhere (no tofu boxes, no truncation issues)
- [ ] App icon and splash screen show the new branded logo (not the old placeholder) on a fresh install
- [ ] Airplane mode / poor connectivity — app doesn't crash, shows reasonable loading/error states
- [ ] Background → foreground — data refreshes appropriately, no stale UI
- [ ] Deep link from a push notification opens the app to the right screen even from a cold start
- [ ] Test on at least one other physical device (not just the primary dev device) to catch device-specific issues

---

## Known limitations (accepted for pilot, revisit post-launch)

- **Prayer/event reminders don't fire if the app was force-stopped or swiped away from Recents.** These are scheduled client-side via Android's `AlarmManager` (`expo-notifications` local scheduling). Since Android 3.1, the OS blocks a force-stopped app's alarms from firing until the user manually reopens it — and several OEMs, including Samsung, map "swipe away from Recents" to a force-stop. This is a platform-level restriction, not something app code can override; confirmed the alarm-permission and battery "sleeping apps" settings were both already correctly configured, so it isn't a config issue either. Reminders work fine as long as the app is merely backgrounded (not force-stopped), which covers most normal usage.
  - This is why eruv/kashrut alerts don't have this problem — those are genuine server-sent push notifications (Expo Push API → FCM), which run through Google Play Services' own persistent process, independent of this app's process state.
  - **Fix would require**: a server-side scheduler (Firebase Cloud Function running periodically) that checks every user's favorited minyanim/notification preferences and sends real push notifications at the right time, instead of relying on client-side local scheduling. This project currently has zero Cloud Functions — this would be new infrastructure, not a small patch. Decided to accept the limitation for the pilot and revisit if it becomes a real problem for users.

- **Non-alert events only push a broadcast to the whole city (or nothing) — no per-user targeting yet.** For the pilot, `isAlert` events push to everyone in the city; regular (non-alert) events don't push at all, which fixes the "notified for events I didn't ask for" complaint. The originally-requested richer behavior — also push regular events to users who favorited the event's synagogue, or who've opted in to an events notification preference — isn't implemented.
  - **Why not now**: favorites (`FavoritesContext.tsx`, kehila-app) are stored only in `AsyncStorage`, per-device, and are never synced to Firestore — there is currently no server/admin-queryable data source for "which users favorited synagogue X." There's also no existing "notify me about events" per-user preference (separate from the prayer `minutesBefore` settings) to check.
  - **Fix would require**: syncing favorites to Firestore (or building a reverse per-synagogue follower index), plus a new events-notification opt-in preference, plus a targeted-push query joining push tokens with that data. Decided to defer this and ship the simpler isAlert-only gating for the pilot.

- **Mikveh opening hours need to be re-entered once after the appointment-system rework.** `Mikveh.openingHours` (free text) and `appointmentConfig.schedule` were replaced by a single `hoursSchedule` (flexible day-grouped blocks, edited only on the mikveh screen now). No migration script was written — this is a pre-launch pilot, so any mikveh hours entered before this change are gone and need re-entering once in the new editor. Not a bug, just a one-time manual step.
