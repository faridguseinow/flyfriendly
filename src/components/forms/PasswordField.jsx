import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import "./PasswordField.scss";

function joinClasses(...values) {
  return values.filter(Boolean).join(" ");
}

export default function PasswordField({
  className = "",
  inputClassName = "",
  icon: Icon = null,
  ...inputProps
}) {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const ToggleIcon = isVisible ? EyeOff : Eye;

  return (
    <div className={joinClasses("password-field", className)}>
      {Icon ? <Icon className="password-field__icon" size={18} aria-hidden="true" /> : null}
      <input
        {...inputProps}
        className={joinClasses("password-field__input", inputClassName)}
        type={isVisible ? "text" : "password"}
      />
      <button
        type="button"
        className="password-field__toggle"
        onClick={() => setIsVisible((current) => !current)}
        aria-label={isVisible
          ? t("common.hidePassword", { defaultValue: "Hide password" })
          : t("common.showPassword", { defaultValue: "Show password" })}
        title={isVisible
          ? t("common.hidePassword", { defaultValue: "Hide password" })
          : t("common.showPassword", { defaultValue: "Show password" })}
      >
        <ToggleIcon size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
