/**
 * AssoCard — la "carte" qui résume une association dans une liste/grille :
 * catégorie, ville, nom, petite phrase d'accroche et nombre de membres.
 * Cliquer dessus ouvre la fiche détaillée. Survoler peut surligner l'asso sur la carte.
 */
import type { CSSProperties } from "react";
import type { Association } from "../lib/api";
import { blurbOf } from "../lib/api";
import { catById } from "../lib/categories";
import { Icon } from "./Icon";
import { CatBadge } from "./CatBadge";

// Les "props" = les données et fonctions que le composant reçoit du parent.
interface Props {
  asso: Association; // l'association à afficher
  active?: boolean; // true = carte mise en avant (ex : asso survolée sur la carte)
  onOpen: (a: Association) => void; // appelée au clic pour ouvrir la fiche
  onHover?: (a: Association) => void; // appelée quand la souris entre
  onLeave?: (a: Association) => void; // appelée quand la souris sort
}

export function AssoCard({ asso, active, onOpen, onHover, onLeave }: Props) {
  const c = catById(asso.categoryId); // couleur + libellé de la catégorie
  return (
    <button
      className={"asso-card" + (active ? " is-active" : "")}
      style={{ "--cat": c.color } as CSSProperties}
      onClick={() => onOpen(asso)}
      onMouseEnter={() => onHover?.(asso)}
      onMouseLeave={() => onLeave?.(asso)}
    >
      <div className="ac-top">
        <CatBadge cat={asso.categoryId} />
        <span className="ac-meta">
          <Icon name="pin" size={14} stroke={2.2} />
          {asso.city ?? asso.region ?? "—"}
        </span>
      </div>
      <h3 className="ac-name">{asso.name}</h3>
      <p className="ac-blurb">{blurbOf(asso)}</p>
      <div className="ac-foot">
        {/* En bas : si on connaît le nombre de membres on l'affiche, sinon on montre la région */}
        <span className="ac-meta">
          {asso.members != null ? (
            <>
              <Icon name="users" size={15} stroke={2} />
              {asso.members} membres
            </>
          ) : (
            <>
              <Icon name="pin" size={15} stroke={2} />
              {asso.region ?? "Grand Ouest"}
            </>
          )}
        </span>
        {/* Bouton "Découvrir". stopPropagation évite que le clic se déclenche deux fois
            (le bouton-carte parent capte déjà le clic). */}
        <span
          className={"ac-cta" + (c.onLight ? " on-light" : "")}
          style={{ "--cat": c.color } as CSSProperties}
          onClick={(e) => { e.stopPropagation(); onOpen(asso); }}
        >
          Découvrir
          <Icon name="arrow" size={14} stroke={2.4} />
        </span>
      </div>
    </button>
  );
}
