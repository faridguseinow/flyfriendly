import ClaimBox from "../../components/ClaimBox/index.jsx";
import CompensationSlider from "../../components/CompensationSlider/index.jsx";
import SectionLabel from "../../components/SectionLabel/index.jsx";
import { articles, benefits, faqs, testimonials } from "../../constants/site.js";
import "./style.scss";

function Home() {
  return (
    <>
      <section className="hero section">
        <div className="hero__inner">
          <span className="section-label is-primary">★ Verified by Real Travelers</span>
          <h1>Delayed or canceled flight?<br />Claim up to <strong>€600</strong> now.</h1>
          <p>We fight for your right to compensation. Submit your claim in minutes and let us handle the airline.</p>
          <ClaimBox />
        </div>
      </section>

      <section className="section trust">
        <SectionLabel>◎ Global Reach</SectionLabel>
        <h2>A trusted partner worldwide</h2>
        <p className="section-copy">Serving millions of passengers in all countries, speaking all languages.</p>
        <div className="benefit-grid">
          {benefits.map((item) => (
            <article className="mini-card" key={item.title}>
              <span className="icon" aria-hidden="true">{item.mark}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section calculator">
        <div className="big-panel">
          <SectionLabel>$ Compensation Calculator</SectionLabel>
          <h2>How much can you claim?</h2>
          <p className="section-copy">Check your eligibility instantly and see how much compensation you can receive.</p>
          <CompensationSlider />
        </div>
      </section>

      <section className="section disruptions">
        <SectionLabel>▢ Flight Issues</SectionLabel>
        <h2>What disruptions qualify?</h2>
        <p className="section-copy">Compensation applies to more than just delays.</p>
        <div className="disruption-grid">
          <article className="issue-card">
            <span className="icon" aria-hidden="true">◷</span>
            <h3>Flight Cancellation</h3>
            <p>Airline canceled your flight last minute? Claim it.</p>
            <ul>
              <li>All airlines</li>
              <li>All countries</li>
              <li>No win, no fee</li>
            </ul>
          </article>
          <article className="issue-card issue-card-wide">
            <span className="icon" aria-hidden="true">∞</span>
            <h3>Missed Connected Flight</h3>
            <p>If you missed your next flight and arrived at your final destination more than 3 hours late? Claim now.</p>
            <ul>
              <li>We check every route</li>
              <li>Done-for-you support</li>
              <li>No upfront payment</li>
            </ul>
          </article>
          <article className="wide-cta">
            <SectionLabel>Flight Issues</SectionLabel>
            <h3>Your airline's fault?<br />You can still get paid.</h3>
            <p>Arrived 3+ hours late? You are eligible.</p>
            <a href="#" className="btn btn-primary">Check Compensation</a>
          </article>
          <article className="photo-cta">
            <img src="https://images.unsplash.com/photo-1553531580-652231dae097?auto=format&fit=crop&w=900&q=80" alt="Traveler holding luggage after a disrupted flight" />
            <div>
              <span className="icon" aria-hidden="true">▣</span>
              <h3>Denied Boarding</h3>
              <p>Overbooked flight? Demand your full compensation now. We fight for your rights.</p>
              <a href="#" className="btn btn-small">Check Your Eligibility</a>
              <a href="#" className="btn btn-small">Start Your Claim</a>
            </div>
          </article>
        </div>
      </section>

      <section className="section membership band">
        <SectionLabel>$ Our Subscription Fee</SectionLabel>
        <h2>Fly Friendly Membership</h2>
        <p className="section-copy">One simple subscription covers all your monthly journeys.</p>
        <div className="membership-grid">
          <article className="membership-card">
            <div className="price-row">
              <span className="icon" aria-hidden="true">✈</span>
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
            <img src="https://images.unsplash.com/photo-1604014237800-1c9102c219da?auto=format&fit=crop&w=1100&q=80" alt="Traveler packing luggage for a trip" />
            <h3>No win, no fee. We only get paid if you do.</h3>
            <span>Denied Boarding</span>
          </article>
        </div>
      </section>

      <section className="section steps">
        <SectionLabel>↻ How It Works</SectionLabel>
        <h2>3 Simple Steps to Your Compensation</h2>
        <p className="section-copy">We do the hard work, you get the payout hassle-free.</p>
        <div className="step-grid">
          <article className="step-card"><small>Claim in minutes</small><h3>Fast, safe and easy compensation</h3><div className="step-icons"><span className="icon">ϟ</span><span className="icon">◌</span><span className="icon">✓</span></div></article>
          <article className="step-card"><small>We handle everything</small><h3>Legal expertise with airlines</h3><div className="document-icon"><span></span><span></span><span></span></div></article>
          <article className="step-card"><small>Claim in minutes</small><h3>Money straight to your account.</h3><div className="step-icons"><span className="icon">$</span><span className="icon">▦</span><span className="icon">▤</span></div></article>
        </div>
      </section>

      <section className="section testimonials">
        <SectionLabel>☻ Testimonials</SectionLabel>
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
        <SectionLabel>⌗ Resources</SectionLabel>
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
          <SectionLabel>✉ Newsletter Signup</SectionLabel>
          <h2>Get the latest updates in your inbox</h2>
          <p>Compensation news, travel tips, and passenger rights delivered monthly.</p>
          <form action="#">
            <label>
              <span className="icon" aria-hidden="true">✉</span>
              <input type="email" placeholder="Enter your email" />
            </label>
            <button className="btn btn-primary" type="submit">›</button>
          </form>
        </div>
      </section>

      <section className="section faq">
        <SectionLabel>ⓘ FAQ</SectionLabel>
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

export default Home;
