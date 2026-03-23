"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

export function SignInScreen({ credentialsConfigured }: { credentialsConfigured: boolean }) {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const error = searchParams.get("error");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!credentialsConfigured || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    await signIn("credentials", {
      email,
      password,
      callbackUrl: "/",
    });
    setIsSubmitting(false);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        position: "relative",
        zIndex: 1,
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
            התחברות עם מייל וססמה מקומית נדרשת כדי לטעון העדפות אישיות,
            לשמור היסטוריית תזכורות ולגשת לחיבור השרת אל Morning.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ marginTop: 18, display: "grid", gap: 12 }}>
          <div className="fld">
            <label>מייל</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="itai@bo-nobo.com"
              autoComplete="email"
              disabled={!credentialsConfigured || isSubmitting}
            />
          </div>
          <div className="fld">
            <label>ססמה</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="ססמה"
              autoComplete="current-password"
              disabled={!credentialsConfigured || isSubmitting}
            />
          </div>
          <button className="btn bp" type="submit" disabled={!credentialsConfigured || isSubmitting}>
            {isSubmitting ? "מתחבר..." : "התחבר"}
          </button>

          {error && credentialsConfigured && (
            <div className="conn-fb error">
              <div className="cfb-icon">✕</div>
              <div>
                <div>פרטי ההתחברות שגויים</div>
                <div className="cfb-steps">בדוק את המייל והססמה ונסה שוב.</div>
              </div>
            </div>
          )}

          {!credentialsConfigured && (
            <div className="conn-fb error">
              <div className="cfb-icon">✕</div>
              <div>
                <div>Credentials Auth לא מוגדר</div>
                <div className="cfb-steps">
                  יש להגדיר `AUTH_EMAIL`, `AUTH_PASSWORD`, `NEXTAUTH_SECRET`
                  ו-`NEXTAUTH_URL`.
                </div>
              </div>
            </div>
          )}
        </form>
      </div>
    </main>
  );
}
