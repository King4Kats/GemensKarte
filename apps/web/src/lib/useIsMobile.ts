import { useEffect, useState } from "react";

/**
 * Hook "responsive" : renvoie true quand l'écran est étroit (téléphone).
 * Sert à afficher un menu burger à la place de la barre de navigation sur mobile.
 * Se met à jour automatiquement au redimensionnement / rotation de l'écran.
 */
export function useIsMobile(breakpoint = 760): boolean {
  const [mobile, setMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false,
  );
  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);
  return mobile;
}
