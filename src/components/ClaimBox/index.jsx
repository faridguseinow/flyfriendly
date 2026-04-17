import { Infinity, PlaneLanding, PlaneTakeoff } from "lucide-react";
import "./style.scss";

function ClaimBox() {
  return (
    <form className="claim-box" action="#">
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
          <input type="text" placeholder="Departure Airport" />
        </label>
        <label>
          <span className="icon" aria-hidden="true"><PlaneLanding size={24} strokeWidth={2} /></span>
          <input type="text" placeholder="Destination Airport" />
        </label>
        <a href="#" className="btn btn-primary">Check Compensation <span>›</span></a>
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
