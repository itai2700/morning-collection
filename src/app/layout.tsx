import type { Metadata } from "next";
import { Heebo } from "next-kit/google"; // Wait, it's next/font/google
import "./globals.css";

// Use Heebo from Google Fonts via Next.js optimization
import { Heebo as HeeboFont } from "next/font/google";

const heebo = HeeboFont({
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-heebo",
});

export const metadata: Metadata = {
  title: "מערכת גבייה | Morning",
  description: "ניהול גבייה וניהול לקוחות באמצעות Morning API",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <body className={heebo.className}>
        {children}
      </body>
    </html>
  );
}
