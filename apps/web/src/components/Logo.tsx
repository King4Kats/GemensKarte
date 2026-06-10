/**
 * Logo — le logo de GemensKarte, cliquable (sert en général à revenir à l'accueil).
 * À gauche : 4 petits ronds de couleur représentant les familles d'associations
 * (culture, écologie, social, sport). À droite : le nom "GemensKarte".
 * "size" pilote la taille globale ; les autres dimensions s'y ajustent.
 */
export function Logo({ size = 22, onClick }: { size?: number; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 9,
        border: 0, background: "transparent", cursor: "pointer", padding: 0,
      }}
    >
      <span style={{ position: "relative", width: size + 6, height: size + 6, flexShrink: 0 }}>
        <i style={{ position: "absolute", left: 0, top: 2, width: 9, height: 9, borderRadius: "50%", background: "var(--c-cult)" }} />
        <i style={{ position: "absolute", right: 0, top: 0, width: 7, height: 7, borderRadius: "50%", background: "var(--c-eco)" }} />
        <i style={{ position: "absolute", left: 3, bottom: 0, width: 8, height: 8, borderRadius: "50%", background: "var(--c-social)" }} />
        <i style={{ position: "absolute", right: 2, bottom: 3, width: 6, height: 6, borderRadius: "50%", background: "var(--c-sport)" }} />
      </span>
      <span style={{ fontSize: size * 0.82, fontWeight: 800, letterSpacing: "-0.03em", color: "var(--ink)" }}>
        Gemens<span style={{ color: "var(--accent)" }}>Karte</span>
      </span>
    </button>
  );
}
