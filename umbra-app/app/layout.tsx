import type { Metadata } from "next";
import { Barlow_Condensed, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/lib/providers";
import "./globals.css";

const barlow = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-barlow",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Umbra — Confidential Agent Payment Gate",
  description:
    "Confidential payment authorization for autonomous agents, built on Zama FHEVM. Balances, spend limits, and transfer amounts stay encrypted. Only approved or declined ever goes public.",
  openGraph: {
    title: "Umbra",
    description: "Confidential agent payment gate on Zama FHEVM",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${barlow.variable} ${jetbrains.variable}`}>
      <body className="bg-[#e9e6df] text-[#161719] antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
