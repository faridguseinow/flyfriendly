import { Infinity, PlaneLanding, PlaneTakeoff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import CountryFlag from "../../components/CountryFlag/index.jsx";
import { describeAirportOption, searchAirports } from "../../services/catalogService.js";
import "./style.scss";

function HomeAirportCombobox({ icon: Icon, placeholder, value, options, onInputChange, onSelect }) {
  const rootRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [options, value]);

  const commitSelection = (option) => {
    onSelect(option);
    setIsOpen(false);
  };

  const onKeyDown = (event) => {
    if (!isOpen && (event.key === "ArrowDown" || event.key === "Enter")) {
      setIsOpen(true);
      return;
    }

    if (!options.length) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((current) => Math.min(current + 1, options.length - 1));
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) => Math.max(current - 1, 0));
    }

    if (event.key === "Enter" && isOpen) {
      event.preventDefault();
      commitSelection(options[highlightedIndex]);
    }

    if (event.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div className={`claim-box__combobox${isOpen ? " is-open" : ""}`} ref={rootRef}>
      <label>
        <span className="icon" aria-hidden="true"><Icon size={24} strokeWidth={2} /></span>
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          onFocus={() => setIsOpen(true)}
          onKeyDown={onKeyDown}
          onChange={(event) => {
            onInputChange(event.target.value);
            setIsOpen(true);
          }}
        />
      </label>
      {isOpen && value.trim().length >= 2 ? (
        <div className="claim-box__menu">
          {options.length ? options.map((item, index) => (
            <button
              type="button"
              key={`${item.id || item.label}-${item.label}`}
              className={`claim-box__option${index === highlightedIndex ? " is-highlighted" : ""}`}
              onMouseEnter={() => setHighlightedIndex(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                commitSelection(item);
              }}
            >
              <div className="claim-box__option-card">
                <CountryFlag code={item.countryCode} label={item.subtitle} className="claim-box__option-flag" />
                <div className="claim-box__option-body">
                  <strong>{item.title}</strong>
                  {item.subtitle ? <small>{item.subtitle}</small> : null}
                  {item.meta ? <div className="claim-box__option-meta">{item.meta}</div> : null}
                </div>
              </div>
            </button>
          )) : <div className="claim-box__empty">No airports found</div>}
        </div>
      ) : null}
    </div>
  );
}

function ClaimBox() {
  const navigate = useNavigate();
  const [departure, setDeparture] = useState("");
  const [destination, setDestination] = useState("");
  const [departureMatches, setDepartureMatches] = useState([]);
  const [destinationMatches, setDestinationMatches] = useState([]);

  useEffect(() => {
    if (departure.trim().length < 2) {
      setDepartureMatches([]);
      return;
    }

    const timeout = window.setTimeout(async () => {
      try {
        const rows = await searchAirports(departure, 6);
        setDepartureMatches(rows.map((item) => describeAirportOption(item)));
      } catch {
        setDepartureMatches([]);
      }
    }, 160);

    return () => window.clearTimeout(timeout);
  }, [departure]);

  useEffect(() => {
    if (destination.trim().length < 2) {
      setDestinationMatches([]);
      return;
    }

    const timeout = window.setTimeout(async () => {
      try {
        const rows = await searchAirports(destination, 6);
        setDestinationMatches(rows.map((item) => describeAirportOption(item)));
      } catch {
        setDestinationMatches([]);
      }
    }, 160);

    return () => window.clearTimeout(timeout);
  }, [destination]);

  const startLead = (event) => {
    event.preventDefault();
    const query = new URLSearchParams();

    if (departure.trim()) query.set("departure", departure.trim());
    if (destination.trim()) query.set("destination", destination.trim());

    navigate(`/claim/eligibility${query.toString() ? `?${query}` : ""}`);
  };

  return (
    <form className="claim-box" action="#" onSubmit={startLead}>
      <div className="claim-box__avatars" aria-hidden="true">
        <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=80&q=80" alt="" />
        <img src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=80&q=80" alt="" />
        <img src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=80&q=80" alt="" />
        <span><Infinity size={24} strokeWidth={2.4} aria-hidden="true" /></span>
      </div>
      <h2>Check and claim your compensation.</h2>
      <div className="claim-box__fields">
        <HomeAirportCombobox
          icon={PlaneTakeoff}
          value={departure}
          placeholder="Departure airport, city or country"
          options={departureMatches}
          onInputChange={setDeparture}
          onSelect={(item) => setDeparture(item.label)}
        />
        <HomeAirportCombobox
          icon={PlaneLanding}
          value={destination}
          placeholder="Destination airport, city or country"
          options={destinationMatches}
          onInputChange={setDestination}
          onSelect={(item) => setDestination(item.label)}
        />
        <button className="btn btn-primary" type="submit">Check Compensation <span>›</span></button>
      </div>
      <div className="claim-box__meta">
        <span>It's free</span>
        <span>Takes minutes</span>
        <span>We fight for your right to compensation.</span>
      </div>
    </form>
  );
}

export default ClaimBox;
