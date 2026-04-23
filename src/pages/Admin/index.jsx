import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, FileText, ShieldCheck, Users } from "lucide-react";
import {
  downloadSignaturePng,
  fetchAdminOverview,
  getDocumentDownloadUrl,
  updateClaimStatus,
  updateLeadStatus,
  updateProfileRole,
} from "../../services/adminService.js";
import { useAdminAuth } from "../../admin/AdminAuthContext.jsx";
import "./style.scss";

const claimStatuses = ["new", "paid", "rejected"];
const leadStatuses = ["new", "submitted", "not_eligible", "converted", "archived"];
const profileRoles = ["customer", "read_only", "customer_support_agent", "case_manager", "operations_manager", "content_manager", "finance_manager", "admin", "super_admin"];

function AdminMetric({ icon: Icon, label, value }) {
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

function AdminTable({ title, description, children }) {
  return (
    <section className="admin-panel">
      <div className="admin-panel__head">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <div className="admin-table-wrap">{children}</div>
    </section>
  );
}

function AdminDashboard() {
  const { profile, primaryRoleLabel, hasPermission } = useAdminAuth();
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const metrics = useMemo(() => {
    const claims = overview?.claims || [];
    const leads = overview?.leads || [];
    return {
      leads: leads.length,
      claims: claims.length,
      users: overview?.profiles?.length || 0,
      documents: overview?.documents?.length || 0,
      open: leads.filter((lead) => lead.status === "new").length + claims.filter((claim) => claim.status === "new").length,
    };
  }, [overview]);

  const loadAdmin = async () => {
    setError("");
    setIsLoading(true);

    try {
      setOverview(await fetchAdminOverview());
    } catch (adminError) {
      setError(adminError.message || "Could not load admin data.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAdmin();
  }, []);

  const changeClaimStatus = async (claimId, status) => {
    await updateClaimStatus(claimId, status);
    await loadAdmin();
  };

  const changeLeadStatus = async (leadId, status) => {
    await updateLeadStatus(leadId, status);
    await loadAdmin();
  };

  const changeRole = async (profileId, role) => {
    await updateProfileRole(profileId, role);
    await loadAdmin();
  };

  const downloadDocument = async (document) => {
    setError("");

    try {
      const url = await getDocumentDownloadUrl(document);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (downloadError) {
      setError(downloadError.message || "Could not create document download link.");
    }
  };

  const downloadSignature = (signature) => {
    try {
      downloadSignaturePng(
        signature.signature_data_url,
        `${signature.signer_name || "lead-signature"}-${signature.lead_id || signature.id}.png`,
      );
    } catch (downloadError) {
      setError(downloadError.message || "Could not download signature.");
    }
  };

  return (
    <div className="admin-page">
      <header className="admin-hero">
        <div>
          <span className="section-label is-primary"><ShieldCheck size={16} /> Foundation</span>
          <h1>Operational dashboard</h1>
          <p>
            Signed in as {profile?.full_name || profile?.email || "internal user"} with role {primaryRoleLabel || "Unknown"}.
            The foundation layer now handles authentication, role mapping, permission guards, and admin navigation.
          </p>
        </div>
      </header>

      {isLoading && <p className="admin-message">Loading admin data...</p>}
      {error && <p className="admin-message is-error">{error}</p>}

      {overview && (
        <>
          <section className="admin-metrics">
            <AdminMetric icon={BadgeCheck} label="Leads loaded" value={metrics.leads} />
            <AdminMetric icon={ShieldCheck} label="Claims loaded" value={metrics.claims} />
            <AdminMetric icon={Users} label="Users loaded" value={metrics.users} />
            <AdminMetric icon={FileText} label="Documents loaded" value={metrics.documents} />
            <AdminMetric icon={BadgeCheck} label="Open work" value={metrics.open} />
          </section>

          {hasPermission("leads.view") && (
            <>
              <AdminTable title="Leads" description="Public compensation requests from Start Your Claim and Check Compensation.">
                <table>
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Status</th>
                      <th>Stage</th>
                      <th>Route</th>
                      <th>Contact</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.leads.map((lead) => (
                      <tr key={lead.id}>
                        <td>{lead.lead_code || lead.id.slice(0, 8)}</td>
                        <td>
                          <select value={lead.status || "new"} onChange={(event) => changeLeadStatus(lead.id, event.target.value)} disabled={!hasPermission("leads.edit")}>
                            {leadStatuses.map((status) => <option value={status} key={status}>{status}</option>)}
                          </select>
                        </td>
                        <td>{lead.stage || "-"}</td>
                        <td>{lead.departure_airport || "-"} → {lead.arrival_airport || "-"}</td>
                        <td>{lead.full_name || lead.email || lead.phone || "-"}</td>
                        <td>{lead.created_at ? new Date(lead.created_at).toLocaleDateString() : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </AdminTable>

              <AdminTable title="Lead Details" description="Flight data, contact information, and customer notes collected from the lead form.">
                <table>
                  <thead>
                    <tr>
                      <th>Lead</th>
                      <th>Flight</th>
                      <th>Delay</th>
                      <th>Contact</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.leads.map((lead) => (
                      <tr key={`${lead.id}-details`}>
                        <td>{lead.lead_code || lead.id.slice(0, 8)}</td>
                        <td>{lead.airline || "-"} · {lead.departure_airport || "-"} → {lead.arrival_airport || "-"}</td>
                        <td>{lead.payload?.delayDuration || lead.eligibility_status || "-"}</td>
                        <td>{lead.full_name || "-"} · {lead.email || lead.phone || "-"}</td>
                        <td className="admin-cell-wrap">{lead.reason || lead.payload?.reason || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </AdminTable>
            </>
          )}

          {hasPermission("cases.view") && (
            <AdminTable title="Claims" description="Review customer requests and move them through the workflow.">
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Status</th>
                    <th>Eligibility</th>
                    <th>Amount</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.claims.map((claim) => (
                    <tr key={claim.id}>
                      <td>{claim.claim_code || claim.id.slice(0, 8)}</td>
                      <td>
                        <select value={claim.status || "new"} onChange={(event) => changeClaimStatus(claim.id, event.target.value)} disabled={!hasPermission("cases.edit")}>
                          {claimStatuses.map((status) => <option value={status} key={status}>{status}</option>)}
                        </select>
                      </td>
                      <td>{claim.eligibility_status || "pending"}</td>
                      <td>{claim.compensation_amount || 0} {claim.currency || "EUR"}</td>
                      <td>{claim.created_at ? new Date(claim.created_at).toLocaleDateString() : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminTable>
          )}

          {hasPermission("users.view") && (
            <AdminTable title="Users & Roles" description="Foundation mapping between authenticated users and internal access levels.">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Role</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.profiles.map((item) => (
                    <tr key={item.id}>
                      <td>{item.full_name || "-"}</td>
                      <td>{item.email || "-"}</td>
                      <td>{item.phone || "-"}</td>
                      <td>
                        <select value={item.role || "customer"} onChange={(event) => changeRole(item.id, event.target.value)} disabled={!hasPermission("users.manage")}>
                          {profileRoles.map((role) => <option value={role} key={role}>{role}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminTable>
          )}

          {hasPermission("documents.view") && (
            <>
              <AdminTable title="Documents" description="Latest uploaded files and their processing status.">
                <table>
                  <thead>
                    <tr>
                      <th>Owner</th>
                      <th>Type</th>
                      <th>File</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th>Download</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.documents.map((document) => (
                      <tr key={document.id}>
                        <td>{document.owner_type}</td>
                        <td>{document.document_type}</td>
                        <td>{document.file_name}</td>
                        <td>{document.status}</td>
                        <td>{document.created_at ? new Date(document.created_at).toLocaleDateString() : "-"}</td>
                        <td>
                          {hasPermission("documents.download") ? (
                            <button className="admin-link-button" type="button" onClick={() => downloadDocument(document)}>
                              Download
                            </button>
                          ) : "Restricted"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </AdminTable>

              <AdminTable title="Electronic Signatures" description="Final lead signatures and accepted terms for submitted claims.">
                <table>
                  <thead>
                    <tr>
                      <th>Signer</th>
                      <th>Email</th>
                      <th>Terms</th>
                      <th>Signed</th>
                      <th>Preview</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.leadSignatures.map((signature) => (
                      <tr key={signature.id}>
                        <td>{signature.signer_name || "-"}</td>
                        <td>{signature.signer_email || "-"}</td>
                        <td>{signature.terms_accepted ? "Accepted" : "Missing"}</td>
                        <td>{signature.signed_at ? new Date(signature.signed_at).toLocaleString() : "-"}</td>
                        <td>
                          <button className="admin-link-button" type="button" onClick={() => downloadSignature(signature)}>
                            Download PNG
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </AdminTable>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default AdminDashboard;
