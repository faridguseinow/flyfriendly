const PROFILE_AVATAR_BUCKET = "profile-avatars";
const PROFILE_AVATAR_MAX_FILE_SIZE = 5 * 1024 * 1024;
const PROFILE_AVATAR_ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const MIME_EXTENSION_MAP = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function normalizeOwnerType(value) {
  return String(value || "").trim().toLowerCase() === "partner" ? "partners" : "clients";
}

export function getInitials(name = "") {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return "U";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

export function getProfileAvatarUrl({
  avatarUrl = "",
  partnerProfile = null,
  profile = null,
  user = null,
  preferUserMetadata = false,
} = {}) {
  const metadata = user?.user_metadata || {};
  const identityData = Array.isArray(user?.identities)
    ? user.identities
      .map((identity) => identity?.identity_data || null)
      .find((identity) => identity?.avatar_url || identity?.picture || identity?.photo_url || identity?.photoURL)
    : null;

  const automaticAvatarUrl = metadata.avatar_url
    || metadata.picture
    || metadata.photo_url
    || metadata.photoURL
    || identityData?.avatar_url
    || identityData?.picture
    || identityData?.photo_url
    || identityData?.photoURL
    || "";

  if (preferUserMetadata) {
    return avatarUrl
      || automaticAvatarUrl
      || profile?.avatar_url
      || partnerProfile?.avatar_url
      || "";
  }

  return avatarUrl
    || partnerProfile?.avatar_url
    || profile?.avatar_url
    || automaticAvatarUrl
    || "";
}

export function validateAvatarFile(file) {
  if (!file) {
    throw new Error("Please upload JPG, PNG, or WEBP up to 5MB.");
  }

  if (!PROFILE_AVATAR_ALLOWED_MIME_TYPES.has(String(file.type || "").toLowerCase())) {
    throw new Error("Please upload JPG, PNG, or WEBP up to 5MB.");
  }

  if (Number(file.size || 0) > PROFILE_AVATAR_MAX_FILE_SIZE) {
    throw new Error("Please upload JPG, PNG, or WEBP up to 5MB.");
  }

  return file;
}

export function buildAvatarStoragePath(ownerType, ownerId, file) {
  const normalizedOwnerType = normalizeOwnerType(ownerType);
  const normalizedOwnerId = String(ownerId || "").trim();

  if (!normalizedOwnerId) {
    throw new Error("Profile photo upload is not available right now.");
  }

  const extension = MIME_EXTENSION_MAP[String(file?.type || "").toLowerCase()] || "jpg";
  return `${normalizedOwnerType}/${normalizedOwnerId}/avatar.${extension}`;
}

export async function uploadProfileAvatar({
  supabase,
  file,
  ownerType,
  ownerId,
}) {
  validateAvatarFile(file);

  if (!supabase) {
    throw new Error("Profile photo upload is not available right now.");
  }

  const path = buildAvatarStoragePath(ownerType, ownerId, file);
  const bucket = supabase.storage.from(PROFILE_AVATAR_BUCKET);

  const { error: uploadError } = await bucket.upload(path, file, {
    upsert: true,
    contentType: file.type,
    cacheControl: "3600",
  });

  if (uploadError) {
    const message = String(uploadError.message || "").toLowerCase();

    if (
      message.includes("bucket")
      || message.includes("not found")
      || message.includes("policy")
      || message.includes("row-level security")
      || message.includes("permission")
      || message.includes("unauthorized")
    ) {
      throw new Error("Profile photo upload is not configured yet. Apply the latest avatar storage migration and policies.");
    }

    throw new Error("Could not upload the profile photo. Please try again.");
  }

  const { data } = bucket.getPublicUrl(path);
  return {
    bucket: PROFILE_AVATAR_BUCKET,
    path,
    publicUrl: data?.publicUrl ? `${data.publicUrl}?v=${Date.now()}` : "",
  };
}

export {
  PROFILE_AVATAR_BUCKET,
  PROFILE_AVATAR_MAX_FILE_SIZE,
};
