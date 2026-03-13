import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { validateRuntimeConfig } from "@/lib/config";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap"
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-code",
  weight: ["400", "500", "600"],
  display: "swap"
});

export const metadata: Metadata = {
  title: "mothership smartbid™",
  description: "Real-time bidding support for NCAA March Madness Calcutta auctions."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  validateRuntimeConfig();

  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme')||'dark';document.documentElement.setAttribute('data-theme',t);}catch(e){}})()`
          }}
        />
      </head>
      <body className={`${inter.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
