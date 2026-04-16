import { useMemo, useState } from "react";
import planeSvg from "../../assets/icons/plane.svg";
import "./style.scss";

const MIN_DISTANCE = 0;
const MAX_DISTANCE = 4500;
const INITIAL_DISTANCE = 1500;

function getCompensation(distance) {
  if (distance >= 3500) {
    return 600;
  }

  if (distance > 1500) {
    return 400;
  }

  return 250;
}

function formatDistance(distance) {
  return `${distance.toLocaleString("en-US")} km`;
}

function getQuadraticBezierPoint(t, p0, p1, p2) {
  const x =
    Math.pow(1 - t, 2) * p0.x +
    2 * (1 - t) * t * p1.x +
    Math.pow(t, 2) * p2.x;

  const y =
    Math.pow(1 - t, 2) * p0.y +
    2 * (1 - t) * t * p1.y +
    Math.pow(t, 2) * p2.y;

  return { x, y };
}

function getQuadraticBezierAngle(t, p0, p1, p2) {
  const dx =
    2 * (1 - t) * (p1.x - p0.x) +
    2 * t * (p2.x - p1.x);

  const dy =
    2 * (1 - t) * (p1.y - p0.y) +
    2 * t * (p2.y - p1.y);

  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

function CompensationSlider() {
  const [distance, setDistance] = useState(INITIAL_DISTANCE);

  const slider = useMemo(() => {
    const progress = ((distance - MIN_DISTANCE) / (MAX_DISTANCE - MIN_DISTANCE)) * 100;
    const t = progress / 100;

    const p0 = { x: 50, y: 360 };
    const p1 = { x: 545, y: 70 };
    const p2 = { x: 1050, y: 170 };

    const point = getQuadraticBezierPoint(t, p0, p1, p2);
    const angle = getQuadraticBezierAngle(t, p0, p1, p2);

    return {
      compensation: getCompensation(distance),
      progress,
      labelProgress: Math.min(92, Math.max(8, progress)),
      planeX: point.x,
      planeY: point.y,
      planeRotation: angle,
    };
  }, [distance]);

  return (
    <div className="compensation-slider">
      <div className="compensation-slider__amount" aria-live="polite">
        <span>Amount of compensation</span>
        <strong>€{slider.compensation}</strong>
      </div>

      <div className="compensation-slider__stage">
        <svg
          className="compensation-slider__route"
          viewBox="0 0 1100 400"
          role="img"
          aria-label={`Flight distance ${formatDistance(distance)}, compensation €${slider.compensation}`}
        >
          <path
            d="M 50 360 Q 545 70 1050 170"
            fill="none"
            stroke="#05a4ff"
            strokeDasharray="10 12"
            strokeLinecap="round"
            strokeWidth="4"
          />
          <image
            href={planeSvg}
            x={slider.planeX - 105}
            y={slider.planeY - 78}
            width="210"
            height="156"
            preserveAspectRatio="xMidYMid meet"
            style={{
              transformBox: "fill-box",
              transformOrigin: "center",
              transform: `rotate(${slider.planeRotation}deg)`,
            }}
          />
        </svg>

        <div className="compensation-slider__controls">
          <div
            className="compensation-slider__distance"
            style={{ left: `${slider.labelProgress}%` }}
          >
            {formatDistance(distance)}
          </div>

          <div className="compensation-slider__track" aria-hidden="true">
            <span style={{ width: `${slider.progress}%` }} />
            <i style={{ left: `${slider.progress}%` }} />
          </div>

          <input
            aria-label="Flight distance in kilometers"
            min={MIN_DISTANCE}
            max={MAX_DISTANCE}
            onChange={(event) => setDistance(Number(event.target.value))}
            type="range"
            value={distance}
          />

          <div className="compensation-slider__scale" aria-hidden="true">
            <span>0 km</span>
            <span>1,500 km</span>
            <span>3,500 km</span>
            <span>4,500 km</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CompensationSlider;