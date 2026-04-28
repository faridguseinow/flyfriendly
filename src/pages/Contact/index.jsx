import { useState } from "react";
import { useTranslation } from "react-i18next";
import SectionLabel from "../../components/SectionLabel/index.jsx";
import { Headphones, Mail, MessageSquare } from "lucide-react";
import { contactEmail } from "../../constants/site.js";
import { openMailClient } from "../../utils/mailto.js";
import "./style.scss";

function Contact() {
  const { t } = useTranslation();
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
      subject: t("contactPage.mailSubject", { name: form.name.trim() || t("contactPage.visitorFallback") }),
      lines: [
        t("contactPage.mailGreeting"),
        "",
        t("contactPage.mailName", { value: form.name.trim() }),
        t("contactPage.mailEmail", { value: form.email.trim() }),
        form.reference.trim() ? t("contactPage.mailReference", { value: form.reference.trim() }) : "",
        "",
        t("contactPage.mailMessageLabel"),
        form.message.trim(),
      ],
    });
  };

  return (
    <>
      <section className="contact-hero section">
        <SectionLabel icon={Mail}>{t("contactPage.heroLabel")}</SectionLabel>
        <h1>{t("contactPage.heroTitle")}</h1>
        <p>{t("contactPage.heroText")}</p>
      </section>

      <section className="contact-main section">
        <div className="contact-grid">
          <article className="contact-support">
            <SectionLabel icon={Headphones}>{t("contactPage.supportLabel")}</SectionLabel>
            <h2>{t("contactPage.supportTitle")}</h2>
            <p>{t("contactPage.supportText")}</p>
            <div className="contact-methods">
              <div><span>{t("contactPage.whatsApp")}</span><a href="https://api.whatsapp.com/send?phone=994998041525">+994 99 804 15 25</a></div>
              <div><span>{t("contactPage.email")}</span><a href={`mailto:${contactEmail}`}>{contactEmail}</a></div>
              <div><span>{t("contactPage.hours")}</span><p>{t("contactPage.hoursValue")}</p></div>
            </div>
          </article>

          <form className="contact-form" onSubmit={handleSubmit}>
            <SectionLabel icon={MessageSquare}>{t("contactPage.messageLabel")}</SectionLabel>
            <h2>{t("contactPage.messageTitle")}</h2>
            <label>
              <span>{t("contactPage.name")}</span>
              <input name="name" type="text" minLength="2" placeholder={t("contactPage.namePlaceholder")} required value={form.name} onChange={updateField} />
            </label>
            <label>
              <span>{t("contactPage.email")}</span>
              <input name="email" type="email" placeholder={t("contactPage.emailPlaceholder")} required value={form.email} onChange={updateField} />
            </label>
            <label>
              <span>{t("contactPage.reference")}</span>
              <input name="reference" type="text" placeholder={t("contactPage.referencePlaceholder")} value={form.reference} onChange={updateField} />
            </label>
            <label>
              <span>{t("contactPage.message")}</span>
              <textarea name="message" minLength="10" rows="7" placeholder={t("contactPage.messagePlaceholder")} required value={form.message} onChange={updateField}></textarea>
            </label>
            <button className="btn btn-primary" type="submit">{t("contactPage.sendButton")}</button>
            <small>{t("contactPage.emailAppNotice", { email: contactEmail })}</small>
          </form>
        </div>
      </section>
    </>
  );
}

export default Contact;
