import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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
import { isSupabaseConfigured } from "../../lib/supabase.js";
import { getCurrentSession } from "../../services/authService.js";
import {
  createDraftClaim,
  saveContactInformation,
  saveDocumentStep,
  saveEligibilityCheck,
  submitClaim,
} from "../../services/claimService.js";
import "./style.scss";

const stages = ["eligibility", "contact", "documents", "finish"];
const stageLabels = ["Eligibility Check", "Contact Information", "Documents", "Finish"];
const airportOptions = [
  "London (LHR)",
  "Washington (DCA)",
  "Baku (GYD)",
  "Istanbul (IST)",
  "Dubai (DXB)",
  "Paris (CDG)",
  "Amsterdam (AMS)",
  "Frankfurt (FRA)",
  "New York (JFK)",
  "Los Angeles (LAX)",
  "Doha (DOH)",
  "Singapore (SIN)",
];
const airlineOptions = [
  "Azerbaijan Airlines / J2 / AHY",
  "British Airways / BA / BAW",
  "Turkish Airlines / TK / THY",
  "Lufthansa / LH / DLH",
  "Emirates / EK / UAE",
  "Qatar Airways / QR / QTR",
  "Air France / AF / AFR",
  "KLM / KL / KLM",
  "United Airlines / UA / UAL",
  "American Airlines / AA / AAL",
  "Delta Air Lines / DL / DAL",
  "Wizz Air / W6 / WZZ",
];

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
      <span>©2025 Fly Friendly</span>
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

function Field({ icon: Icon, placeholder, type = "text", name, value, onChange, list, required = false }) {
  return (
    <label className="claim-field">
      <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
      <input name={name} value={value || ""} onChange={onChange} readOnly={!onChange} type={type} placeholder={placeholder} list={list} required={required} />
    </label>
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

function FileRow({ done }) {
  return (
    <div className={`claim-file${done ? " is-done" : ""}`}>
      <FileText size={22} strokeWidth={1.8} />
      <div>
        <strong>Document.docx</strong>
        <small>1 MB / 1.2 MB</small>
        <span />
      </div>
      {done ? <CircleCheck size={20} /> : <ShieldCheck size={20} />}
      <X size={18} />
    </div>
  );
}

function EligibilityStep({ data, onChange, onNext }) {
  return (
    <form className="claim-form" onSubmit={onNext}>
      <datalist id="claim-airports">
        {airportOptions.map((item) => <option value={item} key={item} />)}
      </datalist>
      <datalist id="claim-airlines">
        {airlineOptions.map((item) => <option value={item} key={item} />)}
      </datalist>
      <section className="claim-question">
        <h3>Where did you fly?</h3>
        <div className="claim-two">
          <Field icon={PlaneTakeoff} name="departure" value={data.departure} onChange={onChange} placeholder="Departure (IATA/ICAO/identifier)" list="claim-airports" />
          <Field icon={PlaneLanding} name="destination" value={data.destination} onChange={onChange} placeholder="Destination (IATA/ICAO/identifier)" list="claim-airports" />
        </div>
      </section>
      <section className="claim-question">
        <h3>Which airline did you fly with?</h3>
        <Field icon={Plane} name="airline" value={data.airline} onChange={onChange} placeholder="Search airline (name / IATA / ICAO) e.g. Philippine / PR / PAL" list="claim-airlines" />
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

function ContactStep({ data, onChange, onNext, onBack }) {
  return (
    <form className="claim-form" onSubmit={onNext}>
      <section className="claim-question">
        <h3>Please, enter your contact information.</h3>
        <div className="claim-two">
          <label><span>Full Name</span><Field icon={User} name="fullName" value={data.fullName} onChange={onChange} placeholder="Enter Your Full Name" required /></label>
          <label><span>Email</span><Field icon={Mail} name="email" value={data.email} onChange={onChange} placeholder="Enter Your Email" required /></label>
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

function DocumentsStep({ data, files, onChange, onFile, onNext, onBack, isSaving }) {
  return (
    <form className="claim-form" onSubmit={onNext}>
      <section className="claim-question">
        <h3>Secure Document Upload</h3>
        <p>Please upload your Passport and Boarding Pass.</p>
        <div className="claim-upload-grid">
          <UploadBox title="Passport" documentType="passport" icon={User} file={files.passport} onFile={onFile} />
          <UploadBox title="Boarding pas" documentType="boarding_pass" icon={FileText} file={files.boarding_pass} onFile={onFile} />
        </div>
        {files.passport && <FileRow done />}
        {files.boarding_pass && <FileRow done />}
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
        <button className="btn btn-primary" type="submit" disabled={isSaving}>{isSaving ? "Saving..." : "Main Page"}</button>
      </div>
    </form>
  );
}

function FinishStep({ data, onChange, onNext, onBack }) {
  return (
    <form className="claim-form" onSubmit={onNext}>
      <section className="claim-question">
        <h3>Your right to compensation?</h3>
        <div className="claim-two">
          <Field icon={Plane} name="departure" value={data.departure} onChange={onChange} placeholder="Departure Airport" />
          <Field icon={Plane} name="destination" value={data.destination} onChange={onChange} placeholder="Destination Airport" />
        </div>
      </section>
      <section className="claim-question">
        <h3>Your right to compensation?</h3>
        <div className="claim-two">
          <Field icon={Calendar} name="date" value={data.date} onChange={onChange} placeholder="dd/mm/yyyy" />
          <Field icon={Plane} name="destination" value={data.destination} onChange={onChange} placeholder="Destination Airport" />
        </div>
      </section>
      <section className="claim-question">
        <h3>Your right to compensation?</h3>
        <label className="claim-radio"><input type="radio" name="direct" value="yes" checked={data.direct === "yes"} onChange={onChange} /> Yes, that was direct</label>
        <label className="claim-radio"><input type="radio" name="direct" value="no" checked={data.direct === "no"} onChange={onChange} /> No, that was not direct</label>
      </section>
      <section className="claim-question">
        <h3>Your right to compensation?</h3>
        <div className="claim-two">
          <SelectField icon={Plane} name="departure" value={data.departure} onChange={onChange} placeholder="Departure Airport" />
          <SelectField icon={Plane} name="destination" value={data.destination} onChange={onChange} placeholder="Destination Airport" />
        </div>
        <label className="claim-check"><input type="checkbox" name="terms" checked={Boolean(data.terms)} onChange={onChange} required /> I agree to the terms and conditions and privacy statement.</label>
      </section>
      <div className="claim-actions">
        <button className="claim-back" type="button" onClick={onBack}>Back</button>
        <button className="btn btn-primary" type="submit">Submit</button>
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
        <strong className="claim-id">Claim ID: #FF743621</strong>
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
  const [data, setData] = useState(() => JSON.parse(localStorage.getItem("flyFriendlyClaim") || "{}"));
  const [files, setFiles] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [syncNotice, setSyncNotice] = useState("");
  const activeIndex = Math.max(0, stages.indexOf(stage));

  useEffect(() => {
    localStorage.setItem("flyFriendlyClaim", JSON.stringify(data));
  }, [data]);

  const onChange = (event) => {
    const { name, type, checked, value } = event.target;
    setData({ ...data, [name]: type === "checkbox" ? checked : value });
  };

  const onFile = (documentType, file) => {
    setFiles((current) => ({ ...current, [documentType]: file }));
  };

  const ensureSession = async () => {
    const session = await getCurrentSession();

    if (!session) {
      window.dispatchEvent(new Event("fly-friendly:start-claim"));
      throw new Error("Please sign in before saving a claim.");
    }
  };

  const ensureClaim = async () => {
    if (data.claimId) {
      return data.claimId;
    }

    const claimId = await createDraftClaim();
    setData((current) => ({ ...current, claimId }));
    return claimId;
  };

  const go = (nextStage) => navigate(`/claim/${nextStage}`);
  const submit = async (nextStage, event) => {
    event.preventDefault();

    setSyncError("");
    setSyncNotice("");

    if (stage === "eligibility" && data.delayDuration === "less_than_3") {
      setSyncNotice("Based on the delay duration, this flight is not eligible for compensation.");
      go("denied");
      return;
    }

    if (!isSupabaseConfigured) {
      setSyncError("Supabase env is missing. The form is saved locally only.");
      go(nextStage);
      return;
    }

    setIsSaving(true);

    try {
      await ensureSession();
      const claimId = await ensureClaim();

      if (stage === "eligibility") {
        await saveEligibilityCheck(claimId, data);
      }

      if (stage === "contact") {
        await saveContactInformation(claimId, data);
      }

      if (stage === "documents") {
        await saveDocumentStep(claimId, data, files);
      }

      if (stage === "finish") {
        await submitClaim(claimId, true);
      }

      setSyncNotice("Saved in Supabase.");
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
    if (stage === "contact") return <ContactStep data={data} onChange={onChange} onNext={(event) => submit("documents", event)} onBack={() => go("eligibility")} />;
    if (stage === "documents") return <DocumentsStep data={data} files={files} onChange={onChange} onFile={onFile} onNext={(event) => submit("finish", event)} onBack={() => go("contact")} isSaving={isSaving} />;
    if (stage === "finish") return <FinishStep data={data} onChange={onChange} onNext={(event) => submit("approved", event)} onBack={() => go("documents")} />;
    return <EligibilityStep data={data} onChange={onChange} onNext={(event) => submit("contact", event)} />;
  };

  return (
    <div className="claim-page">
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
  );
}

export default ClaimFlow;
