/**
 * add_user.js
 * Creates a Firebase Auth user (email + password) and its matching Firestore
 * "users" doc — the same pair of records the app's registerWithEmail() flow
 * creates on sign-up (see src/services/auth.ts).
 *
 * Usage:
 *   node scripts/add_user.js <email> <password> [displayName] [cityId] [role]
 *
 * Requires: scripts/serviceAccount.json
 */

const path = require('path');
const admin = require('firebase-admin');
const serviceAccount = require(path.join(__dirname, 'serviceAccount.json'));

const VALID_ROLES = [
  'user',
  'gabbai',
  'business_manager',
  'kosher_manager',
  'event_manager',
  'eruv_manager',
  'city_admin',
  'dev',
  'super_admin',
];

const [email, password, displayNameArg, cityId = 'city-1', role = 'user'] = process.argv.slice(2);

if (!email || !password) {
  console.error('Usage: node scripts/add_user.js <email> <password> [displayName] [cityId] [role]');
  process.exit(1);
}

if (password.length < 6) {
  console.error('Password must be at least 6 characters (Firebase Auth requirement).');
  process.exit(1);
}

if (!VALID_ROLES.includes(role)) {
  console.error(`Invalid role "${role}". Must be one of: ${VALID_ROLES.join(', ')}`);
  process.exit(1);
}

const displayName = displayNameArg || email.split('@')[0];

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const auth = admin.auth();
const db = admin.firestore();

(async () => {
  let user;
  try {
    user = await auth.getUserByEmail(email);
    console.error(`A user with email ${email} already exists (uid: ${user.uid}).`);
    process.exit(1);
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw err;
  }

  user = await auth.createUser({ email, password, displayName });
  console.log(`Created Auth user: ${user.uid}`);

  await db.collection('users').doc(user.uid).set({
    uid: user.uid,
    email: user.email,
    displayName,
    photoURL: null,
    cityId,
    homeCityId: cityId,
    role,
    managedSynagogueIds: [],
    managedRestaurantIds: [],
    createdAt: new Date(),
  });

  console.log(`Created Firestore users/${user.uid} doc (cityId=${cityId}, role=${role})`);
})().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
