import { useState } from "react";
import { Landing, type ExploreOpts } from "./screens/Landing";
import { MapView } from "./screens/MapView";

export function App() {
  const [screen, setScreen] = useState<"landing" | "map">("landing");
  const [entry, setEntry] = useState<ExploreOpts>({});

  return screen === "landing" ? (
    <Landing onExplore={(o) => { setEntry(o); setScreen("map"); }} />
  ) : (
    <MapView initial={entry} onHome={() => setScreen("landing")} />
  );
}
