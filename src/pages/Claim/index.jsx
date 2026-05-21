import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Trans, useTranslation } from "react-i18next";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  FileText,
  Info,
  Mail,
  MapPin,
  Phone,
  Plane,
  PlaneLanding,
  PlaneTakeoff,
  Search,
  ShieldCheck,
  User,
  X,
} from "lucide-react";
import logoImage from "../../assets/icons/logo-image.svg";
import logoText from "../../assets/icons/fly-friendly.svg";
import claimImage from "../../assets/media/Image-4.png";
import CountryFlag from "../../components/CountryFlag/index.jsx";
import { LocalizedLink } from "../../components/LocalizedLink.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import { getLanguageByCode } from "../../i18n/languages.js";
import { useLocalizedPath } from "../../i18n/useLocalizedPath.js";
import { isSupabaseConfigured } from "../../lib/supabase.js";
import {
  describeAirlineOption,
  describeAirportOption,
  searchAirlines,
  searchAirports,
} from "../../services/catalogService.js";
import {
  createLead,
  saveLeadDocuments,
  saveLeadStep,
  submitClaimServerSide,
  submitLead,
} from "../../services/leadService.js";
import "./style.scss";

const stages = ["eligibility", "contact", "documents", "finish"];
const emailPattern = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const languageToLocale = {
  az: "az-AZ",
  ru: "ru-RU",
  en: "en-GB",
  es: "es-ES",
  fr: "fr-FR",
  pt: "pt-PT",
  de: "de-DE",
  it: "it-IT",
  tr: "tr-TR",
  ka: "ka-GE",
  uk: "uk-UA",
  pl: "pl-PL",
};
const CLAIM_DRAFT_STORAGE_KEY = "flyFriendlyClaim";
const CLAIM_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const PHONE_COUNTRY_OPTIONS = [
  { code: "az", iso: "AZ", label: "Azerbaijan", nativeLabel: "Azərbaycan", dialCode: "+994", localLength: 9, placeholder: "50 123 45 67" },
  { code: "ru", iso: "RU", label: "Russia", nativeLabel: "Россия", dialCode: "+7", localLength: 10, placeholder: "912 345 67 89" },
  { code: "tr", iso: "TR", label: "Turkey", nativeLabel: "Türkiye", dialCode: "+90", localLength: 10, placeholder: "532 123 45 67" },
  { code: "ge", iso: "GE", label: "Georgia", nativeLabel: "საქართველო", dialCode: "+995", localLength: 9, placeholder: "555 12 34 56" },
  { code: "ua", iso: "UA", label: "Ukraine", nativeLabel: "Україна", dialCode: "+380", localLength: 9, placeholder: "50 123 45 67" },
  { code: "gb", iso: "GB", label: "United Kingdom", nativeLabel: "United Kingdom", dialCode: "+44", minLength: 9, maxLength: 10, placeholder: "7400 123456" },
  { code: "de", iso: "DE", label: "Germany", nativeLabel: "Deutschland", dialCode: "+49", minLength: 10, maxLength: 11, placeholder: "1512 3456789" },
  { code: "pl", iso: "PL", label: "Poland", nativeLabel: "Polska", dialCode: "+48", localLength: 9, placeholder: "512 345 678" },
  { code: "it", iso: "IT", label: "Italy", nativeLabel: "Italia", dialCode: "+39", localLength: 10, placeholder: "312 345 6789" },
  { code: "es", iso: "ES", label: "Spain", nativeLabel: "España", dialCode: "+34", localLength: 9, placeholder: "612 34 56 78" },
  { code: "fr", iso: "FR", label: "France", nativeLabel: "France", dialCode: "+33", localLength: 9, placeholder: "6 12 34 56 78" },
  { code: "pt", iso: "PT", label: "Portugal", nativeLabel: "Portugal", dialCode: "+351", localLength: 9, placeholder: "912 345 678" },
  { code: "us", iso: "US", label: "United States", nativeLabel: "United States", dialCode: "+1", localLength: 10, placeholder: "202 555 0186" },
];

function getPhoneCountryOption(countryCode) {
  return PHONE_COUNTRY_OPTIONS.find((option) => option.code === countryCode) || PHONE_COUNTRY_OPTIONS[0];
}

function normalizeDialCode(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 4);
  return digits ? `+${digits}` : "";
}

function phoneDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function splitByPattern(digits, pattern) {
  const parts = [];
  let offset = 0;

  pattern.forEach((size) => {
    if (offset >= digits.length) {
      return;
    }

    const chunk = digits.slice(offset, offset + size);
    if (chunk) {
      parts.push(chunk);
    }
    offset += size;
  });

  if (offset < digits.length) {
    parts.push(digits.slice(offset));
  }

  return parts.filter(Boolean);
}

function formatLocalPhoneNumber(rawValue, countryCode) {
  const digits = phoneDigits(rawValue);
  const option = getPhoneCountryOption(countryCode);

  let pattern = [3, 3, 2, 2];
  if (option.code === "az" || option.code === "ua") pattern = [2, 3, 2, 2];
  if (option.code === "ru" || option.code === "tr") pattern = [3, 3, 2, 2];
  if (option.code === "ge") pattern = [3, 2, 2, 2];
  if (option.code === "fr") pattern = [1, 2, 2, 2, 2];
  if (option.code === "gb") pattern = [4, 3, 3];

  return splitByPattern(digits, pattern).join(" ");
}

function buildFullPhoneNumber(dialCode, localNumber) {
  const normalizedDialCode = normalizeDialCode(dialCode);
  const localDigits = phoneDigits(localNumber);

  return normalizedDialCode && localDigits ? `${normalizedDialCode}${localDigits}` : normalizedDialCode || localDigits;
}

function parseStoredPhone(phone, phoneCountry = "", phoneDialCode = "", phoneLocalNumber = "") {
  if (phoneCountry || phoneDialCode || phoneLocalNumber) {
    const composed = String(phone || buildFullPhoneNumber(phoneDialCode, phoneLocalNumber) || phoneLocalNumber || "").trim();
    return {
      phoneCountry: phoneCountry || "az",
      phoneDialCode: normalizeDialCode(phoneDialCode) || "",
      phoneLocalNumber: composed,
      phone: composed,
    };
  }

  const raw = String(phone || "").trim();
  if (!raw) {
    return {
      phoneCountry: "az",
      phoneDialCode: "",
      phoneLocalNumber: "",
      phone: "",
    };
  }

  return {
    phoneCountry: "az",
    phoneDialCode: "",
    phoneLocalNumber: raw,
    phone: raw,
  };
}

function getPhoneError(data, t) {
  const phone = String(data.phone || data.phoneLocalNumber || "").trim();
  const normalized = phone.replace(/[^\d+()\-\s]/g, "");
  const digits = phoneDigits(normalized);

  if (!digits) {
    return t("claim.contact.phoneInvalid", { defaultValue: "Please enter a valid phone number." });
  }

  if (digits.length < 7 || digits.length > 15) {
    return t("claim.contact.phoneInvalid", { defaultValue: "Please enter a valid phone number." });
  }

  if (normalized.startsWith("+") && !/^\+[\d()\-\s]+$/.test(normalized)) {
    return t("claim.contact.phoneInvalid", { defaultValue: "Please enter a valid phone number." });
  }

  return "";
}

function normalizeAirportValue(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function hasSameAirportSelection(data) {
  const departureId = String(data?.departureAirportId || "").trim();
  const destinationId = String(data?.destinationAirportId || "").trim();

  if (departureId && destinationId) {
    return departureId === destinationId;
  }

  const departureValue = normalizeAirportValue(data?.departure);
  const destinationValue = normalizeAirportValue(data?.destination);
  return Boolean(departureValue && destinationValue && departureValue === destinationValue);
}

function clearStoredClaimDraft() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(CLAIM_DRAFT_STORAGE_KEY);
  } catch {
    // Ignore storage access errors in restrictive browsing modes.
  }
}

function readStoredClaimDraft() {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(CLAIM_DRAFT_STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    const storedAt = Date.parse(parsed?.storedAt || "");

    if (!storedAt || (Date.now() - storedAt) > CLAIM_DRAFT_TTL_MS) {
      clearStoredClaimDraft();
      return {};
    }

    return {
      currentStep: parsed?.currentStep || "eligibility",
      departure: parsed?.departure || "",
      destination: parsed?.destination || "",
      departureAirportId: parsed?.departureAirportId || null,
      departureAirportSource: parsed?.departureAirportSource || null,
      destinationAirportId: parsed?.destinationAirportId || null,
      destinationAirportSource: parsed?.destinationAirportSource || null,
      airline: parsed?.airline || "",
      airlineId: parsed?.airlineId || null,
      airlineSource: parsed?.airlineSource || null,
      date: parsed?.date || "",
    delayDuration: parsed?.delayDuration || "",
    direct: parsed?.direct || "",
    connectionCity: parsed?.connectionCity || "",
    preferredLanguage: parsed?.preferredLanguage || null,
  };
  } catch {
    clearStoredClaimDraft();
    return {};
  }
}

function buildStoredClaimDraft(data, stage, currentLanguageCode) {
  // Only keep non-sensitive flight progress in localStorage.
  // Personal/contact data, signature, consent, and uploaded files must stay in memory only.
  return {
    storedAt: new Date().toISOString(),
    currentStep: stage,
    departure: data.departure || "",
    destination: data.destination || "",
    departureAirportId: data.departureAirportId || null,
    departureAirportSource: data.departureAirportSource || null,
    destinationAirportId: data.destinationAirportId || null,
    destinationAirportSource: data.destinationAirportSource || null,
    airline: data.airline || "",
    airlineId: data.airlineId || null,
    airlineSource: data.airlineSource || null,
    date: data.date || "",
    delayDuration: data.delayDuration || "",
    direct: data.direct || "",
    connectionCity: data.connectionCity || "",
    preferredLanguage: data.preferredLanguage || currentLanguageCode || null,
  };
}

function hasStoredClaimDraftContent(draft) {
  return Boolean(
    draft.departure
      || draft.destination
      || draft.departureAirportId
      || draft.destinationAirportId
      || draft.airline
      || draft.airlineId
      || draft.date
      || draft.delayDuration
      || draft.direct
      || draft.connectionCity,
  );
}

function getEmailError(value, t) {
  const email = String(value || "").trim();
  if (!email || !emailPattern.test(email)) {
    return t("claim.emailError");
  }

  return "";
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 KB";
  }

  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  const megabytes = bytes / (1024 * 1024);
  return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB`;
}

function getLocale(language) {
  return languageToLocale[language] || "en-GB";
}

function parseDateInputValue(value) {
  if (!value) return null;

  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return null;

  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime())
    || date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function formatDateInputValue(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function buildCalendarDays(viewDate) {
  const monthStart = getMonthStart(viewDate);
  const startDay = (monthStart.getDay() + 6) % 7;
  const calendarStart = new Date(monthStart);
  calendarStart.setDate(monthStart.getDate() - startDay);

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(calendarStart);
    day.setDate(calendarStart.getDate() + index);
    return day;
  });
}

function ClaimHeader() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const currentLanguage = getLanguageByCode(lang);

  return (
    <header className="claim-header">
      <LocalizedLink to="/" className="claim-brand" aria-label={t("common.flyFriendlyHomeAria")}>
        <img src={logoImage} alt="" />
        <img src={logoText} alt="Fly Friendly" />
      </LocalizedLink>
      <span className="claim-lang"><CountryFlag code={currentLanguage.countryCode} label={currentLanguage.label} className="claim-flag" /> {currentLanguage.code.toUpperCase()}</span>
    </header>
  );
}

function ClaimFooter() {
  const { t } = useTranslation();

  return (
    <footer className="claim-footer">
      <nav>
        <LocalizedLink to="/contact">{t("common.contact")}</LocalizedLink>
        <LocalizedLink to="/about">{t("common.aboutUs")}</LocalizedLink>
        <LocalizedLink to="/privacyPolicy">{t("common.privacy")}</LocalizedLink>
        <LocalizedLink to="/terms">{t("common.termsAndConditions")}</LocalizedLink>
      </nav>
      <span>©2026 Fly Friendly</span>
    </footer>
  );
}

function Stepper({ activeIndex, completed = false }) {
  const { t } = useTranslation();
  const stageLabels = t("claim.stages", { returnObjects: true });

  return (
    <div className="claim-stepper" aria-label={t("claim.heroTitle")}>
      {stageLabels.map((label, index) => {
        const isActive = index === activeIndex;
        const isDone = completed || index < activeIndex;
        return (
          <div className={`claim-step${isActive ? " is-active" : ""}${isDone ? " is-done" : ""}`} key={label}>
            <span>{isDone ? <Check size={14} strokeWidth={2.4} /> : index + 1}</span>
            <small>{label}</small>
          </div>
        );
      })}
    </div>
  );
}

function Field({
  icon: Icon,
  placeholder,
  type = "text",
  name,
  value,
  onChange,
  list,
  required = false,
  onBlur,
  error = "",
}) {
  return (
    <label className={`claim-field${error ? " is-error" : ""}`}>
      <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
      <input
        name={name}
        value={value || ""}
        onChange={onChange}
        onBlur={onBlur}
        readOnly={!onChange}
        type={type}
        placeholder={placeholder}
        list={list}
        required={required}
        aria-invalid={Boolean(error)}
      />
    </label>
  );
}

function PhoneField({ data, onChange, error = "", t }) {
  return (
    <label className={`claim-phone-field claim-phone-field--plain${error ? " is-error" : ""}`}>
        <Phone size={18} strokeWidth={1.8} aria-hidden="true" />
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          value={data.phone || ""}
          onChange={(event) => onChange("phone", event.target.value)}
          placeholder={t("claim.contact.phonePlaceholder")}
          aria-invalid={Boolean(error)}
          aria-label={t("claim.contact.phone")}
        />
    </label>
  );
}

function DatePickerField({ icon: Icon, name, value, onChange }) {
  const { lang } = useParams();
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const { t, i18n } = useTranslation();
  const locale = getLocale(getLanguageByCode(lang || i18n.resolvedLanguage || i18n.language).code);
  const selectedDate = parseDateInputValue(value);
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => selectedDate || new Date());
  const [panelPosition, setPanelPosition] = useState({ top: 0, left: 0, width: 340, maxHeight: 420 });

  useEffect(() => {
    if (selectedDate) {
      setViewDate(selectedDate);
    }
  }, [value]);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target) && !panelRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useLayoutEffect(() => {
    if (!isOpen || typeof window === "undefined") {
      return undefined;
    }

    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      const viewportPadding = 12;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(Math.max(rect.width, 320), Math.max(280, viewportWidth - (viewportPadding * 2)));
      const left = Math.min(
        Math.max(viewportPadding, rect.left),
        Math.max(viewportPadding, viewportWidth - width - viewportPadding),
      );
      const top = Math.min(rect.bottom + 12, viewportHeight - viewportPadding - 260);
      const maxHeight = Math.max(260, viewportHeight - top - viewportPadding);

      setPanelPosition((current) => {
        if (
          current.top === top
          && current.left === left
          && current.width === width
          && current.maxHeight === maxHeight
        ) {
          return current;
        }

        return { top, left, width, maxHeight };
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

  const weekdayFormatter = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const monthFormatter = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });
  const valueFormatter = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" });
  const weekdays = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(2024, 0, 1 + index);
    return weekdayFormatter.format(day).replace(/\./g, "");
  });
  const days = buildCalendarDays(viewDate);
  const today = new Date();
  const todayValue = formatDateInputValue(today);
  const selectedValue = selectedDate ? formatDateInputValue(selectedDate) : "";
  const currentMonth = viewDate.getMonth();

  const commitValue = (nextValue) => {
    onChange({ target: { name, type: "text", value: nextValue } });
    setIsOpen(false);
  };

  return (
    <div className={`claim-date-picker${isOpen ? " is-open" : ""}`} ref={rootRef}>
      <button type="button" className="claim-field claim-date-picker__trigger" ref={triggerRef} onClick={() => setIsOpen((current) => !current)}>
        <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
        <span className={`claim-date-picker__value${selectedValue ? "" : " is-placeholder"}`}>
          {selectedValue ? valueFormatter.format(selectedDate) : (t("claim.datePicker.placeholder", { defaultValue: "Select date" }))}
        </span>
        <Calendar size={18} strokeWidth={1.8} aria-hidden="true" />
      </button>

      {isOpen && typeof document !== "undefined" ? createPortal(
        <div
          className="claim-date-picker__panel"
          ref={panelRef}
          style={{
            top: `${panelPosition.top}px`,
            left: `${panelPosition.left}px`,
            width: `${panelPosition.width}px`,
            maxHeight: `${panelPosition.maxHeight}px`,
          }}
        >
          <div className="claim-date-picker__header">
            <button type="button" className="claim-date-picker__nav" onClick={() => setViewDate((current) => addMonths(current, -1))} aria-label={t("claim.datePicker.previousMonth", { defaultValue: "Previous month" })}>
              <ChevronLeft size={18} strokeWidth={2.2} />
            </button>
            <strong>{monthFormatter.format(viewDate)}</strong>
            <button type="button" className="claim-date-picker__nav" onClick={() => setViewDate((current) => addMonths(current, 1))} aria-label={t("claim.datePicker.nextMonth", { defaultValue: "Next month" })}>
              <ChevronRight size={18} strokeWidth={2.2} />
            </button>
          </div>

          <div className="claim-date-picker__weekdays">
            {weekdays.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}
          </div>

          <div className="claim-date-picker__grid">
            {days.map((day) => {
              const dayValue = formatDateInputValue(day);
              const isCurrentMonth = day.getMonth() === currentMonth;
              const isSelected = dayValue === selectedValue;
              const isToday = dayValue === todayValue;

              return (
                <button
                  type="button"
                  key={dayValue}
                  className={`claim-date-picker__day${isCurrentMonth ? "" : " is-outside"}${isSelected ? " is-selected" : ""}${isToday ? " is-today" : ""}`}
                  onClick={() => commitValue(dayValue)}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          <div className="claim-date-picker__footer">
            <button type="button" onClick={() => commitValue("")}>
              {t("claim.datePicker.clear", { defaultValue: "Clear" })}
            </button>
            <button type="button" onClick={() => {
              setViewDate(today);
              commitValue(todayValue);
            }}>
              {t("claim.datePicker.today", { defaultValue: "Today" })}
            </button>
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

function SearchCombobox({
  icon: Icon,
  name,
  value,
  placeholder,
  options,
  onInputChange,
  onSelect,
  renderOption,
  emptyLabel,
}) {
  const rootRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [options, value]);

  const commitSelection = (option) => {
    onSelect(name, option);
    setIsOpen(false);
  };

  const onKeyDown = (event) => {
    if (!isOpen && (event.key === "ArrowDown" || event.key === "Enter")) {
      setIsOpen(true);
      return;
    }

    if (!options.length) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((current) => Math.min(current + 1, options.length - 1));
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) => Math.max(current - 1, 0));
    }

    if (event.key === "Enter" && isOpen) {
      event.preventDefault();
      commitSelection(options[highlightedIndex]);
    }

    if (event.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div className={`claim-combobox${isOpen ? " is-open" : ""}`} ref={rootRef}>
      <label className="claim-field">
        <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
        <input
          name={name}
          value={value || ""}
          onChange={(event) => {
            onInputChange(name, event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          placeholder={placeholder}
        />
        <ChevronDown size={18} strokeWidth={1.8} aria-hidden="true" />
      </label>
      {isOpen && (
        <div className="claim-combobox__menu">
          {options.length ? options.map((option, index) => {
            const content = renderOption(option);
            return (
              <button
                type="button"
                key={`${option.id || option.label}-${index}`}
                className={`claim-combobox__option${index === highlightedIndex ? " is-highlighted" : ""}`}
                onMouseEnter={() => setHighlightedIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  commitSelection(option);
                }}
              >
                <div className="claim-combobox__option-card">
                  {content.countryCode ? (
                    <CountryFlag code={content.countryCode} label={content.subtitle} className="claim-combobox__option-flag" />
                  ) : content.code ? (
                    <span className="claim-combobox__option-flag">{content.code.slice(0, 3)}</span>
                  ) : (
                    <span className="claim-combobox__option-flag is-empty" aria-hidden="true" />
                  )}
                  <div className="claim-combobox__option-body">
                    <strong>{content.title}</strong>
                    {content.subtitle ? <small>{content.subtitle}</small> : null}
                    {content.meta ? <div className="claim-combobox__option-meta">{content.meta}</div> : null}
                  </div>
                </div>
              </button>
            );
          }) : (
            <div className="claim-combobox__empty">{emptyLabel}</div>
          )}
        </div>
      )}
    </div>
  );
}

function SelectField({ icon: Icon, placeholder, name, value, onChange }) {
  return (
    <label className="claim-field">
      <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
      <select name={name} value={value || ""} onChange={onChange}>
        <option value="">{placeholder}</option>
        <option value="Baku (BAK)">Baku (BAK)</option>
        <option value="Washington (DCA)">Washington (DCA)</option>
        <option value="London (LHR)">London (LHR)</option>
        <option value="Milan (MXP)">Milan (MXP)</option>
      </select>
      <ChevronDown size={16} strokeWidth={1.8} aria-hidden="true" />
    </label>
  );
}

function PromoCard() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const currentLanguage = getLanguageByCode(lang);

  return (
    <aside className="claim-promo">
      <div className="claim-promo__top">
        <LocalizedLink to="/" className="claim-brand">
          <img src={logoImage} alt="" />
          <img src={logoText} alt="Fly Friendly" />
        </LocalizedLink>
        <span className="claim-lang"><CountryFlag code={currentLanguage.countryCode} label={currentLanguage.label} className="claim-flag" /> {currentLanguage.label}</span>
      </div>
      <h2>{t("claim.promoTitle")}</h2>
      <p>{t("claim.promoText")}</p>
      <img className="claim-promo__image" src={claimImage} alt="Traveler with passport and luggage" />
      <h3>{t("claim.promoIssueTitle")}</h3>
      <p>{t("claim.promoIssueText")}</p>
      <ul>
        <li><CircleCheck size={18} /> {t("claim.allAirlines")}</li>
        <li><CircleCheck size={18} /> {t("claim.allCountries")}</li>
        <li><CircleCheck size={18} /> {t("claim.noWinNoFee")}</li>
      </ul>
    </aside>
  );
}

function UploadBox({ title, documentType, icon: Icon, file, onFile }) {
  const { t } = useTranslation();

  const dropFile = (event) => {
    event.preventDefault();
    onFile(documentType, event.dataTransfer.files?.[0] || null);
  };

  return (
    <label className={`upload-box${file ? " has-file" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={dropFile}>
      <input
        type="file"
        required={!file}
        accept=".png,.jpg,.jpeg,.pdf"
        onChange={(event) => onFile(documentType, event.target.files?.[0] || null)}
      />
      <span><Icon size={34} strokeWidth={1.8} /></span>
      <strong>{file ? file.name : t("claim.documents.dragAndDrop")}</strong>
      <em>{t("claim.documents.or")}</em>
      <b>{t("claim.documents.uploadFile")}</b>
      <small>{t("claim.documents.uploadHint")}</small>
      <mark>{title}</mark>
    </label>
  );
}

function FileRow({ file, done, onRemove }) {
  const { t } = useTranslation();

  return (
    <div className={`claim-file${done ? " is-done" : ""}`}>
      <FileText size={22} strokeWidth={1.8} />
      <div>
        <strong>{file?.name || t("claim.documents.boardingPass")}</strong>
        <small>{formatFileSize(file?.size || 0)} / {formatFileSize(file?.size || 0)}</small>
        <span />
      </div>
      {done ? <CircleCheck size={20} /> : <ShieldCheck size={20} />}
      <button type="button" className="claim-file__remove" aria-label={t("claim.status.removeFile", { file: file?.name || "file" })} onClick={onRemove}>
        <X size={18} />
      </button>
    </div>
  );
}

function EligibilityStep({ data, onChange, onSelect, onNext, airportOptions, airlineOptions, isSaving }) {
  const { t } = useTranslation();

  return (
    <form className="claim-form" onSubmit={onNext}>
      <section className="claim-question">
        <h3>{t("claim.eligibility.whereDidYouFly")}</h3>
        <div className="claim-two">
          <SearchCombobox
            icon={PlaneTakeoff}
            name="departure"
            value={data.departure}
            placeholder={t("claim.eligibility.departurePlaceholder")}
            options={airportOptions.departure}
            onInputChange={onChange}
            onSelect={onSelect}
            renderOption={(option) => ({
              title: option.title,
              subtitle: option.subtitle,
              meta: option.meta,
              countryCode: option.countryCode,
              code: option.code,
            })}
            emptyLabel={t("claim.eligibility.noAirportsFound")}
          />
          <SearchCombobox
            icon={PlaneLanding}
            name="destination"
            value={data.destination}
            placeholder={t("claim.eligibility.arrivalPlaceholder")}
            options={airportOptions.destination}
            onInputChange={onChange}
            onSelect={onSelect}
            renderOption={(option) => ({
              title: option.title,
              subtitle: option.subtitle,
              meta: option.meta,
              countryCode: option.countryCode,
              code: option.code,
            })}
            emptyLabel={t("claim.eligibility.noAirportsFound")}
          />
        </div>
      </section>
      <section className="claim-question">
        <h3>{t("claim.eligibility.whichAirline")}</h3>
        <SearchCombobox
          icon={Plane}
          name="airline"
          value={data.airline}
          placeholder={t("claim.eligibility.searchAirline")}
          options={airlineOptions}
          onInputChange={onChange}
          onSelect={onSelect}
          renderOption={(option) => ({
            title: option.title,
            subtitle: option.subtitle,
            code: option.code,
          })}
          emptyLabel={t("claim.eligibility.noAirlinesFound")}
        />
      </section>
      <section className="claim-question">
        <div className="claim-question-title">
          <span>4</span>
          <h3>{t("claim.eligibility.delayTitle")}</h3>
        </div>
        <div className="claim-option-grid">
          <label className={`claim-choice-card${data.delayDuration === "less_than_3" ? " is-selected" : ""}`}>
            <input type="radio" name="delayDuration" value="less_than_3" checked={data.delayDuration === "less_than_3"} onChange={onChange} required />
            <strong>{t("claim.eligibility.lessThan3")}</strong>
            <small>{t("claim.eligibility.notEligible")}</small>
          </label>
          <label className={`claim-choice-card${data.delayDuration === "more_than_3" ? " is-selected" : ""}`}>
            <input type="radio" name="delayDuration" value="more_than_3" checked={data.delayDuration === "more_than_3"} onChange={onChange} required />
            <strong>{t("claim.eligibility.moreThan3")}</strong>
            <small>{t("claim.eligibility.eligibleForClaim")}</small>
          </label>
          <label className={`claim-choice-card${data.delayDuration === "cancelled" ? " is-selected" : ""}`}>
            <input type="radio" name="delayDuration" value="cancelled" checked={data.delayDuration === "cancelled"} onChange={onChange} required />
            <strong>{t("claim.eligibility.cancelled")}</strong>
            <small>{t("claim.eligibility.specialRights")}</small>
          </label>
        </div>
      </section>
      <section className="claim-question">
        <h3>{t("claim.eligibility.scheduledDepartureDate")}</h3>
        <DatePickerField icon={Calendar} name="date" value={data.date} onChange={onChange} />
      </section>
      <section className="claim-question">
        <h3>{t("claim.eligibility.directFlight")}</h3>
        <label className="claim-radio"><input type="radio" name="direct" value="yes" checked={data.direct === "yes"} onChange={onChange} required /> {t("claim.eligibility.directYes")}</label>
        <label className="claim-radio"><input type="radio" name="direct" value="no" checked={data.direct === "no"} onChange={onChange} required /> {t("claim.eligibility.directNo")}</label>
        {data.direct === "no" ? (
          <label className="claim-wide-field">
            <span>{t("claim.eligibility.connectionCity")}</span>
            <Field
              icon={MapPin}
              name="connectionCity"
              value={data.connectionCity || ""}
              onChange={onChange}
              placeholder={t("claim.eligibility.connectionCityPlaceholder")}
              required
            />
            <small className="claim-field-help">{t("claim.eligibility.connectionCityHelp")}</small>
          </label>
        ) : null}
      </section>
      <div className="claim-actions">
        <span />
        <button className="btn btn-primary" type="submit" disabled={isSaving}>
          {isSaving ? t("common.saving") : t("common.next")}
        </button>
      </div>
    </form>
  );
}

function ContactStep({ data, onChange, onPhoneChange, onNext, onBack, emailError, phoneError, isSaving }) {
  const { t } = useTranslation();

  return (
    <form className="claim-form" onSubmit={onNext}>
      <section className="claim-question">
        <h3>{t("claim.contact.title")}</h3>
        <div className="claim-two">
          <label><span>{t("claim.contact.fullName")}</span><Field icon={User} name="fullName" value={data.fullName} onChange={onChange} placeholder={t("claim.contact.fullNamePlaceholder")} required /></label>
          <label>
            <span>{t("claim.contact.email")}</span>
            <Field icon={Mail} name="email" value={data.email} onChange={onChange} placeholder={t("claim.contact.emailPlaceholder")} required error={emailError} />
            {emailError ? <small className="claim-field-error">{emailError}</small> : null}
          </label>
        </div>
        <label className="claim-wide-field"><span>{t("claim.contact.address")}</span><Field icon={MapPin} name="city" value={data.city} onChange={onChange} placeholder={t("claim.contact.addressPlaceholder")} /></label>
        <small className="claim-field-help">{t("claim.contact.optional")}</small>
        <label className="claim-wide-field">
          <span>{t("claim.contact.phone")}</span>
          <PhoneField data={data} onChange={onPhoneChange} error={phoneError} t={t} />
          {phoneError ? <small className="claim-field-error">{phoneError}</small> : null}
        </label>
        <label className="claim-check"><input type="checkbox" name="whatsapp" checked={Boolean(data.whatsapp)} onChange={onChange} /> {t("claim.contact.hasWhatsapp")}</label>
        <small className="claim-field-help">{t("claim.contact.requiredToProceed")}</small>
      </section>
      <div className="claim-actions">
        <button className="claim-back" type="button" onClick={onBack}>{t("common.back")}</button>
        <button className="btn btn-primary" type="submit" disabled={isSaving}>
          {isSaving ? t("common.saving") : t("common.next")}
        </button>
      </div>
    </form>
  );
}

function DocumentsStep({ data, files, onChange, onFile, onRemoveFile, onNext, onBack, isSaving }) {
  const { t } = useTranslation();

  return (
    <form className="claim-form" onSubmit={onNext}>
      <section className="claim-question">
        <h3>{t("claim.documents.title")}</h3>
        <p>{t("claim.documents.subtitle")}</p>
        <div className="claim-upload-grid">
          <UploadBox title={t("claim.documents.passport")} documentType="passport" icon={User} file={files.passport} onFile={onFile} />
          <UploadBox title={t("claim.documents.boardingPass")} documentType="boarding_pass" icon={FileText} file={files.boarding_pass} onFile={onFile} />
        </div>
        {files.passport && <FileRow file={files.passport} done onRemove={() => onRemoveFile("passport")} />}
        {files.boarding_pass && <FileRow file={files.boarding_pass} done onRemove={() => onRemoveFile("boarding_pass")} />}
      </section>
      <section className="claim-question">
        <h3>{t("claim.documents.reasonTitle")}</h3>
        <textarea name="reason" value={data.reason || ""} onChange={onChange} placeholder={t("claim.documents.reasonPlaceholder")} minLength={3} maxLength={200} required />
        <small className="claim-limit">{(data.reason || "").length}/200</small>
      </section>
      <div className="claim-note">
        <Info size={18} strokeWidth={1.8} />
        <p>{t("claim.documents.signatureNote")}</p>
      </div>
      <div className="claim-actions">
        <button className="claim-back" type="button" onClick={onBack}>{t("common.back")}</button>
        <button className="btn btn-primary" type="submit" disabled={isSaving}>{isSaving ? t("common.saving") : t("common.next")}</button>
      </div>
    </form>
  );
}

function FinishStep({ data, onSignature, onChange, onNext, onBack, isSaving }) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const [hasInk, setHasInk] = useState(Boolean(data.signatureDataUrl));
  const isDrawingRef = useRef(false);
  const activePointerIdRef = useRef(null);
  const pointsRef = useRef([]);

  const configureContext = (context) => {
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#1f4b99";
    context.fillStyle = "#1f4b99";
    context.lineWidth = 2.2;
    context.shadowColor = "rgba(20, 47, 97, 0.14)";
    context.shadowBlur = 0.6;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    context.scale(ratio, ratio);
    configureContext(context);

    if (data.signatureDataUrl) {
      const image = new Image();
      image.onload = () => context.drawImage(image, 0, 0, rect.width, rect.height);
      image.src = data.signatureDataUrl;
    }
  }, [data.signatureDataUrl]);

  const point = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      pressure: event.pressure && event.pressure > 0 ? event.pressure : 0.5,
    };
  };

  const midpoint = (first, second) => ({
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  });

  const strokeWidthForPoint = (current, previous) => {
    if (!previous) return 2.2;
    const distance = Math.hypot(current.x - previous.x, current.y - previous.y);
    const pressureBoost = (current.pressure || 0.5) * 0.65;
    const speedPenalty = Math.min(distance / 18, 0.9);
    return Math.max(1.6, Math.min(2.8, 2.55 + pressureBoost - speedPenalty));
  };

  const drawDot = (context, current) => {
    context.beginPath();
    context.arc(current.x, current.y, 1.3, 0, Math.PI * 2);
    context.fill();
  };

  const drawSegment = (context, currentPoint) => {
    const points = pointsRef.current;
    points.push(currentPoint);

    if (points.length === 1) {
      drawDot(context, currentPoint);
      return;
    }

    if (points.length === 2) {
      const previous = points[0];
      context.beginPath();
      context.lineWidth = strokeWidthForPoint(currentPoint, previous);
      context.moveTo(previous.x, previous.y);
      context.lineTo(currentPoint.x, currentPoint.y);
      context.stroke();
      return;
    }

    const lastIndex = points.length - 1;
    const previousPoint = points[lastIndex - 1];
    const pointBeforePrevious = points[lastIndex - 2];
    const start = midpoint(pointBeforePrevious, previousPoint);
    const end = midpoint(previousPoint, currentPoint);

    context.beginPath();
    context.lineWidth = strokeWidthForPoint(currentPoint, previousPoint);
    context.moveTo(start.x, start.y);
    context.quadraticCurveTo(previousPoint.x, previousPoint.y, end.x, end.y);
    context.stroke();

    if (points.length > 6) {
      points.shift();
    }
  };

  const applyPointerSamples = (event) => {
    if (!isDrawingRef.current || activePointerIdRef.current !== event.pointerId) {
      return;
    }

    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    const samples = typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [event];

    for (const sample of samples) {
      drawSegment(context, point(sample));
    }

    setHasInk(true);
  };

  const beginSignature = (event) => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    const startPoint = point(event);
    canvas.setPointerCapture(event.pointerId);
    activePointerIdRef.current = event.pointerId;
    isDrawingRef.current = true;
    pointsRef.current = [startPoint];
    drawDot(context, startPoint);
    setHasInk(true);
  };

  const drawSignature = (event) => {
    applyPointerSamples(event);
  };

  const endSignature = (event) => {
    if (!isDrawingRef.current) return;

    applyPointerSamples(event);

    const canvas = canvasRef.current;
    if (event?.pointerId !== undefined && canvas.hasPointerCapture?.(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }

    isDrawingRef.current = false;
    activePointerIdRef.current = null;
    pointsRef.current = [];
    onSignature(canvasRef.current.toDataURL("image/png"));
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    configureContext(context);
    isDrawingRef.current = false;
    activePointerIdRef.current = null;
    pointsRef.current = [];
    setHasInk(false);
    onSignature("");
  };

  return (
    <form className="claim-form" onSubmit={onNext}>
      <section className="claim-question claim-sign">
        <h3>{t("claim.finish.title")}</h3>
        <p>{t("claim.finish.subtitle")}</p>
        <div className="claim-sign__field">
          <label>{t("claim.finish.digitalSignature")}</label>
          <div className="claim-signature-pad">
            <canvas
              ref={canvasRef}
              onPointerDown={beginSignature}
              onPointerMove={drawSignature}
              onPointerUp={endSignature}
              onPointerLeave={endSignature}
              onPointerCancel={endSignature}
              aria-label={t("claim.finish.digitalSignature")}
            />
            <button type="button" onClick={clearSignature}>{t("claim.finish.clear")}</button>
          </div>
          <small>{t("claim.finish.signatureHint")}</small>
        </div>
        <label className="claim-sign__terms">
          <input type="checkbox" name="termsAccepted" checked={Boolean(data.termsAccepted)} onChange={onChange} required />
          <span>
            <Trans i18nKey="claim.finish.terms" components={{ termsLink: <LocalizedLink to="/terms" /> }} />
          </span>
        </label>
      </section>
      <div className="claim-actions">
        <button className="claim-back" type="button" onClick={onBack}>{t("common.back")}</button>
        <button className="btn btn-primary" type="submit" disabled={isSaving || !hasInk || !data.termsAccepted}>
          {isSaving ? t("common.submitting") : t("common.submitClaim")}
        </button>
      </div>
    </form>
  );
}

function DeniedResult({ data }) {
  const { t } = useTranslation();
  const protectItems = t("claim.denied.protectItems", { returnObjects: true });

  return (
    <div className="claim-result is-denied">
      <section className="claim-question">
        <CircleAlert className="result-icon" size={34} strokeWidth={1.8} />
        <h3>{t("claim.denied.title")}</h3>
        <p>{t("claim.denied.text")}</p>
        <div className="claim-two">
          <Field icon={Plane} value={data.departure || "Baku (BAK)"} placeholder="Baku (BAK)" />
          <Field icon={Plane} value={data.destination || "Washington (DCA)"} placeholder="Washington (DCA)" />
        </div>
        <div className="claim-note">
          <Info size={18} strokeWidth={1.8} />
          <p><strong>{t("claim.denied.noteTitle")}</strong><br />{t("claim.denied.noteText")}</p>
        </div>
      </section>
      <section className="claim-question claim-protect">
        <LocalizedLink to="/" className="claim-brand">
          <img src={logoImage} alt="" />
          <img src={logoText} alt="Fly Friendly" />
        </LocalizedLink>
        <h3>{t("claim.denied.protectTitle")}</h3>
        <p>{t("claim.denied.protectText")}</p>
        <ul>
          {protectItems.map((item) => <li key={item}><CircleCheck size={18} /> {item}</li>)}
        </ul>
        <LocalizedLink className="btn btn-primary" to="/claim/eligibility">{t("common.checkCompensation")}</LocalizedLink>
      </section>
      <div className="claim-actions">
        <LocalizedLink className="claim-back" to="/claim/eligibility">{t("common.back")}</LocalizedLink>
        <LocalizedLink className="btn btn-primary" to="/">{t("common.mainPage")}</LocalizedLink>
      </div>
    </div>
  );
}

function ApprovedResult({ data }) {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const nextSteps = t("claim.approved.nextSteps", { returnObjects: true });

  return (
    <div className="claim-result is-approved">
      <section className="claim-question">
        <CircleCheck className="result-icon" size={34} strokeWidth={1.8} />
        <h3>{t("claim.approved.title")}</h3>
        <p>{t("claim.approved.text")}</p>
        <div className="claim-two">
          <Field icon={Plane} value={data.departure || "Baku (BAK)"} placeholder="Baku (BAK)" />
          <Field icon={Plane} value={data.destination || "Washington (DCA)"} placeholder="Washington (DCA)" />
        </div>
        <strong className="claim-id">{t("claim.approved.leadId")}: #{data.leadCode || t("claim.approved.pending")}</strong>
      </section>
      <section className="claim-question claim-next">
        <h3>{t("claim.approved.nextTitle")}</h3>
        <p>{t("claim.approved.nextText")}</p>
        {nextSteps.map(([title, text]) => (
          <article key={title}>
            <FileText size={22} strokeWidth={1.8} />
            <div>
              <strong>{title}</strong>
              <p>{text}</p>
            </div>
          </article>
        ))}
      </section>
      <div className="claim-actions">
        <LocalizedLink className="claim-back" to="/claim/finish">{t("common.back")}</LocalizedLink>
        <LocalizedLink className="btn btn-primary" to={isAuthenticated ? "/client/dashboard" : "/"}>
          {isAuthenticated
            ? t("claim.approved.accountCta", { defaultValue: "Open my account" })
            : t("common.mainPage")}
        </LocalizedLink>
      </div>
    </div>
  );
}

function ClaimFlow() {
  const navigate = useNavigate();
  const location = useLocation();
  const toLocalizedPath = useLocalizedPath();
  const { t, i18n } = useTranslation();
  const { stage = "eligibility", lang } = useParams();
  const [searchParams] = useSearchParams();
  const storedClaim = readStoredClaimDraft();
  const navigationClaimState = location.state?.claimFlow || null;
  const [data, setData] = useState(() => {
    const seed = {
      ...storedClaim,
      ...(navigationClaimState?.data || {}),
      departure: searchParams.get("departure") || navigationClaimState?.data?.departure || storedClaim.departure,
      destination: searchParams.get("destination") || navigationClaimState?.data?.destination || storedClaim.destination,
    };

    return {
      ...seed,
      ...parseStoredPhone(seed.phone, seed.phoneCountry, seed.phoneDialCode, seed.phoneLocalNumber),
    };
  });
  const [files, setFiles] = useState(() => navigationClaimState?.files || {});
  const [departureMatches, setDepartureMatches] = useState([]);
  const [destinationMatches, setDestinationMatches] = useState([]);
  const [airlineMatches, setAirlineMatches] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [syncNotice, setSyncNotice] = useState("");
  const [emailError, setEmailError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const activeIndex = Math.max(0, stages.indexOf(stage));
  const currentLanguageCode = getLanguageByCode(lang || i18n.resolvedLanguage || i18n.language).code;

  const withCurrentLanguage = (payload = data) => ({
    ...payload,
    language: currentLanguageCode,
    preferredLanguage: currentLanguageCode,
  });

  useEffect(() => {
    const draft = buildStoredClaimDraft(data, stage, currentLanguageCode);

    if (!hasStoredClaimDraftContent(draft)) {
      clearStoredClaimDraft();
      return;
    }

    window.localStorage.setItem(CLAIM_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  }, [currentLanguageCode, data, stage]);

  const go = (nextStage, nextData = data, nextFiles = files) => navigate(
    toLocalizedPath(`/claim/${nextStage}`),
    {
      state: {
        claimFlow: {
          data: nextData,
          files: nextFiles,
        },
      },
    },
  );

  useEffect(() => {
    if (!["documents", "finish"].includes(stage)) {
      return;
    }

    const isMissingContactDetails = !String(data.fullName || "").trim()
      || !String(data.email || "").trim()
      || !String(data.phone || "").trim();

    if (!isMissingContactDetails) {
      return;
    }

    setSyncNotice(t("claim.status.restoreContact", {
      defaultValue: "For your privacy, contact details are not stored on this device. Please re-enter them to continue.",
    }));
    go("contact");
  }, [data.email, data.fullName, data.phone, go, stage, t]);

  useEffect(() => {
    if (stage === "approved" || stage === "denied") {
      clearStoredClaimDraft();
    }
  }, [stage]);

  useEffect(() => {
    if (stage !== "eligibility") {
      return;
    }

    if (!data.departure || data.departure.length < 2) {
      setDepartureMatches([]);
      return;
    }

    const timeout = window.setTimeout(async () => {
      try {
        const airports = await searchAirports(data.departure);
        setDepartureMatches(airports.map((airport) => describeAirportOption(airport)));
      } catch {
        setDepartureMatches([]);
      }
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [data.departure, stage]);

  useEffect(() => {
    if (stage !== "eligibility") {
      return;
    }

    if (!data.destination || data.destination.length < 2) {
      setDestinationMatches([]);
      return;
    }

    const timeout = window.setTimeout(async () => {
      try {
        const airports = await searchAirports(data.destination);
        setDestinationMatches(airports.map((airport) => describeAirportOption(airport)));
      } catch {
        setDestinationMatches([]);
      }
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [data.destination, stage]);

  useEffect(() => {
    if (stage !== "eligibility" || !data.airline || data.airline.length < 2) {
      setAirlineMatches([]);
      return;
    }

    const timeout = window.setTimeout(async () => {
      try {
        const airlines = await searchAirlines(data.airline);
        setAirlineMatches(airlines.map((airline) => describeAirlineOption(airline)));
      } catch {
        setAirlineMatches([]);
      }
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [data.airline, stage]);

  const onSelectOption = (name, selectedOption) => {
    const nextData = { ...data };

    if (name === "departure") {
      nextData.departure = selectedOption.label;
      nextData.departureAirportId = selectedOption.id || null;
      nextData.departureAirportSource = selectedOption.source || null;
    }

    if (name === "destination") {
      nextData.destination = selectedOption.label;
      nextData.destinationAirportId = selectedOption.id || null;
      nextData.destinationAirportSource = selectedOption.source || null;
    }

    if (name === "airline") {
      nextData.airline = selectedOption.label;
      nextData.airlineId = selectedOption.source === "supabase" ? selectedOption.id || null : null;
      nextData.airlineSource = selectedOption.source || null;
    }

    if (hasSameAirportSelection(nextData)) {
      setSyncError(
        t("claim.eligibility.sameAirportError", {
          defaultValue: "Departure and arrival airports must be different.",
        }),
      );
      return;
    }

    setSyncError("");
    setData(nextData);
  };

  const onFieldInput = (name, value) => {
    const nextData = { ...data, [name]: value };

    if (name === "departure") {
      nextData.departureAirportId = null;
      nextData.departureAirportSource = null;
    }

    if (name === "destination") {
      nextData.destinationAirportId = null;
      nextData.destinationAirportSource = null;
    }

    if (name === "airline") {
      nextData.airlineId = null;
      nextData.airlineSource = null;
    }

    if (name === "direct" && value === "yes") {
      nextData.connectionCity = "";
    }

    if ((name === "departure" || name === "destination") && syncError) {
      setSyncError("");
    }

    setData(nextData);
  };

  const onChange = (eventOrName, maybeValue) => {
    if (typeof eventOrName === "string") {
      onFieldInput(eventOrName, maybeValue);
      if (eventOrName === "email" && emailError) {
        setEmailError(getEmailError(maybeValue, t));
      }
      return;
    }

    const { name, type, checked, value } = eventOrName.target;
    const nextData = { ...data, [name]: type === "checkbox" ? checked : value };

    if (name === "departure") {
      nextData.departureAirportId = null;
      nextData.departureAirportSource = null;
    }

    if (name === "destination") {
      nextData.destinationAirportId = null;
      nextData.destinationAirportSource = null;
    }

    if (name === "airline") {
      nextData.airlineId = null;
      nextData.airlineSource = null;
    }

    if ((name === "departure" || name === "destination") && syncError) {
      setSyncError("");
    }

    setData(nextData);

    if (name === "email" && emailError) {
      setEmailError(getEmailError(value, t));
    }
  };

  const onPhoneChange = (kind, value) => {
    const nextPhone = String(value || "").replace(/[^\d+()\-\s]/g, "");
    const nextData = {
      ...data,
      phoneLocalNumber: nextPhone,
      phone: nextPhone,
    };

    setData(nextData);

    if (phoneError) {
      setPhoneError(getPhoneError(nextData, t));
    }
  };

  const onFile = (documentType, file) => {
    setFiles((current) => ({ ...current, [documentType]: file }));
  };

  const onRemoveFile = (documentType) => {
    setFiles((current) => {
      const next = { ...current };
      delete next[documentType];
      return next;
    });
  };

  const onSignature = (signatureDataUrl) => {
    setData((current) => ({ ...current, signatureDataUrl }));
  };

  const ensureLead = async (payload = data) => {
    if (payload.leadId) {
      return {
        leadId: payload.leadId,
        nextData: payload,
      };
    }

    const lead = await createLead(withCurrentLanguage(payload));
    const nextData = { ...payload, leadId: lead.id, leadCode: lead.lead_code };
    setData(nextData);
    return {
      leadId: lead.id,
      nextData,
    };
  };
  const submit = async (nextStage, event) => {
    event.preventDefault();

    if (isSaving) {
      return;
    }

    setSyncError("");
    setSyncNotice("");

    if (stage === "eligibility" && hasSameAirportSelection(data)) {
      setSyncError(
        t("claim.eligibility.sameAirportError", {
          defaultValue: "Departure and arrival airports must be different.",
        }),
      );
      return;
    }

    if (stage === "eligibility" && data.direct === "no" && !String(data.connectionCity || "").trim()) {
      setSyncError(
        t("claim.eligibility.connectionCityRequired", {
          defaultValue: "Please enter the city where you changed planes.",
        }),
      );
      return;
    }

    if (stage === "eligibility" && data.delayDuration === "less_than_3") {
      if (isSupabaseConfigured) {
        try {
          const { leadId, nextData } = await ensureLead();
          await submitLead(leadId, withCurrentLanguage(), "not_eligible");
          clearStoredClaimDraft();
          go("denied", nextData, files);
        } catch (error) {
          setSyncError(error.message || t("claim.status.saveLeadError"));
          return;
        }
      }

      setSyncNotice(t("claim.status.notEligible"));
      return;
    }

    if (stage === "contact") {
      const nextEmailError = getEmailError(data.email, t);
      if (nextEmailError) {
        setEmailError(nextEmailError);
        return;
      }

      const nextPhoneError = getPhoneError(data, t);
      if (nextPhoneError) {
        setPhoneError(nextPhoneError);
        return;
      }

      setEmailError("");
      setPhoneError("");
    }

    if (!isSupabaseConfigured) {
      setSyncError(t("claim.status.supabaseMissing"));
      go(nextStage);
      return;
    }

    setIsSaving(true);

    try {
      const { leadId, nextData } = await ensureLead();

      if (stage === "eligibility") {
        await saveLeadStep(leadId, "contact", withCurrentLanguage());
      }

      if (stage === "contact") {
        await saveLeadStep(leadId, "documents", withCurrentLanguage());
      }

      if (stage === "documents") {
        await saveLeadDocuments(leadId, withCurrentLanguage(), files);
      }

      if (stage === "finish") {
        if (!data.signatureDataUrl || !data.termsAccepted) {
          throw new Error(t("claim.status.signatureRequired"));
        }

        const finishNotices = [];
        const result = await submitClaimServerSide(leadId, withCurrentLanguage());

        if (result?.account?.isNewUser) {
          finishNotices.push(
            t("claim.account.confirmWithReset", {
              defaultValue: "Your account has been created. Check your inbox and use the password setup link to access your dashboard.",
            }),
          );
        } else {
          finishNotices.push(
            t("claim.account.existing", {
              defaultValue: "We linked this claim to your existing Fly Friendly account and emailed you a secure access link.",
            }),
          );
        }

        if (result?.email?.already_sent) {
          finishNotices.push(t("claim.status.emailAlreadySent", { email: data.email || t("claim.status.customerFallback") }));
        } else if (result?.email?.sent) {
          finishNotices.push(t("claim.status.emailSent", { email: data.email || t("claim.status.customerFallback") }));
        } else {
          finishNotices.push(t("claim.status.emailFailed"));
        }

        if (finishNotices.length) {
          setSyncNotice(finishNotices.join(" "));
        }

        clearStoredClaimDraft();
      }

      if (stage !== "finish") {
        setSyncNotice(t("common.savedInSupabase"));
      }
      go(nextStage, nextData, files);
    } catch (error) {
      setSyncError(error.message || t("claim.status.saveClaimError"));
    } finally {
      setIsSaving(false);
    }
  };

  const renderStage = () => {
    if (stage === "denied") return <DeniedResult data={data} />;
    if (stage === "approved") return <ApprovedResult data={data} />;
    if (stage === "contact") return <ContactStep data={data} onChange={onChange} onPhoneChange={onPhoneChange} onNext={(event) => submit("documents", event)} onBack={() => go("eligibility")} emailError={emailError} phoneError={phoneError} isSaving={isSaving} />;
    if (stage === "documents") return <DocumentsStep data={data} files={files} onChange={onChange} onFile={onFile} onRemoveFile={onRemoveFile} onNext={(event) => submit("finish", event)} onBack={() => go("contact")} isSaving={isSaving} />;
    if (stage === "finish") {
      return (
        <FinishStep
          data={data}
          onSignature={onSignature}
          onChange={onChange}
          onNext={(event) => submit("approved", event)}
          onBack={() => go("documents")}
          isSaving={isSaving}
        />
      );
    }
    return (
      <EligibilityStep
        data={data}
        onChange={onChange}
        onSelect={onSelectOption}
        onNext={(event) => submit("contact", event)}
        airportOptions={{
          departure: departureMatches.filter((option) => String(option.id || "") !== String(data.destinationAirportId || "") && normalizeAirportValue(option.label) !== normalizeAirportValue(data.destination)),
          destination: destinationMatches.filter((option) => String(option.id || "") !== String(data.departureAirportId || "") && normalizeAirportValue(option.label) !== normalizeAirportValue(data.departure)),
        }}
        airlineOptions={airlineMatches}
        isSaving={isSaving}
      />
    );
  };

  return (
    <div className="claim-page">
      <div className="claim-frame">
        <ClaimHeader />
        <main className="claim-shell">
          <section className="claim-main">
            <h1>{t("claim.heroTitle")}</h1>
            <p>{t("common.globalReachCopy")}</p>
            {syncError && <p className="claim-sync is-error">{syncError}</p>}
            {syncNotice && <p className="claim-sync is-notice">{syncNotice}</p>}
            {stage !== "approved" && stage !== "denied" && <Stepper activeIndex={activeIndex} />}
            {stage === "approved" && <Stepper activeIndex={3} completed />}
            {renderStage()}
          </section>
          <PromoCard />
        </main>
        <ClaimFooter />
      </div>
    </div>
  );
}

export default ClaimFlow;
