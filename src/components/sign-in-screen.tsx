"use client";

import { signIn } from "next-auth/react";

export function SignInScreen() {
  const googleConfigured = Boolean(
    process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED ?? "true",
  );

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background:
          "linear-gradient(135deg, rgba(18,122,84,0.14), rgba(15,23,42,0.05) 45%, rgba(255,255,255,0.9))",
      }}
    >
      <div
        className="gls"
        style={{
          width: "min(100%, 520px)",
          padding: 28,
          borderRadius: 24,
        }}
      >
        <div style={{ display: "grid", gap: 10 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              display: "grid",
              placeItems: "center",
              background: "var(--greenb)",
              color: "var(--green)",
              fontWeight: 800,
              fontSize: 24,
            }}
          >
            ₪
          </div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>מערכת גבייה</h1>
          <p style={{ margin: 0, color: "var(--t3)", lineHeight: 1.6 }}>
            התחברות עם Google נדרשת כדי לטעון העדפות אישיות, לשמור היסטוריית
            תזכורות ולגשת לחיבור השרת אל Morning.
          </p>
        </div>

        <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
          <button
            className="btn bp"
            onClick={() => signIn("google")}
            disabled={!googleConfigured}
          >
            התחבר עם Google
          </button>

          {!googleConfigured && (
            <div className="conn-fb error">
              <div className="cfb-icon">✕</div>
              <div>
                <div>Google Auth לא מוגדר</div>
                <div className="cfb-steps">
                  יש להגדיר `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
                  `NEXTAUTH_SECRET` ו-`NEXTAUTH_URL`.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

