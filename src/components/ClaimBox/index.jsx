import { Infinity, PlaneLanding, PlaneTakeoff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import "./style.scss";

function ClaimBox() {
  const navigate = useNavigate();

  const startLead = (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const departure = form.get("departure")?.toString().trim();
    const destination = form.get("destination")?.toString().trim();
    const query = new URLSearchParams();

    if (departure) query.set("departure", departure);
    if (destination) query.set("destination", destination);

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
        <label>
          <span className="icon" aria-hidden="true"><PlaneTakeoff size={24} strokeWidth={2} /></span>
          <input name="departure" type="text" placeholder="Departure Airport" />
        </label>
        <label>
          <span className="icon" aria-hidden="true"><PlaneLanding size={24} strokeWidth={2} /></span>
          <input name="destination" type="text" placeholder="Destination Airport" />
        </label>
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
