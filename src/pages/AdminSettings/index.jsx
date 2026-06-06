import { MonitorCog, Moon, Palette, Shield, Sun, Type, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import PasswordField from "../../components/forms/PasswordField.jsx";
import { languages } from "../../i18n/languages.js";
import { getPasswordValidationError } from "../../lib/passwordValidation.js";
import { requireSupabase } from "../../lib/supabase.js";
import { getProfileAvatarUrl, uploadProfileAvatar, validateAvatarFile } from "../../lib/profileAvatar.js";
import ProfileAvatarUploader from "../../components/profile/ProfileAvatarUploader.jsx";
import { useAdminAuth } from "../../admin/AdminAuthContext.jsx";
import { useAdminPreferences } from "../../admin/AdminPreferencesContext.jsx";
import { updateCurrentProfile, updatePassword } from "../../services/authService.js";

const ADMIN_LANGUAGE_CODES = new Set(["en", "ru", "az"]);

const textScaleOptions = [
  { value: "compact", labelKey: "admin.preferences.textScaleOptions.compact" },
  { value: "default", labelKey: "admin.preferences.textScaleOptions.default" },
  { value: "large", labelKey: "admin.preferences.textScaleOptions.large" },
];

export default function AdminSettings() {
  const { t } = useTranslation();
  const { profile, user, refreshAuth } = useAdminAuth();
  const { preferences, resolvedTheme, setPreference, resetPreferences } = useAdminPreferences();
  const [profileDraft, setProfileDraft] = useState({ fullName: "", avatar_url: "" });
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");
  const [avatarError, setAvatarError] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [passwordDraft, setPasswordDraft] = useState({ password: "", confirmPassword: "" });
  const [passwordError, setPasswordError] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  useEffect(() => {
    setProfileDraft({
      fullName: profile?.full_name || "",
      avatar_url: profile?.avatar_url || "",
    });
  }, [profile?.avatar_url, profile?.full_name]);

  useEffect(() => () => {
    if (avatarPreviewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(avatarPreviewUrl);
    }
  }, [avatarPreviewUrl]);

  const currentAvatarUrl = getProfileAvatarUrl({
    avatarUrl: avatarPreviewUrl || profileDraft.avatar_url,
    profile,
    user,
  });

  const adminLanguages = useMemo(
    () => languages.filter((language) => ADMIN_LANGUAGE_CODES.has(language.code)),
    [],
  );
  const themeOptions = useMemo(() => ([
    { value: "light", label: t("admin.preferences.themeOptions.light"), icon: Sun },
    { value: "dark", label: t("admin.preferences.themeOptions.dark"), icon: Moon },
    { value: "system", label: t("admin.preferences.themeOptions.system"), icon: MonitorCog },
  ]), [t]);
  const selectedLanguage = useMemo(
    () => adminLanguages.find((language) => language.code === preferences.language) || adminLanguages.find((language) => language.code === "en"),
    [adminLanguages, preferences.language],
  );

  const selectAvatarFile = async (file) => {
    setAvatarError("");
    setProfileError("");
    setProfileMessage("");

    try {
      validateAvatarFile(file);
      setAvatarFile(file);
      setAvatarPreviewUrl((current) => {
        if (current.startsWith("blob:")) {
          URL.revokeObjectURL(current);
        }
        return URL.createObjectURL(file);
      });
    } catch (error) {
      setAvatarError(error.message || t("profileAvatar.validation"));
    }
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setProfileError("");
    setProfileMessage("");
    setAvatarError("");
    setIsSavingProfile(true);

    try {
      let nextAvatarUrl = profileDraft.avatar_url || "";

      if (avatarFile) {
        const uploaded = await uploadProfileAvatar({
          supabase: requireSupabase(),
          file: avatarFile,
          ownerType: "client",
          ownerId: profile?.id || user?.id,
        });
        nextAvatarUrl = uploaded.publicUrl;
      }

      await updateCurrentProfile({
        full_name: profileDraft.fullName,
        avatar_url: nextAvatarUrl,
      });

      await refreshAuth();
      setProfileDraft((current) => ({ ...current, avatar_url: nextAvatarUrl }));
      setAvatarFile(null);
      setAvatarPreviewUrl((current) => {
        if (current.startsWith("blob:")) {
          URL.revokeObjectURL(current);
        }
        return "";
      });
      setProfileMessage(t("admin.preferences.profileUpdated"));
    } catch (error) {
      setProfileError(error.message || t("admin.preferences.profileSaveError"));
    } finally {
      setIsSavingProfile(false);
    }
  };

  const savePassword = async (event) => {
    event.preventDefault();
    setPasswordError("");
    setPasswordMessage("");

    const passwordValidationError = getPasswordValidationError(passwordDraft.password, t, "admin.preferences.passwordRequirements");
    if (passwordValidationError) {
      setPasswordError(passwordValidationError);
      return;
    }

    if (passwordDraft.password !== passwordDraft.confirmPassword) {
      setPasswordError(t("admin.preferences.passwordsMismatch"));
      return;
    }

    setIsSavingPassword(true);
    try {
      await updatePassword(passwordDraft.password);
      setPasswordDraft({ password: "", confirmPassword: "" });
      setPasswordMessage(t("admin.preferences.passwordUpdated"));
    } catch (error) {
      setPasswordError(error.message || t("admin.preferences.passwordSaveError"));
    } finally {
      setIsSavingPassword(false);
    }
  };

  return (
    <div className="admin-page admin-preferences-page">
      <div className="admin-page-header">
        <div className="admin-page-header__content">
          <h1>{t("admin.preferences.title")}</h1>
          <p>{t("admin.preferences.description")}</p>
        </div>
      </div>

      <div className="admin-preferences-page__grid">
        <section className="admin-card admin-preferences-card">
          <header className="admin-preferences-card__head">
            <div className="admin-preferences-card__icon"><Palette size={18} /></div>
            <div>
              <h2>{t("admin.preferences.workspaceTitle")}</h2>
              <p>{t("admin.preferences.workspaceDescription")}</p>
            </div>
          </header>

          <div className="admin-preferences-card__section">
            <label>{t("admin.preferences.theme")}</label>
            <div className="admin-preferences-card__choices">
              {themeOptions.map((option) => {
                const Icon = option.icon;
                const isActive = preferences.theme === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`admin-preferences-chip${isActive ? " is-active" : ""}`}
                    onClick={() => setPreference("theme", option.value)}
                  >
                    <Icon size={15} />
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
            <small>{t("admin.preferences.currentAppliedTheme", { theme: t(`admin.preferences.themeOptions.${resolvedTheme}`) })}</small>
          </div>

          <div className="admin-preferences-card__section">
            <label>{t("admin.preferences.adminLanguage")}</label>
            <select
              className="admin-select"
              value={preferences.language}
              onChange={(event) => setPreference("language", event.target.value)}
            >
              {adminLanguages.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.label} - {language.nativeLabel}
                </option>
              ))}
            </select>
            <small>{t("admin.preferences.currentLanguage", { language: selectedLanguage?.label || "English" })}</small>
          </div>

          <div className="admin-preferences-card__section">
            <label>{t("admin.preferences.textScale")}</label>
            <div className="admin-preferences-card__choices">
              {textScaleOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`admin-preferences-chip${preferences.textScale === option.value ? " is-active" : ""}`}
                  onClick={() => setPreference("textScale", option.value)}
                >
                  <Type size={15} />
                  <span>{t(option.labelKey)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="admin-preferences-card__actions">
            <button type="button" className="btn btn--ghost" onClick={resetPreferences}>{t("admin.preferences.resetPreferences")}</button>
          </div>
        </section>

        <section className="admin-card admin-preferences-card">
          <header className="admin-preferences-card__head">
            <div className="admin-preferences-card__icon"><UserRound size={18} /></div>
            <div>
              <h2>{t("admin.preferences.profileTitle")}</h2>
              <p>{t("admin.preferences.profileDescription")}</p>
            </div>
          </header>

          <form className="admin-preferences-form" onSubmit={saveProfile}>
            <ProfileAvatarUploader
              avatarUrl={currentAvatarUrl}
              fallbackName={profileDraft.fullName || profile?.email || "Admin"}
              size="xl"
              editable
              uploading={isSavingProfile}
              onFileSelected={selectAvatarFile}
              error={avatarError}
              label={t("admin.preferences.profilePhoto")}
              actionLabel={t("admin.preferences.changeProfilePhoto")}
            />

            <div className="admin-preferences-form__grid">
              <label className="admin-preferences-field">
                <span>{t("admin.preferences.fullName")}</span>
                <input
                  className="admin-input"
                  value={profileDraft.fullName}
                  onChange={(event) => setProfileDraft((current) => ({ ...current, fullName: event.target.value }))}
                  placeholder={t("admin.preferences.adminNamePlaceholder")}
                />
              </label>

              <label className="admin-preferences-field">
                <span>{t("admin.common.email")}</span>
                <input className="admin-input" value={profile?.email || ""} readOnly />
              </label>
            </div>

            {profileError ? <p className="admin-message is-error">{profileError}</p> : null}
            {profileMessage ? <p className="admin-message">{profileMessage}</p> : null}

            <div className="admin-preferences-card__actions">
              <button type="submit" className="btn btn--primary" disabled={isSavingProfile}>
                {isSavingProfile ? t("admin.common.saving") : t("admin.preferences.saveProfile")}
              </button>
            </div>
          </form>
        </section>

        <section className="admin-card admin-preferences-card">
          <header className="admin-preferences-card__head">
            <div className="admin-preferences-card__icon"><Shield size={18} /></div>
            <div>
              <h2>{t("admin.preferences.securityTitle")}</h2>
              <p>{t("admin.preferences.securityDescription")}</p>
            </div>
          </header>

          <form className="admin-preferences-form" onSubmit={savePassword}>
            <div className="admin-preferences-form__grid">
              <label className="admin-preferences-field">
                <span>{t("admin.preferences.newPassword")}</span>
                <PasswordField
                  className="admin-input"
                  value={passwordDraft.password}
                  onChange={(event) => setPasswordDraft((current) => ({ ...current, password: event.target.value }))}
                  placeholder={t("admin.preferences.passwordPlaceholder")}
                  autoComplete="new-password"
                />
              </label>
              <p className="admin-field-hint">
                {t("admin.preferences.passwordRequirements", {
                  defaultValue: "Password must be at least 8 characters and include 1 uppercase letter and 1 special character.",
                })}
              </p>

              <label className="admin-preferences-field">
                <span>{t("admin.preferences.confirmPassword")}</span>
                <PasswordField
                  className="admin-input"
                  value={passwordDraft.confirmPassword}
                  onChange={(event) => setPasswordDraft((current) => ({ ...current, confirmPassword: event.target.value }))}
                  placeholder={t("admin.preferences.confirmPasswordPlaceholder")}
                  autoComplete="new-password"
                />
              </label>
            </div>

            {passwordError ? <p className="admin-message is-error">{passwordError}</p> : null}
            {passwordMessage ? <p className="admin-message">{passwordMessage}</p> : null}

            <div className="admin-preferences-card__actions">
              <button type="submit" className="btn btn--primary" disabled={isSavingPassword}>
                {isSavingPassword ? t("admin.common.updating") : t("admin.preferences.updatePassword")}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
