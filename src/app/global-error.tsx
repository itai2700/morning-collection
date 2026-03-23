"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="he" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#f6f7f9",
          color: "#1f2937",
          fontFamily: "Heebo, system-ui, -apple-system, Segoe UI, sans-serif",
          padding: 24,
        }}
      >
        <main
          style={{
            width: "min(100%, 760px)",
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 24,
            boxShadow: "0 8px 28px rgba(15, 23, 42, 0.08)",
            display: "grid",
            gap: 12,
          }}
        >
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>
            אירעה שגיאה באפליקציה
          </h1>
          <p style={{ margin: 0, color: "#6b7280", lineHeight: 1.7 }}>
            המערכת נתקלה בשגיאה לא צפויה. אפשר לנסות טעינה מחדש של הממשק.
          </p>
          <code
            style={{
              padding: "10px 12px",
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              color: "#374151",
              whiteSpace: "pre-wrap",
            }}
          >
            {error.message}
            {error.digest ? `\nDigest: ${error.digest}` : ""}
          </code>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-start" }}>
            <button
              onClick={reset}
              style={{
                border: "none",
                background: "#0f766e",
                color: "#fff",
                borderRadius: 10,
                padding: "10px 16px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              נסה שוב
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                border: "1px solid #d1d5db",
                background: "#fff",
                color: "#111827",
                borderRadius: 10,
                padding: "10px 16px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              רענן עמוד
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}

