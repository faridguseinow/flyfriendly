import { useState } from "react";
import SectionLabel from "../../components/SectionLabel/index.jsx";
import { Headphones, Mail, MessageSquare } from "lucide-react";
import { contactEmail } from "../../constants/site.js";
import { openMailClient } from "../../utils/mailto.js";
import "./style.scss";

function Contact() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    reference: "",
    message: "",
  });

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    openMailClient({
      subject: `Website contact message from ${form.name.trim() || "Fly Friendly visitor"}`,
      lines: [
        "Hello Fly Friendly,",
        "",
        `Name: ${form.name.trim()}`,
        `Email: ${form.email.trim()}`,
        form.reference.trim() ? `Flight or booking reference: ${form.reference.trim()}` : "",
        "",
        "Message:",
        form.message.trim(),
      ],
    });
  };

  return (
    <>
      <section className="contact-hero section">
        <SectionLabel icon={Mail}>Contact</SectionLabel>
        <h1>Contact us</h1>
        <p>
          Have a question about a delayed, canceled, or overbooked flight?
          Send a message and our team will help you understand the next step.
        </p>
      </section>

      <section className="contact-main section">
        <div className="contact-grid">
          <article className="contact-support">
            <SectionLabel icon={Headphones}>Support</SectionLabel>
            <h2>We are here to help</h2>
            <p>
              Tell us what happened with your flight, what documents you have,
              and how we can reach you. Do not send sensitive identity documents
              until our team requests them through the proper claim flow.
            </p>
            <div className="contact-methods">
              <div><span>WhatsApp</span><a href="https://api.whatsapp.com/send?phone=994998041525">+994 99 804 15 25</a></div>
              <div><span>Email</span><a href={`mailto:${contactEmail}`}>{contactEmail}</a></div>
              <div><span>Hours</span><p>Mon-Fri, 09:00-18:00</p></div>
            </div>
          </article>

          <form className="contact-form" onSubmit={handleSubmit}>
            <SectionLabel icon={MessageSquare}>Send a message</SectionLabel>
            <h2>Write to us by email</h2>
            <label>
              <span>Name</span>
              <input name="name" type="text" minLength="2" placeholder="Your name" required value={form.name} onChange={updateField} />
            </label>
            <label>
              <span>Email</span>
              <input name="email" type="email" placeholder="you@example.com" required value={form.email} onChange={updateField} />
            </label>
            <label>
              <span>Flight or booking reference</span>
              <input name="reference" type="text" placeholder="Optional" value={form.reference} onChange={updateField} />
            </label>
            <label>
              <span>Message</span>
              <textarea name="message" minLength="10" rows="7" placeholder="Tell us what happened with your flight" required value={form.message} onChange={updateField}></textarea>
            </label>
            <button className="btn btn-primary" type="submit">Send</button>
            <small>Submitting opens your email app and prepares your message to {contactEmail}.</small>
          </form>
        </div>
      </section>
    </>
  );
}

export default Contact;
