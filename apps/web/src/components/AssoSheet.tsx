import React from "react";
import type { CSSProperties, ReactNode } from "react";
import type { Association } from "../lib/api";
import { actionOf } from "../lib/api";
import { catById } from "../lib/categories";
import { Icon, type IconName } from "./Icon";
import { CatBadge } from "./CatBadge";

interface PressArticle {
  title: string; url: string; source: string; domain?: string; snippet: string;
}

const SOURCE_COLORS: Record<string, string> = {
  "Ouest-France":           "#e2001a",
  "Le Télégramme":          "#0057a8",
  "Actu.fr":                "#ff6600",
  "Presse Océan":           "#006bac",
  "Vendée Matin":           "#00843d",
  "Le Courrier de l'Ouest": "#8b0000",
  "Paris-Normandie":        "#003366",
};

function PressCard({ article }: { article: PressArticle }) {
  const color = SOURCE_COLORS[article.source] ?? "#6b7280";
  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "block",
        textDecoration: "none",
        padding: "13px 0",
        borderBottom: "1px solid var(--hairline-2)",
        transition: "opacity .15s",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.72"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{
          fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase",
          color, padding: "2px 9px", borderRadius: "var(--radius-pill)", whiteSpace: "nowrap",
          border: `1.5px solid ${color}`,
        }}>
          {article.source}
        </span>
        <Icon name="arrowUpRight" size={13} stroke={2.2} style={{ color: "var(--muted)" } as any} />
      </div>
      <p style={{
        margin: "0 0 4px",
        fontSize: 14, fontWeight: 700, color: "var(--ink)", lineHeight: 1.3,
      }}>
        {article.title}
      </p>
      {article.snippet && (
        <p style={{
          margin: 0, fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.45,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        } as React.CSSProperties}>
          {article.snippet}
        </p>
      )}
    </a>
  );
}

const sheetH: CSSProperties = {
  fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase",
  color: "var(--muted)", margin: "0 0 12px",
};

function SheetRow({ icon, children, href }: { icon: IconName; children: ReactNode; href?: string }) {
  const inner = (
    <span style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--hairline-2)" }}>
      <span style={{ display: "grid", placeItems: "center", width: 36, height: 36, borderRadius: 11, background: "var(--bg-sunk)", color: "var(--ink-2)", flexShrink: 0 }}>
        <Icon name={icon} size={17} stroke={2} />
      </span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {children}
      </span>
      {href && <span style={{ color: "var(--muted)", display: "flex" }}><Icon name="arrowUpRight" size={16} stroke={2.2} /></span>}
    </span>
  );
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", display: "block" }}>{inner}</a>
  ) : inner;
}

function SocialBtn({ icon, label, href }: { icon: IconName; label: string; href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ flex: 1, minWidth: 130, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, height: 44, borderRadius: 13, border: "1.5px solid var(--hairline)", background: "var(--bg)", cursor: "pointer", fontFamily: "var(--font)", fontWeight: 700, fontSize: 13.5, color: "var(--ink)", textDecoration: "none" }}>
      <Icon name={icon} size={18} stroke={2} />
      {label}
    </a>
  );
}

const SOCIAL_META: Record<string, { icon: IconName; label: string }> = {
  facebook: { icon: "facebook", label: "Facebook" },
  instagram: { icon: "insta", label: "Instagram" },
  helloasso: { icon: "heart", label: "HelloAsso" },
};

function prettyUrl(u: string): string {
  return u.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

const TIER_COLOR: Record<string, string> = { A: "#00b87a", B: "#2b7fff", C: "#f5a623", D: "#9ca3af" };
const TIER_LABEL: Record<string, string> = { A: "Excellente", B: "Bonne", C: "Correcte", D: "À enrichir" };

function QualityBadge({ score, tier }: { score: number; tier: string }) {
  const color = TIER_COLOR[tier] ?? "#9ca3af";
  return (
    <span
      title={`Qualité de la fiche : ${TIER_LABEL[tier] ?? ""} (${score}/100). Score calculé : liens vérifiés, disponibilité, fraîcheur, agenda.`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, height: 26, padding: "0 11px 0 9px",
        borderRadius: "var(--radius-pill)", background: `color-mix(in srgb, ${color} 14%, white)`,
        border: `1.5px solid color-mix(in srgb, ${color} 45%, white)`,
        fontSize: 12, fontWeight: 800, color, letterSpacing: "-0.01em", whiteSpace: "nowrap",
      }}
    >
      <span style={{ display: "grid", placeItems: "center", width: 17, height: 17, borderRadius: "50%", background: color, color: "#fff", fontSize: 10.5, fontWeight: 800 }}>{tier}</span>
      Qualité {score}
    </span>
  );
}

interface EventItem {
  title?: string | null; start?: string | null; dateLabel?: string | null;
  city?: string | null; place?: string | null; url?: string | null; matchedAsso?: boolean;
}

function EventCard({ ev, color }: { ev: EventItem; color: string }) {
  const body = (
    <span style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--hairline-2)" }}>
      <span style={{ flexShrink: 0, width: 42, textAlign: "center", color }}>
        <Icon name="calendar" size={20} stroke={2.1} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 12, fontWeight: 800, color, letterSpacing: "-0.01em", marginBottom: 2 }}>
          {ev.dateLabel || (ev.start ? new Date(ev.start).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : "")}
        </span>
        <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "var(--ink)", lineHeight: 1.3 }}>{ev.title}</span>
        {(ev.place || ev.city) && (
          <span style={{ display: "block", fontSize: 12.5, color: "var(--muted)", fontWeight: 600, marginTop: 2 }}>
            {[ev.place, ev.city].filter(Boolean).join(" · ")}
          </span>
        )}
      </span>
      {ev.url && <span style={{ color: "var(--muted)", display: "flex", alignItems: "center" }}><Icon name="arrowUpRight" size={16} stroke={2.2} /></span>}
    </span>
  );
  return ev.url
    ? <a href={ev.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", display: "block" }}>{body}</a>
    : body;
}

export function AssoSheet({ asso, onClose }: { asso: Association | null; onClose: () => void }) {
  const c = asso ? catById(asso.categoryId) : null;
  const website = asso?.social?.website ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pressArticles: PressArticle[] = (asso as any)?.pressArticles ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const events: EventItem[] = (asso as any)?.events ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const quality = (asso as any)?.qualityScore ?? null;
  const socialLinks = Object.entries(asso?.social ?? {}).filter(
    ([k, v]) => k !== "website" && v && SOCIAL_META[k],
  ) as Array<[string, string]>;

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "absolute", inset: 0, zIndex: 1200,
          background: "rgba(20,20,27,.28)", backdropFilter: "blur(2px)",
          opacity: asso ? 1 : 0, pointerEvents: asso ? "auto" : "none",
          transition: "opacity .32s ease",
        }}
      />
      <aside
        className="cm-scroll"
        style={{
          position: "absolute", top: 0, right: 0, bottom: 0, zIndex: 1201,
          width: "min(440px, 92vw)", background: "var(--bg)",
          boxShadow: "var(--shadow-sheet)", overflowY: "auto",
          transform: asso ? "translateX(0)" : "translateX(102%)",
          transition: "transform .4s cubic-bezier(.5,.1,.25,1)",
        }}
      >
        {asso && c && (
          <div>
            {/* Hero band — the only place we let color flood */}
            <div style={{ position: "relative", padding: "22px 26px 24px", background: `color-mix(in srgb, ${c.color} 9%, white)`, overflow: "hidden" }}>
              <div aria-hidden style={{ position: "absolute", inset: 0, opacity: 0.5 }}>
                <i style={{ position: "absolute", top: 14, right: 30, width: 14, height: 14, borderRadius: "50%", background: c.color, opacity: 0.5 }} />
                <i style={{ position: "absolute", top: 46, right: 70, width: 8, height: 8, borderRadius: 2, background: c.color, opacity: 0.35, transform: "rotate(20deg)" }} />
                <i style={{ position: "absolute", bottom: 18, right: 18, width: 10, height: 10, borderRadius: "50%", border: `2.5px solid ${c.color}`, opacity: 0.4 }} />
              </div>
              <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <CatBadge cat={asso.categoryId} solid />
                  {quality && <QualityBadge score={quality.score} tier={quality.tier} />}
                </span>
                <button
                  onClick={onClose}
                  aria-label="Fermer"
                  style={{ display: "grid", placeItems: "center", width: 38, height: 38, borderRadius: "50%", border: 0, background: "var(--bg)", color: "var(--ink)", cursor: "pointer", boxShadow: "var(--shadow-card)" }}
                >
                  <Icon name="close" size={18} stroke={2.4} />
                </button>
              </div>
              <h2 style={{ position: "relative", fontSize: 30, fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1.05, margin: "0 0 10px", color: "var(--ink)" }}>
                {asso.name}
              </h2>
              <div style={{ position: "relative", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 14, fontSize: 13.5, fontWeight: 600, color: "var(--ink-2)" }}>
                {(asso.city || asso.region) && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <Icon name="pin" size={15} stroke={2.2} />
                    {[asso.city, asso.region].filter(Boolean).join(", ")}
                  </span>
                )}
                {asso.founded && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <Icon name="calendar" size={15} stroke={2.2} />Depuis {asso.founded}
                  </span>
                )}
              </div>
            </div>

            <div style={{ padding: "22px 26px 30px" }}>
              {/* Stats + need */}
              {(asso.members != null || asso.needs) && (
                <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
                  {asso.members != null && (
                    <div style={{ flex: 1, background: "var(--bg-soft)", borderRadius: 14, padding: "14px 16px" }}>
                      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em", color: "var(--ink)" }}>{asso.members}</div>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--muted)", marginTop: 2 }}>membres actifs</div>
                    </div>
                  )}
                  {asso.needs && (
                    <div style={{ flex: 1.4, borderRadius: 14, padding: "14px 16px", background: `color-mix(in srgb, ${c.color} 11%, white)` }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: c.color }}>
                        <Icon name="sparkle" size={13} stroke={2.4} /> Recherche
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", marginTop: 4, letterSpacing: "-0.01em" }}>{asso.needs}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Description */}
              {asso.description && (
                <>
                  <h4 style={sheetH}>À propos</h4>
                  <p style={{ fontSize: 14.5, lineHeight: 1.6, color: "var(--ink-2)", margin: "0 0 20px", textWrap: "pretty" }}>{asso.description}</p>
                </>
              )}

              {/* Tags RNA masqués (codes internes D/S sans valeur UX) */}

              {/* Contact */}
              {(website || asso.email || asso.phone) && (
                <>
                  <h4 style={sheetH}>Contact</h4>
                  <div style={{ marginBottom: 24 }}>
                    {website && <SheetRow icon="globe" href={website}>{prettyUrl(website)}</SheetRow>}
                    {asso.email && <SheetRow icon="mail" href={`mailto:${asso.email}`}>{asso.email}</SheetRow>}
                    {asso.phone && <SheetRow icon="phone">{asso.phone}</SheetRow>}
                  </div>
                </>
              )}

              {/* Socials */}
              {socialLinks.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 26 }}>
                  {socialLinks.map(([k, v]) => (
                    <SocialBtn key={k} icon={SOCIAL_META[k]!.icon} label={SOCIAL_META[k]!.label} href={v} />
                  ))}
                </div>
              )}

              {/* Agenda à venir (événements OpenAgenda à proximité) */}
              {events.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <h4 style={sheetH}>
                    Agenda à venir
                    {events.some((e) => !e.matchedAsso) && (
                      <span style={{ fontWeight: 600, textTransform: "none", letterSpacing: 0, color: "var(--muted)" }}> · à proximité</span>
                    )}
                  </h4>
                  {events.slice(0, 6).map((ev, idx) => (
                    <EventCard key={idx} ev={ev} color={c.color} />
                  ))}
                </div>
              )}

              {/* Dans la presse */}
              {pressArticles.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <h4 style={sheetH}>Dans la presse</h4>
                  {pressArticles.map((a, idx) => (
                    <PressCard key={idx} article={a} />
                  ))}
                </div>
              )}
            </div>

            {/* Bouton Contacter — seulement si email dispo en DB */}
            {asso.email && (
              <div style={{ position: "sticky", bottom: 0, padding: "16px 26px 22px", background: "linear-gradient(to top, var(--bg) 72%, transparent)", display: "flex", gap: 10 }}>
                <a
                  href={`mailto:${asso.email}`}
                  className="btn btn-lg"
                  style={{ flex: 1, background: c.color, color: c.onLight ? "var(--ink)" : "#fff", boxShadow: `0 8px 22px color-mix(in srgb, ${c.color} 38%, transparent)`, textDecoration: "none" }}
                >
                  <Icon name="mail" size={18} stroke={2.2} />
                  Contacter
                </a>
                <button className="btn btn-ghost btn-lg" style={{ width: 56, padding: 0 }} aria-label="Partager">
                  <Icon name="arrowUpRight" size={20} stroke={2.2} />
                </button>
              </div>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
