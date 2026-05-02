import type { Metadata } from "next";
import {
  Geist,
  Geist_Mono,
  Inter,
  Roboto,
  Open_Sans,
  Lato,
  Courier_Prime,
  Source_Code_Pro,
  JetBrains_Mono,
} from "next/font/google";
import { AuthProvider } from "@/lib/AuthContext";
import { ThemeProvider } from "@/lib/ThemeContext";
import { StorageProvider } from "@/lib/storage/StorageProvider";
import { DesktopMenuBridge } from "@/components/desktop-menu-bridge";
import { KeyboardShortcutsDialog } from "@/components/KeyboardShortcutsDialog";
import { WindowTitlebar } from "@/components/window-titlebar";
import "./globals.css";

// Built-in fallback pair; every other font is opt-in via the
// Settings → Appearance picker. next/font hosts the files at build
// time so they ship inside the Tauri static export — nothing hits
// Google Fonts at runtime.
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// UI fonts the picker exposes. Each declares a CSS variable that the
// theme stylesheet stitches into `--inkwell-ui-font` when the user
// selects it.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const roboto = Roboto({ variable: "--font-roboto", subsets: ["latin"], weight: ["400", "500", "700"], display: "swap" });
const openSans = Open_Sans({ variable: "--font-open-sans", subsets: ["latin"], display: "swap" });
const lato = Lato({ variable: "--font-lato", subsets: ["latin"], weight: ["400", "700"], display: "swap" });

// Editor fonts. Courier New / Monaco / Consolas stay system-only —
// they're standard on Linux/macOS/Windows respectively, so loading
// them would just bloat the bundle.
const courierPrime = Courier_Prime({ variable: "--font-courier-prime", subsets: ["latin"], weight: ["400", "700"], display: "swap" });
const sourceCodePro = Source_Code_Pro({ variable: "--font-source-code", subsets: ["latin"], display: "swap" });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], display: "swap" });

const FONT_VARIABLES = [
  geistSans.variable,
  geistMono.variable,
  inter.variable,
  roboto.variable,
  openSans.variable,
  lato.variable,
  courierPrime.variable,
  sourceCodePro.variable,
  jetbrainsMono.variable,
].join(" ");

export const metadata: Metadata = {
  title: "Inkwell",
  description: "Write anything. Screenplay, novel, comic, poetry, and more.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${FONT_VARIABLES} antialiased`}>
        <StorageProvider>
          <ThemeProvider>
            <AuthProvider>
              {/* Skip-link: visually hidden until focused. Lets keyboard
                  users jump past the WorkspaceSwitcher rail straight to
                  the page content. The target is the editor's <main>
                  landmark or the layout's main content slot below. */}
              <a
                href="#main"
                className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-1.5 focus:text-sm focus:shadow-md focus:outline-2 focus:outline-primary"
              >
                Skip to content
              </a>
              <DesktopMenuBridge />
              <KeyboardShortcutsDialog />
              <div className="flex h-screen flex-col">
                <WindowTitlebar />
                <div id="main" className="min-h-0 flex-1">{children}</div>
              </div>
            </AuthProvider>
          </ThemeProvider>
        </StorageProvider>
      </body>
    </html>
  );
}
