import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  BadgeCheck,
  Calendar,
  Check,
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
  saveLeadSignature,
  sendLeadConfirmationEmail,
  saveLeadStep,
  submitLead,
} from "../../services/leadService.js";
import "./style.scss";

const stages = ["eligibility", "contact", "documents", "finish"];
const stageLabels = ["Eligibility Check", "Contact Information", "Documents", "Finish"];
const emailPattern = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

function getEmailError(value) {
  const email = String(value || "").trim();
  if (!email || !emailPattern.test(email)) {
    return "Введите корректный email адрес";
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

function Flag() {
  return (
    <span className="claim-flag" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 36 36">
        <clipPath id="claim-en-clip"><circle cx="18" cy="18" r="18" /></clipPath>
        <g clipPath="url(#claim-en-clip)">
          <path fill="#012169" d="M0 0h36v36H0z" />
          <path stroke="#fff" strokeWidth="7" d="m0 0 36 36M36 0 0 36" />
          <path stroke="#C8102E" strokeWidth="4" d="m0 0 36 36M36 0 0 36" />
          <path stroke="#fff" strokeWidth="11" d="M18 0v36M0 18h36" />
          <path stroke="#C8102E" strokeWidth="7" d="M18 0v36M0 18h36" />
        </g>
      </svg>
    </span>
  );
}

function ClaimHeader() {
  return (
    <header className="claim-header">
      <Link to="/" className="claim-brand" aria-label="Fly Friendly home">
        <img src={logoImage} alt="" />
        <img src={logoText} alt="Fly Friendly" />
      </Link>
      <span className="claim-lang"><Flag /> Eng</span>
    </header>
  );
}

function ClaimFooter() {
  return (
    <footer className="claim-footer">
      <nav>
        <Link to="/contact">Contact</Link>
        <Link to="/about">About us</Link>
        <Link to="/privacyPolicy">Privacy</Link>
        <Link to="/terms">Terms and Conditions</Link>
      </nav>
      <span>©2026 Fly Friendly</span>
    </footer>
  );
}

function Stepper({ activeIndex, completed = false }) {
  return (
    <div className="claim-stepper" aria-label="Claim progress">
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
  return (
    <aside className="claim-promo">
      <div className="claim-promo__top">
        <Link to="/" className="claim-brand">
          <img src={logoImage} alt="" />
          <img src={logoText} alt="Fly Friendly" />
        </Link>
        <span className="claim-lang"><Flag /> English</span>
      </div>
      <h2>Claim up to <strong>€600</strong> now.</h2>
      <p>We fight for your right to compensation. Submit your claim in minutes and let us handle the airline.</p>
      <img className="claim-promo__image" src={claimImage} alt="Traveler with passport and luggage" />
      <h3>Flight Delay</h3>
      <p>Arrived 3+ hours late? You're eligible.</p>
      <ul>
        <li><CircleCheck size={18} /> All airlines</li>
        <li><CircleCheck size={18} /> All countries</li>
        <li><CircleCheck size={18} /> No win, no fee</li>
      </ul>
    </aside>
  );
}

function UploadBox({ title, documentType, icon: Icon, file, onFile }) {
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
      <strong>{file ? file.name : "Drag and Drop file"}</strong>
      <em>or</em>
      <b>Upload file</b>
      <small>Please upload your boarding pass as PNG, JPG or PDF. Max size 25MB</small>
      <mark>{title}</mark>
    </label>
  );
}

function FileRow({ file, done, onRemove }) {
  return (
    <div className={`claim-file${done ? " is-done" : ""}`}>
      <FileText size={22} strokeWidth={1.8} />
      <div>
        <strong>{file?.name || "Document"}</strong>
        <small>{formatFileSize(file?.size || 0)} / {formatFileSize(file?.size || 0)}</small>
        <span />
      </div>
      {done ? <CircleCheck size={20} /> : <ShieldCheck size={20} />}
      <button type="button" className="claim-file__remove" aria-label={`Remove ${file?.name || "file"}`} onClick={onRemove}>
        <X size={18} />
      </button>
    </div>
  );
}

function EligibilityStep({ data, onChange, onSelect, onNext, airportOptions, airlineOptions }) {
  return (
    <form className="claim-form" onSubmit={onNext}>
      <section className="claim-question">
        <h3>Where did you fly?</h3>
        <div className="claim-two">
          <SearchCombobox
            icon={PlaneTakeoff}
            name="departure"
            value={data.departure}
            placeholder="Departure airport, city or country"
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
            emptyLabel="No airports found"
          />
          <SearchCombobox
            icon={PlaneLanding}
            name="destination"
            value={data.destination}
            placeholder="Arrival airport, city or country"
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
            emptyLabel="No airports found"
          />
        </div>
      </section>
      <section className="claim-question">
        <h3>Which airline did you fly with?</h3>
        <SearchCombobox
          icon={Plane}
          name="airline"
          value={data.airline}
          placeholder="Search airline"
          options={airlineOptions}
          onInputChange={onChange}
          onSelect={onSelect}
          renderOption={(option) => ({
            title: option.title,
            subtitle: option.subtitle,
            code: option.code,
          })}
          emptyLabel="No airlines found"
        />
      </section>
      <section className="claim-question">
        <div className="claim-question-title">
          <span>4</span>
          <h3>Flight delay duration</h3>
        </div>
        <div className="claim-option-grid">
          <label className={`claim-choice-card${data.delayDuration === "less_than_3" ? " is-selected" : ""}`}>
            <input type="radio" name="delayDuration" value="less_than_3" checked={data.delayDuration === "less_than_3"} onChange={onChange} required />
            <strong>Less than 3 hours</strong>
            <small>Not eligible</small>
          </label>
          <label className={`claim-choice-card${data.delayDuration === "more_than_3" ? " is-selected" : ""}`}>
            <input type="radio" name="delayDuration" value="more_than_3" checked={data.delayDuration === "more_than_3"} onChange={onChange} required />
            <strong>More than 3 hours</strong>
            <small>Eligible for claim</small>
          </label>
          <label className={`claim-choice-card${data.delayDuration === "cancelled" ? " is-selected" : ""}`}>
            <input type="radio" name="delayDuration" value="cancelled" checked={data.delayDuration === "cancelled"} onChange={onChange} required />
            <strong>Flight cancelled</strong>
            <small>Special rights</small>
          </label>
        </div>
      </section>
      <section className="claim-question">
        <h3>What was your scheduled departure date?</h3>
        <Field icon={Calendar} name="date" value={data.date} onChange={onChange} type="date" placeholder="dd.mm.yyyy" />
      </section>
      <section className="claim-question">
        <h3>Was it a direct flight?</h3>
        <label className="claim-radio"><input type="radio" name="direct" value="yes" checked={data.direct === "yes"} onChange={onChange} required /> Yes, that was direct</label>
        <label className="claim-radio"><input type="radio" name="direct" value="no" checked={data.direct === "no"} onChange={onChange} required /> No, that was not direct</label>
      </section>
      <div className="claim-actions">
        <span />
        <button className="btn btn-primary" type="submit">Next</button>
      </div>
    </form>
  );
}

function ContactStep({ data, onChange, onNext, onBack, emailError }) {
  return (
    <form className="claim-form" onSubmit={onNext}>
      <section className="claim-question">
        <h3>Please, enter your contact information.</h3>
        <div className="claim-two">
          <label><span>Full Name</span><Field icon={User} name="fullName" value={data.fullName} onChange={onChange} placeholder="Enter Your Full Name" required /></label>
          <label>
            <span>Email</span>
            <Field icon={Mail} name="email" value={data.email} onChange={onChange} placeholder="Enter Your Email" required error={emailError} />
            {emailError ? <small className="claim-field-error">{emailError}</small> : null}
          </label>
        </div>
        <label className="claim-wide-field"><span>Address</span><Field icon={MapPin} name="city" value={data.city} onChange={onChange} placeholder="Enter Your City" /></label>
        <small className="claim-field-help">Optional</small>
        <label className="claim-wide-field"><span>Contact Number (WhatsApp preferred)</span><Field icon={Phone} name="phone" value={data.phone} onChange={onChange} placeholder="E.g.: +90 5xx xxx xx xx" required /></label>
        <label className="claim-check"><input type="checkbox" name="whatsapp" checked={Boolean(data.whatsapp)} onChange={onChange} /> Yes, this number has Whatsapp.</label>
        <small className="claim-field-help">Required to proceed.</small>
      </section>
      <div className="claim-actions">
        <button className="claim-back" type="button" onClick={onBack}>Back</button>
        <button className="btn btn-primary" type="submit">Next</button>
      </div>
    </form>
  );
}

function DocumentsStep({ data, files, onChange, onFile, onRemoveFile, onNext, onBack, isSaving }) {
  return (
    <form className="claim-form" onSubmit={onNext}>
      <section className="claim-question">
        <h3>Secure Document Upload</h3>
        <p>Please upload your Passport and Boarding Pass.</p>
        <div className="claim-upload-grid">
          <UploadBox title="Passport" documentType="passport" icon={User} file={files.passport} onFile={onFile} />
          <UploadBox title="Boarding Pass" documentType="boarding_pass" icon={FileText} file={files.boarding_pass} onFile={onFile} />
        </div>
        {files.passport && <FileRow file={files.passport} done onRemove={() => onRemoveFile("passport")} />}
        {files.boarding_pass && <FileRow file={files.boarding_pass} done onRemove={() => onRemoveFile("boarding_pass")} />}
      </section>
      <section className="claim-question">
        <h3>What was the official reason for your flight delay or cancellation?</h3>
        <textarea name="reason" value={data.reason || ""} onChange={onChange} placeholder="e.g., Crew/Staffing Problems" minLength={3} maxLength={200} required />
        <small className="claim-limit">{(data.reason || "").length}/200</small>
      </section>
      <div className="claim-note">
        <Info size={18} strokeWidth={1.8} />
        <p>Your signature give us consent to get the compensation for your flight from the airline. You signature is requested by the airline to process the compensation. By signing, you agree to the terms and conditions.</p>
      </div>
      <div className="claim-actions">
        <button className="claim-back" type="button" onClick={onBack}>Back</button>
        <button className="btn btn-primary" type="submit" disabled={isSaving}>{isSaving ? "Saving..." : "Next"}</button>
      </div>
    </form>
  );
}

function FinishStep({ data, onSignature, onChange, onNext, onBack, isSaving }) {
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
        <h3>Finish & Sign</h3>
        <p>Please review the terms and sign below to finalize your claim.</p>
        <div className="claim-sign__field">
          <label>Digital Signature</label>
          <div className="claim-signature-pad">
            <canvas
              ref={canvasRef}
              onPointerDown={beginSignature}
              onPointerMove={drawSignature}
              onPointerUp={endSignature}
              onPointerLeave={endSignature}
              onPointerCancel={endSignature}
              aria-label="Digital signature"
            />
            <button type="button" onClick={clearSignature}>Clear</button>
          </div>
          <small>* Please use your mouse or finger to sign inside the box.</small>
        </div>
        <label className="claim-sign__terms">
          <input type="checkbox" name="termsAccepted" checked={Boolean(data.termsAccepted)} onChange={onChange} required />
          <span>
            I agree to the <Link to="/terms">Terms & Conditions</Link> and confirm that the information provided is accurate.
          </span>
        </label>
      </section>
      <div className="claim-actions">
        <button className="claim-back" type="button" onClick={onBack}>Back</button>
        <button className="btn btn-primary" type="submit" disabled={isSaving || !hasInk || !data.termsAccepted}>
          {isSaving ? "Submitting..." : "Submit Claim"}
        </button>
      </div>
    </form>
  );
}

function DeniedResult({ data }) {
  return (
    <div className="claim-result is-denied">
      <section className="claim-question">
        <CircleAlert className="result-icon" size={34} strokeWidth={1.8} />
        <h3>Unfortunately, there's no compensation for this flight.</h3>
        <p>We help customers under several air passenger regulations, but unfortunately, this flight isn't covered by any of them.</p>
        <div className="claim-two">
          <Field icon={Plane} value={data.departure || "Baku (BAK)"} placeholder="Baku (BAK)" />
          <Field icon={Plane} value={data.destination || "Washington (DCA)"} placeholder="Washington (DCA)" />
        </div>
        <div className="claim-note">
          <Info size={18} strokeWidth={1.8} />
          <p><strong>Note: This data is not shared publicly.</strong><br />We use this information strictly to personalize your experience and improve our service.</p>
        </div>
      </section>
      <section className="claim-question claim-protect">
        <Link to="/" className="claim-brand">
          <img src={logoImage} alt="" />
          <img src={logoText} alt="Fly Friendly" />
        </Link>
        <h3>Stay protected next time - instantly.</h3>
        <p>Perfect for frequent travelers and smart planners</p>
        <ul>
          <li><CircleCheck size={18} /> Unlimited flight searches</li>
          <li><CircleCheck size={18} /> Real-time fare updates</li>
          <li><CircleCheck size={18} /> Saved trips & favorites</li>
          <li><CircleCheck size={18} /> Multi-city trip planner</li>
          <li><CircleCheck size={18} /> Early access to travel deals</li>
        </ul>
        <Link className="btn btn-primary" to="/claim/eligibility">Check Compensation</Link>
      </section>
      <div className="claim-actions">
        <Link className="claim-back" to="/claim/eligibility">Back</Link>
        <Link className="btn btn-primary" to="/">Main Page</Link>
      </div>
    </div>
  );
}

function ApprovedResult({ data }) {
  const nextSteps = [
    ["We check your flight history", "Our specialists confirm all flight data, from departure records to delay reasons."],
    ["We build your case smartly", "AI-assisted tools help us gather the strongest arguments, so airlines can't ignore your rights."],
    ["We talk to the airline", "Our negotiation team contacts the airline directly, speeding up responses and ensuring fair compensation."],
    ["If things get complicated", "Sometimes airlines resist. That's when our legal network steps in to take it further, still no fee unless you win."],
    ["Payment takes off", "When your claim is approved, we transfer the money straight to your account."],
  ];

  return (
    <div className="claim-result is-approved">
      <section className="claim-question">
        <CircleCheck className="result-icon" size={34} strokeWidth={1.8} />
        <h3>Thank you, your claim is on its way!</h3>
        <p>Thanks for trusting Fly Friendly, your request has safely landed in our system. Our flight compensation team is now reviewing your case and will keep you informed as it progresses.</p>
        <div className="claim-two">
          <Field icon={Plane} value={data.departure || "Baku (BAK)"} placeholder="Baku (BAK)" />
          <Field icon={Plane} value={data.destination || "Washington (DCA)"} placeholder="Washington (DCA)" />
        </div>
        <strong className="claim-id">Lead ID: #{data.leadCode || "Pending"}</strong>
      </section>
      <section className="claim-question claim-next">
        <h3>What happens next</h3>
        <p>Every claim is handled by a dedicated team, specialists, negotiators, and legal pros who know air travel inside out.</p>
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
        <Link className="claim-back" to="/claim/finish">Back</Link>
        <Link className="btn btn-primary" to="/">Main Page</Link>
      </div>
    </div>
  );
}

function ClaimFlow() {
  const navigate = useNavigate();
  const { stage = "eligibility" } = useParams();
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
        setEmailError(getEmailError(maybeValue));
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
      setEmailError(getEmailError(value));
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

    const lead = await createLead(data);
    setData((current) => ({ ...current, leadId: lead.id, leadCode: lead.lead_code }));
    return lead.id;
  };

  const go = (nextStage) => navigate(`/claim/${nextStage}`);
  const submit = async (nextStage, event) => {
    event.preventDefault();

    setSyncError("");
    setSyncNotice("");

    if (stage === "eligibility" && data.delayDuration === "less_than_3") {
      if (isSupabaseConfigured) {
        try {
          const leadId = await ensureLead();
          await submitLead(leadId, data, "not_eligible");
        } catch (error) {
          setSyncError(error.message || "Could not save lead data.");
          return;
        }
      }

      setSyncNotice("Based on the delay duration, this flight is not eligible for compensation.");
      go("denied");
      return;
    }

    if (stage === "contact") {
      const nextEmailError = getEmailError(data.email);
      if (nextEmailError) {
        setEmailError(nextEmailError);
        return;
      }

      setEmailError("");
    }

    if (!isSupabaseConfigured) {
      setSyncError("Supabase env is missing. The form is saved locally only.");
      go(nextStage);
      return;
    }

    setIsSaving(true);

    try {
      const leadId = await ensureLead();

      if (stage === "eligibility") {
        await saveLeadStep(leadId, "contact", data);
      }

      if (stage === "contact") {
        await saveLeadStep(leadId, "documents", data);
      }

      if (stage === "documents") {
        await saveLeadDocuments(leadId, data, files);
      }

      if (stage === "finish") {
        if (!data.signatureDataUrl || !data.termsAccepted) {
          throw new Error("Please sign and accept the terms before submitting.");
        }

        await saveLeadSignature(leadId, data);
        await submitLead(leadId, data, "eligible");

        try {
          const emailResult = await sendLeadConfirmationEmail(leadId);
          if (emailResult?.already_sent) {
            setSyncNotice(`Claim submitted. Confirmation email was already sent to ${data.email || "the customer"}.`);
          } else if (emailResult?.sent) {
            setSyncNotice(`Claim submitted. Confirmation email was sent to ${data.email || "the customer"}.`);
          }
        } catch (emailError) {
          console.error("Confirmation email error:", emailError);
          setSyncNotice("Claim submitted, but the confirmation email could not be sent automatically.");
        }
      }

      if (stage !== "finish") {
        setSyncNotice("Saved in Supabase.");
      }
      go(nextStage);
    } catch (error) {
      setSyncError(error.message || "Could not save claim data.");
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
            <span className="section-label is-primary"><BadgeCheck size={16} fill="currentColor" aria-hidden="true" /> Verified by Real Travelers</span>
            <h1>Check and claim compensation</h1>
            <p>Serving millions of passengers in all countries, speaking all languages.</p>
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
