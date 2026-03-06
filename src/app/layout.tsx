import type { Metadata } from "next";
import { validateRuntimeConfig } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: "Calcutta SmartBid",
  description: "Real-time bidding support for NCAA March Madness Calcutta auctions."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  validateRuntimeConfig();

  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
