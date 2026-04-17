import SectionLabel from "../../components/SectionLabel/index.jsx";
import { faqs } from "../../constants/site.js";
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
} from "lucide-react";
import "./style.scss";

const partnerImage = "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1600&q=80";
const shareImage = "https://images.unsplash.com/photo-1526481280695-3c687fd5432c?auto=format&fit=crop&w=1600&q=80";
const rewardImage = "https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=1600&q=80";
const creatorImage = "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1800&q=80";

const avatars = [
  "https://i.pravatar.cc/80?img=11",
  "https://i.pravatar.cc/80?img=12",
  "https://i.pravatar.cc/80?img=13",
];

const accessItems = [
  [Trophy, "Compete and win travel vouchers.", "Earn up to 20% on every successful referral."],
  [Megaphone, "Featured Partner Spotlights", "Get promoted on our channels."],
  [Handshake, "Custom Collab Opportunities", "Co-create campaigns with our design team."],
  [BookOpen, "Creator Resource Hub", "Tutorials, tips, and analytics insights."],
];

const benefits = [
  [CircleDollarSign, "Generous Commissions", "Earn up to 20% on every successful referral."],
  [ChartBar, "Instant Tracking Dashboard", "View clicks, signups, and earnings in real time."],
  [Image, "Creative Assets Provided", "Ready-made visuals, brand kits, and caption templates."],
  [Globe2, "Global Recognition", "Be part of a network that's changing flight experiences worldwide."],
];

const steps = [
  {
    step: "Step 1",
    title: "Apply & Get Your Link",
    heading: "Submit your info and receive your",
    text: "personal referral link within 24 hours.",
    image: partnerImage,
  },
  {
    step: "Step 2",
    title: "Share Authentically",
    heading: "Post it in your bio, stories and videos,",
    text: "and turn your followers into your monthly earnings.",
    image: shareImage,
  },
  {
    step: "Step 3",
    title: "Earn Rewards Monthly",
    heading: "Track results in your dashboard and get",
    text: "paid automatically every month.",
    image: rewardImage,
  },
];

const creatorStories = [
  {
    name: "Lena Morales",
    role: "Travel Blogger",
    quote: "I've collaborated with many brands, but Fly Friendly truly supports creators. Their communication and transparency are unmatched.",
    image: "https://i.pravatar.cc/80?img=47",
  },
  {
    name: "James Yi",
    role: "YouTuber",
    quote: "I shared my referral link in just two videos and saw earnings in the first week. The dashboard makes everything super easy.",
    image: "https://i.pravatar.cc/80?img=12",
  },
  {
    name: "Sarah Johnson",
    role: "Marketing Manager, London",
    quote: "It's the first affiliate program where both sides genuinely win. My audience trusts me more, and I earn consistently.",
    image: "https://i.pravatar.cc/80?img=53",
  },
  {
    name: "Sophie Duarte",
    role: "Instagram Creator",
    quote: "It's the first affiliate program where both sides genuinely win. My audience trusts me more, and I earn consistently.",
    image: "https://i.pravatar.cc/80?img=32",
  },
];

function AvatarStack() {
  return (
    <div className="ref-avatar-stack" aria-hidden="true">
      {avatars.map((avatar) => <img src={avatar} alt="" key={avatar} />)}
    </div>
  );
}

function Referral() {
  return (
    <>
      <section className="ref-hero section">
        <div className="ref-hero__inner">
          <AvatarStack />
          <p className="ref-hero__tag"># ForCreators&Influencers</p>
          <h1>Partner with Fly Friendly & earn by helping travelers</h1>
          <p>
            Join our partnership program, share your link, inspire your audience,
            and get rewarded for every claim we win together.
          </p>
          <div className="ref-hero__actions">
            <a href="#" className="btn btn-primary">Join as a Partner</a>
            <a href="#" className="btn ref-btn-secondary">Log in</a>
          </div>
        </div>
      </section>

      <section className="ref-section section">
        <SectionLabel icon={Sparkles}>Exclusive Access</SectionLabel>
        <h2>More than earnings, it's partnership</h2>
        <p className="section-copy">Fly Friendly supports every creator with the tools and visibility they deserve.</p>
        <div className="ref-partnership-grid">
          <article className="ref-access-card">
            {accessItems.map(([Icon, title, text]) => (
              <div className="ref-access-item" key={title}>
                <span><Icon size={24} strokeWidth={2} aria-hidden="true" /></span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </div>
            ))}
          </article>
          <article className="ref-photo-card">
            <img src={partnerImage} alt="Creators discussing a partnership campaign" />
            <p>Turn your audience into opportunity.</p>
          </article>
        </div>
      </section>

      <section className="ref-section ref-benefits section">
        <SectionLabel icon={BadgeCheck}>Program Benefits</SectionLabel>
        <h2>A trusted partner worldwide</h2>
        <p className="section-copy">Serving millions of passengers in all countries, speaking all languages.</p>
        <div className="ref-benefit-grid">
          {benefits.map(([Icon, title, text]) => (
            <article className="ref-benefit-card" key={title}>
              <span><Icon size={24} strokeWidth={2} aria-hidden="true" /></span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="ref-process band">
        <div className="ref-process__inner">
          <SectionLabel icon={Settings}>Simple 3-Step Process</SectionLabel>
          <h2>Your path to effortless earnings</h2>
          <p>It's quick, transparent, and built for creators who want to make an impact.</p>
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
        <SectionLabel icon={Users}>Community Voices</SectionLabel>
        <h2>Creators who grew with Fly Friendly</h2>
        <p className="section-copy">
          Many influencers have earned money simply by sharing and educating their followers about their flight rights through our program.
        </p>
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
            <h3>We fight for your rights.</h3>
            <p>Create. Share. Earn.</p>
          </article>
          <article className="ref-cta-card">
            <AvatarStack />
            <span># StartEarningToday</span>
            <h2>Become a Fly Friendly Partner</h2>
            <p>Join a network of creators helping travelers worldwide. It takes less than 5 minutes to get started.</p>
            <a href="#" className="btn btn-primary">Apply Now <span>›</span></a>
          </article>
        </div>
      </section>

      <section className="section faq ref-faq">
        <SectionLabel icon={CircleHelp}>FAQ</SectionLabel>
        <h2>Frequently Asked Questions</h2>
        <p className="section-copy">Everything you need to know about claiming compensation.</p>
        <div className="faq-panel">
          {faqs.map((item) => (
            <details key={item.question}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}

export default Referral;
