import { useEffect, useMemo, useState } from "react";
import { Download, HandCoins, Link2, Search, Users, Wallet } from "lucide-react";
import {
  createReferralPartner,
  createReferralPartnerPayout,
  fetchReferralPartnersModuleData,
  updatePartnerPortalStatus,
  updateReferralPartner,
} from "../../services/adminService.js";
import { useAdminAuth } from "../../admin/AdminAuthContext.jsx";
import { useSearchParams } from "react-router-dom";
import "./style.scss";

const partnerStatuses = ["active", "paused", "archived"];
const portalStatuses = ["pending", "approved", "rejected", "suspended"];
const commissionTypes = ["percentage", "fixed"];
const payoutStatuses = ["pending", "approved", "paid", "cancelled"];

function MetricCard({ icon: Icon, label, value }) {
  return (
    <article className="admin-metric">
      <span><Icon size={22} strokeWidth={1.8} /></span>
      <div>
        <strong>{value}</strong>
        <small>{label}</small>
      </div>
    </article>
  );
}

function formatCurrency(value, currency = "EUR") {
  return `${Number(value || 0).toFixed(0)} ${currency || "EUR"}`;
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function normalizePartnerMatch(row, partner) {
  const label = String(row.referral_partner_label || "").toLowerCase();
  return row.referral_partner_id === partner.id
    || (label && (label === String(partner.name || "").toLowerCase()
      || label === String(partner.referral_code || "").toLowerCase()));
}

function exportPartnersCsv(rows) {
  const headers = ["Partner", "Code", "Status", "Leads", "Cases", "Approved Cases", "Earned Commission", "Paid Commission"];
  const lines = rows.map((item) => [
    item.name,
    item.referral_code,
    item.status,
    item.leadsGenerated,
    item.casesConverted,
    item.approvedCases,
    item.earnedCommission,
    item.paidCommission,
  ]);

  const csv = [headers, ...lines]
    .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `fly-friendly-referral-partners-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function AdminReferralPartners() {
  const { hasPermission } = useAdminAuth();
  const [searchParams] = useSearchParams();
  const [moduleData, setModuleData] = useState(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [partnerForm, setPartnerForm] = useState({
    name: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    commission_type: "percentage",
    commission_rate: 10,
    referral_link: "",
    notes: "",
  });
  const [payoutForm, setPayoutForm] = useState({
    case_id: "",
    amount: "",
    currency: "EUR",
    status: "pending",
    payout_method: "",
    note: "",
  });

  const loadPartners = async () => {
    setError("");
    setIsLoading(true);

    try {
      const next = await fetchReferralPartnersModuleData();
      setModuleData(next);
      if (!selectedPartnerId && next.partners[0]) {
        setSelectedPartnerId(next.partners[0].id);
      }
    } catch (nextError) {
      setError(nextError.message || "Could not load referral partners module.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPartners();
  }, []);

  useEffect(() => {
    const deepLinkedPartnerId = searchParams.get("partner");
    if (deepLinkedPartnerId) {
      setSelectedPartnerId(deepLinkedPartnerId);
    }
  }, [searchParams]);

  const partnerRows = useMemo(() => {
    const cases = moduleData?.cases || [];
    const leads = moduleData?.leads || [];
    const commissions = moduleData?.commissions || [];
    const payouts = moduleData?.payouts || [];

    return (moduleData?.partners || []).map((partner) => {
      const linkedCases = cases.filter((item) => normalizePartnerMatch(item, partner));
      const linkedLeads = leads.filter((item) => item.referral_partner_id === partner.id);
      const linkedCommissions = commissions.filter((item) => item.partner_id === partner.id);
      const linkedPayouts = payouts.filter((item) => item.partner_id === partner.id);
      const earnedCommission = linkedCommissions
        .filter((item) => item.status !== "cancelled")
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const paidCommission = linkedPayouts
        .filter((item) => item.status === "paid")
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);

      return {
        ...partner,
        linkedCases,
        linkedLeads,
        linkedCommissions,
        linkedPayouts,
        leadsGenerated: linkedLeads.length,
        casesConverted: linkedCases.length,
        approvedCases: linkedCommissions.filter((item) => ["approved", "paid"].includes(item.status)).length
          || linkedCases.filter((item) => ["approved", "paid", "closed"].includes(item.status)).length,
        earnedCommission,
        paidCommission,
        pendingCommission: earnedCommission - paidCommission,
      };
    });
  }, [moduleData]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return partnerRows.filter((item) => {
      const matchesSearch = !query || [
        item.name,
        item.referral_code,
        item.contact_name,
        item.contact_email,
      ].some((value) => String(value || "").toLowerCase().includes(query));
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [partnerRows, search, statusFilter]);

  const selectedPartner = useMemo(
    () => filteredRows.find((item) => item.id === selectedPartnerId)
      || partnerRows.find((item) => item.id === selectedPartnerId)
      || filteredRows[0]
      || null,
    [filteredRows, partnerRows, selectedPartnerId],
  );

  const metrics = useMemo(() => ({
    totalPartners: partnerRows.length,
    pendingApplications: partnerRows.filter((item) => item.portal_status === "pending").length,
    leadsGenerated: partnerRows.reduce((sum, item) => sum + item.leadsGenerated, 0),
    casesConverted: partnerRows.reduce((sum, item) => sum + item.casesConverted, 0),
    approvedCases: partnerRows.reduce((sum, item) => sum + item.approvedCases, 0),
    earnedCommission: partnerRows.reduce((sum, item) => sum + item.earnedCommission, 0),
    paidCommission: partnerRows.reduce((sum, item) => sum + item.paidCommission, 0),
  }), [partnerRows]);

  const selectedPartnerCases = selectedPartner?.linkedCases || [];
  const selectedPartnerCommissions = selectedPartner?.linkedCommissions || [];
  const selectedPartnerPayouts = selectedPartner?.linkedPayouts || [];

  const updatePartnerAccess = async (nextPortalStatus) => {
    if (!selectedPartner) return;
    setError("");
    setIsSaving(true);
    try {
      await updatePartnerPortalStatus(selectedPartner.id, nextPortalStatus);
      await loadPartners();
    } catch (nextError) {
      setError(nextError.message || "Could not update partner access.");
    } finally {
      setIsSaving(false);
    }
  };

  const createPartner = async (event) => {
    event.preventDefault();
    if (!partnerForm.name.trim()) {
      setError("Partner name is required.");
      return;
    }

    setError("");
    setIsSaving(true);
    try {
      await createReferralPartner(partnerForm);
      setPartnerForm({
        name: "",
        contact_name: "",
        contact_email: "",
        contact_phone: "",
        commission_type: "percentage",
        commission_rate: 10,
        referral_link: "",
        notes: "",
      });
      await loadPartners();
    } catch (nextError) {
      setError(nextError.message || "Could not create referral partner.");
    } finally {
      setIsSaving(false);
    }
  };

  const savePartner = async (updates) => {
    if (!selectedPartner) return;
    setError("");
    setIsSaving(true);
    try {
      await updateReferralPartner(selectedPartner.id, updates);
      await loadPartners();
    } catch (nextError) {
      setError(nextError.message || "Could not update referral partner.");
    } finally {
      setIsSaving(false);
    }
  };

  const submitPayout = async (event) => {
    event.preventDefault();
    if (!selectedPartner || !payoutForm.amount) {
      setError("Payout amount is required.");
      return;
    }

    setError("");
    setIsSaving(true);
    try {
      await createReferralPartnerPayout({
        ...payoutForm,
        partner_id: selectedPartner.id,
      });
      setPayoutForm({
        case_id: "",
        amount: "",
        currency: "EUR",
        status: "pending",
        payout_method: "",
        note: "",
      });
      await loadPartners();
    } catch (nextError) {
      setError(nextError.message || "Could not create referral payout.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="admin-page admin-referral-page">
      <header className="admin-hero">
        <div>
          <span className="section-label is-primary"><HandCoins size={16} /> Business Modules</span>
          <h1>Referral Partners</h1>
          <p>
            Track affiliate performance, linked cases, earned commissions, and referral payouts in one partner workspace.
          </p>
        </div>
      </header>

      {error && <p className="admin-message is-error">{error}</p>}
      {moduleData && !moduleData.supportsPartnersModuleV1 && (
        <p className="admin-message">
          Referral partners schema is not available yet. Run `008_referral_partners_module_v1.sql` in Supabase to unlock this module.
        </p>
      )}

      {isLoading ? (
        <p className="admin-message">Loading referral partners...</p>
      ) : (
        <>
          <section className="admin-metrics">
            <MetricCard icon={Users} label="Total partners" value={metrics.totalPartners} />
            <MetricCard icon={HandCoins} label="Pending applications" value={metrics.pendingApplications} />
            <MetricCard icon={Link2} label="Leads generated" value={metrics.leadsGenerated} />
            <MetricCard icon={HandCoins} label="Cases converted" value={metrics.casesConverted} />
            <MetricCard icon={Wallet} label="Approved cases" value={metrics.approvedCases} />
            <MetricCard icon={Wallet} label="Earned commission" value={formatCurrency(metrics.earnedCommission)} />
            <MetricCard icon={Wallet} label="Paid commission" value={formatCurrency(metrics.paidCommission)} />
          </section>

          <section className="admin-panel">
            <div className="admin-panel__head">
              <div>
                <h2>Partner registry</h2>
                <p>Manage partner accounts, commission models, and payout tracking.</p>
              </div>
              <button className="admin-link-button" type="button" onClick={() => exportPartnersCsv(filteredRows)}>
                <Download size={14} />
                <span>Export CSV</span>
              </button>
            </div>

            <div className="admin-referral__filters">
              <label className="admin-search">
                <Search size={16} />
                <input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="Search partner, code, contact" />
              </label>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All statuses</option>
                {partnerStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>

            <div className="admin-referral__grid">
              <section className="admin-panel">
                <div className="admin-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Partner</th>
                        <th>Code</th>
                        <th>Portal</th>
                        <th>Leads</th>
                        <th>Cases</th>
                        <th>Commission</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((item) => (
                        <tr key={item.id} className={selectedPartner?.id === item.id ? "is-selected" : ""} onClick={() => setSelectedPartnerId(item.id)}>
                          <td>{item.public_name || item.name}</td>
                          <td>{item.referral_code}</td>
                          <td>{item.portal_status || item.status}</td>
                          <td>{item.leadsGenerated}</td>
                          <td>{item.casesConverted}</td>
                          <td>{formatCurrency(item.earnedCommission)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="admin-panel admin-referral__detail">
                <div className="admin-panel__head">
                  <div>
                    <h2>Create partner</h2>
                    <p>Create a referral partner profile with commission settings.</p>
                  </div>
                </div>
                <form className="admin-referral__form" onSubmit={createPartner}>
                  <input value={partnerForm.name} onChange={(event) => setPartnerForm((current) => ({ ...current, name: event.target.value }))} placeholder="Partner name" />
                  <div className="admin-referral__form-grid">
                    <input value={partnerForm.contact_name} onChange={(event) => setPartnerForm((current) => ({ ...current, contact_name: event.target.value }))} placeholder="Contact name" />
                    <input value={partnerForm.contact_email} onChange={(event) => setPartnerForm((current) => ({ ...current, contact_email: event.target.value }))} placeholder="Contact email" />
                    <input value={partnerForm.contact_phone} onChange={(event) => setPartnerForm((current) => ({ ...current, contact_phone: event.target.value }))} placeholder="Contact phone" />
                    <input value={partnerForm.referral_link} onChange={(event) => setPartnerForm((current) => ({ ...current, referral_link: event.target.value }))} placeholder="Referral link" />
                    <select value={partnerForm.commission_type} onChange={(event) => setPartnerForm((current) => ({ ...current, commission_type: event.target.value }))}>
                      {commissionTypes.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                    <input type="number" value={partnerForm.commission_rate} onChange={(event) => setPartnerForm((current) => ({ ...current, commission_rate: Number(event.target.value || 0) }))} placeholder="Commission rate" />
                  </div>
                  <textarea value={partnerForm.notes} onChange={(event) => setPartnerForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Internal notes" />
                  <div className="admin-referral__form-actions">
                    <button className="admin-link-button" type="submit" disabled={!hasPermission("partners.edit") || isSaving}>
                      <span>{isSaving ? "Saving..." : "Create partner"}</span>
                    </button>
                  </div>
                </form>
              </section>
            </div>

            <section className="admin-referral__detail-grid">
              <section className="admin-panel admin-referral__detail-panel">
                <div className="admin-panel__head">
                  <div>
                    <h2>Partner detail</h2>
                    <p>{selectedPartner ? selectedPartner.name : "Select a partner to inspect."}</p>
                  </div>
                </div>

                {selectedPartner ? (
                  <div className="admin-referral__detail-body">
                    <div className="admin-referral__summary">
                      <article><strong>Code</strong><span>{selectedPartner.referral_code}</span></article>
                      <article><strong>Contact</strong><span>{selectedPartner.contact_name || selectedPartner.contact_email || "-"}</span></article>
                      <article><strong>Rate</strong><span>{selectedPartner.commission_rate} {selectedPartner.commission_type === "percentage" ? "%" : "fixed"}</span></article>
                      <article><strong>Link</strong><span>{selectedPartner.referral_link || "-"}</span></article>
                      <article><strong>Portal status</strong><span>{selectedPartner.portal_status || "-"}</span></article>
                      <article><strong>Profile link</strong><span>{selectedPartner.profile_id || "-"}</span></article>
                    </div>

                    <div className="admin-referral__actions">
                      <label>
                        <span>Status</span>
                        <select value={selectedPartner.status} onChange={(event) => savePartner({ status: event.target.value })} disabled={!hasPermission("partners.edit") || isSaving}>
                          {partnerStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                      </label>
                      <label>
                        <span>Commission rate</span>
                        <input type="number" value={selectedPartner.commission_rate} onChange={(event) => savePartner({ commission_rate: Number(event.target.value || 0) })} disabled={!hasPermission("partners.edit") || isSaving} />
                      </label>
                      <label>
                        <span>Portal status</span>
                        <select value={selectedPartner.portal_status || "pending"} onChange={(event) => updatePartnerAccess(event.target.value)} disabled={!hasPermission("partners.edit") || isSaving}>
                          {portalStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                      </label>
                    </div>

                    <div className="admin-access__actions">
                      <button className="btn btn--primary" type="button" disabled={!hasPermission("partners.edit") || isSaving} onClick={() => updatePartnerAccess("approved")}>
                        Approve application
                      </button>
                      <button className="admin-link-button" type="button" disabled={!hasPermission("partners.edit") || isSaving} onClick={() => updatePartnerAccess("rejected")}>
                        Reject
                      </button>
                      <button className="admin-link-button" type="button" disabled={!hasPermission("partners.edit") || isSaving} onClick={() => updatePartnerAccess("suspended")}>
                        Suspend
                      </button>
                      <button className="admin-link-button" type="button" disabled={!hasPermission("partners.edit") || isSaving} onClick={() => updatePartnerAccess("pending")}>
                        Return to pending
                      </button>
                    </div>

                    {selectedPartner.application_reason ? (
                      <section className="admin-referral__section">
                        <h3>Application reason</h3>
                        <p>{selectedPartner.application_reason}</p>
                      </section>
                    ) : null}

                    <section className="admin-referral__section">
                      <h3>Linked cases</h3>
                      <div className="admin-referral__timeline">
                        {selectedPartnerCases.length ? selectedPartnerCases.map((item) => (
                          <article key={item.id}>
                            <strong>{item.case_code}</strong>
                            <p>{item.status} · {formatCurrency(item.estimated_compensation)}</p>
                          </article>
                        )) : <p>No linked cases yet.</p>}
                      </div>
                    </section>

                    <section className="admin-referral__section">
                      <h3>Commissions</h3>
                      <div className="admin-referral__timeline">
                        {selectedPartnerCommissions.length ? selectedPartnerCommissions.map((item) => (
                          <article key={item.id}>
                            <strong>{formatCurrency(item.amount, item.currency)}</strong>
                            <p>{item.status} · {item.case_id || item.lead_id || "-"} · {formatDate(item.paid_at || item.approved_at || item.created_at)}</p>
                          </article>
                        )) : <p>No commissions yet.</p>}
                      </div>
                    </section>

                    <section className="admin-referral__section">
                      <h3>Create payout</h3>
                      <form className="admin-referral__payout-form" onSubmit={submitPayout}>
                        <select value={payoutForm.case_id} onChange={(event) => setPayoutForm((current) => ({ ...current, case_id: event.target.value }))}>
                          <option value="">No linked case</option>
                          {selectedPartnerCases.map((item) => <option key={item.id} value={item.id}>{item.case_code}</option>)}
                        </select>
                        <div className="admin-referral__form-grid">
                          <input type="number" value={payoutForm.amount} onChange={(event) => setPayoutForm((current) => ({ ...current, amount: event.target.value }))} placeholder="Amount" />
                          <input value={payoutForm.currency} onChange={(event) => setPayoutForm((current) => ({ ...current, currency: event.target.value }))} placeholder="Currency" />
                          <select value={payoutForm.status} onChange={(event) => setPayoutForm((current) => ({ ...current, status: event.target.value }))}>
                            {payoutStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
                          </select>
                          <input value={payoutForm.payout_method} onChange={(event) => setPayoutForm((current) => ({ ...current, payout_method: event.target.value }))} placeholder="Payout method" />
                        </div>
                        <textarea value={payoutForm.note} onChange={(event) => setPayoutForm((current) => ({ ...current, note: event.target.value }))} placeholder="Payout note" />
                        <div className="admin-referral__form-actions">
                          <button className="admin-link-button" type="submit" disabled={!hasPermission("partners.edit") || isSaving}>
                            <span>{isSaving ? "Saving..." : "Create payout"}</span>
                          </button>
                        </div>
                      </form>
                    </section>

                    <section className="admin-referral__section">
                      <h3>Payouts</h3>
                      <div className="admin-referral__timeline">
                        {selectedPartnerPayouts.length ? selectedPartnerPayouts.map((item) => (
                          <article key={item.id}>
                            <strong>{formatCurrency(item.amount, item.currency)}</strong>
                            <p>{item.status} · {item.payout_method || "-"} · {formatDate(item.created_at)}</p>
                          </article>
                        )) : <p>No payouts yet.</p>}
                      </div>
                    </section>
                  </div>
                ) : (
                  <div className="admin-empty admin-empty--module">
                    <h2>No partner selected</h2>
                    <p>Select a partner to review performance and payouts.</p>
                  </div>
                )}
              </section>
            </section>
          </section>
        </>
      )}
    </div>
  );
}

export default AdminReferralPartners;
