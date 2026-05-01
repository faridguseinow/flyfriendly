import { useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  BadgeCheck,
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
      <span className="claim-lang"><span className="claim-flag" aria-hidden="true">{currentLanguage.flag}</span> {currentLanguage.code.toUpperCase()}</span>
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

function DatePickerField({ icon: Icon, name, value, onChange }) {
  const rootRef = useRef(null);
  const { t, i18n } = useTranslation();
  const locale = getLocale(i18n.resolvedLanguage || i18n.language);
  const selectedDate = parseDateInputValue(value);
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => selectedDate || new Date());

  useEffect(() => {
    if (selectedDate) {
      setViewDate(selectedDate);
    }
  }, [value]);

  useEffect(() => {
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
  }, []);

  const weekdayFormatter = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const monthFormatter = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });
  const valueFormatter = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" });
  const weekdays = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(2024, 0, 1 + index);
    return weekdayFormatter.format(day);
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
      <button type="button" className="claim-field claim-date-picker__trigger" onClick={() => setIsOpen((current) => !current)}>
        <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
        <span className={`claim-date-picker__value${selectedValue ? "" : " is-placeholder"}`}>
          {selectedValue ? valueFormatter.format(selectedDate) : (t("claim.datePicker.placeholder", { defaultValue: "Select date" }))}
        </span>
        <Calendar size={18} strokeWidth={1.8} aria-hidden="true" />
      </button>

      {isOpen ? (
        <div className="claim-date-picker__panel">
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
            {weekdays.map((label) => <span key={label}>{label.slice(0, 2)}</span>)}
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
        </div>
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
        <span className="claim-lang"><span className="claim-flag" aria-hidden="true">{currentLanguage.flag}</span> {currentLanguage.label}</span>
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

function EligibilityStep({ data, onChange, onSelect, onNext, airportOptions, airlineOptions }) {
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
        <h3>{t("claim.eligibility.flightNumber", { defaultValue: "What was your flight number?" })}</h3>
        <Field
          icon={Plane}
          name="flightNumber"
          value={data.flightNumber}
          onChange={onChange}
          placeholder={t("claim.eligibility.flightNumberPlaceholder", { defaultValue: "For example: AZ123 or BA2490" })}
          required
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
      </section>
      <div className="claim-actions">
        <span />
        <button className="btn btn-primary" type="submit">{t("common.next")}</button>
      </div>
    </form>
  );
}

function ContactStep({ data, onChange, onNext, onBack, emailError }) {
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
        <label className="claim-wide-field"><span>{t("claim.contact.phone")}</span><Field icon={Phone} name="phone" value={data.phone} onChange={onChange} placeholder={t("claim.contact.phonePlaceholder")} required /></label>
        <label className="claim-check"><input type="checkbox" name="whatsapp" checked={Boolean(data.whatsapp)} onChange={onChange} /> {t("claim.contact.hasWhatsapp")}</label>
        <small className="claim-field-help">{t("claim.contact.requiredToProceed")}</small>
      </section>
      <div className="claim-actions">
        <button className="claim-back" type="button" onClick={onBack}>{t("common.back")}</button>
        <button className="btn btn-primary" type="submit">{t("common.next")}</button>
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
  const toLocalizedPath = useLocalizedPath();
  const { t, i18n } = useTranslation();
  const { stage = "eligibility", lang } = useParams();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState(() => ({
    ...JSON.parse(localStorage.getItem("flyFriendlyClaim") || "{}"),
    departure: searchParams.get("departure") || JSON.parse(localStorage.getItem("flyFriendlyClaim") || "{}").departure,
    destination: searchParams.get("destination") || JSON.parse(localStorage.getItem("flyFriendlyClaim") || "{}").destination,
  }));
  const [files, setFiles] = useState({});
  const [departureMatches, setDepartureMatches] = useState([]);
  const [destinationMatches, setDestinationMatches] = useState([]);
  const [airlineMatches, setAirlineMatches] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [syncNotice, setSyncNotice] = useState("");
  const [emailError, setEmailError] = useState("");
  const activeIndex = Math.max(0, stages.indexOf(stage));
  const currentLanguageCode = getLanguageByCode(lang || i18n.resolvedLanguage || i18n.language).code;

  const withCurrentLanguage = (payload = data) => ({
    ...payload,
    language: currentLanguageCode,
    preferredLanguage: currentLanguageCode,
  });

  useEffect(() => {
    localStorage.setItem("flyFriendlyClaim", JSON.stringify(data));
  }, [data]);

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
      nextData.departureAirportId = selectedOption.source === "supabase" ? selectedOption.id || null : null;
      nextData.departureAirportSource = selectedOption.source || null;
    }

    if (name === "destination") {
      nextData.destination = selectedOption.label;
      nextData.destinationAirportId = selectedOption.source === "supabase" ? selectedOption.id || null : null;
      nextData.destinationAirportSource = selectedOption.source || null;
    }

    if (name === "airline") {
      nextData.airline = selectedOption.label;
      nextData.airlineId = selectedOption.source === "supabase" ? selectedOption.id || null : null;
      nextData.airlineSource = selectedOption.source || null;
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

    setData(nextData);

    if (name === "email" && emailError) {
      setEmailError(getEmailError(value, t));
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

  const ensureLead = async () => {
    if (data.leadId) {
      return data.leadId;
    }

    const lead = await createLead(withCurrentLanguage());
    setData((current) => ({ ...current, leadId: lead.id, leadCode: lead.lead_code }));
    return lead.id;
  };

  const go = (nextStage) => navigate(toLocalizedPath(`/claim/${nextStage}`));
  const submit = async (nextStage, event) => {
    event.preventDefault();

    setSyncError("");
    setSyncNotice("");

    if (stage === "eligibility" && data.delayDuration === "less_than_3") {
      if (isSupabaseConfigured) {
        try {
          const leadId = await ensureLead();
          await submitLead(leadId, withCurrentLanguage(), "not_eligible");
        } catch (error) {
          setSyncError(error.message || t("claim.status.saveLeadError"));
          return;
        }
      }

      setSyncNotice(t("claim.status.notEligible"));
      go("denied");
      return;
    }

    if (stage === "contact") {
      const nextEmailError = getEmailError(data.email, t);
      if (nextEmailError) {
        setEmailError(nextEmailError);
        return;
      }

      setEmailError("");
    }

    if (!isSupabaseConfigured) {
      setSyncError(t("claim.status.supabaseMissing"));
      go(nextStage);
      return;
    }

    setIsSaving(true);

    try {
      const leadId = await ensureLead();

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
      }

      if (stage !== "finish") {
        setSyncNotice(t("common.savedInSupabase"));
      }
      go(nextStage);
    } catch (error) {
      setSyncError(error.message || t("claim.status.saveClaimError"));
    } finally {
      setIsSaving(false);
    }
  };

  const renderStage = () => {
    if (stage === "denied") return <DeniedResult data={data} />;
    if (stage === "approved") return <ApprovedResult data={data} />;
    if (stage === "contact") return <ContactStep data={data} onChange={onChange} onNext={(event) => submit("documents", event)} onBack={() => go("eligibility")} emailError={emailError} />;
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
        airportOptions={{ departure: departureMatches, destination: destinationMatches }}
        airlineOptions={airlineMatches}
      />
    );
  };

  return (
    <div className="claim-page">
      <div className="claim-frame">
        <ClaimHeader />
        <main className="claim-shell">
          <section className="claim-main">
            <span className="section-label is-primary"><BadgeCheck size={16} fill="currentColor" aria-hidden="true" /> {t("claim.heroLabel")}</span>
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
