import { Navigate, Route, Routes } from "react-router-dom";
import Home from "../pages/Home/index.jsx";
import About from "../pages/About/index.jsx";
import Contact from "../pages/Contact/index.jsx";
import Referral from "../pages/Referral/index.jsx";
import PrivacyPolicy from "../pages/PrivacyPolicy/index.jsx";
import TermsOfUse from "../pages/TermsOfUse/index.jsx";
import Cookies from "../pages/Cookies/index.jsx";

function AnimatedRoutes({ location }) {
  return (
    <Routes location={location}>
      <Route path="/" element={<Home />} />
      <Route path="/referral" element={<Referral />} />
      <Route path="/referralProgram" element={<Referral />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/about" element={<About />} />
      <Route path="/aboutUs" element={<About />} />
      <Route path="/privacyPolicy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<TermsOfUse />} />
      <Route path="/termsOfUse" element={<TermsOfUse />} />
      <Route path="/cookies" element={<Cookies />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default AnimatedRoutes;
