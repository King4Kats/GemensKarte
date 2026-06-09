import type { CSSProperties } from "react";
import type { Association } from "../lib/api";
import { blurbOf } from "../lib/api";
import { catById } from "../lib/categories";
import { Icon } from "./Icon";
import { CatBadge } from "./CatBadge";

interface Props {
  asso: Association;
  active?: boolean;
  onOpen: (a: Association) => void;
  onHover?: (a: Association) => void;
  onLeave?: (a: Association) => void;
}

export function AssoCard({ asso, active, onOpen, onHover, onLeave }: Props) {
  const c = catById(asso.categoryId);
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
