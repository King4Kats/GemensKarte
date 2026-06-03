import type { CSSProperties, ReactNode } from "react";
import type { Association } from "../lib/api";
import { actionOf } from "../lib/api";
import { catById } from "../lib/categories";
import { Icon, type IconName } from "./Icon";
import { CatBadge } from "./CatBadge";

const sheetH: CSSProperties = {
  fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase",
  color: "var(--muted)", margin: "0 0 12px",
};

function SheetRow({ icon, children, href }: { icon: IconName; children: ReactNode; href?: boolean }) {
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
  return href ? <a href="#" onClick={(e) => e.preventDefault()} style={{ textDecoration: "none", display: "block" }}>{inner}</a> : inner;
}

function SocialBtn({ icon, label }: { icon: IconName; label: string }) {
  return (
    <button style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, height: 44, borderRadius: 13, border: "1.5px solid var(--hairline)", background: "var(--bg)", cursor: "pointer", fontFamily: "var(--font)", fontWeight: 700, fontSize: 13.5, color: "var(--ink)" }}>
      <Icon name={icon} size={18} stroke={2} />
      {label}
    </button>
  );
}

export function AssoSheet({ asso, onClose }: { asso: Association | null; onClose: () => void }) {
  const c = asso ? catById(asso.categoryId) : null;
  const website = asso?.social?.website ?? null;
  const insta = asso?.social?.instagram ?? null;
  const facebook = asso?.social?.facebook ?? null;

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
                <CatBadge cat={asso.categoryId} solid />
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

              {/* Tags */}
              {asso.tags.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 26 }}>
                  {asso.tags.map((t) => (
                    <span key={t} style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-2)", background: "var(--bg-sunk)", padding: "6px 12px", borderRadius: "var(--radius-pill)" }}>{t}</span>
                  ))}
                </div>
              )}

              {/* Contact */}
              {(website || asso.email || asso.phone) && (
                <>
                  <h4 style={sheetH}>Contact</h4>
                  <div style={{ marginBottom: 24 }}>
                    {website && <SheetRow icon="globe" href>{website}</SheetRow>}
                    {asso.email && <SheetRow icon="mail" href>{asso.email}</SheetRow>}
                    {asso.phone && <SheetRow icon="phone">{asso.phone}</SheetRow>}
                  </div>
                </>
              )}

              {/* Socials */}
              {(insta || facebook) && (
                <div style={{ display: "flex", gap: 10, marginBottom: 26 }}>
                  {insta && <SocialBtn icon="insta" label={insta} />}
                  {facebook && <SocialBtn icon="facebook" label="Facebook" />}
                </div>
              )}
            </div>

            {/* Sticky action */}
            <div style={{ position: "sticky", bottom: 0, padding: "16px 26px 22px", background: "linear-gradient(to top, var(--bg) 72%, transparent)", display: "flex", gap: 10 }}>
              <button
                className="btn btn-lg"
                style={{ flex: 1, background: c.color, color: c.onLight ? "var(--ink)" : "#fff", boxShadow: `0 8px 22px color-mix(in srgb, ${c.color} 38%, transparent)` }}
              >
                <Icon name="heart" size={18} stroke={2.2} />
                {actionOf(asso)}
              </button>
              <button className="btn btn-ghost btn-lg" style={{ width: 56, padding: 0 }} aria-label="Partager">
                <Icon name="arrowUpRight" size={20} stroke={2.2} />
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
