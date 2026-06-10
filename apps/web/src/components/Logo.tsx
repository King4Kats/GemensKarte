/**
 * Logo — le logo de GemensKarte (image), cliquable (sert en général à revenir à l'accueil).
 * C'est le wordmark officiel "GemensKarte" avec ses confettis (fichier public/logo.png).
 * "size" pilote la HAUTEUR du logo ; la largeur s'ajuste automatiquement (ratio conservé).
 */
export function Logo({ size = 22, onClick }: { size?: number; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="GemensKarte — accueil"
      style={{
        display: "inline-flex", alignItems: "center",
        border: 0, background: "transparent", cursor: onClick ? "pointer" : "default", padding: 0,
      }}
    >
      <img
        src="/logo.png"
        alt="GemensKarte"
        style={{ height: size + 8, width: "auto", display: "block" }}
      />
    </button>
  );
}
