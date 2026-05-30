import { useMemo, useRef } from "react";
import { Camera } from "lucide-react";
import { getInitials } from "../../lib/profileAvatar.js";
import "./ProfileAvatarUploader.scss";

export function ProfileAvatar({
  avatarUrl = "",
  fallbackImageUrl = "",
  fallbackName = "",
  size = "lg",
  className = "",
}) {
  const imageUrl = String(avatarUrl || fallbackImageUrl || "").trim();
  const initials = useMemo(() => getInitials(fallbackName), [fallbackName]);

  return (
    <div className={`profile-avatar profile-avatar--${size}${className ? ` ${className}` : ""}`} aria-hidden="true">
      {imageUrl ? (
        <img src={imageUrl} alt="" className="profile-avatar__image" />
      ) : (
        <span className="profile-avatar__initials">{initials}</span>
      )}
    </div>
  );
}

export default function ProfileAvatarUploader({
  avatarUrl = "",
  fallbackName = "",
  fallbackImageUrl = "",
  size = "xl",
  editable = true,
  uploading = false,
  onFileSelected,
  error = "",
  label = "",
  actionLabel = "",
  uploadingLabel = "",
}) {
  const inputRef = useRef(null);

  const openPicker = () => {
    if (!editable || uploading) {
      return;
    }

    inputRef.current?.click();
  };

  const handleChange = (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = "";

    if (file && onFileSelected) {
      void onFileSelected(file);
    }
  };

  return (
    <div className="profile-avatar-uploader">
      {label ? <span className="profile-avatar-uploader__label">{label}</span> : null}
      <div className="profile-avatar-uploader__body">
        <button
          type="button"
          className="profile-avatar-uploader__trigger"
          onClick={openPicker}
          disabled={!editable || uploading}
          aria-label={actionLabel || label || "Change photo"}
        >
          <ProfileAvatar
            avatarUrl={avatarUrl}
            fallbackImageUrl={fallbackImageUrl}
            fallbackName={fallbackName}
            size={size}
          />
          {editable ? (
            <span className="profile-avatar-uploader__overlay" aria-hidden="true">
              <Camera size={15} />
            </span>
          ) : null}
        </button>

        {editable ? (
          <button
            type="button"
            className="btn btn-secondary profile-avatar-uploader__button"
            onClick={openPicker}
            disabled={uploading}
          >
            {uploading ? (uploadingLabel || "Uploading...") : (actionLabel || "Change photo")}
          </button>
        ) : null}
      </div>

      {error ? <p className="profile-avatar-uploader__error">{error}</p> : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        hidden
        onChange={handleChange}
      />
    </div>
  );
}
