const BLOG_IMAGE_BUCKET = "blog-images";
const BLOG_IMAGE_MAX_FILE_SIZE = 5 * 1024 * 1024;
const BLOG_IMAGE_ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const MIME_EXTENSION_MAP = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function validateBlogImageFile(file) {
  if (!file) {
    throw new Error("Please upload JPG, PNG, or WEBP up to 5MB.");
  }

  if (!BLOG_IMAGE_ALLOWED_MIME_TYPES.has(String(file.type || "").toLowerCase())) {
    throw new Error("Please upload JPG, PNG, or WEBP up to 5MB.");
  }

  if (Number(file.size || 0) > BLOG_IMAGE_MAX_FILE_SIZE) {
    throw new Error("Please upload JPG, PNG, or WEBP up to 5MB.");
  }

  return file;
}

export function buildBlogImageStoragePath(postId, file) {
  const extension = MIME_EXTENSION_MAP[String(file?.type || "").toLowerCase()] || "jpg";
  const normalizedPostId = String(postId || crypto.randomUUID()).trim();
  return `posts/${normalizedPostId}/cover-${Date.now().toString(36)}.${extension}`;
}

export async function uploadBlogImage({ supabase, file, postId }) {
  validateBlogImageFile(file);

  if (!supabase) {
    throw new Error("Blog image upload is not available right now.");
  }

  const path = buildBlogImageStoragePath(postId, file);
  const bucket = supabase.storage.from(BLOG_IMAGE_BUCKET);
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
      || message.includes("permission")
      || message.includes("unauthorized")
      || message.includes("row-level security")
    ) {
      throw new Error("Blog image upload is not configured yet. Create the blog-images bucket and storage policies first.");
    }

    throw new Error("Could not upload the blog image. Please try again.");
  }

  const { data } = bucket.getPublicUrl(path);
  return {
    bucket: BLOG_IMAGE_BUCKET,
    path,
    publicUrl: data?.publicUrl ? `${data.publicUrl}?v=${Date.now()}` : "",
  };
}

export {
  BLOG_IMAGE_BUCKET,
  BLOG_IMAGE_MAX_FILE_SIZE,
};
