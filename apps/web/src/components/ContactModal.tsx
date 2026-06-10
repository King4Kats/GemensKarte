/**
 * ContactModal : la fenêtre pop-up (modale) où l'internaute peut soit demander
 * à AJOUTER son association à la carte ("recenser"), soit SIGNALER une asso à
 * retirer ("deferencer"). Les deux onglets partagent la même fenêtre.
 * À l'envoi, le formulaire appelle l'API (le serveur) puis affiche un message
 * de succès ou d'erreur.
 */
import { useState } from "react";
import { api } from "../lib/api";
import { CATEGORIES } from "../lib/categories";
import { Icon } from "./Icon";

type Mode = "recenser" | "deferencer";

const REASONS = [
  "Association fermée / dissoute",
  "Erreur dans les données",
  "Doublon",
  "Autre",
];

interface Props {
  mode: Mode;
  onClose: () => void;
}

export function ContactModal({ mode: initialMode, onClose }: Props) {
  // mode = onglet actif ("recenser" ou "deferencer").
  const [mode, setMode] = useState<Mode>(initialMode);
  // status = état d'avancement de l'envoi : rien / en cours / réussi / erreur.
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "err">("idle");

  // Champs recenser
  const [name, setName]       = useState("");
  const [category, setCategory] = useState("");
  const [city, setCity]       = useState("");
  const [postal, setPostal]   = useState("");
  const [email, setEmail]     = useState("");
  const [website, setWebsite] = useState("");
  const [desc, setDesc]       = useState("");

  // Champs deferencer
  const [dName, setDName]     = useState("");
  const [reason, setReason]   = useState(REASONS[0]);
  const [dMsg, setDMsg]       = useState("");
  const [dEmail, setDEmail]   = useState("");

  // Envoi du formulaire : on choisit le bon appel API selon l'onglet, et on met
  // à jour le status (sending -> ok ou err) pour afficher le bon écran.
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); // empêche le rechargement de page par défaut du navigateur
    setStatus("sending");
    try {
      if (mode === "recenser") {
        await api.recenser({ name, category, city, postalCode: postal || undefined, email, website: website || undefined, description: desc });
      } else {
        await api.deferencer({ name: dName, reason, message: dMsg || undefined, email: dEmail || undefined });
      }
      setStatus("ok");
    } catch {
      setStatus("err");
    }
  };

  // Styles réutilisés pour tous les champs/labels du formulaire (évite de les
  // réécrire à chaque <input>). Ce sont juste des objets de style CSS.
  const inp: React.CSSProperties = {
    width: "100%", height: 44, padding: "0 14px",
    borderRadius: 12, border: "1.5px solid var(--hairline)",
    background: "var(--bg)", fontFamily: "var(--font)",
    fontSize: 14.5, color: "var(--ink)", outline: "none",
    boxSizing: "border-box",
    transition: "border-color .15s",
  };
  const textarea: React.CSSProperties = {
    ...inp, height: 100, padding: "12px 14px",
    resize: "vertical" as const, lineHeight: 1.5,
  };
  const label: React.CSSProperties = {
    display: "block", fontSize: 12.5, fontWeight: 700,
    color: "var(--muted)", marginBottom: 6, letterSpacing: "0.04em",
    textTransform: "uppercase",
  };

  return (
    // Fond sombre qui couvre tout l'écran. Cliquer EN DEHORS de la fenêtre
    // (sur le fond) ferme la modale ; un clic sur la fenêtre elle-même non.
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 2000,
        background: "rgba(10,10,20,.65)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "20px",
      }}
    >
      <div style={{
        width: "min(560px, 100%)", maxHeight: "90vh",
        background: "var(--bg)", borderRadius: 20,
        boxShadow: "0 32px 80px rgba(0,0,0,.28)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "22px 26px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: "-0.03em" }}>
              {mode === "recenser" ? "Référencer mon association" : "Déférencer une association"}
            </h2>
            <button
              onClick={onClose}
              style={{ background: "none", border: 0, cursor: "pointer", color: "var(--muted)", display: "flex", padding: 4 }}
            >
              <Icon name="close" size={20} stroke={2} />
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, padding: "4px", background: "var(--bg-soft)", borderRadius: 12, marginBottom: 24 }}>
            {(["recenser", "deferencer"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setStatus("idle"); }}
                style={{
                  flex: 1, height: 38, borderRadius: 9, border: 0,
                  background: mode === m ? "var(--bg)" : "transparent",
                  boxShadow: mode === m ? "0 1px 6px rgba(0,0,0,.08)" : "none",
                  fontFamily: "var(--font)", fontWeight: 700, fontSize: 13.5,
                  color: mode === m ? "var(--ink)" : "var(--muted)",
                  cursor: "pointer", transition: "all .15s",
                }}
              >
                {m === "recenser" ? "➕ Référencer" : "🗑️ Déférencer"}
              </button>
            ))}
          </div>
        </div>

        {/* Corps de la modale. Ce qu'on affiche dépend du status : écran de
            succès, écran d'erreur, ou bien le formulaire (recenser/deferencer). */}
        <div style={{ overflowY: "auto", padding: "0 26px 26px", flex: 1 }}>
          {status === "ok" ? (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
              <p style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)", margin: "0 0 8px" }}>
                {mode === "recenser" ? "Demande envoyée !" : "Signalement envoyé !"}
              </p>
              <p style={{ fontSize: 14, color: "var(--muted)", margin: "0 0 24px" }}>
                {mode === "recenser"
                  ? "Nous examinerons votre demande sous 48h."
                  : "Nous traiterons votre signalement rapidement."}
              </p>
              <button className="btn btn-accent btn-md" onClick={onClose}>Fermer</button>
            </div>
          ) : status === "err" ? (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
              <p style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", margin: "0 0 16px" }}>Une erreur est survenue.</p>
              <button className="btn btn-accent btn-md" onClick={() => setStatus("idle")}>Réessayer</button>
            </div>
          ) : mode === "recenser" ? (
            <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div>
                <label style={label}>Nom de l'association *</label>
                <input required style={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : Club de foot de Noirmoutier" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={label}>Catégorie *</label>
                  <select required style={{ ...inp, cursor: "pointer" }} value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="">Choisir…</option>
                    {CATEGORIES.map((c) => (
                      <option key={c.id} value={c.label}>{c.emoji} {c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={label}>Ville *</label>
                  <input required style={inp} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ex : La Roche-sur-Yon" />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={label}>Code postal</label>
                  <input style={inp} value={postal} onChange={(e) => setPostal(e.target.value)} placeholder="85000" maxLength={5} />
                </div>
                <div>
                  <label style={label}>Email de contact *</label>
                  <input required type="email" style={inp} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contact@asso.fr" />
                </div>
              </div>
              <div>
                <label style={label}>Site web ou réseaux sociaux</label>
                <input style={inp} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" />
              </div>
              <div>
                <label style={label}>Description *</label>
                <textarea required style={textarea} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Décrivez l'objet et les activités de votre association (10 caractères min.)…" />
              </div>
              <button
                type="submit"
                disabled={status === "sending"}
                className="btn btn-accent btn-md"
                style={{ marginTop: 4, opacity: status === "sending" ? 0.6 : 1 }}
              >
                {status === "sending" ? "Envoi en cours…" : "Envoyer la demande →"}
              </button>
            </form>
          ) : (
            <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div>
                <label style={label}>Nom de l'association *</label>
                <input required style={inp} value={dName} onChange={(e) => setDName(e.target.value)} placeholder="Ex : Club de foot de Noirmoutier" />
              </div>
              <div>
                <label style={label}>Raison *</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {REASONS.map((r) => (
                    <label key={r} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 14.5, fontWeight: 600, color: "var(--ink)" }}>
                      <input
                        type="radio" name="reason" value={r}
                        checked={reason === r} onChange={() => setReason(r)}
                        style={{ accentColor: "var(--accent)", width: 16, height: 16 }}
                      />
                      {r}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label style={label}>Message complémentaire</label>
                <textarea style={textarea} value={dMsg} onChange={(e) => setDMsg(e.target.value)} placeholder="Précisez si nécessaire…" />
              </div>
              <div>
                <label style={label}>Votre email (pour le suivi)</label>
                <input type="email" style={inp} value={dEmail} onChange={(e) => setDEmail(e.target.value)} placeholder="votre@email.fr" />
              </div>
              <button
                type="submit"
                disabled={status === "sending"}
                className="btn btn-md"
                style={{ marginTop: 4, opacity: status === "sending" ? 0.6 : 1, background: "var(--ink)", color: "white" }}
              >
                {status === "sending" ? "Envoi en cours…" : "Envoyer le signalement →"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
