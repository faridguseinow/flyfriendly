import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLocalizedPath } from "../../i18n/useLocalizedPath.js";
import { validateReferralCode } from "../../services/referralService.js";

export default function ReferralCapturePage() {
  const navigate = useNavigate();
  const toLocalizedPath = useLocalizedPath();
  const { referralCode } = useParams();

  useEffect(() => {
    let active = true;

    validateReferralCode(referralCode, {
      sourcePath: `/r/${referralCode || ""}`,
    })
      .catch(() => null)
      .finally(() => {
        if (active) {
          navigate(toLocalizedPath("/claim/eligibility"), { replace: true });
        }
      });

    return () => {
      active = false;
    };
  }, [navigate, referralCode, toLocalizedPath]);

  return <div className="placeholder-page"><p>Redirecting...</p></div>;
}
