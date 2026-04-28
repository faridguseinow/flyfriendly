import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import ClaimBox from "../../components/ClaimBox/index.jsx";
import { LocalizedLink } from "../../components/LocalizedLink.jsx";
import CompensationSlider from "../../components/CompensationSlider/index.jsx";
import SectionLabel from "../../components/SectionLabel/index.jsx";
import {
  BadgeAlert,
  BadgeCheck,
  Building2,
  CircleCheck,
  CircleDollarSign,
  CircleHelp,
  Clock3,
  CreditCard,
  FileText,
  Flag,
  Globe2,
  Infinity,
  Landmark,
  Mail,
  Newspaper,
  OctagonAlert,
  Plane,
  Percent,
  RefreshCw,
  Route,
  Search,
  SendHorizontal,
  ShieldCheck,
  Star,
  Timer,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { openMailClient } from "../../utils/mailto.js";
import deniedBoardingImage from "../../assets/media/Image-4.png";
import missedConnectionPlane from "../../assets/media/hand-drawn-airplane-outline-illustration.png";
import "./style.scss";

const benefitIcons = [Timer, ShieldCheck, TrendingUp];
const testimonialImages = [
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=160&q=80",
  "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=160&q=80",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=160&q=80",
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=160&q=80",
  "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=160&q=80",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=160&q=80",
];
const articleImages = [
  "https://images.unsplash.com/photo-1483450388369-9ed95738483c?q=80&w=870&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  "https://images.unsplash.com/photo-1569154941061-e231b4725ef1?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80",
];

function IconBadge({ icon: Icon, className = "" }) {
  return (
    <span className={`icon ${className}`.trim()} aria-hidden="true">
      <Icon size={24} strokeWidth={2} />
    </span>
  );
}

function FeatureItem({ icon: Icon, children }) {
  return (
    <li>
      <Icon size={24} strokeWidth={2} aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}

function FaqItem({ item, isOpen, onToggle }) {
  return (
    <article className={`faq-item${isOpen ? " is-open" : ""}`}>
      <button type="button" className="faq-item__toggle" onClick={onToggle} aria-expanded={isOpen}>
        <span>{item.question}</span>
        <span className="faq-item__icon" aria-hidden="true">+</span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            key="content"
            className="faq-item__content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
          >
            <motion.p
              initial={{ y: -8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -6, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {item.answer}
            </motion.p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </article>
  );
}

function Home() {
  const { t } = useTranslation();
  const [openFaq, setOpenFaq] = useState("");
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const benefits = t("home.benefits", { returnObjects: true });
  const testimonials = t("home.testimonials", { returnObjects: true }).map((item, index) => ({ ...item, image: testimonialImages[index] }));
  const articles = t("home.articles", { returnObjects: true }).map((item, index) => ({ ...item, image: articleImages[index] }));
  const faqs = t("home.faqs", { returnObjects: true });
  const membershipItems = t("home.membershipItems", { returnObjects: true });
  const disruptionCards = t("home.disruptionCards", { returnObjects: true });
  const stepCards = t("home.stepsCards", { returnObjects: true });

  const handleNewsletterSubmit = (event) => {
    event.preventDefault();

    const email = newsletterEmail.trim();
    if (!email) return;

    openMailClient({
      subject: t("home.newsletterSubject"),
      lines: [
        t("home.newsletterGreeting"),
        "",
        t("home.newsletterRequest"),
        email,
      ],
    });
  };

  return (
    <>
      <section className="hero section">
        <div className="hero__inner">
          <span className="hero__ambient hero__ambient--glow" aria-hidden="true" />
          <span className="section-label is-primary"><Star size={16} fill="currentColor" aria-hidden="true" /> {t("home.heroLabel")}</span>
          <h1>{t("home.heroTitle")}<br /><strong>{t("home.heroTitleStrong")}</strong></h1>
          <p>{t("home.heroText")}</p>
          <ClaimBox />
        </div>
      </section>

      <section className="section trust">
        <SectionLabel icon={Globe2}>{t("home.trustLabel")}</SectionLabel>
        <h2>{t("home.trustTitle")}</h2>
        <p className="section-copy">{t("common.globalReachCopy")}</p>
        <div className="benefit-grid">
          {benefits.map((item, index) => {
            const BenefitIcon = benefitIcons[index] || BadgeCheck;
            return (
            <article className="mini-card" key={item.title}>
              <IconBadge icon={BenefitIcon} />
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          )})}
        </div>
      </section>

      <section className="section calculator">
        <div className="big-panel">
          <SectionLabel icon={CircleDollarSign}>{t("home.calculatorLabel")}</SectionLabel>
          <h2>{t("home.calculatorTitle")}</h2>
          <p className="section-copy">{t("home.calculatorText")}</p>
          <CompensationSlider />
        </div>
      </section>

      <section className="section disruptions">
        <SectionLabel icon={OctagonAlert}>{t("home.disruptionsLabel")}</SectionLabel>
        <h2>{t("home.disruptionsTitle")}</h2>
        <p className="section-copy">{t("home.disruptionsText")}</p>
        <div className="disruption-grid">
          <article className="issue-card">
            <IconBadge icon={Clock3} />
            <h3>{disruptionCards.cancellationTitle}</h3>
            <p>{disruptionCards.cancellationText}</p>
            <ul>
              <FeatureItem icon={Plane}>{disruptionCards.allAirlines}</FeatureItem>
              <FeatureItem icon={Flag}>{disruptionCards.allCountries}</FeatureItem>
              <FeatureItem icon={Percent}>{disruptionCards.noWinNoFee}</FeatureItem>
            </ul>
          </article>
          <article className="issue-card issue-card-wide">
            <div className="disruption-avatars" aria-hidden="true">
              {testimonials.slice(0, 3).map((item) => <img src={item.image} alt="" key={item.name} />)}
              <span><Infinity size={24} strokeWidth={2.4} aria-hidden="true" /></span>
            </div>
            <IconBadge icon={Route} />
            <h3>{disruptionCards.missedTitle}</h3>
            <p>{disruptionCards.missedText}</p>
            <img className="missed-plane" src={missedConnectionPlane} alt="" aria-hidden="true" />
          </article>
          <article className="wide-cta">
            <SectionLabel icon={BadgeAlert}>{t("home.disruptionsLabel")}</SectionLabel>
            <h3>{disruptionCards.airlineFaultTitle.split("\n")[0]}<br />{disruptionCards.airlineFaultTitle.split("\n")[1]}</h3>
            <p>{disruptionCards.airlineFaultText}</p>
            <LocalizedLink to="/claim/eligibility" className="btn btn-primary">{t("common.checkCompensation")}</LocalizedLink>
          </article>
          <article className="photo-cta">
            <img src={deniedBoardingImage} alt="Traveler holding a passport and luggage" />
            <div>
              <IconBadge icon={BadgeAlert} />
              <h3>{disruptionCards.deniedTitle}</h3>
              <p>{disruptionCards.deniedText}</p>
              <LocalizedLink to="/claim/eligibility" className="btn btn-small"><Search size={16} strokeWidth={2} aria-hidden="true" /> {t("common.checkYourEligibility")}</LocalizedLink>
              <LocalizedLink to="/claim/eligibility" className="btn btn-small"><FileText size={16} strokeWidth={2} aria-hidden="true" /> {t("common.startYourClaim")}</LocalizedLink>
            </div>
          </article>
        </div>
      </section>

      <section className="section membership">
        <SectionLabel icon={CircleDollarSign}>{t("home.membershipLabel")}</SectionLabel>
        <h2>{t("home.membershipTitle")}</h2>
        <p className="section-copy">{t("home.membershipText")}</p>
        <div className="membership-grid">
          <article className="membership-card">
            <div className="price-row">
              <IconBadge icon={Plane} />
              <strong>$12<span>{t("home.membershipPriceSuffix")}</span></strong>
            </div>
            <h3>{t("home.membershipPlan")}</h3>
            <p>{t("home.membershipPlanText")}</p>
            <ul>
              {membershipItems.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <a href="#" className="btn btn-primary">{t("home.subscribe")} <span>›</span></a>
          </article>
          <article className="membership-photo">
            <img src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1200&q=80&quot" alt="Traveler packing luggage for a trip" />
            <h3>{t("home.membershipPhotoTitle")}</h3>
            <span>{t("home.membershipPhotoTag")}</span>
          </article>
        </div>
      </section>

      <section className="section steps">
        <SectionLabel icon={RefreshCw}>{t("home.stepsLabel")}</SectionLabel>
        <h2>{t("home.stepsTitle")}</h2>
        <p className="section-copy">{t("home.stepsText")}</p>
        <div className="step-grid">
          <article className="step-card step-card-process">
            <small>{stepCards.minutes}</small>
            <h3>{stepCards.processTitle}</h3>
            <div className="step-cluster" aria-hidden="true">
              <span className="step-line step-line-left"></span>
              <span className="step-line step-line-right"></span>
              <IconBadge icon={ShieldCheck} className="step-node-main" />
              <IconBadge icon={Zap} className="step-node-left" />
              <IconBadge icon={CircleCheck} className="step-node-right" />
            </div>
          </article>
          <article className="step-card step-card-docs">
            <small>{stepCards.handleEverything}</small>
            <h3>{stepCards.legalTitle}</h3>
            <div className="document-stack" aria-hidden="true">
              <div className="document-icon"><IconBadge icon={CircleCheck} /><span></span><span></span></div>
              <div className="document-icon"><IconBadge icon={FileText} /><span></span><span></span></div>
              <div className="document-icon"><IconBadge icon={BadgeCheck} /><span></span><span></span></div>
            </div>
          </article>
          <article className="step-card step-card-money">
            <small>{stepCards.minutes}</small>
            <h3>{stepCards.moneyTitle}</h3>
            <div className="money-visual" aria-hidden="true">
              <IconBadge icon={CircleDollarSign} className="money-node-main" />
              <IconBadge icon={Building2} className="money-node-left" />
              <IconBadge icon={Landmark} className="money-node-right" />
            </div>
          </article>
        </div>
      </section>

      <section className="section testimonials">
        <SectionLabel icon={BadgeCheck}>{t("home.testimonialsLabel")}</SectionLabel>
        <h2>{t("home.testimonialsTitle")}</h2>
        <p className="section-copy">{t("home.testimonialsText")}</p>
        <div className="testimonial-grid">
          {testimonials.map((item) => (
            <article className="testimonial-card" key={item.name}>
              <div className="person">
                <img src={item.image} alt={`${item.name} portrait`} />
                <div><h3>{item.name}</h3><p>{item.role}</p></div>
              </div>
              <p>{item.quote}</p>
              <span className="stars">★★★★★</span>
            </article>
          ))}
        </div>
      </section>

      <section className="section resources">
        <SectionLabel icon={Newspaper}>{t("home.resourcesLabel")}</SectionLabel>
        <h2>{t("home.resourcesTitle")}</h2>
        <p className="section-copy">{t("home.resourcesText")}</p>
        <div className="article-grid">
          {articles.map((item) => (
            <article className="article-card" key={item.title}>
              <img src={item.image} alt="" />
              <time>{item.date}</time>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="newsletter band">
        <article className="newsletter-photo">
          <img src="https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1100&q=80" alt="Person reading travel news" />
          <p>{t("home.newsletterPhoto")}</p>
          <span>{t("home.newsletterTag")}</span>
        </article>
        <div className="newsletter-form">
          <SectionLabel icon={Mail}>{t("home.newsletterLabel")}</SectionLabel>
          <h2>{t("home.newsletterTitle")}</h2>
          <p>{t("home.newsletterText")}</p>
          <form onSubmit={handleNewsletterSubmit}>
            <label>
              <IconBadge icon={Mail} />
              <input
                type="email"
                placeholder={t("home.newsletterPlaceholder")}
                value={newsletterEmail}
                onChange={(event) => setNewsletterEmail(event.target.value)}
                required
              />
            </label>
            <button className="btn btn-primary" type="submit" aria-label={t("home.newsletterAria")}><SendHorizontal size={24} strokeWidth={2} /></button>
          </form>
          <small>{t("home.newsletterNotice")}</small>
        </div>
      </section>

      <section className="section faq">
        <SectionLabel icon={CircleHelp}>{t("home.faqLabel")}</SectionLabel>
        <h2>{t("home.faqTitle")}</h2>
        <p className="section-copy">{t("home.faqText")}</p>
        <div className="faq-panel">
          {faqs.map((item) => (
            <FaqItem
              key={item.question}
              item={item}
              isOpen={openFaq === item.question}
              onToggle={() => setOpenFaq((current) => (current === item.question ? "" : item.question))}
            />
          ))}
        </div>
      </section>
    </>
  );
}

export default Home;
