import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import SectionLabel from "../../components/SectionLabel/index.jsx";
import { useMemo, useState } from "react";
import {
  BadgeCheck,
  BookOpen,
  ChartBar,
  CircleDollarSign,
  CircleHelp,
  Globe2,
  Handshake,
  Image,
  Megaphone,
  Settings,
  Sparkles,
  Trophy,
  Users,
  Camera,
} from "lucide-react";
import { LocalizedLink } from "../../components/LocalizedLink.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import "./style.scss";

const partnerImage = "https://images.unsplash.com/photo-1713946598491-4f85decbeaaf?q=80&w=2064&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D";
const linkImage = "https://plus.unsplash.com/premium_photo-1670071482497-5dc3dac4800f?q=80&w=774&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D";
const shareImage = "https://images.unsplash.com/photo-1660732421012-83b2c4eb49ff?q=80&w=928&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D";
const rewardImage = "https://images.unsplash.com/photo-1744178173167-5bf201681dd3?q=80&w=696&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D";
const creatorImage = "https://images.unsplash.com/photo-1768839719921-6a554fb3e847?q=80&w=1740&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D";

const avatars = [
  "https://i.pravatar.cc/80?img=11",
  "https://i.pravatar.cc/80?img=12",
  "https://i.pravatar.cc/80?img=13",
];
const accessIcons = [Trophy, Megaphone, Handshake, BookOpen];
const benefitIcons = [CircleDollarSign, ChartBar, Image, Globe2];
const stepImages = [linkImage, shareImage, rewardImage];
const storyImages = [
  "https://i.pravatar.cc/80?img=47",
  "https://i.pravatar.cc/80?img=12",
  "https://i.pravatar.cc/80?img=53",
  "https://i.pravatar.cc/80?img=32",
];

function AvatarStack() {
  return (
    <div className="ref-avatar-stack" aria-hidden="true">
      {avatars.map((avatar) => <img src={avatar} alt="" key={avatar} />)}
    </div>
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

function Referral() {
  const { t } = useTranslation();
  const { isAuthenticated, partnerProfile } = useAuth();
  const [openFaq, setOpenFaq] = useState("");
  const accessItems = t("referral.accessItems", { returnObjects: true });
  const benefits = t("referral.benefits", { returnObjects: true });
  const steps = t("referral.steps", { returnObjects: true }).map((item, index) => ({ ...item, image: stepImages[index] }));
  const creatorStories = t("referral.stories", { returnObjects: true }).map((item, index) => ({ ...item, image: storyImages[index] }));
  const faqs = t("home.faqs", { returnObjects: true });
  const partnerTarget = useMemo(() => {
    if (partnerProfile?.id) {
      return partnerProfile.portal_status === "approved"
        ? "/partner/dashboard"
        : `/partner/${partnerProfile.portal_status || "pending"}`;
    }

    if (isAuthenticated) {
      return "/partner/apply";
    }

    return "/auth/register?returnTo=%2Fpartner%2Fapply";
  }, [isAuthenticated, partnerProfile]);

  const loginTarget = isAuthenticated
    ? partnerTarget
    : "/auth/login?returnTo=%2Fpartner%2Fapply";

  return (
    <>
      <section className="ref-hero section">
        <div className="ref-hero__inner">
          <AvatarStack />
          <p className="ref-hero__tag">{t("referral.heroTag")}</p>
          <h1>{t("referral.heroTitle")}</h1>
          <p>{t("referral.heroText")}</p>
          <div className="ref-hero__actions">
            <LocalizedLink to={partnerTarget} className="btn btn-primary">{t("referral.joinAsPartner")}</LocalizedLink>
            <LocalizedLink to={loginTarget} className="btn ref-btn-secondary">{t("referral.logIn")}</LocalizedLink>
          </div>
        </div>
      </section>

      <section className="ref-section section">
        <SectionLabel icon={Sparkles}>{t("referral.exclusiveAccessLabel")}</SectionLabel>
        <h2>{t("referral.exclusiveAccessTitle")}</h2>
        <p className="section-copy">{t("referral.exclusiveAccessText")}</p>
        <div className="ref-partnership-grid">
          <article className="ref-access-card">
            {accessItems.map(({ title, text }, index) => {
              const Icon = accessIcons[index];
              return (
              <div className="ref-access-item" key={title}>
                <span><Icon size={24} strokeWidth={2} aria-hidden="true" /></span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </div>
            );})}
          </article>
          <article className="ref-photo-card">
            <img src={partnerImage} alt="Creators discussing a partnership campaign" />
            <p>{t("referral.photoCard")}</p>
          </article>
        </div>
      </section>

      <section className="ref-section ref-benefits section">
        <SectionLabel icon={BadgeCheck}>{t("referral.benefitsLabel")}</SectionLabel>
        <h2>{t("referral.benefitsTitle")}</h2>
        <p className="section-copy">{t("referral.benefitsText")}</p>
        <div className="ref-benefit-grid">
          {benefits.map(({ title, text }, index) => {
            const Icon = benefitIcons[index];
            return (
            <article className="ref-benefit-card" key={title}>
              <span><Icon size={24} strokeWidth={2} aria-hidden="true" /></span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          );})}
        </div>
      </section>

      <section className="ref-process band">
        <div className="ref-process__inner">
          <SectionLabel icon={Settings}>{t("referral.processLabel")}</SectionLabel>
          <h2>{t("referral.processTitle")}</h2>
          <p>{t("referral.processText")}</p>
          <div className="ref-step-grid">
            {steps.map((item) => (
              <article className="ref-step-card" key={item.step}>
                <div className="ref-step-card__image">
                  <img src={item.image} alt="" />
                  <span>{item.step}</span>
                </div>
                <div className="ref-step-card__body">
                  <strong>{item.title}</strong>
                  <h3>{item.heading}</h3>
                  <p>{item.text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="ref-section ref-voices section">
        <SectionLabel icon={Users}>{t("referral.voicesLabel")}</SectionLabel>
        <h2>{t("referral.voicesTitle")}</h2>
        <p className="section-copy">{t("referral.voicesText")}</p>
        <div className="ref-story-panel">
          {creatorStories.map((story) => (
            <article className="ref-story-card" key={story.name}>
              <span className="stars">★★★★★</span>
              <p>{story.quote}</p>
              <div>
                <img src={story.image} alt={`${story.name} portrait`} />
                <span>
                  <strong>{story.name}</strong>
                  <small>{story.role}</small>
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="ref-cta band">
        <div className="ref-cta__inner">
          <article className="ref-cta-photo">
            <img src={creatorImage} alt="Creators making travel content" />
            <h3>{t("referral.ctaPhotoTitle")}</h3>
            <Camera className="ref-cta-photo__icon" />
            <p>{t("referral.ctaPhotoText")}</p>
          </article>
          <article className="ref-cta-card">
            <AvatarStack />
            <span>{t("referral.ctaHash")}</span>
            <h2>{t("referral.ctaTitle")}</h2>
            <p>{t("referral.ctaText")}</p>
            <LocalizedLink to={partnerTarget} className="btn btn-primary">{t("referral.applyNow")} <span>›</span></LocalizedLink>
          </article>
        </div>
      </section>

      <section className="section faq ref-faq">
        <SectionLabel icon={CircleHelp}>{t("referral.faqLabel")}</SectionLabel>
        <h2>{t("referral.faqTitle")}</h2>
        <p className="section-copy">{t("referral.faqText")}</p>
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

export default Referral;
