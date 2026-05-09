import { useEffect, useMemo, useState } from "react";
import { Link2, UserSquare2 } from "lucide-react";
import { fetchReferralPartnersModuleData } from "../../services/adminService.js";
import {
  AdminDataTable,
  AdminFilterBar,
  AdminKpiCard,
  AdminPageHeader,
  AdminStatusBadge,
} from "../../admin/components/AdminUi.jsx";
import "./style.scss";

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function resolvePartnerLabel(lead, partnersById) {
  const direct = partnersById.get(lead.referral_partner_id);
  return direct?.public_name || direct?.name || lead.source_details?.referral_partner || lead.source_details?.referral_code || "—";
}

function resolveClaimStatus(lead, casesByLeadId) {
  const caseRow = casesByLeadId.get(lead.id);
  return caseRow?.status || lead.status || "—";
}

export default function AdminPartnerReferrals() {
  const [moduleData, setModuleData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const load = async () => {
      setError("");
      setIsLoading(true);
      try {
        setModuleData(await fetchReferralPartnersModuleData());
      } catch (nextError) {
        setError(nextError.message || "Could not load referrals.");
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const partnersById = useMemo(() => new Map((moduleData?.partners || []).map((item) => [item.id, item])), [moduleData?.partners]);
  const casesByLeadId = useMemo(() => {
    const map = new Map();
    for (const item of moduleData?.cases || []) {
      if (item.lead_id && !map.has(item.lead_id)) map.set(item.lead_id, item);
    }
    return map;
  }, [moduleData?.cases]);

  const referralRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (moduleData?.leads || [])
      .filter((lead) => lead.referral_partner_id || lead.source_details?.referral_code)
      .filter((lead) => {
        if (!query) return true;
        return [
          lead.lead_code,
          lead.source_details?.referral_code,
          lead.source_details?.referral_partner,
          resolvePartnerLabel(lead, partnersById),
        ].some((value) => String(value || "").toLowerCase().includes(query));
      })
      .map((lead) => ({
        id: lead.id,
        leadCode: lead.lead_code || lead.id.slice(0, 8),
        partnerLabel: resolvePartnerLabel(lead, partnersById),
        claimStatus: resolveClaimStatus(lead, casesByLeadId),
        attributionDate: lead.created_at,
        referralCode: lead.source_details?.referral_code || "—",
      }));
  }, [casesByLeadId, moduleData?.leads, partnersById, search]);

  return (
    <div className="admin-page admin-partner-referrals-page">
      <AdminPageHeader
        title="Referrals"
        subtitle="Claims attributed to approved referral partners"
        breadcrumbs={[
          { label: "Admin", path: "/admin" },
          { label: "Referrals" },
        ]}
      />

      {error ? <p className="admin-message is-error">{error}</p> : null}

      <div className="admin-partner-program__kpis">
        <AdminKpiCard label="Attributed claims" value={isLoading ? "—" : referralRows.length} icon={Link2} />
        <AdminKpiCard label="Approved partners involved" value={isLoading ? "—" : new Set(referralRows.map((row) => row.partnerLabel)).size} icon={UserSquare2} />
      </div>

      <AdminFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search claim, partner, referral code"
      />

      <AdminDataTable
        title="Referred claims"
        columns={[
          { key: "claim", label: "Claim" },
          { key: "partner", label: "Partner" },
          { key: "status", label: "Claim status" },
          { key: "code", label: "Referral code" },
          { key: "date", label: "Attribution date" },
        ]}
        rows={referralRows}
        loading={isLoading}
        error={!isLoading ? error : ""}
        emptyLabel="No referral attributions found."
        renderRow={(row) => (
          <tr key={row.id}>
            <td>{row.leadCode}</td>
            <td>{row.partnerLabel}</td>
            <td><AdminStatusBadge tone="neutral">{row.claimStatus}</AdminStatusBadge></td>
            <td>{row.referralCode}</td>
            <td>{formatDate(row.attributionDate)}</td>
          </tr>
        )}
      />
    </div>
  );
}
