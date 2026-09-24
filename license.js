/**
 * ZEVA CBT — OFFLINE DEVICE-LOCKED, TIME-LIMITED LICENSING
 * ============================================================
 * Zero-dependency (Node builtins only: crypto, os, fs, path) so it works
 * on any machine running the app with no internet connection and no
 * extra installs.
 *
 * HOW IT WORKS (read this before touching the SECRET below)
 * ------------------------------------------------------------
 * 1. On first run on a machine, this module reads a handful of
 *    hardware-ish identifiers (OS machine ID / disk-ish IDs, primary MAC
 *    address, hostname, platform) and hashes them into a per-device
 *    FINGERPRINT. The fingerprint is deterministic for a given machine
 *    + OS install, but changes if the app is moved to a different PC,
 *    or if the OS is reinstalled (a fresh OS install gets a new machine
 *    ID on Windows/macOS/Linux) — which is exactly the "new serial
 *    number on reinstall/transfer" behaviour that was asked for.
 *
 * 2. The fingerprint is formatted into a human-readable SERIAL NUMBER
 *    (e.g. ZEVACBT-7F3K-9QXM-2LPD-8NRT) and saved locally in a small
 *    license file. This is what gets shown to the customer and what
 *    they send to Zeus Technologies Innovations to purchase an
 *    activation code.
 *
 * 3. Every ACTIVATION CODE is sold as one of three PLANS — 30, 60, or
 *    90 days — and the plan is baked into the code itself (see the
 *    "T30-"/"T60-"/"T90-" prefix in computeActivationCode). A code is
 *    a value that only someone holding the SECRET (below) can
 *    correctly compute for a given (serial number, plan) pair.
 *    Validating a code the customer enters is just recomputing that
 *    HMAC locally and comparing — no internet connection needed, ever.
 *
 * 4. Because the activation code is mathematically tied to ONE serial
 *    number, and the serial number is tied to ONE device fingerprint,
 *    a code purchased for machine A will not activate on machine B —
 *    machine B has a different fingerprint, therefore a different
 *    serial number, therefore a different valid code.
 *
 * 5. TIME LIMIT: the instant a code is accepted, this module stamps
 *    an expiry date = activation time + the plan's day count (30/60/
 *    90), and saves it locally. Every future startup checks "is now
 *    past that stored expiry" — if so, the app is treated as
 *    unactivated again and the customer must buy and enter a new
 *    code to keep using it. This is what turns the product into a
 *    recurring purchase rather than a one-time unlock, exactly as
 *    specified. See checkLicenseStatus() and PLAN_DURATIONS_DAYS
 *    below.
 *
 *    A NOTE ON CLOCK HONESTY: expiry is checked against the OS clock,
 *    which a determined user could wind backwards to "extend" an
 *    expired code. Closing that gap needs either an online time
 *    source (defeats the offline design) or an anti-rollback trick
 *    (e.g. refusing to run if the clock is earlier than the last time
 *    the app ran, tracked in the license file). A basic version of
 *    that anti-rollback check is included below (lastSeenAt) — it
 *    isn't bulletproof against a sophisticated user, but it stops the
 *    casual "just set the date back" approach.
 *
 * ------------------------------------------------------------
 * THE SECRET — READ THIS
 * ------------------------------------------------------------
 * ZEVA_LICENSE_SECRET below is what makes this secure: anyone who has
 * it can generate valid activation codes for ANY serial number, which
 * is exactly the power that should belong only to Zeus Technologies
 * Innovations, not to end users or to whoever can open this file.
 *
 * For v1.7 (ship-now, no server) this secret ships inside the app,
 * which means a sufficiently determined person who decompiles the
 * app CAN find it and self-generate codes. This is a real, known
 * limitation of any fully-offline licensing scheme — there is no
 * offline design that doesn't have this weakness, because the
 * validating code and the generating secret both have to live
 * somewhere the app can reach without internet.
 * It still stops the overwhelming majority of casual copying (moving
 * the installer to a friend's PC, reinstalling after a refund, etc.),
 * which is what was asked for.
 *
 * When you're ready to close that gap in v2.1+, see INSTALL-GUIDE.txt
 * for how to move validation to a small online service you control,
 * without changing how customers activate the app.
 *
 * CHANGE THIS SECRET before you ship — generate your own with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 * and keep it private (never commit the real one to a public repo).
 * The same secret must be used by the generate-activation-code.js
 * script (used by Zeus Technologies Innovations staff to issue codes
 * to customers) and by every copy of the app that validates them.
 */

const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const path = require('path');

// ⚠️ CHANGE THIS before shipping — see note above.
const ZEVA_LICENSE_SECRET = 'CHANGE-ME-2a8f3e9c1b7d4f6081a2c3e4b5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718';

const PRODUCT_TAG = 'ZEVACBT';

/** The three purchasable plans and how many days each keeps the app
 * activated from the moment the code is accepted. Add a new tier here
 * (and to PLAN_PREFIXES) if you ever want a 4th option — nothing else
 * needs to change. */
const PLAN_DURATIONS_DAYS = {
  T30: 30,
  T60: 60,
  T90: 90,
};

/** Where the per-device license state is stored. This file is the
 * single source of truth for "has this app been reinstalled" — it
 * MUST be placed somewhere a normal uninstall actually deletes (e.g.
 * inside the installed app's own folder, or the OS's per-app data
 * folder that installers are configured to remove on uninstall), NOT
 * in a location that survives reinstalls (like a shared Documents
 * folder) — otherwise reinstalling would not generate a new serial
 * number as intended. See INSTALL-GUIDE.txt for the exact path used
 * by the packaged .exe. */
function getLicenseFilePath(baseDir) {
  return path.join(baseDir || __dirname, 'license.json');
}

/** Gathers a handful of OS-level identifiers that are stable for the
 * life of one OS installation on one machine, but differ between
 * machines and get reset by a fresh OS reinstall. None of these are
 * exotic — every desktop OS exposes something for at least one of
 * these three, which is why three are combined (redundancy). */
function collectDeviceIdentifiers() {
  const parts = [];

  // 1. Primary network interface MAC address (physical NIC, not virtual
  // adapters where possible) — the classic hardware identifier.
  try {
    const nets = os.networkInterfaces();
    const macs = [];
    for (const name of Object.keys(nets)) {
      for (const iface of nets[name] || []) {
        if (iface.mac && iface.mac !== '00:00:00:00:00:00' && !iface.internal) {
          macs.push(iface.mac);
        }
      }
    }
    macs.sort();
    if (macs.length) parts.push('mac:' + macs[0]);
  } catch (e) { /* ignore — fall through to other identifiers */ }

  // 2. Hostname + platform + CPU model — not unique alone, but adds
  // entropy and a bit of resilience if the MAC read fails or the
  // network adapter changes.
  try {
    parts.push('host:' + os.hostname());
    parts.push('plat:' + os.platform() + '-' + os.arch());
    const cpus = os.cpus();
    if (cpus && cpus[0]) parts.push('cpu:' + cpus[0].model);
  } catch (e) { /* ignore */ }

  // 3. OS-level machine ID where the OS exposes one. This is the
  // strongest signal: Windows' MachineGuid, Linux's /etc/machine-id,
  // and macOS's IOPlatformUUID all persist for the life of one OS
  // install and change on a fresh OS reinstall — exactly the
  // behaviour wanted ("reinstalled... serial number changed").
  try {
    const osMachineId = readOsMachineId();
    if (osMachineId) parts.push('osid:' + osMachineId);
  } catch (e) { /* ignore */ }

  return parts;
}

function readOsMachineId() {
  const platform = os.platform();
  try {
    if (platform === 'linux') {
      if (fs.existsSync('/etc/machine-id')) {
        return fs.readFileSync('/etc/machine-id', 'utf8').trim();
      }
      if (fs.existsSync('/var/lib/dbus/machine-id')) {
        return fs.readFileSync('/var/lib/dbus/machine-id', 'utf8').trim();
      }
    }
    if (platform === 'win32') {
      // Reading the registry needs a child process on Windows; this is
      // wrapped in try/catch and is non-fatal if it fails (the MAC +
      // hostname + CPU identifiers above still apply).
      const { execSync } = require('child_process');
      const out = execSync('reg query HKLM\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid', { encoding: 'utf8', windowsHide: true });
      const match = out.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]+)/);
      if (match) return match[1].trim();
    }
    if (platform === 'darwin') {
      const { execSync } = require('child_process');
      const out = execSync('ioreg -rd1 -c IOPlatformExpertDevice', { encoding: 'utf8' });
      const match = out.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
      if (match) return match[1].trim();
    }
  } catch (e) {
    return null;
  }
  return null;
}

/** Formats a hash into a human-typeable serial number:
 * ZEVA-XXXX-XXXX-XXXX-XXXX (base32-ish, excludes ambiguous chars
 * like 0/O and 1/I/L). */
function formatSerial(hashHex) {
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // no 0/O/1/I/L
  // Convert enough of the hash into base-32-ish groups.
  const bytes = Buffer.from(hashHex, 'hex');
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length && out.length < 16; i += 5) {
    const idx = parseInt(bits.slice(i, i + 5), 2) % alphabet.length;
    out += alphabet[idx];
  }
  const groups = out.match(/.{1,4}/g) || [];
  return `${PRODUCT_TAG}-${groups.join('-')}`;
}

/** Deterministically derives this device's HARDWARE fingerprint. Same
 * physical device (same OS install) => same hardware fingerprint every
 * time. Different device, or the same device after a fresh OS
 * reinstall => different hardware fingerprint. This alone is NOT the
 * serial number — see computeDeviceSerial / loadOrCreateLicense below
 * for why an install-specific value is mixed in too. */
function computeHardwareFingerprint() {
  const identifiers = collectDeviceIdentifiers();
  const material = identifiers.join('|') + '|' + PRODUCT_TAG;
  return crypto.createHash('sha256').update(material).digest('hex');
}

/** Combines the hardware fingerprint with a random per-install value
 * into the final serial number. Mixing in the install-specific value
 * is what makes uninstalling and reinstalling the app on the SAME
 * physical machine also issue a brand-new serial number — matching
 * "if it is uninstalled ... and reinstalled, the serial number
 * changed" — rather than only changing when the app moves to
 * different hardware. */
function computeDeviceSerial(installId) {
  const hardwareHash = computeHardwareFingerprint();
  const material = hardwareHash + '|' + installId;
  const hash = crypto.createHash('sha256').update(material).digest('hex');
  return formatSerial(hash);
}

/**
 * TRIAL TRACKING — deliberately separate from the per-install
 * license.json above.
 * ------------------------------------------------------------
 * The paid-activation system above is intentionally reinstall-
 * resettable (a fresh install always gets a fresh serial + a clean
 * slate) — that is a FEATURE for paid activation, forcing a genuine
 * reinstall to buy a new code rather than dodge one it already used
 * up.
 *
 * The 4-day FREE TRIAL needs the opposite property: it must NOT reset
 * on reinstall, or anyone could get an unlimited trial by
 * uninstalling and reinstalling every 4 days. So trial usage is
 * tracked by the HARDWARE fingerprint alone (computeHardwareFingerprint,
 * not computeDeviceSerial — no random per-install value mixed in),
 * and written to locations OUTSIDE the app's own install folder, so a
 * normal uninstall doesn't remove them.
 *
 * HONESTY ABOUT THE LIMITS OF THIS: nothing on a general-purpose PC
 * that a normal user's uninstaller doesn't touch is un-clearable by a
 * sufficiently determined user (they could still find and delete the
 * OS folders used below, or reinstall the OS entirely). This raises
 * the bar from "any accidental reinstall re-triggers a free trial" to
 * "you'd have to deliberately go hunting for hidden trial markers or
 * wipe the OS" — the same kind of practical-not-perfect protection
 * as the rest of this offline licensing design (see the SECRET note
 * near the top of this file for the same tradeoff applied to
 * activation codes).
 *
 * Two redundant marker locations are used so clearing one alone
 * (e.g. a user finds and deletes the OS temp copy) doesn't reset the
 * trial if the other survives:
 *   1. The OS temp directory (os.tmpdir()) — survives an app
 *      uninstall, but IS cleared by some "PC cleaner" tools or a
 *      fresh OS install.
 *   2. The OS user-data / home directory, in a dotfile-style hidden
 *      location — more durable than temp, still gone on a fresh OS
 *      install (which also changes the hardware fingerprint anyway,
 *      issuing a new trial legitimately — a genuinely different
 *      Windows/macOS/Linux installation is, for licensing purposes,
 *      treated the same as different hardware throughout this
 *      module).
 */
function getTrialMarkerPaths() {
  const fileName = '.zevacbt-trial-' + crypto.createHash('sha256').update(PRODUCT_TAG).digest('hex').slice(0, 12);
  const paths = [];
  try { paths.push(path.join(os.tmpdir(), fileName)); } catch (e) { /* ignore */ }
  try { paths.push(path.join(os.homedir(), fileName)); } catch (e) { /* ignore */ }
  return paths;
}

/** Reads the earliest trial-start timestamp found across every marker
 * location for this hardware fingerprint, or null if the trial has
 * never been started on this hardware before. Checking every location
 * and taking the EARLIEST protects against someone deleting one
 * marker and hoping a fresh one gets created — as long as any marker
 * for this hardware survives anywhere, the original start date wins. */
function readExistingTrialStart(hardwareHash) {
  let earliest = null;
  for (const p of getTrialMarkerPaths()) {
    try {
      if (!fs.existsSync(p)) continue;
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (data.hardwareHash !== hardwareHash || !data.trialStartedAt) continue;
      const started = new Date(data.trialStartedAt).getTime();
      if (!earliest || started < earliest) earliest = started;
    } catch (e) { /* corrupt or unreadable — ignore this location */ }
  }
  return earliest ? new Date(earliest).toISOString() : null;
}

/** Writes the trial-start marker to every location, so as many
 * redundant copies as possible exist. Safe to call repeatedly with
 * the same timestamp (idempotent). */
function writeTrialStartMarker(hardwareHash, trialStartedAt) {
  const payload = JSON.stringify({ hardwareHash, trialStartedAt, product: PRODUCT_TAG });
  for (const p of getTrialMarkerPaths()) {
    try { fs.writeFileSync(p, payload, 'utf8'); } catch (e) { /* non-fatal — other location may still succeed */ }
  }
}

const TRIAL_DURATION_DAYS = 4;

/** Returns this device's trial status without ever granting more than
 * one trial per physical machine (per computeHardwareFingerprint),
 * regardless of how many times the app itself has been reinstalled.
 * Call this ONLY as a fallback when there is no active paid
 * activation — see checkLicenseStatus, which does exactly that. */
function checkTrialStatus() {
  const hardwareHash = computeHardwareFingerprint();
  let trialStartedAt = readExistingTrialStart(hardwareHash);

  if (!trialStartedAt) {
    // First time this hardware has ever been seen — start the clock
    // now and persist it redundantly so a later reinstall can't get a
    // second trial.
    trialStartedAt = new Date().toISOString();
    writeTrialStartMarker(hardwareHash, trialStartedAt);
  } else {
    // Trial already started before (possibly by an earlier install
    // that has since been removed) — re-write to all locations so any
    // location that's missing (e.g. was individually deleted) gets
    // restored with the ORIGINAL start date, not a new one.
    writeTrialStartMarker(hardwareHash, trialStartedAt);
  }

  const startedMs = new Date(trialStartedAt).getTime();
  const expiresMs = startedMs + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000;
  const nowMs = Date.now();
  const daysRemaining = Math.max(0, Math.ceil((expiresMs - nowMs) / (24 * 60 * 60 * 1000)));

  return {
    trialStartedAt,
    trialExpiresAt: new Date(expiresMs).toISOString(),
    trialActive: nowMs <= expiresMs,
    trialDaysRemaining: daysRemaining,
  };
}

/** Computes the ONE valid activation code for a given (serial number,
 * plan) pair. Only code that has ZEVA_LICENSE_SECRET can call this
 * meaningfully — this is the function Zeus Technologies Innovations
 * staff run (via generate-activation-code.js) to issue a code after a
 * customer pays for a specific plan. Never expose this as something
 * the running app calls on itself to "self-activate" — it must only
 * run on the seller's side.
 *
 * The plan (T30/T60/T90) is embedded as a visible prefix on the code
 * itself (e.g. "T30-XXXX-XXXX-XXXX") rather than hidden, because the
 * customer and support staff both benefit from being able to see at a
 * glance which plan a given code is for — the security comes from the
 * HMAC needing the secret, not from hiding which tier was purchased. */
function computeActivationCode(serialNumber, plan = 'T30', secret = ZEVA_LICENSE_SECRET) {
  if (!PLAN_DURATIONS_DAYS[plan]) {
    throw new Error(`Unknown plan "${plan}". Valid plans: ${Object.keys(PLAN_DURATIONS_DAYS).join(', ')}`);
  }
  const hmac = crypto.createHmac('sha256', secret).update(`${serialNumber}|${plan}`).digest('hex');
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  const bytes = Buffer.from(hmac, 'hex');
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length && out.length < 12; i += 5) {
    const idx = parseInt(bits.slice(i, i + 5), 2) % alphabet.length;
    out += alphabet[idx];
  }
  const groups = out.match(/.{1,4}/g) || [];
  return `${plan}-${groups.join('-')}`;
}

/** Validates a customer-entered activation code against a serial
 * number, trying every known plan (the code's own "T30-"/"T60-"/
 * "T90-" prefix tells us which one it claims to be, but we recompute
 * for that specific plan rather than trusting the prefix blindly —
 * an attacker changing "T30-" to "T90-" on a real 30-day code
 * shouldn't grant 90 days). Returns the matched plan on success, or
 * null if the code is invalid for every plan. */
function validateActivationCode(serialNumber, activationCode, secret = ZEVA_LICENSE_SECRET) {
  const normalise = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const normalisedInput = normalise(activationCode);
  for (const plan of Object.keys(PLAN_DURATIONS_DAYS)) {
    const expected = computeActivationCode(serialNumber, plan, secret);
    if (normalise(expected) === normalisedInput) return plan;
  }
  return null;
}

/** Back-compat helper: true/false validity check without needing to
 * know which plan matched. Prefer validateActivationCode() where you
 * need the plan (e.g. to compute the expiry date on activation). */
function isActivationCodeValid(serialNumber, activationCode, secret = ZEVA_LICENSE_SECRET) {
  return validateActivationCode(serialNumber, activationCode, secret) !== null;
}

/** Loads (or creates, on first run OR on reinstall) this device's
 * license record.
 *
 * The "has this app been reinstalled" signal is simply: does the
 * license file still exist with an installId in it? A real uninstall
 * that removes application data (the normal, expected behaviour of an
 * uninstaller) removes this file, so the next run has no installId to
 * read and mints a fresh one — which changes the serial number even
 * on the exact same PC, exactly as specified. Moving to a different
 * PC changes the hardware fingerprint half of the serial regardless
 * of whether the license file comes along or not. */
function loadOrCreateLicense(baseDir) {
  const filePath = getLicenseFilePath(baseDir);

  let record = null;
  if (fs.existsSync(filePath)) {
    try {
      record = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      record = null; // corrupt file — treat as fresh install
    }
  }

  const needsNewInstallId = !record || !record.installId;
  const installId = needsNewInstallId ? crypto.randomBytes(16).toString('hex') : record.installId;
  const currentSerial = computeDeviceSerial(installId);

  if (needsNewInstallId || record.serialNumber !== currentSerial) {
    // Either genuinely first run, a reinstall (license file/installId
    // gone), or the hardware fingerprint changed (moved to a new
    // machine, or a fresh OS reinstall on the same box) — issue a
    // brand-new serial number and require re-activation. Any
    // previously-entered activation code is intentionally discarded
    // here: it was valid for the OLD serial number only.
    record = {
      installId,
      serialNumber: currentSerial,
      activated: false,
      activationCode: null,
      plan: null,
      activatedAt: null,
      expiresAt: null,
      lastSeenAt: null,
      firstSeenAt: new Date().toISOString(),
    };
    fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf8');
  }

  return record;
}

/** Attempts to activate this device with a customer-entered code.
 * Returns { success, message, plan, expiresAt }. Computes and stores
 * an expiry date = the moment of activation + the matched plan's day
 * count, which is what makes this a recurring (30/60/90-day) purchase
 * rather than a one-time unlock. */
function activateWithCode(activationCode, baseDir) {
  const filePath = getLicenseFilePath(baseDir);
  const record = loadOrCreateLicense(baseDir);

  const matchedPlan = validateActivationCode(record.serialNumber, activationCode);
  if (!matchedPlan) {
    return { success: false, message: 'That activation code does not match this device\'s serial number.' };
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + PLAN_DURATIONS_DAYS[matchedPlan] * 24 * 60 * 60 * 1000);

  record.activated = true;
  record.activationCode = String(activationCode).toUpperCase().trim();
  record.plan = matchedPlan;
  record.activatedAt = now.toISOString();
  record.expiresAt = expiresAt.toISOString();
  record.lastSeenAt = now.toISOString();
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf8');
  return { success: true, message: `Activated on the ${PLAN_DURATIONS_DAYS[matchedPlan]}-day plan.`, plan: matchedPlan, expiresAt: record.expiresAt };
}

/** The function the app calls on every startup (and, in server.js,
 * on every single request — see the activation gate there). Returns
 * the current license state without requiring any network access.
 *
 * Three ways this can report "not activated":
 *   1. Never activated at all (record.activated is false)
 *   2. The stored expiry date has passed (the 30/60/90-day plan ran
 *      out) — this is the recurring-purchase mechanic itself
 *   3. The system clock is EARLIER than the last time this function
 *      ran (lastSeenAt) — a basic anti-rollback guard against
 *      winding the clock back to "extend" an expired code. A small
 *      grace window (CLOCK_ROLLBACK_TOLERANCE_MS) allows for normal
 *      things like daylight-saving adjustments or NTP drift without
 *      false-triggering.
 */
const CLOCK_ROLLBACK_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes
function checkLicenseStatus(baseDir) {
  const filePath = getLicenseFilePath(baseDir);
  const record = loadOrCreateLicense(baseDir);
  const now = new Date();

  const codeStillMatches = record.activated && isActivationCodeValid(record.serialNumber, record.activationCode || '');
  const hasExpiry = !!record.expiresAt;
  const notExpired = hasExpiry && now.getTime() <= new Date(record.expiresAt).getTime();
  const lastSeen = record.lastSeenAt ? new Date(record.lastSeenAt).getTime() : 0;
  const clockLooksRolledBack = lastSeen > 0 && now.getTime() < (lastSeen - CLOCK_ROLLBACK_TOLERANCE_MS);

  const paidActive = !!(codeStillMatches && hasExpiry && notExpired && !clockLooksRolledBack);
  const paidExpired = !!(codeStillMatches && hasExpiry && !notExpired);

  // Record this check so the next run can detect a rolled-back clock.
  // Only advances lastSeenAt forward — never write a value that would
  // itself look like a rollback to a future check.
  if (!lastSeen || now.getTime() > lastSeen) {
    record.lastSeenAt = now.toISOString();
    try { fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf8'); } catch (e) { /* non-fatal */ }
  }

  // A paying, currently-active customer never needs the trial system
  // at all — skip touching the trial markers entirely in that case so
  // there's nothing to report and nothing to (re)write.
  if (paidActive) {
    return {
      serialNumber: record.serialNumber,
      activated: true,
      source: 'paid',
      plan: record.plan || null,
      activatedAt: record.activatedAt || null,
      expiresAt: record.expiresAt || null,
      daysRemaining: Math.max(0, Math.ceil((new Date(record.expiresAt).getTime() - now.getTime()) / (24 * 60 * 60 * 1000))),
      expired: false,
      clockRollbackDetected: false,
      trial: null,
    };
  }

  // No active paid plan (never activated, expired, or a rolled-back
  // clock made a real one look invalid) — fall back to trial status.
  // Trial eligibility is tracked per PHYSICAL MACHINE (hardware
  // fingerprint), independent of this reinstallable license.json, so
  // a reinstall never grants a second trial — see checkTrialStatus.
  const trial = checkTrialStatus();

  return {
    serialNumber: record.serialNumber,
    activated: trial.trialActive,
    source: trial.trialActive ? 'trial' : 'none',
    plan: null,
    activatedAt: null,
    expiresAt: null,
    daysRemaining: trial.trialActive ? trial.trialDaysRemaining : 0,
    expired: paidExpired,
    clockRollbackDetected: clockLooksRolledBack,
    trial: {
      active: trial.trialActive,
      startedAt: trial.trialStartedAt,
      expiresAt: trial.trialExpiresAt,
      daysRemaining: trial.trialDaysRemaining,
      alreadyUsed: !trial.trialActive, // trial exists but ran out — distinct from "never tried"
    },
  };
}

module.exports = {
  ZEVA_LICENSE_SECRET,
  PLAN_DURATIONS_DAYS,
  TRIAL_DURATION_DAYS,
  computeDeviceSerial,
  computeActivationCode,
  validateActivationCode,
  isActivationCodeValid,
  loadOrCreateLicense,
  activateWithCode,
  checkLicenseStatus,
  checkTrialStatus,
  getLicenseFilePath,
};

/**
 * NOTE ON STANDALONE (NO-SERVER) MODE
 * ------------------------------------------------------------
 * This licensing module is Node-only (uses os/fs/crypto with real OS
 * identifiers) and is wired into server.js, which gates every request
 * to the packaged LAN server app — the commercial product this is
 * meant to protect.
 *
 * The app also has a "standalone" fallback (index.html/admin.html
 * opened directly with no server running, using LocalDataStore /
 * browser localStorage). Browsers don't expose real hardware
 * identifiers, so any lock built there would only be tied to browser
 * storage — which "clear browsing data" resets, making ordinary
 * privacy-conscious users look like a fresh reinstall and get
 * incorrectly locked out. That trade-off isn't worth the weak
 * protection it would buy, so standalone mode is intentionally left
 * unlicensed/free. It functions as a lightweight offline demo/fallback
 * rather than the licensed product — schools running exams at scale
 * should be using the LAN server app (server/server.js), which this
 * module fully protects.
 */

