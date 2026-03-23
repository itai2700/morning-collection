"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function RegisterScreen({ registrationAvailable }: { registrationAvailable: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!registrationAvailable || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, email, password }),
    });

    const data = await response.json();
    setIsSubmitting(false);

    if (!response.ok) {
      setSubmitError(data.error || "Registration failed");
      return;
    }

    router.push("/?registered=1");
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
          "linear-gradient(135deg, rgba(12,74,110,0.12), rgba(15,23,42,0.05) 45%, rgba(255,255,255,0.94))",
      }}
    >
      <div className="gls" style={{ width: "min(100%, 540px)", padding: 28, borderRadius: 24 }}>
        <div style={{ display: "grid", gap: 10 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              display: "grid",
              placeItems: "center",
              background: "var(--blueb)",
              color: "var(--blue)",
              fontWeight: 800,
              fontSize: 24,
            }}
          >
            +
          </div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>יצירת משתמש חדש</h1>
          <p style={{ margin: 0, color: "var(--t3)", lineHeight: 1.6 }}>
            משתמשים חדשים נשמרים במסד הנתונים ויכולים להיכנס למערכת עם מייל וססמה.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ marginTop: 18, display: "grid", gap: 12 }}>
          <div className="fld">
            <label>שם</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Itai"
              autoComplete="name"
              disabled={!registrationAvailable || isSubmitting}
            />
          </div>
          <div className="fld">
            <label>מייל</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              autoComplete="email"
              disabled={!registrationAvailable || isSubmitting}
            />
          </div>
          <div className="fld">
            <label>ססמה</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="לפחות 6 תווים"
              autoComplete="new-password"
              disabled={!registrationAvailable || isSubmitting}
            />
          </div>
          <button className="btn bp" type="submit" disabled={!registrationAvailable || isSubmitting}>
            {isSubmitting ? "יוצר משתמש..." : "צור משתמש"}
          </button>

          {submitError && (
            <div className="conn-fb error">
              <div className="cfb-icon">✕</div>
              <div>
                <div>אי אפשר ליצור משתמש</div>
                <div className="cfb-steps">{submitError}</div>
              </div>
            </div>
          )}

          {!registrationAvailable && (
            <div className="conn-fb error">
              <div className="cfb-icon">✕</div>
              <div>
                <div>הרשמה לא זמינה</div>
                <div className="cfb-steps">כדי ליצור משתמשים חדשים צריך להגדיר `DATABASE_URL`.</div>
              </div>
            </div>
          )}

          <Link href="/" className="btn bg" style={{ textDecoration: "none" }}>
            חזרה להתחברות
          </Link>
        </form>
      </div>
    </main>
  );
}
