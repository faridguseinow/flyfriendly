import { Link, NavLink } from "react-router-dom";
import logoImage from "../../assets/icons/logo-image.svg";
import logoText from "../../assets/icons/fly-friendly.svg";
import { languages, navLinks } from "../../constants/site.js";
import "./style.scss";

function Flag({ code }) {
  const common = { width: 22, height: 22, viewBox: "0 0 36 36", "aria-hidden": "true" };

  if (code === "az") {
    return (
      <svg {...common}>
        <clipPath id="az-clip"><circle cx="18" cy="18" r="18" /></clipPath>
        <g clipPath="url(#az-clip)">
          <path fill="#00B5E2" d="M0 0h36v12H0z" />
          <path fill="#EF3340" d="M0 12h36v12H0z" />
          <path fill="#509E2F" d="M0 24h36v12H0z" />
          <circle cx="16" cy="18" r="4.8" fill="#fff" />
          <circle cx="17.4" cy="18" r="4" fill="#EF3340" />
          <path fill="#fff" d="m24 14 1 2.4 2.6-.8-1.4 2.3 2.2 1.5-2.7.4.2 2.7-1.9-1.9-1.9 1.9.2-2.7-2.7-.4 2.2-1.5-1.4-2.3 2.6.8z" />
        </g>
      </svg>
    );
  }

  if (code === "ru") {
    return (
      <svg {...common}>
        <clipPath id="ru-clip"><circle cx="18" cy="18" r="18" /></clipPath>
        <g clipPath="url(#ru-clip)">
          <path fill="#fff" d="M0 0h36v12H0z" />
          <path fill="#1C57A5" d="M0 12h36v12H0z" />
          <path fill="#E32D38" d="M0 24h36v12H0z" />
        </g>
      </svg>
    );
  }

  if (code === "tr") {
    return (
      <svg {...common}>
        <circle cx="18" cy="18" r="18" fill="#E30A17" />
        <circle cx="15.5" cy="18" r="7" fill="#fff" />
        <circle cx="17.4" cy="18" r="5.6" fill="#E30A17" />
        <path fill="#fff" d="m25 13.8 1.1 2.8 3-.9-1.6 2.6 2.5 1.8-3 .4.2 3-2.2-2.1-2.1 2.1.2-3-3-.4 2.5-1.8-1.6-2.6 3 .9z" />
      </svg>
    );
  }

  if (code === "fr") {
    return (
      <svg {...common}>
        <clipPath id="fr-clip"><circle cx="18" cy="18" r="18" /></clipPath>
        <g clipPath="url(#fr-clip)">
          <path fill="#0055A4" d="M0 0h12v36H0z" />
          <path fill="#fff" d="M12 0h12v36H12z" />
          <path fill="#EF4135" d="M24 0h12v36H24z" />
        </g>
      </svg>
    );
  }

  if (code === "ge") {
    return (
      <svg {...common}>
        <circle cx="18" cy="18" r="18" fill="#fff" />
        <path fill="#E30A17" d="M15 0h6v36h-6zM0 15h36v6H0z" />
        <path fill="#E30A17" d="M7 7h2v6H7zM5 9h6v2H5zM27 7h2v6h-2zM25 9h6v2h-6zM7 25h2v6H7zM5 27h6v2H5zM27 25h2v6h-2zM25 27h6v2h-6z" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <clipPath id="en-clip"><circle cx="18" cy="18" r="18" /></clipPath>
      <g clipPath="url(#en-clip)">
        <path fill="#012169" d="M0 0h36v36H0z" />
        <path stroke="#fff" strokeWidth="7" d="m0 0 36 36M36 0 0 36" />
        <path stroke="#C8102E" strokeWidth="4" d="m0 0 36 36M36 0 0 36" />
        <path stroke="#fff" strokeWidth="11" d="M18 0v36M0 18h36" />
        <path stroke="#C8102E" strokeWidth="7" d="M18 0v36M0 18h36" />
      </g>
    </svg>
  );
}

function Navbar() {
  return (
    <header className="site-header">
      <nav className="navbar" aria-label="Main navigation">
        <Link to="/" className="brand" aria-label="Fly Friendly home">
          <img className="brand__icon" src={logoImage} alt="" />
          <img className="brand__text" src={logoText} alt="Fly Friendly" />
        </Link>
        <div className="nav-links">
          {navLinks.map((item) => (
            <NavLink key={item.path} to={item.path}>{item.label}</NavLink>
          ))}
        </div>
        <div className="nav-actions">
          <div className="language-switcher">
            <button className="language-current" aria-label="Select language">
              <Flag code="en" />
            </button>
            <div className="language-menu">
              {languages.map(([code, label]) => (
                <a href="#" key={code}>
                  <Flag code={code} />
                  <span>{label}</span>
                </a>
              ))}
            </div>
          </div>
          <a className="btn btn-primary" href="#">Start Your Claim</a>
        </div>
      </nav>
    </header>
  );
}

export default Navbar;
