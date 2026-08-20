# Kehila Pilot Test Plan — מעלה אדומים

Tracks manual QA before launching the pilot. Check items off as you test them (`- [x]`); when something fails, don't check it — instead add a `- [ ] 🐛 <short description>` line right under the failing item so it stays visible, and reference the fix commit there once resolved.

Test on a real device with the `preview` (or `development`) build, signed in with a real (non-demo) account unless a step says otherwise.

Run `npm run test-plan` and open **http://localhost:4850** for an interactive checklist with live per-section progress bars — clicking a box there writes straight back to this file, so it's always accurate whether you check things off here or there.

---

## 1. Auth & onboarding

- [x] Register with email — new account gets to `CompleteCityScreen` if no city set <!-- note:fixed%20-%20AuthGate%20now%20navigates%20to%20the%20Home%20tab%20explicitly%20instead%20of%20goBack()%2C%20which%20previously%20returned%20to%20wherever%20the%20login%20modal%20was%20opened%20from -->
- [x] Register with Google Sign-In — new account created correctly, `cityId` not left empty <!-- note:fixed%20-%20AuthGate%20now%20navigates%20to%20the%20Home%20tab%20explicitly%20instead%20of%20goBack()%2C%20which%20previously%20returned%20to%20wherever%20the%20login%20modal%20was%20opened%20from -->
- [x] Login with existing email account <!-- note:fixed%20-%20AuthGate%20now%20navigates%20to%20the%20Home%20tab%20explicitly%20instead%20of%20goBack()%2C%20which%20previously%20returned%20to%20wherever%20the%20login%20modal%20was%20opened%20from -->
- [x] Login with Google — existing account signs in, no duplicate user doc created <!-- note:fixed%20-%20AuthGate%20now%20navigates%20to%20the%20Home%20tab%20explicitly%20instead%20of%20goBack()%2C%20which%20previously%20returned%20to%20wherever%20the%20login%20modal%20was%20opened%20from -->
- [x] Continue as guest — guest gets a real (non-null) anonymous auth token, can browse <!-- note:fixed%20-%20AuthGate%20now%20navigates%20to%20the%20Home%20tab%20explicitly%20instead%20of%20goBack()%2C%20which%20previously%20returned%20to%20wherever%20the%20login%20modal%20was%20opened%20from -->
- [x] Guest → switch city — persists locally (not Firestore), survives app restart
- [x] Guest → register/upgrade to real account (if this flow exists — verify) <!-- note:when%20tap%20on%20%D7%94%D7%AA%D7%97%D7%91%D7%A8%2F%D7%94%D7%A8%D7%A9%D7%9E%D7%94%20it's%20navigate%20to%20sign-in%20screen%20with%20option%20to%20register -->
- [ ] Password rules — live checklist appears as you type, all five rules go green, strength bar tracks them
- [ ] A Hebrew password is refused — switch the keyboard to Hebrew mid-field and the "אנגלית בלבד" rule goes red <!-- note:english-only%20is%20printable%20ASCII%2C%20space%20excluded.%20Reason%20is%20recovery%2C%20not%20security%3A%20the%20keyboard%20layout%20changes%20between%20the%20field%20where%20the%20password%20was%20chosen%20and%20the%20field%20where%20it's%20retyped%2C%20the%20masked%20dots%20give%20no%20clue%20which%20layout%20is%20live%2C%20and%20the%20same%20password%20typed%20on%20the%20admin%20dashboard's%20physical%20keyboard%20comes%20out%20different.%20Check%20the%20ASCII%20keyboard%20hint%20on%20iOS%20too%20-%20keyboardType%3D%22ascii-capable%22%20is%20iOS-only%2C%20Android%20has%20no%20equivalent%2C%20so%20an%20Android%20user%20CAN%20still%20type%20Hebrew%20and%20must%20be%20told%20by%20the%20rule. --> <!-- note:rules%3A%208%2B%20chars%2C%20lowercase%2C%20uppercase%2C%20digit%2C%20symbol%20-%20plus%20a%20blocklist%20and%20a%20name%2Femail%20check.%20Client-side%20only%3A%20Firebase%20Auth's%20own%20floor%20is%206%20and%20raising%20it%20needs%20Identity%20Platform%2C%20so%20this%20stops%20weak%20CHOICES%2C%20not%20a%20determined%20attacker%20hitting%20the%20REST%20API.%20Rules%20live%20in%20src%2Futils%2FpasswordPolicy.ts%20(duplicated%20in%20kehila-admin)%20-%20if%20pilot%20registrations%20stall%2C%20drop%20the%20uppercase%20rule%20first%2C%20not%20the%20length.%20NOTE%3A%20there%20is%20still%20no%20forgot-password%20flow%2C%20and%20longer%20passwords%20make%20that%20gap%20bite%20sooner. -->
- [ ] A password containing the user's own name or email prefix is refused
- [ ] "צור חשבון" with a failing password explains which rule is missing instead of a generic error
- [ ] Admin dashboard → הוספת משתמש enforces the same rules, and "הצע סיסמה" generates a passing one
- [ ] "שכחתי סיסמה" on the login screen — sends the reset mail, and says the same thing whether or not the address is registered <!-- note:deliberate%3A%20with%20email%20enumeration%20protection%20on%2C%20Firebase%20resolves%20successfully%20either%20way%2C%20and%20reporting%20'no%20such%20user'%20would%20let%20anyone%20test%20which%20addresses%20belong%20to%20community%20members.%20Only%20auth%2Finvalid-email%20is%20surfaced. -->
- [ ] Reset link actually arrives, sets a new password, and the new password logs in
- [ ] Registration sends a verification mail, and the "כתובת האימייל טרם אומתה" banner shows on Home and Profile
- [ ] "שלח שוב" works and then counts down 60s; "כבר אימתתי" flips the banner off once the link has been opened
- [ ] Google sign-in arrives already verified — no banner
- [ ] An unverified account tapping דיווח על מידע שגוי is told to verify first; a guest is told to sign in
- [ ] Verify, then report — the write succeeds (the rule requires `email_verified`, so this fails until the rules are deployed) <!-- note:firestore.rules%20contentReports%20create%20now%20requires%20request.auth.token.email_verified%20%3D%3D%20true.%20NOT%20YET%20DEPLOYED%20-%20until%20it%20is%2C%20the%20gate%20is%20client-side%20only.%20Deploying%20it%20also%20blocks%20guest%20(anonymous)%20reports%2C%20which%20used%20to%20be%20allowed. -->
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
- [ ] Selichot card appears in season, names the next night and the earliest minyan, opens the סליחות screen (see §20)
- [ ] Red "!" on the פרופיל quick-link when management items need attention — the tab bar is hidden on Home, so this is the only place it can surface there

## 3. Synagogues

- [x] List loads, shows distance-sorted order when location permission granted
- [x] Filter/search within list works
- [x] Detail screen shows address, contact, weekly + Shabbat prayer schedule, shiurim
- [x] Map/location opens correctly (external maps app or in-app map)
- [ ] One ניווט button opens the OS app chooser (Waze, Moovit, Google Maps — whatever is installed) and every app lands on the synagogue, not a default city <!-- note:was%20broken%3A%20the%20maps%20button%20sent%20geo%3A0%2C0%3Fq%3D%3Clat%3E%2C%3Clng%3E(%3Cname%3E)%2C%20which%20means%20'no%20coordinates%2C%20treat%20q%20as%20a%20search'.%20Google%20Maps%20parsed%20it%20anyway%2C%20Waze%20did%20not%20and%20navigated%20to%20Jerusalem.%20Now%20one%20button%2C%20OS%20chooser%2C%20geo%3A%3Clat%3E%2C%3Clng%3E%3Fq%3D%3Clat%3E%2C%3Clng%3E. -->
- [ ] Report button (flag) in the header opens the report sheet (see §19)
- [x] Favorite/save a synagogue (if supported)

## 4. Prayer times & Zmanim

- [x] Prayer times screen shows today's שחרית/מנחה/ערבית times correctly for the city
- [x] Zmanim screen shows halachic times (netz, shkia, etc.) matching the city's coordinates
- [ ] Zmanim settings — changing calculation method/opinion updates displayed times <!-- note:code-reviewed%2C%20looks%20correctly%20wired%20(both%20ZmanimScreen%20and%20Home's%20useTodayZmanim%20recompute%20on%20settings%20change%2C%20calcZmanim%20genuinely%20uses%20alot%2Ftzet%20method%2Fvalue)%20-%20still%20needs%20an%20on-device%20check%20to%20confirm -->
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

- [x] Gemach list loads
- [x] Submit a new gemach listing — appears in admin's pending queue, not live immediately
- [x] Approved gemach listing appears publicly

## 10. Search

- [ ] Global search returns relevant results across synagogues/restaurants/events/etc. <!-- note:not%20relevent%20at%20the%20moment -->
- [ ] Empty query / no-results state handled gracefully

## 11. Profile & settings

- [x] Profile shows correct name, email, role badge (e.g. "מנהל על")
- [x] "מנהל על" / admin button only shows for admin-role accounts, correctly routes to the management menu
- [x] Language button shows the "coming soon" message (not a silent no-op) <!-- note:pressing%20it%20open%20popup -->
- [x] Switch city (for a real account, not guest) works and persists <!-- note:fixed%20-%20CityPicker%20(used%20here%20for%20switching%20city)%20now%20has%20real%20swipe-down-to-dismiss%20on%20the%20handle%2Fheader%2C%20which%20previously%20only%20closed%20via%20tap-outside%20despite%20the%20decorative%20handle%20bar%20implying%20swipe.%20Same%20PanResponder%20pattern%20as%20NeighborhoodPickerModal.%20Needs%20on-device%20retest%2C%20could%20not%20verify%20visually%20in%20this%20session -->
- [x] Logout works from this screen
- [ ] "!" on the פרופיל tab and a count on each ניהול row that has work waiting
- [ ] Tapping a row with a count opens the tab holding those items (עירוב → דיווחים, אירועים/גמ"חים → ממתינים לאישור)
- [ ] App-icon badge shows the same count <!-- note:set%20locally%20by%20the%20app%2C%20so%20it%20only%20updates%20while%20the%20app%20is%20open%20%E2%80%94%20it%20reflects%20what%20was%20true%20at%20the%20last%20launch%2C%20not%20live.%20A%20live%20badge%20needs%20the%20Cloud%20Function%20(see%20Known%20limitations). -->

## 12. Push notifications

<!-- note:VERIFIED%20end-to-end%202026-08-16%20on%20a%20real%20device%3A%20Expo%20ticket%20ok%2C%20getReceipts%20ok%2C%20and%20dumpsys%20notification%20showed%20the%20record%20posted%20by%20the%20app%20on%20the%20'default'%20channel%20via%20FCM.%20So%20EAS%20holds%20working%20FCM%20V1%20credentials%20%E2%80%94%20the%20legacy-FCM-shutdown%20concern%20does%20not%20apply.%20Method%20for%20re-testing%20without%20spamming%20every%20registered%20device%3A%20read%20the%20device's%20Expo%20token%20from%20Firestore%20pushTokens%2F%3CdeviceId%3E%20(deviceId%20is%20in%20AsyncStorage%20under%20kehila_device_id_v1)%2C%20POST%20that%20one%20token%20to%20exp.host%2F--%2Fapi%2Fv2%2Fpush%2Fsend%2C%20then%20POST%20the%20ticket%20id%20to%20%2F--%2Fapi%2Fv2%2Fpush%2FgetReceipts.%20A%20ticket%20of%20'ok'%20only%20means%20Expo%20QUEUED%20it%3B%20only%20the%20receipt%20proves%20FCM%20accepted%20it%2C%20and%20that%20is%20where%20InvalidCredentials%20or%20MismatchSenderId%20would%20appear. -->

For each, confirm the notification **actually arrives on a physical device with the app backgrounded or closed** — not just that Firestore gets written to:

- [x] Eruv status change → push received
- [x] Kashrut cancellation/upgrade → push received (recently fixed — retest to confirm the fix holds on a fresh `preview` build, not just the dev-client) <!-- note:the%20notification%20recived%20but%20the%20update%20not%20in%20the%20%D7%A2%D7%93%D7%9B%D7%95%D7%A0%D7%99%20%D7%9B%D7%A9%D7%A8%D7%95%D7%AA%20in%20the%20app. -->
- [ ] New event published → push received <!-- note:we%20dicussed%20it%20before.%20push%20only%20urgent -->
- [ ] Prayer-time reminder (local notification, not push) fires at the configured offset
- [ ] Tapping a notification deep-links to the right screen
- [ ] Notification permission denial handled gracefully (app doesn't crash, just no pushes)
- [ ] Uninstall/reinstall — stale push token cleaned up server-side (`DeviceNotRegistered` pruning)

## 13. Shabbat lock

- [x] Identify exactly which screens/actions lock during Shabbat (read the `useShabbatLock`/`getShabbatLock` logic if unsure) and verify each one <!-- note:fixed%20-%20mobile%20already%20locked%20everything%20correctly%20(RootNavigator%20swaps%20the%20whole%20app%20for%20ShabbatClosedScreen%2C%20useCityId()%20always%20defaults%20so%20it%20applies%20even%20without%20a%20city).%20The%20real%20gap%20was%20kehila-admin%2C%20which%20had%20no%20Shabbat%20lock%20at%20all%20-%20added%20one%20(ShabbatLockGate%2FShabbatLockScreen%2C%20wraps%20the%20whole%20app%20incl.%20%2Flogin%2C%20based%20on%20the%20admin's%20own%20computer%20clock%2Ftimezone%2C%20not%20any%20city) -->
- [x] Lock engages at the correct candle-lighting time and releases at the correct הבדלה time
- [x] Locked state is clearly communicated to the user (not just a silent failure)

## 14. Mobile admin screens (bottom-sheet "ניהול" menu)

- [x] `ManageSynagogueScreen` — create/edit/delete a synagogue <!-- note:fixed%20-%20%D7%A9%D7%9B%D7%95%D7%A0%D7%94%20field%20converted%20from%20free%20text%20to%20a%20chip-select%20dropdown%20(options%20come%20from%20City.neighborhoods%2C%20with%20inline%20add-new)%2C%20same%20pattern%20as%20the%20existing%20%D7%A0%D7%95%D7%A1%D7%97%20picker%20also%20switched%20from%20chip-pills%20to%20a%20real%20modal%20dropdown%20(NeighborhoodPickerModal%20-%20search%20%2B%20tap-to-select%20%2B%20inline%20add-new)%20per%20user%20request%3B%20fixed%20a%20bug%20where%20opening%20the%20keyboard%20(search%20autofocus)%20pushed%20the%20modal%20off-screen%20on%20Android%20-%20now%20wrapped%20in%20KeyboardAvoidingView%20with%20explicit%20height%20behavior%20instead%20of%20relying%20on%20native%20resize%20fixed%20again%20-%20keyboard-close%20left%20a%20gap%20under%20the%20sheet%20(KeyboardAvoidingView%20height%20behavior%20fighting%20edge-to-edge%20%2B%20safe-area%20padding%20on%20Android)%20-%20replaced%20with%20manual%20Keyboard%20show%2Fhide%20tracking%3B%20also%20added%20real%20swipe-down-to-dismiss%20on%20the%20handle%2Fheader%20(was%20decorative%20only%2C%20tap-outside%20was%20the%20sole%20close%20method)%20root%20cause%20found%20-%20React%20Native%20Modal%20on%20Android%20needs%20BOTH%20statusBarTranslucent%20and%20navigationBarTranslucent%20set%20when%20the%20app%20runs%20edge-to-edge%20(app.json%20has%20edgeToEdgeEnabled%3Atrue)%2C%20otherwise%20the%20modal%20window%20miscalculates%20its%20own%20bounds%20and%20leaves%20a%20gap%20at%20the%20bottom%20showing%20the%20raw%20un-tinted%20background%20through.%20Added%20navigationBarTranslucent%20(was%20missing)%20to%20NeighborhoodPickerModal%2C%20CityPicker%2C%20MainTabNavigator%20edit-sheet%2C%20BusinessDetailScreen%20cert%20viewer%2C%20FavoritePrayerModal%2C%20GuestInfoModal%20-%20the%20modals%20that%20already%20had%20statusBarTranslucent%20set.%20Manual%20Keyboard%20listener%20replacing%20KeyboardAvoidingView%20kept%20as-is.%20UPDATE%20(superseded)%3A%20all%20of%20this%20now%20lives%20in%20a%20shared%20BottomSheetModal%20component%20%E2%80%94%20swipe-to-dismiss%2C%20backdrop%20that%20fades%20with%20the%20drag%2C%20keyboard%20offset%20on%20the%20overlay%2C%20height%20cap%20on%20the%20wrapper.%2012%20sheets%20were%20migrated%20onto%20it%2C%20so%20re-test%20every%20bottom%20sheet%20in%20the%20app%20rather%20than%20just%20this%20one.%20Two%20bugs%20fixed%20along%20the%20way%3A%20the%20height%20cap%20sat%20on%20the%20sheet%20instead%20of%20the%20wrapper%20(percentage%20heights%20resolve%20against%20the%20parent%2C%20leaving%20a%20gap%20below%20the%20sheet)%2C%20and%20an%20ancestor%20Pressable%20swallowed%20drags%20so%20content%20could%20not%20be%20scrolled%20from%20non-interactive%20areas. -->
- [x] `ManageRestaurantScreen` / `ManageKosherScreen` — create/edit a restaurant, toggle certs (see §12 for the push-notification retest), publish confirmation modal shows the right changes <!-- note:fixed%20-%20removed%20the%20manager%20dropdown%20from%20the%20create%20modal%3B%20added%20a%20manager-by-email%20field%20(%D7%9E%D7%A0%D7%94%D7%9C%20%D7%94%D7%A2%D7%A1%D7%A7)%20in%20the%20cert%20editor%20instead%20-%20assigns%20managedRestaurantIds%20%2B%20bumps%20role%20to%20business_manager%2C%20same%20logic%20as%20before%2C%20just%20moved%20and%20by%20email%20instead%20of%20a%20dropdown%20Also%20fixed%20-%20the%20rabbanut%2Fbadatz%20add-to-list%20sheet%20(AddItemModal)%20now%20has%20real%20swipe-down-to-dismiss%20on%20the%20handle%2Fheader%2C%20which%20previously%20only%20closed%20via%20tap-outside%20despite%20the%20decorative%20handle%20bar%20implying%20swipe.%20Same%20PanResponder%20pattern%20as%20NeighborhoodPickerModal.%20Needs%20on-device%20retest%2C%20could%20not%20verify%20visually%20in%20this%20session -->

- [ ] `ManageMikvehScreen` — create/edit mikveh, hours <!-- note:added%20anchor-relative%20(netz%2Fshkia%2Ftzeit%2Fchatzot%2Fplag%2Fmincha)%20hours%20in%20both%20apps%2C%20mirroring%20the%20synagogue%20prayer-time%20model%20-%20resolves%20to%20actual%20times%20on%20MikvehDetailScreen%2FMikvehCard%2Fbooking%2C%20formula-only%20in%20admin.%20tzeit%20uses%20the%20existing%20tzetHakochavim%20value%20(per%20the%20users%20own%20zmanim%20settings).%20Also%20fixed%20-%20%D7%A9%D7%9B%D7%95%D7%A0%D7%94%20field%20converted%20from%20free%20text%20to%20a%20chip-select%20dropdown%20(options%20from%20City.neighborhoods%2C%20inline%20add-new)%2C%20same%20pattern%20as%20%D7%A0%D7%95%D7%A1%D7%97%2C%20then%20switched%20again%20to%20a%20real%20modal%20dropdown%20(NeighborhoodPickerModal)%20per%20user%20request%2C%20same%20fix%20as%20ManageSynagogueScreen%20(incl.%20the%20keyboard-hides-modal%20Android%20bug).%20Needs%20on-device%20retest%2C%20could%20not%20verify%20visually%20in%20this%20session -->
- [x] `ManageAppointmentsScreen` — view/manage bookings
- [x] `ManageEruvScreen` — update status, edit polygon, push fires
- [x] `ManageEventsScreen` — create/edit/delete event, approve pending gabbai submissions <!-- note:fixed!%20when%20adding%20event%20from%20a%20synaguge%2C%20the%20%D7%94%D7%95%D7%A1%D7%A3%20%D7%95%D7%A9%D7%9C%D7%97%20%D7%9C%D7%90%D7%99%D7%A9%D7%95%D7%A8%20button%20is%20behind%20the%20device%20nav%20bar -->
- [x] `ManageGemachScreen` — approve/reject pending gemach submissions
- [x] `ManageCitiesScreen` — city settings editable by the right roles only <!-- note:this%20note%20was%20misattributed%20-%20ManageCitiesScreen%20has%20no%20neighborhood%20field.%20The%20actual%20free-text%20%D7%A9%D7%9B%D7%95%D7%A0%D7%94%20fields%20were%20in%20ManageSynagogueScreen%20and%20ManageMikvehScreen%2C%20both%20now%20fixed%20-%20converted%20to%20a%20chip-select%20dropdown%20sourced%20from%20City.neighborhoods%20(with%20inline%20add-new)%2C%20same%20pattern%20as%20the%20existing%20%D7%A0%D7%95%D7%A1%D7%97%20picker%20Also%20fixed%20-%20added%20real%20swipe-down-to-dismiss%20on%20the%20handle%2Fheader%20of%20both%20bottom%20sheets%20in%20this%20screen%20(timezone%20picker%20and%20add-city%20sheet)%2C%20which%20previously%20only%20closed%20via%20tap-outside%20despite%20the%20decorative%20handle%20bar%20implying%20swipe.%20Same%20PanResponder%20pattern%20as%20NeighborhoodPickerModal.%20Needs%20on-device%20retest%2C%20could%20not%20verify%20visually%20in%20this%20session -->
- [x] `UserManagementScreen` — assign/change roles, assign managed businesses/synagogues to a `business_manager`/`gabbai`
- [ ] `ManageReportsScreen` — דיווחים על מידע שגוי: list, resolve/dismiss, "פתח לתיקון" opens the reported item (see §19)
- [ ] `ManageSynagogueScreen` — סליחות prayer type, Hebrew calendar, start-date custom (see §20)
- [x] Biometric/PIN gate — entering any management screen prompts once, doesn't re-prompt within the 5-minute window, re-prompts after it expires

## 15. Admin web dashboard (kehila-admin)

- [x] Login works, session persists on refresh <!-- note:fixed%20-%20ALLOWED_ROLES%20was%20missing%20mikveh_manager%20entirely%2C%20silently%20signing%20them%20out%20right%20after%20a%20successful%20login%3B%20also%20switched%20the%20role%20check%20to%20look%20at%20the%20full%20roles%5B%5D%20array%20(not%20just%20the%20primary%20role)%2C%20same%20pattern%20used%20everywhere%20else%20-%20a%20multi-role%20user%20whose%20primary%20role%20wasn't%20in%20the%20allowlist%20would've%20been%20blocked%20too.%20Session%20persistence%20itself%20is%20Firebase%20Auth's%20default%20(browserLocalPersistence%2C%20no%20override%20found)%20-%20should%20already%20work%2C%20needs%20on-device%2Fbrowser%20confirm -->
- [ ] `Dashboard` — key stats/overview correct
- [x] `CitiesPage` / `CitiesMapPage` — city list and map view correct
- [x] `CityDashboard` / `CitySettingsPage` — per-city overview and settings
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

## 18. Security & booking fixes — 2026-07-26 (rules deployed)

Covers the appointment-privacy mirror, the deterministic-id double-booking lock, and the pushTokens role validation. Rules are already live (`cloud.firestore` release updated), so these test the deployed behavior:

**Booking race & mirror**

- [ ] Book a slot → cancel it → rebook the **same** slot — all three succeed (exercises create + delete of the new `{date}_{HH-MM}_t{track}` mirror docs)
- [ ] Two accounts on two devices tap the same free slot near-simultaneously — exactly one booking succeeds; the loser gets the "התור הרגע נתפס" error and the grid refreshes to show the slot as taken
- [ ] Mikveh with `parallelTracks` > 1 — the same slot can be booked by a 2nd account up to capacity, blocked beyond it
- [ ] "הכנה במקווה" (multi-slot) booking — occupies all covered base slots; cancelling frees **all** of them at once
- [ ] Cancel an appointment created **before** this change (if any exist) — succeeds and frees its slot (legacy mirror-doc fallback)
- [ ] As a regular user, the booking grid shows occupied/free correctly with **no permission errors** — occupancy now comes from the non-identifying `appointmentSlots` mirror, and other users' appointment docs (with their userId) are no longer readable

**Push token validation**

- [ ] Fresh app launch signed in with a real account — no `[Push] registerPushToken failed` warning in Metro logs ~3s after load (token doc's `role`/`roles` must now match the Firestore profile exactly)
- [ ] Same check as a **guest** — token registers with `role: 'guest'` and no warning
- [ ] Change a user's role via `UserManagementScreen`, then relaunch the app on their device — token re-registers with the new role, no warning
- [ ] Admin-targeted push (`sendPushToRoles`) still reaches manager devices after the rules tightening

**Privilege boundaries (rules-level — test via a second account or the admin console)**

- [ ] A regular user editing their own profile **cannot** change `roles` (write is rejected, same as `role`)
- [ ] A `mikveh_manager` whose `homeCityId` is another city cannot view/cancel this city's mikveh appointments

---

## 19. Content reports (דיווח על מידע שגוי)

<!-- note:SERVER-SIDE%20GATE%20VERIFIED%202026-08-16%20against%20the%20deployed%20rule%2C%20by%20creating%20a%20report%20over%20the%20Firestore%20REST%20API%20as%20three%20identities%3A%20guest%2Fanonymous%20-%3E%20403%20PERMISSION_DENIED%3B%20registered%20but%20email%20unverified%20-%3E%20403%20PERMISSION_DENIED%3B%20registered%20and%20verified%20-%3E%20200%20created.%20The%20third%20case%20is%20the%20one%20that%20matters%3A%20had%20the%20email_verified%20claim%20been%20missing%20from%20the%20token%2C%20reporting%20would%20have%20broken%20for%20everyone.%20Test%20data%20was%20cleaned%20up%20(report%20deleted%2C%20both%20throwaway%20auth%20users%20deleted%2C%20follow-up%20query%20for%20entityId%3DRULE-TEST%20returns%20zero).%20STILL%20UNVERIFIED%3A%20the%20on-device%20MESSAGES.%20The%20rule%20proves%20the%20write%20is%20refused%3B%20it%20does%20not%20prove%20the%20app%20says%20'%D7%A0%D7%93%D7%A8%D7%A9%D7%AA%20%D7%94%D7%AA%D7%97%D7%91%D7%A8%D7%95%D7%AA'%20%2F%20'%D7%A0%D7%93%D7%A8%D7%A9%20%D7%90%D7%99%D7%9E%D7%95%D7%AA%20%D7%90%D7%99%D7%9E%D7%99%D7%99%D7%9C'%20rather%20than%20letting%20someone%20write%20a%20report%20and%20lose%20it%20to%20permission-denied%20on%20send. -->

- [ ] Report button appears on synagogue, mikveh, business/restaurant and gemach detail screens
- [ ] Sheet opens, reason chips select, free-text details type, keyboard doesn't cover the send button
- [ ] Sending shows a confirmation and the sheet closes
- [ ] Report shows up in ניהול → דיווחים on the phone and in the דיווחים tab of the web dashboard
- [ ] "פתח לתיקון" opens the reported item's edit screen with the right item preselected
- [ ] One back press from that edit screen returns to the reports list, not through the manager list
- [ ] Resolve / dismiss removes it from the list and from the badge counts
- [ ] Role scoping — a gabbai sees only reports on their own synagogues, a business_manager only their businesses, city_manager/super_admin see everything <!-- note:Firestore%20rules%20are%20not%20filters%20-%20a%20query%20that%20touches%20one%20unreadable%20doc%20fails%20entirely%2C%20so%20the%20client%20builds%20a%20separate%20query%20per%20managed%20item%20(capped%20at%2030%2C%20the%20'in'%20limit)%20and%20merges%20the%20results.%20A%20manager%20with%20more%20than%2030%20managed%20items%20would%20silently%20miss%20some%20-%20worth%20checking%20if%20any%20pilot%20user%20gets%20there. -->
- [ ] A guest (anonymous) account can still file a report, and it carries enough context to act on

## 20. Selichot

- [ ] Gabbai can add a סליחות time in `ManageSynagogueScreen` — fixed clock time or a zmanim anchor
- [ ] "תאריכים מסוימים" mode — the Hebrew calendar opens, multi-select works, נקה clears, and the עברי/לועזי switch pages by the right month
- [ ] Calendar is laid out RTL (Sunday on the right) and past dates are not selectable
- [ ] Start-date custom chips (מר״ח אלול / מוצ״ש שלפני ר״ה) update the "יוצג למתפללים החל מ-" line to the correct civil date <!-- note:5786%3A%20sephardi%20start%2016%2F08%20(2%20Elul%20is%20Shabbat%2C%20so%20it%20moves%20to%20Motzaei%20Shabbat)%2C%20ashkenazi%20start%2006%2F09%2C%20season%20ends%2020%2F09%20(9%20Tishrei).%20A%20shul%20that%20never%20set%20a%20custom%20defaults%20to%20the%20EARLIEST%20-%20being%20a%20week%20early%20beats%20hiding%20a%20running%20minyan. -->
- [ ] Home card appears in season, names the next night and the earliest minyan, and opens the סליחות screen
- [ ] סליחות screen — נוסח / שכונה filters and the המוקדם ↔ הקרוב sort both work
- [ ] Day strip shows one night at a time, with day name + civil date per tab; switching days keeps the filters
- [ ] Grouping — a 00:30 minyan is listed under מוצ״ש (the previous evening), a 05:15 one as that morning <!-- note:the%20boundary%20is%20%D7%A2%D7%9C%D7%95%D7%AA%20%D7%94%D7%A9%D7%97%D7%A8%20read%20from%20the%20day's%20zmanim%2C%20not%20midnight%20-%20until%20dawn%20one%20may%20still%20daven%20arvit%2C%20so%20the%20minyan%20belongs%20to%20the%20previous%20day.%20Falls%20back%20to%2004%3A00%20only%20while%20zmanim%20are%20still%20loading. -->
- [ ] Nothing listed on Shabbat, on Rosh Hashana (1–2 Tishrei), or after Erev Yom Kippur
- [ ] Synagogue detail shows a סליחות section from a week before that shul's own start date
- [ ] Out of season (post-Yom Kippur) the Home card and the screen entry disappear entirely

## 21. "בקרוב" gating (features held back from the pilot)

Flags live in `src/utils/comingSoon.ts` — flipping one to `false` releases the feature, and since it's JS-only it ships as an OTA update, no rebuild. <!-- note:the%20screens%20are%20not%20deleted%2C%20only%20unreachable%20-%20BusinessesScreen%2C%20KashrutUpdatesScreen%2C%20AppointmentBookingScreen%20and%20ZmanimSettingsScreen%20are%20all%20still%20registered%20and%20still%20typecheck.%20Re-test%20the%20full%20flows%20in%20sections%205%2C%206%20and%204%20before%20flipping%20a%20flag%20back%20on%3B%20they%20have%20not%20been%20exercised%20while%20gated. -->

- [ ] כשרות — the tab renders the בקרוב placeholder instead of the business list
- [ ] כשרות — בקרוב pill shows on the Home quick-link, the "עוד" popup and the שירותים נוספים card
- [ ] כשרות — no kashrut-updates banner on Home, and no כשרות chip or results in search
- [ ] מקווה — "קביעת תור אונליין" is dimmed with a בקרוב tag and explains the phone route when tapped; the phone "הזמנה" button still dials
- [ ] זמנים — the method badge still names the shita in use but no longer opens the settings screen; tapping explains why
- [ ] Managers can still edit kashrut / mikveh data behind the gate, so content is ready on release day

## 22. Map data & coordinates

- [ ] Picker maps (synagogue / mikveh / business / eruv) open in satellite and the לוויין ⇄ רחובות toggle works
- [ ] Once VITE_GOOGLE_MAPS_KEY is set, imagery shows הר הלבונה's buildings and the attribution reads Google <!-- note:Esri's%20capture%20over%20%D7%9E%D7%A2%D7%9C%D7%94%20%D7%90%D7%93%D7%95%D7%9E%D7%99%D7%9D%20is%202024-07-27%20(queried%20from%20Esri's%20own%20capture-date%20service)%2C%20which%20predates%20%D7%94%D7%A8%20%D7%94%D7%9C%D7%91%D7%95%D7%A0%D7%94%20-%20hence%20bare%20ground%20there.%20Google's%20Map%20Tiles%20API%20is%20used%20when%20a%20key%20is%20present%2C%20Esri%20otherwise.%20The%20undocumented%20mt1.google.com%2Fvt%20endpoint%20was%20rejected%20on%20purpose%3A%20it%20works%20and%20needs%20no%20key%2C%20but%20breaks%20Google's%20terms%20and%20can%20block%20without%20notice.%20The%20SAME%20key%20is%20needed%20by%20the%20mobile%20app%20for%20react-native-maps%20on%20Android%20release%20builds%20-%20app.json%20still%20holds%20the%20YOUR_GOOGLE_MAPS_API_KEY%20placeholder. -->
- [ ] With no key set, imagery still loads from Esri and no console warning is emitted
- [ ] A pin placed by eye on satellite saves coordinates that Waze AND Google Maps both navigate to correctly
- [ ] "אתר" on an address OSM doesn't know reports "לא נמצאה" — it must never silently save a hit in another town <!-- note:measured%20against%20live%20Nominatim%2C%202026-08%3A%20'%D7%94%D7%A8%20%D7%94%D7%9C%D7%91%D7%95%D7%A0%D7%94%2018'%20returned%20%D7%94%D7%9C%D7%95%D7%9C%D7%91%2018%20in%20%D7%92%D7%91%D7%A2%D7%AA%20%D7%96%D7%90%D7%91%2C%20~15km%20away%2C%20and%20unbounded%20it%20returned%20a%20railway%20near%20Paris.%20There%20is%20now%20a%20MAX_DISTANCE_KM%3D12%20guard%20against%20the%20city%20centre.%20Root%20cause%20is%20data%2C%20not%20query%20tuning%3A%20%D7%94%D7%A8%20%D7%94%D7%9C%D7%91%D7%95%D7%A0%D7%94%20is%20not%20in%20OSM%20at%20all%20(checked%20via%20Overpass%20across%20the%20whole%20region)%2C%20and%20'%D7%9E%D7%A2%D7%9C%D7%94%20%D7%90%D7%93%D7%95%D7%9E%D7%99%D7%9D'%20in%20Hebrew%20returns%200%20results%20from%20Nominatim%20-%20only%20the%20Latin%20'Ma'ale%20Adumim'%20resolves.%20Google's%20road%20layer%20is%20missing%20the%20street%20too%20(Waze%20has%20it).%20Coordinates%20from%20a%20satellite%20pin%20are%20the%20only%20reliable%20input%3B%20navigation%20itself%20is%20coordinate-based%20already%20so%20it%20is%20unaffected%20by%20the%20missing%20street%20names. -->
- [ ] `localStorage.geocodeDebug = '1'` in the browser console logs each candidate with its distance and keep/drop decision
- [ ] In-app picker (`MapPickerModal`, reached from any ניהול screen's location editor) opens in satellite, and the רחובות ⇄ לוויין toggle works
- [ ] In-app "אתר" finds a known address and moves the pin; an unmapped one says so and invites a map tap <!-- note:the%20app%20geocodes%20with%20expo-location%20(the%20device's%20own%20geocoder%2C%20which%20on%20Android%20is%20Google's)%2C%20NOT%20the%20Nominatim%20service%20the%20dashboard%20uses%20-%20Nominatim%20has%20no%20Hebrew%20entry%20for%20%D7%9E%D7%A2%D7%9C%D7%94%20%D7%90%D7%93%D7%95%D7%9E%D7%99%D7%9D%20and%20returned%20another%20town's%20street%20for%20'%D7%94%D7%A8%20%D7%94%D7%9C%D7%91%D7%95%D7%A0%D7%94%2018'.%20Same%2012km%20distance%20guard%20as%20the%20dashboard%2C%20so%20a%20wrong-town%20hit%20is%20dropped%20rather%20than%20saved.%20Needs%20a%20real%20device%3A%20geocodeAsync%20does%20nothing%20useful%20on%20an%20emulator%20without%20Google%20Play%20services. -->
- [ ] Adding a location for a listing in a city other than the pilot opens the map on THAT city, not on מעלה אדומים

## Known limitations (accepted for pilot, revisit post-launch)

- **Prayer/event reminders don't fire if the app was force-stopped or swiped away from Recents.** These are scheduled client-side via Android's `AlarmManager` (`expo-notifications` local scheduling). Since Android 3.1, the OS blocks a force-stopped app's alarms from firing until the user manually reopens it — and several OEMs, including Samsung, map "swipe away from Recents" to a force-stop. This is a platform-level restriction, not something app code can override; confirmed the alarm-permission and battery "sleeping apps" settings were both already correctly configured, so it isn't a config issue either. Reminders work fine as long as the app is merely backgrounded (not force-stopped), which covers most normal usage.
  - This is why eruv/kashrut alerts don't have this problem — those are genuine server-sent push notifications (Expo Push API → FCM), which run through Google Play Services' own persistent process, independent of this app's process state.
  - **Fix would require**: a server-side scheduler (Firebase Cloud Function running periodically) that checks every user's favorited minyanim/notification preferences and sends real push notifications at the right time, instead of relying on client-side local scheduling. This project currently has zero Cloud Functions — this would be new infrastructure, not a small patch. Decided to accept the limitation for the pilot and revisit if it becomes a real problem for users.

- **Non-alert events only push a broadcast to the whole city (or nothing) — no per-user targeting yet.** For the pilot, `isAlert` events push to everyone in the city; regular (non-alert) events don't push at all, which fixes the "notified for events I didn't ask for" complaint. The originally-requested richer behavior — also push regular events to users who favorited the event's synagogue, or who've opted in to an events notification preference — isn't implemented.
  - **Why not now**: favorites (`FavoritesContext.tsx`, kehila-app) are stored only in `AsyncStorage`, per-device, and are never synced to Firestore — there is currently no server/admin-queryable data source for "which users favorited synagogue X." There's also no existing "notify me about events" per-user preference (separate from the prayer `minutesBefore` settings) to check.
  - **Fix would require**: syncing favorites to Firestore (or building a reverse per-synagogue follower index), plus a new events-notification opt-in preference, plus a targeted-push query joining push tokens with that data. Decided to defer this and ship the simpler isAlert-only gating for the pilot.

- **Mikveh opening hours need to be re-entered once after the appointment-system rework.** `Mikveh.openingHours` (free text) and `appointmentConfig.schedule` were replaced by a single `hoursSchedule` (flexible day-grouped blocks, edited only on the mikveh screen now). No migration script was written — this is a pre-launch pilot, so any mikveh hours entered before this change are gone and need re-entering once in the new editor. Not a bug, just a one-time manual step.

- **Push notifications are sent client-side, straight from whichever admin's device/browser triggers them — there's no backend.** `sendPush`/`sendPushToRoles`/`sendPushToCity` all run in the kehila-app or kehila-admin client, reading `pushTokens` directly and calling Expo's Push API from there. Acceptable for the pilot's scale and trust level (only mikveh-manager/kosher-manager/etc. accounts can target pushes at all, per the Firestore rules), but it means delivery reliability depends on that admin's device staying online for the whole send loop, and it's why `pushTokens` rules can't be tightened further than "signed-in users can read their own city's roster to filter client-side for kehila-admin's UI" without breaking the send flow.
  - **Fix would require**: a Cloud Function (or other server-side job) that owns push-sending — the client would just write a "send this notification" request doc, and the function would read `pushTokens`, call Expo, and log the result. This also lets `pushTokens` reads be restricted to admin-only server-side with no client-side read requirement at all. This project currently has zero Cloud Functions — new infrastructure, not a small patch. Decided to accept for the pilot and revisit if delivery reliability becomes a real problem.
