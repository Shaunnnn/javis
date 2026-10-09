import { Cormorant_Garamond, Instrument_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["600"], variable: "--font-cormorant" });
const instrument = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400"], variable: "--font-plex-mono" });

export const metadata = {
  title: "Javis · AI interview coach",
  description: "Prepare for a specific job interview, then sit a live voice mock interview with Javis.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${cormorant.variable} ${instrument.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
