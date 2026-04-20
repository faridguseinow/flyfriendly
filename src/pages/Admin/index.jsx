import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, FileText, ShieldCheck, Users } from "lucide-react";
import logoImage from "../../assets/icons/logo-image.svg";
import logoText from "../../assets/icons/fly-friendly.svg";
import { isSupabaseConfigured } from "../../lib/supabase.js";
import {
  fetchAdminOverview,
  getAdminContext,
  updateClaimStatus,
  updateProfileRole,
} from "../../services/adminService.js";
import "./style.scss";

const claimStatuses = ["draft", "submitted", "in_review", "approved", "not_eligible", "paid", "rejected"];
const profileRoles = ["customer", "admin", "manager", "support"];

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

function Admin() {
  const [context, setContext] = useState({ user: null, profile: null, isAdmin: false });
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const metrics = useMemo(() => {
    const claims = overview?.claims || [];
    return {
      claims: claims.length,
      users: overview?.profiles?.length || 0,
      documents: overview?.documents?.length || 0,
      open: claims.filter((claim) => ["draft", "submitted", "in_review"].includes(claim.status)).length,
    };
  }, [overview]);

  const loadAdmin = async () => {
    setError("");
    setIsLoading(true);

    try {
      const nextContext = await getAdminContext();
      setContext(nextContext);

      if (nextContext.isAdmin) {
        setOverview(await fetchAdminOverview());
      }
    } catch (adminError) {
      setError(adminError.message || "Could not load admin data.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError("Supabase env is missing.");
      setIsLoading(false);
      return;
    }

    loadAdmin();
  }, []);

  const changeClaimStatus = async (claimId, status) => {
    await updateClaimStatus(claimId, status);
    await loadAdmin();
  };

  const changeRole = async (profileId, role) => {
    await updateProfileRole(profileId, role);
    await loadAdmin();
  };

  return (
    <main className="admin-page">
      <header className="admin-hero">
        <Link to="/" className="admin-brand">
          <img src={logoImage} alt="" />
          <img src={logoText} alt="Fly Friendly" />
        </Link>
        <div>
          <span className="section-label is-primary"><ShieldCheck size={16} /> Admin Control</span>
          <h1>Site administration</h1>
          <p>Manage claims, customers, documents, events, and compensation decisions from one place.</p>
        </div>
      </header>

      {isLoading && <p className="admin-message">Loading admin data...</p>}
      {error && <p className="admin-message is-error">{error}</p>}

      {!isLoading && !context.user && (
        <section className="admin-empty">
          <h2>Admin login required</h2>
          <p>Sign in with an account that has `profiles.role = admin`.</p>
          <button className="btn btn-primary" type="button" onClick={() => window.dispatchEvent(new Event("fly-friendly:start-claim"))}>
            Log in
          </button>
        </section>
      )}

      {!isLoading && context.user && !context.isAdmin && (
        <section className="admin-empty">
          <h2>No admin access</h2>
          <p>Your current role is `{context.profile?.role || "unknown"}`. Ask an administrator to grant access.</p>
        </section>
      )}

      {context.isAdmin && overview && (
        <>
          <section className="admin-metrics">
            <AdminMetric icon={BadgeCheck} label="Claims loaded" value={metrics.claims} />
            <AdminMetric icon={Users} label="Users loaded" value={metrics.users} />
            <AdminMetric icon={FileText} label="Documents loaded" value={metrics.documents} />
            <AdminMetric icon={ShieldCheck} label="Open work" value={metrics.open} />
          </section>

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
                      <select value={claim.status || "draft"} onChange={(event) => changeClaimStatus(claim.id, event.target.value)}>
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

          <AdminTable title="Users" description="Grant admin, manager, support, or customer access.">
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
                {overview.profiles.map((profile) => (
                  <tr key={profile.id}>
                    <td>{profile.full_name || "-"}</td>
                    <td>{profile.email || "-"}</td>
                    <td>{profile.phone || "-"}</td>
                    <td>
                      <select value={profile.role || "customer"} onChange={(event) => changeRole(profile.id, event.target.value)}>
                        {profileRoles.map((role) => <option value={role} key={role}>{role}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTable>

          <AdminTable title="Documents" description="Latest uploaded files and their processing status.">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>File</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {overview.documents.map((document) => (
                  <tr key={document.id}>
                    <td>{document.document_type}</td>
                    <td>{document.file_name}</td>
                    <td>{document.status}</td>
                    <td>{document.created_at ? new Date(document.created_at).toLocaleDateString() : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTable>

          <div className="admin-grid">
            <AdminTable title="Eligibility Results" description="Most recent compensation decisions.">
              <table>
                <thead>
                  <tr>
                    <th>Stage</th>
                    <th>Eligible</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.eligibility.map((result) => (
                    <tr key={result.id}>
                      <td>{result.stage}</td>
                      <td>{result.eligible ? "Yes" : "No"}</td>
                      <td>{result.compensation_amount || 0} {result.currency || "EUR"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminTable>

            <AdminTable title="Recent Events" description="System activity across claims.">
              <table>
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.events.map((event) => (
                    <tr key={event.id}>
                      <td>{event.event_type}</td>
                      <td>{event.created_at ? new Date(event.created_at).toLocaleString() : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminTable>
          </div>
        </>
      )}
    </main>
  );
}

export default Admin;
