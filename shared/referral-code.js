const DEFAULT_REFERRAL_CODE_LENGTH = 8;
const REFERRAL_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function getCrypto() {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.getRandomValues) {
    return globalThis.crypto;
  }

  return null;
}

function randomIndex(max) {
  const crypto = getCrypto();
  if (crypto) {
    const bytes = new Uint8Array(1);
    crypto.getRandomValues(bytes);
    return bytes[0] % max;
  }

  return Math.floor(Math.random() * max);
}

export function generateRandomReferralCode(length = DEFAULT_REFERRAL_CODE_LENGTH) {
  const size = DEFAULT_REFERRAL_CODE_LENGTH;

  let code = "";
  for (let index = 0; index < size; index += 1) {
    code += REFERRAL_CODE_ALPHABET[randomIndex(REFERRAL_CODE_ALPHABET.length)];
  }

  return code;
}

export function buildReferralPath(referralCode = "") {
  const code = String(referralCode || "").trim();
  return code ? `/r/${code}` : "";
}

export function buildReferralUrl(siteUrl = "", referralCode = "") {
  const path = buildReferralPath(referralCode);
  const base = String(siteUrl || "").trim().replace(/\/$/, "");
  if (!path) {
    return "";
  }

  return base ? `${base}${path}` : path;
}
