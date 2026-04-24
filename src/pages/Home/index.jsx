import { AnimatePresence, motion } from "framer-motion";
import ClaimBox from "../../components/ClaimBox/index.jsx";
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
import { Link } from "react-router-dom";
import { articles, benefits, faqs, testimonials } from "../../constants/site.js";
import { openMailClient } from "../../utils/mailto.js";
import deniedBoardingImage from "../../assets/media/Image-4.png";
import missedConnectionPlane from "../../assets/media/hand-drawn-airplane-outline-illustration.png";
import "./style.scss";

const benefitIcons = [Timer, ShieldCheck, TrendingUp];

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
  const [openFaq, setOpenFaq] = useState("");
  const [newsletterEmail, setNewsletterEmail] = useState("");

  const handleNewsletterSubmit = (event) => {
    event.preventDefault();

    const email = newsletterEmail.trim();
    if (!email) return;

    openMailClient({
      subject: "Newsletter subscription request",
      lines: [
        "Hello Fly Friendly,",
        "",
        "Please add this email to the newsletter list:",
        email,
      ],
    });
  };

  return (
    <>
      <section className="hero section">
        <div className="hero__inner">
          <span className="section-label is-primary"><Star size={16} fill="currentColor" aria-hidden="true" /> Verified by Real Travelers</span>
          <h1>Delayed or canceled flight?<br />Claim up to <strong>€600</strong> now.</h1>
          <p>We fight for your right to compensation. Submit your claim in minutes and let us handle the airline.</p>
          <ClaimBox />
        </div>
      </section>

      <section className="section trust">
        <SectionLabel icon={Globe2}>Global Reach</SectionLabel>
        <h2>A trusted partner worldwide</h2>  
        <p className="section-copy">Serving millions of passengers in all countries, speaking all languages.</p>
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
          <SectionLabel icon={CircleDollarSign}>Compensation Calculator</SectionLabel>
          <h2>How much can you claim?</h2>
          <p className="section-copy">Check your eligibility instantly and see how much compensation you can receive.</p>
          <CompensationSlider />
        </div>
      </section>

      <section className="section disruptions">
        <SectionLabel icon={OctagonAlert}>Flight Issues</SectionLabel>
        <h2>What disruptions qualify?</h2>
        <p className="section-copy">Compensation applies to more than just delays.</p>
        <div className="disruption-grid">
          <article className="issue-card">
            <IconBadge icon={Clock3} />
            <h3>Flight Cancellation</h3>
            <p>Airline canceled your flight last minute? Claim it.</p>
            <ul>
              <FeatureItem icon={Plane}>All airlines</FeatureItem>
              <FeatureItem icon={Flag}>All countries</FeatureItem>
              <FeatureItem icon={Percent}>No win, no fee</FeatureItem>
            </ul>
          </article>
          <article className="issue-card issue-card-wide">
            <div className="disruption-avatars" aria-hidden="true">
              {testimonials.slice(0, 3).map((item) => <img src={item.image} alt="" key={item.name} />)}
              <span><Infinity size={24} strokeWidth={2.4} aria-hidden="true" /></span>
            </div>
            <IconBadge icon={Route} />
            <h3>Missed Connected Flight</h3>
            <p>If you missed your next flight and arrived at your final destination more than 3 hours late? Claim now.</p>
            <img className="missed-plane" src={missedConnectionPlane} alt="" aria-hidden="true" />
          </article>
          <article className="wide-cta">
            <SectionLabel icon={BadgeAlert}>Flight Issues</SectionLabel>
            <h3>Your airline's fault?<br />You can still get paid.</h3>
            <p>Arrived 3+ hours late? You are eligible.</p>
            <Link to="/claim/eligibility" className="btn btn-primary">Check Compensation</Link>
          </article>
          <article className="photo-cta">
            <img src={deniedBoardingImage} alt="Traveler holding a passport and luggage" />
            <div>
              <IconBadge icon={BadgeAlert} />
              <h3>Denied Boarding</h3>
              <p>Overbooked flight? Demand your full compensation now. We fight for your rights.</p>
              <Link to="/claim/eligibility" className="btn btn-small"><Search size={16} strokeWidth={2} aria-hidden="true" /> Check Your Eligibility</Link>
              <Link to="/claim/eligibility" className="btn btn-small"><FileText size={16} strokeWidth={2} aria-hidden="true" /> Start Your Claim</Link>
            </div>
          </article>
        </div>
      </section>

      <section className="section membership">
        <SectionLabel icon={CircleDollarSign}>Our Subscription Fee</SectionLabel>
        <h2>Fly Friendly Membership</h2>
        <p className="section-copy">One simple subscription covers all your monthly journeys.</p>
        <div className="membership-grid">
          <article className="membership-card">
            <div className="price-row">
              <IconBadge icon={Plane} />
              <strong>$12<span>/month</span></strong>
            </div>
            <h3>Fly Friendly Plus</h3>
            <p>Perfect for frequent travelers and smart planners.</p>
            <ul>
              <li>Unlimited flight searches</li>
              <li>Real-time fare updates</li>
              <li>Smart alerts for price drops</li>
              <li>Saved trips and favorites</li>
              <li>Multi-city trip planner</li>
              <li>Early access to travel deals</li>
            </ul>
            <a href="#" className="btn btn-primary">Subscribe <span>›</span></a>
          </article>
          <article className="membership-photo">
            <img src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1200&q=80&quot" alt="Traveler packing luggage for a trip" />
            <h3>No win, no fee. We only get paid if you do.</h3>
            <span>Denied Boarding</span>
          </article>
        </div>
      </section>

      <section className="section steps">
        <SectionLabel icon={RefreshCw}>How It Works</SectionLabel>
        <h2>3 Simple Steps to Your Compensation</h2>
        <p className="section-copy">We do the hard work, you get the payout hassle-free.</p>
        <div className="step-grid">
          <article className="step-card step-card-process">
            <small>Claim in minutes</small>
            <h3>Fast, safe and easy compensation</h3>
            <div className="step-cluster" aria-hidden="true">
              <span className="step-line step-line-left"></span>
              <span className="step-line step-line-right"></span>
              <IconBadge icon={ShieldCheck} className="step-node-main" />
              <IconBadge icon={Zap} className="step-node-left" />
              <IconBadge icon={CircleCheck} className="step-node-right" />
            </div>
          </article>
          <article className="step-card step-card-docs">
            <small>We handle everything</small>
            <h3>Legal expertise with airlines</h3>
            <div className="document-stack" aria-hidden="true">
              <div className="document-icon"><IconBadge icon={CircleCheck} /><span></span><span></span></div>
              <div className="document-icon"><IconBadge icon={FileText} /><span></span><span></span></div>
              <div className="document-icon"><IconBadge icon={BadgeCheck} /><span></span><span></span></div>
            </div>
          </article>
          <article className="step-card step-card-money">
            <small>Claim in minutes</small>
            <h3>Money straight to your account.</h3>
            <div className="money-visual" aria-hidden="true">
              <IconBadge icon={CircleDollarSign} className="money-node-main" />
              <IconBadge icon={Building2} className="money-node-left" />
              <IconBadge icon={Landmark} className="money-node-right" />
            </div>
          </article>
        </div>
      </section>

      <section className="section testimonials">
        <SectionLabel icon={BadgeCheck}>Testimonials</SectionLabel>
        <h2>Loved by millions of travelers</h2>
        <p className="section-copy">Real passengers. Real compensation. Real stories.</p>
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
        <SectionLabel icon={Newspaper}>Resources</SectionLabel>
        <h2>Travel Tips & Guides</h2>
        <p className="section-copy">Stay informed with our latest resources on air passenger rights.</p>
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
          <p>Join our newsletter to get latest updates to your inbox.</p>
          <span>Stay Updated</span>
        </article>
        <div className="newsletter-form">
          <SectionLabel icon={Mail}>Newsletter Signup</SectionLabel>
          <h2>Get the latest updates in your inbox</h2>
          <p>Compensation news, travel tips, and passenger rights delivered monthly.</p>
          <form onSubmit={handleNewsletterSubmit}>
            <label>
              <IconBadge icon={Mail} />
              <input
                type="email"
                placeholder="Enter your email"
                value={newsletterEmail}
                onChange={(event) => setNewsletterEmail(event.target.value)}
                required
              />
            </label>
            <button className="btn btn-primary" type="submit" aria-label="Subscribe"><SendHorizontal size={24} strokeWidth={2} /></button>
          </form>
          <small>This opens your email app and prepares a subscription request to our team.</small>
        </div>
      </section>

      <section className="section faq">
        <SectionLabel icon={CircleHelp}>FAQ</SectionLabel>
        <h2>Frequently Asked Questions</h2>
        <p className="section-copy">Everything you need to know about claiming compensation.</p>
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
