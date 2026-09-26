import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Download, LogIn, RefreshCw, ShieldCheck, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { EVENT_DATE_LONG, EVENT_DATE_SHORT } from "@shared/event";
import { trpc } from "@/lib/trpc";

export default function Admin() {
  const { user, loading, logout, refresh } = useAuth();
  const [isExporting, setIsExporting] = useState(false);
  const [localPassword, setLocalPassword] = useState("");
  // Without the Manus portal (local development) the page signs in with the
  // organizer password instead of redirecting to the OAuth login.
  const usesLocalLogin = !import.meta.env.VITE_OAUTH_PORTAL_URL;
  const participants = trpc.participants.list.useQuery(undefined, { enabled: Boolean(user) });
  const utils = trpc.useUtils();
  const loginLocal = trpc.auth.loginLocal.useMutation({
    onSuccess: async () => {
      setLocalPassword("");
      toast.success("Connexion réussie");
      await refresh();
    },
    onError: (error) => toast.error("Connexion impossible", { description: error.message }),
  });
  const remove = trpc.participants.remove.useMutation({
    onSuccess: () => {
      toast.success("Participant supprimé");
      utils.participants.list.invalidate();
    },
    onError: (error) => toast.error("Suppression impossible", { description: error.message }),
  });

  async function refreshList() {
    if (participants.isFetching) return;
    try {
      // invalidate() drops the cached page (a plain refetch() can be skipped
      // while the cache still looks fresh), then fetch() returns fresh rows.
      await utils.participants.list.invalidate();
      const fresh = await utils.participants.list.fetch();
      toast.success("Liste à jour", {
        description: `${fresh.length} inscription${fresh.length === 1 ? "" : "s"} au total.`,
      });
    } catch (error) {
      toast.error("Actualisation impossible", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  function exportCsv() {
    if (!participants.data?.length) return;
    setIsExporting(true);
    const header = "Nom,Prénom,Pays,Date d'inscription\n";
    const rows = participants.data.map((item) => [item.lastName, item.firstName, item.country, new Date(item.createdAt).toLocaleString("fr-FR")].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "participants-creation-de-contenu.csv";
    link.click();
    URL.revokeObjectURL(url);
    setTimeout(() => setIsExporting(false), 300);
  }

  if (loading) return <div className="admin-loading">Chargement de l’espace organisateur…</div>;

  if (!user) {
    return (
      <main className="admin-shell">
        <div className="admin-login-card">
          <div className="admin-logo"><ShieldCheck size={24} /></div>
          <span className="eyebrow">ESPACE ORGANISATEUR</span>
          <h1>Gérez vos inscriptions.</h1>
          <p>
            {usesLocalLogin
              ? "Connectez-vous avec le mot de passe de l’organisateur pour consulter la liste des participants et exporter les données."
              : "Connectez-vous pour consulter la liste des participants et exporter les données."}
          </p>
          {usesLocalLogin ? (
            <form
              className="admin-login-form"
              onSubmit={(event) => {
                event.preventDefault();
                loginLocal.mutate({ password: localPassword });
              }}
            >
              <input
                type="password"
                value={localPassword}
                onChange={(event) => setLocalPassword(event.target.value)}
                placeholder="Mot de passe organisateur"
                autoComplete="current-password"
                autoFocus
                required
              />
              <button className="submit-button" type="submit" disabled={loginLocal.isPending}>
                <LogIn size={18} /> {loginLocal.isPending ? "Connexion…" : "Se connecter"}
              </button>
            </form>
          ) : (
            <button className="submit-button" onClick={() => startLogin()}><LogIn size={18} /> Se connecter</button>
          )}
          <Link href="/" className="back-link"><ArrowLeft size={16} /> Retour au formulaire</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <header className="admin-header page-width">
        <Link href="/" className="brand"><span className="brand-mark">CC</span><span><strong>Création</strong> de contenu</span></Link>
        <div className="admin-user"><span>{user.name || user.email || "Organisateur"}</span><button onClick={() => logout()}>Se déconnecter</button></div>
      </header>
      <section className="admin-content page-width">
        <div className="admin-title-row"><div><span className="eyebrow">TABLEAU DE SUIVI</span><h1>Participants</h1><p>Les inscriptions à la masterclass du {EVENT_DATE_LONG}.</p></div><div className="admin-actions"><button className="ghost-button" type="button" onClick={refreshList} disabled={participants.isFetching}><RefreshCw size={16} className={participants.isFetching ? "animate-spin" : undefined} /> {participants.isFetching ? "Actualisation…" : "Actualiser"}</button><button className="dark-button" disabled={!participants.data?.length || isExporting} onClick={exportCsv}><Download size={16} /> Exporter CSV</button></div></div>
        <div className="stats-row"><div className="stat-card"><span className="stat-icon blue"><Users size={20} /></span><span><small>Total inscrits</small><strong>{participants.data?.length ?? "—"}</strong></span></div><div className="stat-card"><span className="stat-icon green"><ShieldCheck size={20} /></span><span><small>Événement</small><strong>{EVENT_DATE_SHORT}</strong></span></div></div>
        <div className="table-card">
          <div className="table-heading"><h2>Liste des inscrits</h2><span>{participants.data?.length ?? 0} participant{participants.data?.length === 1 ? "" : "s"}</span></div>
          {participants.isLoading ? <div className="table-empty">Chargement de la liste…</div> : participants.data?.length ? <div className="table-scroll"><table><thead><tr><th>#</th><th>Photo</th><th>Nom</th><th>Prénom</th><th>Pays</th><th>Inscrit le</th><th /></tr></thead><tbody>{participants.data.map((item, index) => <tr key={item.id}><td className="muted">{String(index + 1).padStart(2, "0")}</td><td>{item.photoUrl ? <img className="admin-avatar" src={item.photoUrl} alt="" /> : <span className="no-photo">—</span>}</td><td><strong>{item.lastName}</strong></td><td>{item.firstName}</td><td><span className="country-pill">{item.country}</span></td><td className="muted">{new Date(item.createdAt).toLocaleDateString("fr-FR")}</td><td><button className="icon-button" aria-label={`Supprimer ${item.firstName} ${item.lastName}`} onClick={() => { if (window.confirm("Supprimer cette inscription ?")) remove.mutate({ id: item.id }); }}><Trash2 size={16} /></button></td></tr>)}</tbody></table></div> : <div className="table-empty"><Users size={34} /><strong>Aucune inscription pour le moment</strong><span>Les prochains participants apparaîtront ici.</span></div>}
        </div>
      </section>
    </main>
  );
}
