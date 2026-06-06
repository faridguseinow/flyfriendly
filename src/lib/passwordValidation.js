export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_UPPERCASE_REGEX = /[A-Z]/;
export const PASSWORD_SPECIAL_CHAR_REGEX = /[^A-Za-z0-9]/;

export function isStandardPassword(password) {
  const value = String(password || "");
  return (
    value.length >= PASSWORD_MIN_LENGTH
    && PASSWORD_UPPERCASE_REGEX.test(value)
    && PASSWORD_SPECIAL_CHAR_REGEX.test(value)
  );
}

export function getPasswordValidationError(password, t, key = "auth.validation.passwordRequirements") {
  if (isStandardPassword(password)) {
    return "";
  }

  return t(key, {
    defaultValue: "Password must be at least 8 characters and include 1 uppercase letter and 1 special character.",
  });
}
