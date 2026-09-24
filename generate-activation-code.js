#!/usr/bin/env node
/**
 * ZEUS TECHNOLOGIES INNOVATIONS — INTERNAL USE ONLY
 * ============================================================
 * Run this on YOUR OWN computer to generate an activation code after a
 * customer pays and sends you their device's Serial Number.
 *
 * NEVER ship this file, or the ZEVA_LICENSE_SECRET it depends on
 * (in license.js / mobile-app/licensing/mobile-license.js), inside
 * anything you give to customers. Keep this script and the secret on
 * your own machine only.
 *
 * USAGE — PC SERVER (recurring 30/60/90-day plans):
 *   node generate-activation-code.js <SERIAL-NUMBER> <PLAN>
 *   PLAN is one of: 30, 60, 90 (days). Defaults to 30 if omitted.
 *   Serial format: ZEVACBT-XXXX-XXXX-XXXX-XXXX
 *
 *   Examples:
 *     node generate-activation-code.js ZEVACBT-7F3K-9QXM-2LPD-8NRT 30
 *     node generate-activation-code.js ZEVACBT-7F3K-9QXM-2LPD-8NRT 90
 *
 * USAGE — MOBILE APP (one-time purchase, no expiry):
 *   node generate-activation-code.js <SERIAL-NUMBER> --mobile
 *   Serial format: ZEVAMOB-XXXX-XXXX-XXXX-XXXX (note the different
 *   prefix — mobile and PC serials are never interchangeable, so it's
 *   easy to tell at a glance which kind of code to generate).
 *
 *   Example:
 *     node generate-activation-code.js ZEVAMOB-QR2G-T227-J74P-2ENZ --mobile
 *
 * Prints the activation code to give the customer. That's the whole
 * transaction — no internet connection or server needed on either
 * side. IMPORTANT: the secret used here (ZEVA_LICENSE_SECRET in
 * license.js) MUST be kept byte-for-byte identical to the one in
 * mobile-app/licensing/mobile-license.js, or mobile codes generated
 * here won't validate in the app. Change both together, always.
 */

const crypto = require('crypto');
const { computeActivationCode, PLAN_DURATIONS_DAYS, ZEVA_LICENSE_SECRET } = require('./license.js');

const args = process.argv.slice(2);
const isMobile = args.includes('--mobile');
const serial = args.find((a) => !a.startsWith('--'));

if (!serial) {
  console.log('');
  console.log('Usage (PC server, recurring plan):');
  console.log('  node generate-activation-code.js <SERIAL-NUMBER> [PLAN_DAYS]');
  console.log('  PLAN_DAYS: 30, 60, or 90 (defaults to 30)');
  console.log('');
  console.log('Usage (mobile app, one-time purchase):');
  console.log('  node generate-activation-code.js <SERIAL-NUMBER> --mobile');
  console.log('');
  console.log('Examples:');
  console.log('  node generate-activation-code.js ZEVACBT-7F3K-9QXM-2LPD-8NRT 30');
  console.log('  node generate-activation-code.js ZEVACBT-7F3K-9QXM-2LPD-8NRT 90');
  console.log('  node generate-activation-code.js ZEVAMOB-QR2G-T227-J74P-2ENZ --mobile');
  console.log('');
  process.exit(1);
}

const serialUpper = serial.trim().toUpperCase();

if (isMobile) {
  // Must byte-for-byte match mobile-app/licensing/mobile-license.js's
  // computeActivationCode() — same secret, same message format, same
  // alphabet/grouping. If you ever change one, change both together
  // and re-verify with a real device before shipping.
  const hmac = crypto.createHmac('sha256', ZEVA_LICENSE_SECRET).update(`${serialUpper}|MOBILE-ONETIME`).digest('hex');
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  const bytes = Buffer.from(hmac, 'hex');
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length && out.length < 12; i += 5) {
    out += alphabet[parseInt(bits.slice(i, i + 5), 2) % alphabet.length];
  }
  const code = (out.match(/.{1,4}/g) || []).join('-');

  console.log('');
  console.log('Platform:          Mobile app (one-time purchase)');
  console.log('Serial Number:    ', serialUpper);
  console.log('Activation Code:  ', code);
  console.log('');
  console.log('Give this activation code to the customer. It will only work on the');
  console.log('phone that produced this exact serial number, permanently (no expiry).');
  console.log('It will keep working across uninstall/reinstall on that SAME phone, but');
  console.log('will not work if copied to any other phone.');
  console.log('');
  process.exit(0);
}

const planArg = (args.find((a) => /^\d+$/.test(a)) || '30');
const plan = `T${planArg}`;

if (!PLAN_DURATIONS_DAYS[plan]) {
  console.log('');
  console.log(`Unknown plan "${planArg}". Valid options: 30, 60, 90.`);
  console.log('');
  process.exit(1);
}

const code = computeActivationCode(serialUpper, plan);

console.log('');
console.log('Platform:          PC server');
console.log('Serial Number:    ', serialUpper);
console.log('Plan:             ', `${PLAN_DURATIONS_DAYS[plan]} days`);
console.log('Activation Code:  ', code);
console.log('');
console.log('Give this activation code to the customer. It will only work on the');
console.log(`device that produced this exact serial number, and will keep the app`);
console.log(`working for ${PLAN_DURATIONS_DAYS[plan]} days from the moment they enter it.`);
console.log('');
