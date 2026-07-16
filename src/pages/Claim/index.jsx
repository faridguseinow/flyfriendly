import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import SeoHead from "../../components/SeoHead.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import { DEFAULT_LANGUAGE, getLanguageByCode } from "../../i18n/languages.js";
import { localizePath } from "../../i18n/path.js";
import { getLocalizedCountryName, PHONE_COUNTRY_OPTIONS } from "../../lib/phoneCountries.js";
import { BRAND_NAME, buildSeoPayload } from "../../lib/seo.js";
import { useLocalizedPath } from "../../i18n/useLocalizedPath.js";
import { trackAnalyticsEvent } from "../../lib/analyticsTracker.js";
import { isSupabaseConfigured } from "../../lib/supabase.js";
import {
  describeAirlineOption,
  describeAirportOption,
  searchAirlines,
  searchAirports,
} from "../../services/catalogService.js";
import {
  createLead,
  fetchClaimReuseData,
  saveLeadDocuments,
  saveLeadStep,
  submitClaimServerSide,
  submitLead,
} from "../../services/leadService.js";
import { clearReferralAttribution } from "../../services/referralService.js";
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
const CLAIM_SUBMITTED_ANALYTICS_KEY = "fly-friendly-claim-submitted";
const CLAIM_FIELD_SELECTORS = {
  departure: 'input[name="departure"]',
  destination: 'input[name="destination"]',
  airline: 'input[name="airline"]',
  delayDuration: 'input[name="delayDuration"]',
  date: '[data-field-name="date"] button',
  direct: 'input[name="direct"]',
  connectionCity: 'input[name="connectionCity"]',
  fullName: 'input[name="fullName"]',
  email: 'input[name="email"]',
  phone: 'input[name="phone"]',
  passport: 'input[data-document-type="passport"]',
  boarding_pass: 'input[data-document-type="boarding_pass"]',
  reason: 'textarea[name="reason"]',
  signatureDataUrl: 'canvas[data-field-name="signatureDataUrl"]',
  termsAccepted: 'input[name="termsAccepted"]',
};
function getPhoneCountryOption(countryCode) {
  return PHONE_COUNTRY_OPTIONS.find((option) => option.code === countryCode) || PHONE_COUNTRY_OPTIONS[0];
}

function normalizeDialCode(value) {
  const digits = String(value || "").replace(/\D/g, "");
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

function getDialCodeVariants(dialCode) {
  const digits = String(dialCode || "").replace(/\D/g, "");
  return digits ? [dialCode, `+${digits}`] : [];
}

function parseStoredPhone(phone, phoneCountry = "", phoneDialCode = "", phoneLocalNumber = "") {
  if (phoneCountry || phoneDialCode || phoneLocalNumber) {
    const nextCountry = phoneCountry || "az";
    const nextDialCode = normalizeDialCode(phoneDialCode) || getPhoneCountryOption(nextCountry).dialCode;
    const fullPhoneDigits = phoneDigits(phone);
    const dialDigits = phoneDigits(nextDialCode);
    const inferredLocalNumber = fullPhoneDigits.startsWith(dialDigits)
      ? fullPhoneDigits.slice(dialDigits.length)
      : fullPhoneDigits;
    const nextLocalNumber = formatLocalPhoneNumber(phoneLocalNumber || inferredLocalNumber || phone || "", nextCountry);
    const composed = buildFullPhoneNumber(nextDialCode, nextLocalNumber);
    return {
      phoneCountry: nextCountry,
      phoneDialCode: nextDialCode,
      phoneLocalNumber: nextLocalNumber,
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

  const normalizedRaw = raw.replace(/\s+/g, "");
  if (normalizedRaw.startsWith("+")) {
    const matched = [...PHONE_COUNTRY_OPTIONS]
      .sort((a, b) => phoneDigits(b.dialCode).length - phoneDigits(a.dialCode).length)
      .find((option) => getDialCodeVariants(option.dialCode).some((variant) => normalizedRaw.startsWith(variant.replace(/\s+/g, ""))));

    if (matched) {
      const dialDigits = phoneDigits(matched.dialCode);
      const localDigits = phoneDigits(normalizedRaw).slice(dialDigits.length);
      const localNumber = formatLocalPhoneNumber(localDigits, matched.code);
      return {
        phoneCountry: matched.code,
        phoneDialCode: matched.dialCode,
        phoneLocalNumber: localNumber,
        phone: buildFullPhoneNumber(matched.dialCode, localNumber),
      };
    }
  }

  const defaultOption = getPhoneCountryOption("az");
  const localNumber = formatLocalPhoneNumber(raw, defaultOption.code);
  return {
    phoneCountry: defaultOption.code,
    phoneDialCode: normalizeDialCode(defaultOption.dialCode),
    phoneLocalNumber: localNumber,
    phone: buildFullPhoneNumber(defaultOption.dialCode, localNumber),
  };
}

function getPhoneError(data, t) {
  const option = getPhoneCountryOption(data.phoneCountry);
  const localDigits = phoneDigits(data.phoneLocalNumber || "");
  if (!localDigits) {
    return t("claim.contact.phoneInvalid", { defaultValue: "Please enter a valid phone number." });
  }

  const minLength = option.localLength || option.minLength || 7;
  const maxLength = option.localLength || option.maxLength || 15;

  if (localDigits.length < minLength || localDigits.length > maxLength) {
    return t("claim.contact.phoneInvalid", { defaultValue: "Please enter a valid phone number." });
  }

  return "";
}

function getSortedPhoneCountries(locale) {
  return [...PHONE_COUNTRY_OPTIONS].sort((left, right) => {
    const leftName = getLocalizedCountryName(left, locale);
    const rightName = getLocalizedCountryName(right, locale);
    return leftName.localeCompare(rightName, locale, { sensitivity: "base" });
  });
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

function hasSelectedAirlineOption(data) {
  return Boolean(
    data?.airlineId
    || (String(data?.airline || "").trim() && String(data?.airlineSource || "").trim()),
  );
}

function clearStoredClaimDraft() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(CLAIM_DRAFT_STORAGE_KEY);
  } catch {
    // Ignore storage access errors in restrictive browsing modes.
  }
}

function wasClaimSubmissionTracked(trackingKey) {
  if (typeof window === "undefined" || !trackingKey) {
    return false;
  }

  try {
    return window.sessionStorage.getItem(`${CLAIM_SUBMITTED_ANALYTICS_KEY}:${trackingKey}`) === "true";
  } catch {
    return false;
  }
}

function markClaimSubmissionTracked(trackingKey) {
  if (typeof window === "undefined" || !trackingKey) {
    return;
  }

  try {
    window.sessionStorage.setItem(`${CLAIM_SUBMITTED_ANALYTICS_KEY}:${trackingKey}`, "true");
  } catch {
    // Ignore restrictive storage modes.
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
      connectionAirportId: parsed?.connectionAirportId || null,
      connectionAirportSource: parsed?.connectionAirportSource || null,
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
    connectionAirportId: data.connectionAirportId || null,
    connectionAirportSource: data.connectionAirportSource || null,
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
    || draft.connectionAirportId
    || draft.airline
    || draft.airlineId
    || draft.date
    || draft.delayDuration
    || draft.direct
    || draft.connectionCity,
  );
}

function focusClaimField(fieldName) {
  if (typeof window === "undefined" || !fieldName) {
    return;
  }

  const selector = CLAIM_FIELD_SELECTORS[fieldName];
  if (!selector) {
    return;
  }

  window.setTimeout(() => {
    const element = window.document.querySelector(selector);
    if (!element) {
      return;
    }

    element.scrollIntoView({ behavior: "smooth", block: "center" });

    if (typeof element.focus === "function") {
      element.focus({ preventScroll: true });
    }
  }, 30);
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

function buildSafeApprovedClaimData(data = {}, override = {}) {
  return {
    leadId: data.leadId || "",
    leadCode: data.leadCode || "",
    departure: data.departure || "",
    destination: data.destination || "",
    airline: data.airline || "",
    date: data.date || "",
    fullName: data.fullName || "",
    email: data.email || "",
    phone: data.phone || "",
    phoneCountry: data.phoneCountry || "",
    phoneDialCode: data.phoneDialCode || "",
    phoneLocalNumber: data.phoneLocalNumber || "",
    preferredLanguage: data.preferredLanguage || data.language || "",
    ...override,
  };
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

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function isFutureDay(date, today) {
  return startOfDay(date).getTime() > startOfDay(today).getTime();
}

function isSameCalendarDay(left, right) {
  if (!(left instanceof Date) || Number.isNaN(left.getTime())) return false;
  if (!(right instanceof Date) || Number.isNaN(right.getTime())) return false;

  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
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

function PhoneField({ data, onChange, error = "", t, i18n }) {
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const locale = i18n.resolvedLanguage || i18n.language || "en";
  const selectedCountry = getPhoneCountryOption(data.phoneCountry || "az");
  const sortedCountries = useMemo(() => getSortedPhoneCountries(locale), [locale]);
  const filteredCountries = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return sortedCountries;
    }

    return sortedCountries.filter((option) => {
      const localizedName = getLocalizedCountryName(option, locale).toLowerCase();
      return localizedName.includes(query)
        || option.label.toLowerCase().includes(query)
        || option.iso.toLowerCase().includes(query)
        || option.code.toLowerCase().includes(query)
        || option.dialCode.toLowerCase().includes(query);
    });
  }, [locale, search, sortedCountries]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
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
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setSearch("");
      return;
    }

    const timerId = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(timerId);
  }, [isOpen]);

  const phonePlaceholder = selectedCountry.placeholder || t("claim.contact.phonePlaceholder");

  return (
    <div className={`claim-phone-field${error ? " is-error" : ""}${isOpen ? " is-open" : ""}`} ref={rootRef}>
      <label className="claim-phone-field__control">
        <button
          type="button"
          className="claim-phone-field__country"
          onClick={() => setIsOpen((current) => !current)}
          aria-expanded={isOpen}
          aria-label={t("claim.contact.phoneSearchPlaceholder")}
        >
          <CountryFlag code={selectedCountry.code} size={18} />
          <span className="claim-phone-field__dial">{normalizeDialCode(selectedCountry.dialCode)}</span>
          <ChevronDown size={16} strokeWidth={2} aria-hidden="true" />
        </button>

        <span className="claim-phone-field__divider" aria-hidden="true" />

        <Phone size={18} strokeWidth={1.8} aria-hidden="true" />

        <input
          className="claim-phone-field__input"
          name="phone"
          type="tel"
          inputMode="tel"
          value={data.phoneLocalNumber || ""}
          onChange={(event) => onChange("localNumber", event.target.value)}
          placeholder={phonePlaceholder}
          aria-invalid={Boolean(error)}
          aria-label={t("claim.contact.phone")}
        />
      </label>

      {isOpen ? (
        <div className="claim-phone-field__dropdown">
          <label className="claim-phone-field__search">
            <Search size={16} strokeWidth={2} aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("claim.contact.phoneSearchPlaceholder")}
              aria-label={t("claim.contact.phoneSearchPlaceholder")}
            />
          </label>

          <div className="claim-phone-field__options" role="listbox" aria-label={t("claim.contact.phoneSearchPlaceholder")}>
            {filteredCountries.length ? filteredCountries.map((option) => {
              const isSelected = option.code === selectedCountry.code;
              return (
                <button
                  type="button"
                  key={option.code}
                  className={`claim-phone-field__option${isSelected ? " is-selected" : ""}`}
                  onClick={() => {
                    onChange("country", option.code);
                    setIsOpen(false);
                  }}
                >
                  <span className="claim-phone-field__option-flag">
                    <CountryFlag code={option.code} size={18} />
                  </span>
                  <span className="claim-phone-field__option-label">
                    {getLocalizedCountryName(option, locale)}
                  </span>
                  <span className="claim-phone-field__option-code">{normalizeDialCode(option.dialCode)}</span>
                  {isSelected ? <Check size={16} strokeWidth={2.2} aria-hidden="true" /> : null}
                </button>
              );
            }) : (
              <div className="claim-phone-field__empty">
                {t("claim.contact.phoneSearchEmpty")}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DatePickerField({ icon: Icon, name, value, onChange, error = "" }) {
  const { lang } = useParams();
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const { t, i18n } = useTranslation();
  const locale = getLocale(getLanguageByCode(lang || i18n.resolvedLanguage || i18n.language).code);
  const selectedDate = useMemo(() => parseDateInputValue(value), [value]);
  const today = useMemo(() => startOfDay(new Date()), []);
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => {
    if (selectedDate && !isFutureDay(selectedDate, today)) {
      return selectedDate;
    }
    return today;
  });
  const [panelPosition, setPanelPosition] = useState({ top: 0, left: 0, width: 340, maxHeight: 420 });

  useEffect(() => {
    if (selectedDate && !isFutureDay(selectedDate, today)) {
      setViewDate((current) => (isSameCalendarDay(current, selectedDate) ? current : selectedDate));
    }
  }, [selectedDate, today]);

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
  const todayValue = formatDateInputValue(today);
  const selectedValue = selectedDate ? formatDateInputValue(selectedDate) : "";
  const currentMonth = viewDate.getMonth();
  const isCurrentOrPastMonth = getMonthStart(viewDate).getTime() < getMonthStart(today).getTime();

  const commitValue = (nextValue) => {
    onChange({ target: { name, type: "text", value: nextValue } });
    setIsOpen(false);
  };

  return (
    <div className={`claim-date-picker${isOpen ? " is-open" : ""}`} ref={rootRef} data-field-name={name}>
      <button
        type="button"
        className={`claim-field claim-date-picker__trigger${error ? " is-error" : ""}`}
        ref={triggerRef}
        onClick={() => setIsOpen((current) => !current)}
        aria-invalid={Boolean(error)}
      >
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
            <button
              type="button"
              className="claim-date-picker__nav"
              onClick={() => {
                if (isCurrentOrPastMonth) {
                  setViewDate((current) => addMonths(current, 1));
                }
              }}
              aria-label={t("claim.datePicker.nextMonth", { defaultValue: "Next month" })}
              disabled={!isCurrentOrPastMonth}
            >
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
              const isFuture = isFutureDay(day, today);

              return (
                <button
                  type="button"
                  key={dayValue}
                  className={`claim-date-picker__day${isCurrentMonth ? "" : " is-outside"}${isSelected ? " is-selected" : ""}${isToday ? " is-today" : ""}${isFuture ? " is-disabled" : ""}`}
                  onClick={() => {
                    if (!isFuture) {
                      commitValue(dayValue);
                    }
                  }}
                  disabled={isFuture}
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
  error = "",
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
      <label className={`claim-field${error ? " is-error" : ""}`}>
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
          aria-invalid={Boolean(error)}
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

function UploadBox({ title, documentType, icon: Icon, file, existingDocument = null, onFile, error = "" }) {
  const { t } = useTranslation();

  const dropFile = (event) => {
    event.preventDefault();
    onFile(documentType, event.dataTransfer.files?.[0] || null);
  };

  return (
    <label className={`upload-box${file ? " has-file" : ""}${error ? " is-error" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={dropFile}>
      <input
        type="file"
        required={!file && !existingDocument}
        accept=".png,.jpg,.jpeg,.pdf"
        data-document-type={documentType}
        onChange={(event) => onFile(documentType, event.target.files?.[0] || null)}
      />
      <span><Icon size={34} strokeWidth={1.8} /></span>
      <strong>{file ? file.name : existingDocument?.file_name || t("claim.documents.dragAndDrop")}</strong>
      <em>{t("claim.documents.or")}</em>
      <b>{t("claim.documents.uploadFile")}</b>
      <small>{t("claim.documents.uploadHint")}</small>
      <mark>{title}</mark>
    </label>
  );
}

function FileRow({ file, done, onRemove, metaText = "" }) {
  const { t } = useTranslation();

  return (
    <div className={`claim-file${done ? " is-done" : ""}`}>
      <FileText size={22} strokeWidth={1.8} />
      <div>
        <strong>{file?.name || t("claim.documents.boardingPass")}</strong>
        <small>{metaText || `${formatFileSize(file?.size || 0)} / ${formatFileSize(file?.size || 0)}`}</small>
        <span />
      </div>
      {done ? <CircleCheck size={20} /> : <ShieldCheck size={20} />}
      {onRemove ? (
        <button type="button" className="claim-file__remove" aria-label={t("claim.status.removeFile", { file: file?.name || "file" })} onClick={onRemove}>
          <X size={18} />
        </button>
      ) : null}
    </div>
  );
}

function EligibilityStep({ data, onChange, onSelect, onNext, airportOptions, airlineOptions, isSaving, errors = {} }) {
  const { t } = useTranslation();

  return (
    <form className="claim-form" onSubmit={onNext}>
      <section className="claim-question">
        <h3>{t("claim.eligibility.whereDidYouFly")}</h3>
        <div className="claim-two">
          <div>
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
              error={errors.departure}
            />
            {errors.departure ? <small className="claim-field-error">{errors.departure}</small> : null}
          </div>
          <div>
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
              error={errors.destination}
            />
            {errors.destination ? <small className="claim-field-error">{errors.destination}</small> : null}
          </div>
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
          error={errors.airline}
        />
        {errors.airline ? <small className="claim-field-error">{errors.airline}</small> : null}
      </section>
      <section className="claim-question">
        <div className="claim-question-title">
          <span>4</span>
          <h3>{t("claim.eligibility.delayTitle")}</h3>
        </div>
        <div className="claim-option-grid">
          <label className={`claim-choice-card${data.delayDuration === "less_than_3" ? " is-selected" : ""}${errors.delayDuration ? " is-error" : ""}`}>
            <input type="radio" name="delayDuration" value="less_than_3" checked={data.delayDuration === "less_than_3"} onChange={onChange} required />
            <strong>{t("claim.eligibility.lessThan3")}</strong>
            <small>{t("claim.eligibility.notEligible")}</small>
          </label>
          <label className={`claim-choice-card${data.delayDuration === "more_than_3" ? " is-selected" : ""}${errors.delayDuration ? " is-error" : ""}`}>
            <input type="radio" name="delayDuration" value="more_than_3" checked={data.delayDuration === "more_than_3"} onChange={onChange} required />
            <strong>{t("claim.eligibility.moreThan3")}</strong>
            <small>{t("claim.eligibility.eligibleForClaim")}</small>
          </label>
          <label className={`claim-choice-card${data.delayDuration === "cancelled" ? " is-selected" : ""}${errors.delayDuration ? " is-error" : ""}`}>
            <input type="radio" name="delayDuration" value="cancelled" checked={data.delayDuration === "cancelled"} onChange={onChange} required />
            <strong>{t("claim.eligibility.cancelled")}</strong>
            <small>{t("claim.eligibility.specialRights")}</small>
          </label>
        </div>
        {errors.delayDuration ? <small className="claim-field-error">{errors.delayDuration}</small> : null}
      </section>
      <section className="claim-question">
        <h3>{t("claim.eligibility.scheduledDepartureDate")}</h3>
        <DatePickerField icon={Calendar} name="date" value={data.date} onChange={onChange} error={errors.date} />
        {errors.date ? <small className="claim-field-error">{errors.date}</small> : null}
      </section>
      <section className="claim-question">
        <h3>{t("claim.eligibility.directFlight")}</h3>
        <label className={`claim-radio${errors.direct ? " is-error" : ""}`}><input type="radio" name="direct" value="yes" checked={data.direct === "yes"} onChange={onChange} required /> {t("claim.eligibility.directYes")}</label>
        <label className={`claim-radio${errors.direct ? " is-error" : ""}`}><input type="radio" name="direct" value="no" checked={data.direct === "no"} onChange={onChange} required /> {t("claim.eligibility.directNo")}</label>
        {errors.direct ? <small className="claim-field-error">{errors.direct}</small> : null}
        {data.direct === "no" ? (
          <label className="claim-wide-field">
            <span>{t("claim.eligibility.connectionCity")}</span>
            <SearchCombobox
              icon={MapPin}
              name="connectionCity"
              value={data.connectionCity || ""}
              placeholder={t("claim.eligibility.connectionCityPlaceholder")}
              options={airportOptions.connection}
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
              error={errors.connectionCity}
            />
            <small className="claim-field-help">{t("claim.eligibility.connectionCityHelp")}</small>
            {errors.connectionCity ? <small className="claim-field-error">{errors.connectionCity}</small> : null}
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

function ContactStep({ data, onChange, onPhoneChange, onNext, onBack, errors = {}, isSaving }) {
  const { t, i18n } = useTranslation();

  return (
    <form className="claim-form" onSubmit={onNext}>
      <section className="claim-question">
        <h3>{t("claim.contact.title")}</h3>
        <div className="claim-two">
          <label>
            <span>{t("claim.contact.fullName")}</span>
            <Field icon={User} name="fullName" value={data.fullName} onChange={onChange} placeholder={t("claim.contact.fullNamePlaceholder")} required error={errors.fullName} />
            {errors.fullName ? <small className="claim-field-error">{errors.fullName}</small> : null}
          </label>
          <label>
            <span>{t("claim.contact.email")}</span>
            <Field icon={Mail} name="email" value={data.email} onChange={onChange} placeholder={t("claim.contact.emailPlaceholder")} required error={errors.email} />
            {errors.email ? <small className="claim-field-error">{errors.email}</small> : null}
          </label>
        </div>
        <label className="claim-wide-field"><span>{t("claim.contact.address")}</span><Field icon={MapPin} name="city" value={data.city} onChange={onChange} placeholder={t("claim.contact.addressPlaceholder")} /></label>
        <small className="claim-field-help">{t("claim.contact.optional")}</small>
        <label className="claim-wide-field">
          <span>{t("claim.contact.phone")}</span>
          <PhoneField data={data} onChange={onPhoneChange} error={errors.phone} t={t} i18n={i18n} />
          {errors.phone ? <small className="claim-field-error">{errors.phone}</small> : null}
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

function DocumentsStep({ data, files, reusablePassportDocument, onChange, onFile, onRemoveFile, onNext, onBack, isSaving, errors = {} }) {
  const { t } = useTranslation();

  return (
    <form className="claim-form" onSubmit={onNext}>
      <section className="claim-question">
        <h3>{t("claim.documents.title")}</h3>
        <p>{t("claim.documents.subtitle")}</p>
        <div className="claim-upload-grid">
          <div>
            <UploadBox title={t("claim.documents.passport")} documentType="passport" icon={User} file={files.passport} existingDocument={!files.passport ? reusablePassportDocument : null} onFile={onFile} error={errors.passport} />
            {errors.passport ? <small className="claim-field-error">{errors.passport}</small> : null}
          </div>
          <div>
            <UploadBox title={t("claim.documents.boardingPass")} documentType="boarding_pass" icon={FileText} file={files.boarding_pass} onFile={onFile} error={errors.boarding_pass} />
            {errors.boarding_pass ? <small className="claim-field-error">{errors.boarding_pass}</small> : null}
          </div>
        </div>
        {files.passport ? <FileRow file={files.passport} done onRemove={() => onRemoveFile("passport")} /> : null}
        {!files.passport && reusablePassportDocument ? (
          <FileRow
            file={{ name: reusablePassportDocument.file_name || t("claim.documents.passport"), size: reusablePassportDocument.file_size || 0 }}
            done
            metaText={t("claim.documents.savedPassportReuse", { defaultValue: "Saved passport on file will be reused." })}
          />
        ) : null}
        {files.boarding_pass && <FileRow file={files.boarding_pass} done onRemove={() => onRemoveFile("boarding_pass")} />}
      </section>
      <section className="claim-question">
        <h3>{t("claim.documents.reasonTitle")}</h3>
        <textarea className={errors.reason ? "is-error" : ""} name="reason" value={data.reason || ""} onChange={onChange} placeholder={t("claim.documents.reasonPlaceholder")} minLength={3} maxLength={200} required aria-invalid={Boolean(errors.reason)} />
        {errors.reason ? <small className="claim-field-error">{errors.reason}</small> : null}
        <small className="claim-limit">{(data.reason || "").length}/200</small>
      </section>

      <div className="claim-actions">
        <button className="claim-back" type="button" onClick={onBack}>{t("common.back")}</button>
        <button className="btn btn-primary" type="submit" disabled={isSaving}>{isSaving ? t("common.saving") : t("common.next")}</button>
      </div>
    </form>
  );
}

function FinishStep({ data, onSignature, onChange, onNext, onBack, isSaving, errors = {} }) {
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
    setHasInk(Boolean(data.signatureDataUrl));
  }, [data.signatureDataUrl]);

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
          <div className={`claim-signature-pad${errors.signatureDataUrl ? " is-error" : ""}`}>
            <canvas
              ref={canvasRef}
              data-field-name="signatureDataUrl"
              tabIndex={0}
              onPointerDown={beginSignature}
              onPointerMove={drawSignature}
              onPointerUp={endSignature}
              onPointerLeave={endSignature}
              onPointerCancel={endSignature}
              aria-label={t("claim.finish.digitalSignature")}
              aria-invalid={Boolean(errors.signatureDataUrl)}
            />
            <button type="button" onClick={clearSignature}>{t("claim.finish.clear")}</button>
          </div>
          <small>{t("claim.finish.signatureHint")}</small>
          {errors.signatureDataUrl ? <small className="claim-field-error">{errors.signatureDataUrl}</small> : null}
        </div>

        <div className="claim-note">
          <Info size={18} strokeWidth={1.8} />
          <p>{t("claim.documents.signatureNote")}</p>
        </div>

        <label className={`claim-sign__terms claim-check${errors.termsAccepted ? " is-error" : ""}`}>
          <input type="checkbox" name="termsAccepted" checked={Boolean(data.termsAccepted)} onChange={onChange} required />
          <span>
            <Trans i18nKey="claim.finish.terms" components={{ termsLink: <LocalizedLink to="/terms" /> }} />
          </span>
        </label>
        {errors.termsAccepted ? <small className="claim-field-error">{errors.termsAccepted}</small> : null}
      </section>
      <div className="claim-actions">
        <button className="claim-back" type="button" onClick={onBack}>{t("common.back")}</button>
        <button className="btn btn-primary" type="submit" disabled={isSaving}>
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
        <LocalizedLink className="claim-back" to="/">{t("common.mainPage")}</LocalizedLink>
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
  const { isAuthenticated } = useAuth();
  const { stage = "eligibility", lang } = useParams();
  const locale = lang || DEFAULT_LANGUAGE;
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
  const [reusablePassportDocument, setReusablePassportDocument] = useState(null);
  const [departureMatches, setDepartureMatches] = useState([]);
  const [destinationMatches, setDestinationMatches] = useState([]);
  const [connectionMatches, setConnectionMatches] = useState([]);
  const [airlineMatches, setAirlineMatches] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [syncNotice, setSyncNotice] = useState("");
  const [errors, setErrors] = useState({});
  const activeIndex = Math.max(0, stages.indexOf(stage));
  const currentLanguageCode = getLanguageByCode(lang || i18n.resolvedLanguage || i18n.language).code;
  const normalizedClaimPath = location.pathname.replace(/\/+$/, "");
  const isBaseClaimPage = normalizedClaimPath === localizePath("/claim", locale);
  const claimTitle = stage === "approved"
    ? t("claim.approved.title")
    : stage === "denied"
      ? t("claim.denied.title")
      : t("claim.heroTitle");
  const claimDescription = stage === "approved"
    ? t("claim.approved.text")
    : stage === "denied"
      ? t("claim.denied.text")
      : t("claim.promoText");
  const seo = buildSeoPayload({
    lang: locale,
    title: `${claimTitle} | ${BRAND_NAME}`,
    description: claimDescription,
    pathname: location.pathname,
    canonicalPath: isBaseClaimPage ? localizePath("/claim", locale) : localizePath(`/claim/${stage}`, locale),
    alternatesPath: "/claim",
    indexable: isBaseClaimPage,
  });

  const withCurrentLanguage = (payload = data) => ({
    ...payload,
    language: currentLanguageCode,
    preferredLanguage: currentLanguageCode,
  });

  const clearFieldError = (fieldName) => {
    setErrors((current) => {
      if (!current[fieldName]) {
        return current;
      }

      const next = { ...current };
      delete next[fieldName];
      return next;
    });
  };

  const validateCurrentStep = (currentStage, currentData = data, currentFiles = files) => {
    const nextErrors = {};
    const selectOptionError = t("claim.validation.selectOption");

    if (currentStage === "eligibility") {
      if (!currentData.departureAirportId) {
        nextErrors.departure = selectOptionError;
      }

      if (!currentData.destinationAirportId) {
        nextErrors.destination = selectOptionError;
      }

      if (!hasSelectedAirlineOption(currentData)) {
        nextErrors.airline = selectOptionError;
      }

      if (!String(currentData.date || "").trim()) {
        nextErrors.date = t("claim.validation.flightDateRequired");
      }

      if (!String(currentData.delayDuration || "").trim()) {
        nextErrors.delayDuration = t("claim.validation.delayDurationRequired");
      }

      if (!String(currentData.direct || "").trim()) {
        nextErrors.direct = t("claim.validation.directRequired");
      }

      if (currentData.direct === "no" && !currentData.connectionAirportId) {
        nextErrors.connectionCity = selectOptionError;
      }

      if (hasSameAirportSelection(currentData)) {
        nextErrors.destination = t("claim.eligibility.sameAirportError");
      }
    }

    if (currentStage === "contact") {
      if (!String(currentData.fullName || "").trim()) {
        nextErrors.fullName = t("claim.validation.fullNameRequired");
      }

      const nextEmailError = getEmailError(currentData.email, t);
      if (nextEmailError) {
        nextErrors.email = nextEmailError;
      }

      const nextPhoneError = getPhoneError(currentData, t);
      if (nextPhoneError) {
        nextErrors.phone = nextPhoneError;
      }
    }

    if (currentStage === "documents") {
      if (!currentFiles?.passport && !reusablePassportDocument) {
        nextErrors.passport = t("claim.validation.passportRequired");
      }

      if (!currentFiles?.boarding_pass) {
        nextErrors.boarding_pass = t("claim.validation.boardingPassRequired");
      }

      if (!String(currentData.reason || "").trim()) {
        nextErrors.reason = t("claim.validation.reasonRequired");
      }
    }

    if (currentStage === "finish") {
      if (!currentData.signatureDataUrl) {
        nextErrors.signatureDataUrl = t("claim.validation.signatureRequired");
      }

      if (!currentData.termsAccepted) {
        nextErrors.termsAccepted = t("claim.validation.termsRequired");
      }
    }

    return nextErrors;
  };

  useEffect(() => {
    const draft = buildStoredClaimDraft(data, stage, currentLanguageCode);

    if (!hasStoredClaimDraftContent(draft)) {
      clearStoredClaimDraft();
      return;
    }

    window.localStorage.setItem(CLAIM_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  }, [currentLanguageCode, data, stage]);

  useEffect(() => {
    let active = true;

    if (!isAuthenticated || !isSupabaseConfigured) {
      return undefined;
    }

    fetchClaimReuseData()
      .then((prefill) => {
        if (!active || !prefill) {
          return;
        }

        const parsedPhone = parseStoredPhone(
          prefill.phone,
          prefill.phoneCountry,
          prefill.phoneDialCode,
          prefill.phoneLocalNumber,
        );

        setData((current) => ({
          ...current,
          fullName: current.fullName || prefill.fullName || "",
          email: current.email || prefill.email || "",
          ...(current.phone || current.phoneLocalNumber ? {} : parsedPhone),
          city: current.city || prefill.city || "",
          preferredLanguage: current.preferredLanguage || prefill.preferredLanguage || current.preferredLanguage || "",
          whatsapp: typeof current.whatsapp === "boolean" ? current.whatsapp : Boolean(prefill.whatsapp),
        }));
      })
      .catch(() => null);

    return () => {
      active = false;
    };
  }, [isAuthenticated]);

  const go = (nextStage, nextData = data, nextFiles = files) => {
    const isTerminalStage = nextStage === "approved" || nextStage === "denied";
    const navigationData = isTerminalStage ? buildSafeApprovedClaimData(nextData) : nextData;
    const navigationFiles = isTerminalStage ? {} : nextFiles;

    navigate(
      toLocalizedPath(`/claim/${nextStage}`),
      {
        state: {
          claimFlow: {
            data: navigationData,
            files: navigationFiles,
          },
        },
      },
    );
  };

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
    setErrors({});
  }, [stage]);

  useEffect(() => {
    if (stage !== "approved") {
      return;
    }

    const trackingKey = data.leadId || data.leadCode || data.email || "";
    if (!trackingKey || wasClaimSubmissionTracked(trackingKey)) {
      return;
    }

    markClaimSubmissionTracked(trackingKey);
    void trackAnalyticsEvent("claim_submitted");
  }, [data.email, data.leadCode, data.leadId, stage]);

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
    if (stage !== "eligibility" || data.direct !== "no") {
      setConnectionMatches([]);
      return;
    }

    if (!data.connectionCity || data.connectionCity.length < 2) {
      setConnectionMatches([]);
      return;
    }

    const timeout = window.setTimeout(async () => {
      try {
        const airports = await searchAirports(data.connectionCity);
        setConnectionMatches(airports.map((airport) => describeAirportOption(airport)));
      } catch {
        setConnectionMatches([]);
      }
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [data.connectionCity, data.direct, stage]);

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

    if (name === "connectionCity") {
      nextData.connectionCity = selectedOption.label;
      nextData.connectionAirportId = selectedOption.id || null;
      nextData.connectionAirportSource = selectedOption.source || null;
    }

    if (name === "airline") {
      nextData.airline = selectedOption.label;
      nextData.airlineId = selectedOption.source === "supabase" ? selectedOption.id || null : null;
      nextData.airlineSource = selectedOption.source || null;
    }

    if (hasSameAirportSelection(nextData)) {
      const message = t("claim.eligibility.sameAirportError", {
        defaultValue: "Departure and arrival airports must be different.",
      });
      setErrors((current) => ({ ...current, destination: message }));
      setSyncError(t("claim.validation.summary"));
      return;
    }

    setSyncError("");
    if (name === "departure" || name === "destination") {
      clearFieldError("departure");
      clearFieldError("destination");
    } else {
      clearFieldError(name);
    }
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

    if (name === "connectionCity") {
      nextData.connectionAirportId = null;
      nextData.connectionAirportSource = null;
    }

    if (name === "direct" && value === "yes") {
      nextData.connectionCity = "";
      nextData.connectionAirportId = null;
      nextData.connectionAirportSource = null;
    }

    setSyncError("");
    if (name === "departure" || name === "destination") {
      clearFieldError("departure");
      clearFieldError("destination");
    } else {
      clearFieldError(name);
    }
    setData(nextData);
  };

  const onChange = (eventOrName, maybeValue) => {
    if (typeof eventOrName === "string") {
      onFieldInput(eventOrName, maybeValue);
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

    if (name === "connectionCity") {
      nextData.connectionAirportId = null;
      nextData.connectionAirportSource = null;
    }

    if (name === "direct" && value === "yes") {
      nextData.connectionCity = "";
      nextData.connectionAirportId = null;
      nextData.connectionAirportSource = null;
    }

    setSyncError("");
    clearFieldError(name);
    setData(nextData);
  };

  const onPhoneChange = (kind, value) => {
    const nextCountry = kind === "country"
      ? getPhoneCountryOption(value)
      : getPhoneCountryOption(data.phoneCountry || "az");
    const nextDialCode = normalizeDialCode(nextCountry.dialCode);
    const nextLocalNumber = kind === "country"
      ? formatLocalPhoneNumber(data.phoneLocalNumber || "", nextCountry.code)
      : formatLocalPhoneNumber(String(value || "").replace(/[^\d()\-\s]/g, ""), nextCountry.code);
    const nextData = {
      ...data,
      phoneCountry: nextCountry.code,
      phoneDialCode: nextDialCode,
      phoneLocalNumber: nextLocalNumber,
      phone: buildFullPhoneNumber(nextDialCode, nextLocalNumber),
    };

    setData(nextData);
    setSyncError("");
    clearFieldError("phone");
  };

  const onFile = (documentType, file) => {
    setSyncError("");
    clearFieldError(documentType);
    setFiles((current) => ({ ...current, [documentType]: file }));
  };

  const onRemoveFile = (documentType) => {
    setSyncError("");
    setFiles((current) => {
      const next = { ...current };
      delete next[documentType];
      return next;
    });
  };

  const onSignature = (signatureDataUrl) => {
    setSyncError("");
    clearFieldError("signatureDataUrl");
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
    const nextErrors = validateCurrentStep(stage);
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      setSyncError(t("claim.validation.summary"));
      focusClaimField(Object.keys(nextErrors)[0]);
      return;
    }

    if (stage === "eligibility" && data.delayDuration === "less_than_3") {
      if (isSupabaseConfigured) {
        try {
          const { leadId, nextData } = await ensureLead();
          await submitLead(leadId, withCurrentLanguage(), "not_eligible");
          clearStoredClaimDraft();
          const safeDeniedData = buildSafeApprovedClaimData(nextData);
          setFiles({});
          setReusablePassportDocument(null);
          setData(safeDeniedData);
          go("denied", safeDeniedData, {});
        } catch (error) {
          setSyncError(error.message || t("claim.status.saveLeadError"));
          return;
        }
      }

      setSyncNotice(t("claim.status.notEligible"));
      return;
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
        await saveLeadDocuments(leadId, withCurrentLanguage(), files, {
          reusablePassportDocument: files.passport ? null : reusablePassportDocument,
        });
      }

      if (stage === "finish") {
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
        clearReferralAttribution();
        const safeApprovedData = buildSafeApprovedClaimData(nextData, {
          leadId,
          leadCode: result?.leadCode || nextData.leadCode || "",
        });
        setFiles({});
        setReusablePassportDocument(null);
        setErrors({});
        setData(safeApprovedData);
        go(nextStage, safeApprovedData, {});
        return;
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
    if (stage === "contact") return <ContactStep data={data} onChange={onChange} onPhoneChange={onPhoneChange} onNext={(event) => submit("documents", event)} onBack={() => go("eligibility")} errors={errors} isSaving={isSaving} />;
    if (stage === "documents") return <DocumentsStep data={data} files={files} reusablePassportDocument={reusablePassportDocument} onChange={onChange} onFile={onFile} onRemoveFile={onRemoveFile} onNext={(event) => submit("finish", event)} onBack={() => go("contact")} errors={errors} isSaving={isSaving} />;
    if (stage === "finish") {
      return (
        <FinishStep
          data={data}
          onSignature={onSignature}
          onChange={onChange}
          onNext={(event) => submit("approved", event)}
          onBack={() => go("documents")}
          errors={errors}
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
          connection: connectionMatches.filter((option) => (
            String(option.id || "") !== String(data.departureAirportId || "")
            && String(option.id || "") !== String(data.destinationAirportId || "")
            && normalizeAirportValue(option.label) !== normalizeAirportValue(data.departure)
            && normalizeAirportValue(option.label) !== normalizeAirportValue(data.destination)
          )),
        }}
        airlineOptions={airlineMatches}
        errors={errors}
        isSaving={isSaving}
      />
    );
  };

  return (
    <>
      <SeoHead {...seo} />
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
    </>
  );
}

export default ClaimFlow;
