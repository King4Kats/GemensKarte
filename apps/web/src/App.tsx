import { useEffect, useState } from "react";
import { Landing, type ExploreOpts } from "./screens/Landing";
import { AdminReview } from "./components/AdminReview";
import { LinkReview } from "./components/LinkReview";
import { MapView } from "./screens/MapView";

export function App() {
  const [screen, setScreen] = useState<"landing" | "map">("landing");
  const [admin, setAdmin] = useState(false);
  const [links, setLinks] = useState(false);
  const [entry, setEntry] = useState<ExploreOpts>({});

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "A") setAdmin((v) => !v);
      if (e.ctrlKey && e.shiftKey && (e.key === "L" || e.key === "l")) setLinks((v) => !v);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      {admin && <AdminReview onClose={() => setAdmin(false)} />}
      {links && <LinkReview onClose={() => setLinks(false)} />}
        {screen === "landing"
        ? <Landing onExplore={(o) => { setEntry(o); setScreen("map"); }} />
        : <MapView initial={entry} onHome={() => setScreen("landing")} />
      }
    </>
  );
}
