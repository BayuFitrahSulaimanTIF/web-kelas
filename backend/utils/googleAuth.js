// ===================================================
// VERIFIKASI LOGIN GOOGLE (OIDC)
// Frontend memakai Google Identity Services dan mengirim
// ID token (JWT) yang sudah ditandatangani Google.
// Backend tinggal memverifikasi tanda tangannya lewat
// kunci publik milik Google. Client secret tidak dipakai:
// flows ini "implicit/id token" dan memang tidak rahasiakan
// apa pun ke browser.
// ===================================================

const { OAuth2Client } = require('google-auth-library');
const env = require('../config/env').env;

let client = null;

function getClient() {
  if (!env.google.clientId) return null;
  if (!client) client = new OAuth2Client(env.google.clientId);
  return client;
}

// Dipakai frontend untuk memeriksa apakah tombol ditampilkan atau tidak.
// Tidak pernah mengembalikan client secret.
function isEnabled() {
  return Boolean(env.google.clientId);
}

async function verifyIdToken(idToken) {
  const oauth = getClient();
  if (!oauth) {
    const err = new Error('GOOGLE_CLIENT_ID belum diatur');
    err.status = 503;
    throw err;
  }

  const ticket = await oauth.verifyIdToken({
    idToken,
    audience: env.google.clientId
  });

  return ticket.getPayload();
}

module.exports = { isEnabled, verifyIdToken };