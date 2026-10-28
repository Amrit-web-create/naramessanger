import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { NaraApp } from "@/components/nara/app";
import { Splash } from "@/components/nara/splash";
import { useNara } from "@/lib/store";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (useNara.persist.hasHydrated()) {
      setReady(true);
      return;
    }
    const unsub = useNara.persist.onFinishHydration(() => setReady(true));
    const id = window.setTimeout(() => setReady(true), 1200);
    return () => {
      unsub();
      window.clearTimeout(id);
    };
  }, []);
  if (!ready) return <Splash />;
  return <NaraApp />;
}
