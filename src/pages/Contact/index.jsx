import SectionLabel from "../../components/SectionLabel/index.jsx";
import "./style.scss";

function Contact() {
  return (
    <>
      <section className="contact-hero section">
        <SectionLabel>Contact</SectionLabel>
        <h1>Contact us</h1>
        <p>
          Have a question about a delayed, canceled, or overbooked flight?
          Send a message and our team will help you understand the next step.
        </p>
      </section>

      <section className="contact-main section">
        <div className="contact-grid">
          <article className="contact-support">
            <SectionLabel>Support</SectionLabel>
            <h2>We are here to help</h2>
            <p>
              Tell us what happened with your flight, what documents you have,
              and how we can reach you. Do not send sensitive identity documents
              until our team requests them through the proper claim flow.
            </p>
            <div className="contact-methods">
              <div><span>WhatsApp</span><a href="https://api.whatsapp.com/send?phone=994998041525">+994 99 804 15 25</a></div>
              <div><span>Email</span><a href="mailto:support@fly-friendly.com">support@fly-friendly.com</a></div>
              <div><span>Hours</span><p>Mon-Fri, 09:00-18:00</p></div>
            </div>
          </article>

          <form
            className="contact-form"
            action="mailto:support@fly-friendly.com"
            method="post"
            encType="text/plain"
          >
            <SectionLabel>Send a message</SectionLabel>
            <h2>Write to us by email</h2>
            <label>
              <span>Name</span>
              <input name="name" type="text" minLength="2" placeholder="Your name" required />
            </label>
            <label>
              <span>Email</span>
              <input name="email" type="email" placeholder="you@example.com" required />
            </label>
            <label>
              <span>Flight or booking reference</span>
              <input name="reference" type="text" placeholder="Optional" />
            </label>
            <label>
              <span>Message</span>
              <textarea name="message" minLength="10" rows="7" placeholder="Tell us what happened with your flight" required></textarea>
            </label>
            <button className="btn btn-primary" type="submit">Send</button>
            <small>Submitting opens your email app with this message. A backend email service can be connected later.</small>
          </form>
        </div>
      </section>
    </>
  );
}

export default Contact;
