"use client";

import { useEffect, useState } from "react";
import { AuthForm } from "../components/AuthForm";
import { Inbox } from "../components/Inbox";
import { fetchMe, tryRefresh, type AuthResponse, type PublicUser } from "../lib/api";

/**
 * Orchestrates Phase 3's demo script (docs/ROADMAP.md Phase 3): shows the
 * login/register form until authenticated, then the real Inbox. On mount,
 * attempts a silent refresh from the httpOnly cookie alone - a page
 * reload doesn't force a fresh login if a valid session already exists,
 * matching real session semantics (docs/SECURITY.md Section 4.3).
 */
export default function HomePage() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    tryRefresh().then(async (result) => {
      if (!result) {
        setBooting(false);
        return;
      }
      try {
        const me = await fetchMe(result.accessToken);
        setAccessToken(result.accessToken);
        setUser(me.user);
      } finally {
        setBooting(false);
      }
    });
  }, []);

  function handleAuthenticated(result: AuthResponse) {
    setAccessToken(result.accessToken);
    setUser(result.user);
  }

  function handleLoggedOut() {
    setAccessToken(null);
    setUser(null);
  }

  if (booting) {
    return (
      <main style={{ maxWidth: 420, margin: "80px auto", padding: 24, color: "#9AA5B1" }}>
        Loading...
      </main>
    );
  }

  if (!accessToken || !user) {
    return <AuthForm onAuthenticated={handleAuthenticated} />;
  }

  return <Inbox accessToken={accessToken} user={user} onLoggedOut={handleLoggedOut} />;
}
