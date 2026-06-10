import { useEffect, useState } from "react";

/**
 * Hook "responsive" : renvoie true quand l'écran est étroit (téléphone).
 * Permet d'adapter la mise en page en JavaScript (les styles sont écrits en ligne
 * dans ce projet, on ne peut donc pas tout faire en CSS @media). Se met à jour
 * automatiquement si on tourne le téléphone ou redimensionne la fenêtre.
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
