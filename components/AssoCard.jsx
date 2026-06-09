// GemensKarte — Composants "Peps & Confetti" en React + Tailwind
// -----------------------------------------------------------------------------
// Pré-requis Tailwind : étendre le thème avec la palette des catégories.
//
// tailwind.config.js
// theme: { extend: { colors: {
//   ink: "#1A1A2E", paper: "#FDFCF9",
//   eco: "#19C37D", culture: "#EC2D8A", sport: "#FFB020",
//   social: "#3B6BFF", jeunesse: "#8B5CF6", sante: "#FF6B57",
// }, borderRadius: { card: "20px", btn: "14px" } } }
// -----------------------------------------------------------------------------

// Table des catégories : 1 couleur de marque + 1 fond pastel + émoji repère.
// On encode les classes Tailwind en dur (pas de string interpolée) pour que le
// JIT de Tailwind ne les purge pas.
export const CATEGORIES = {
  eco:      { label: "Écologie", emoji: "🌱", text: "text-eco",      bg: "bg-eco",      soft: "bg-eco/10",      ring: "shadow-eco/40" },
  culture:  { label: "Culture",  emoji: "🎭", text: "text-culture",  bg: "bg-culture",  soft: "bg-culture/10",  ring: "shadow-culture/40" },
  sport:    { label: "Sport",    emoji: "⚽", text: "text-sport",    bg: "bg-sport",    soft: "bg-sport/10",    ring: "shadow-sport/40" },
  social:   { label: "Social",   emoji: "🤝", text: "text-social",   bg: "bg-social",   soft: "bg-social/10",   ring: "shadow-social/40" },
  jeunesse: { label: "Jeunesse", emoji: "🎓", text: "text-jeunesse", bg: "bg-jeunesse", soft: "bg-jeunesse/10", ring: "shadow-jeunesse/40" },
  sante:    { label: "Santé",    emoji: "❤️", text: "text-sante",    bg: "bg-sante",    soft: "bg-sante/10",    ring: "shadow-sante/40" },
};

/* ---------------------------------------------------------------------------
 * Tag catégorie — la pastille "confetti"
 * ------------------------------------------------------------------------- */
export function CategoryTag({ cat }) {
  const c = CATEGORIES[cat];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1
                      text-[11px] font-bold uppercase tracking-wide ${c.text} ${c.soft}`}>
      <span aria-hidden>{c.emoji}</span> {c.label}
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * Boutons
 * ------------------------------------------------------------------------- */
export function Button({ variant = "primary", cat, className = "", children, ...props }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-btn px-5 py-3 " +
    "text-[15px] font-semibold transition-all duration-150 active:translate-y-0";
  const variants = {
    primary: "bg-social text-white shadow-lg shadow-social/40 hover:-translate-y-0.5 hover:shadow-social/60",
    ghost:   "bg-white border border-black/5 text-ink hover:-translate-y-0.5 hover:shadow-lg",
    // bouton aux couleurs de la catégorie courante (footer de la fiche)
    cat:     `${CATEGORIES[cat]?.bg} text-white hover:-translate-y-0.5 shadow-lg ${CATEGORIES[cat]?.ring}`,
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------------------
 * AssoCard — chaque carte est un "confetti"
 *   hover : lift + ombre teintée + barre latérale colorée
 *   onHover déclenche le rebond du pin jumeau sur la carte (lien liste ↔ carte)
 * ------------------------------------------------------------------------- */
export function AssoCard({ asso, isFav, onToggleFav, onOpen, onHoverPin }) {
  const c = CATEGORIES[asso.cat];
  return (
    <article
      onClick={() => onOpen(asso.id)}
      onMouseEnter={() => onHoverPin?.(asso.id)}
      className="group relative cursor-pointer overflow-hidden rounded-card border
                 border-black/5 bg-white p-4 pl-5 transition-all duration-200
                 hover:-translate-y-1 hover:shadow-2xl"
    >
      {/* barre latérale révélée au hover */}
      <span className={`absolute inset-y-0 left-0 w-1.5 origin-top scale-y-0 rounded-r
                        ${c.bg} transition-transform duration-200 group-hover:scale-y-100`} />

      <div className="mb-2 flex items-center justify-between">
        <CategoryTag cat={asso.cat} />
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFav(asso.id); }}
          className={`text-lg transition-transform hover:scale-125 ${isFav ? "text-culture" : "text-gray-300"}`}
          aria-label="Favori"
        >♥</button>
      </div>

      <h3 className="text-[17px] font-semibold leading-tight text-ink">{asso.name}</h3>
      <p className="mt-1 line-clamp-2 text-sm text-gray-500">{asso.desc}</p>

      <div className="mt-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[13px] text-gray-500">
          📍 {asso.city} · {asso.dist}
        </span>
        <span className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold ${c.text} ${c.soft}
                          transition-transform group-hover:translate-x-0.5`}>
          Voir →
        </span>
      </div>
    </article>
  );
}

/* ---------------------------------------------------------------------------
 * Pin confetti pour la carte (Leaflet : utiliser via L.divIcon avec ce markup)
 * ------------------------------------------------------------------------- */
export function ConfettiPin({ cat }) {
  const c = CATEGORIES[cat];
  return (
    <span className={`block h-6 w-6 rounded-full border-[3px] border-white shadow-md
                      ${c.bg} transition-transform hover:scale-125`} />
  );
}
