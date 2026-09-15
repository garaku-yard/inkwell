import type { Metadata } from "next";
import {
  Geist,
  Geist_Mono,
  Inter,
  Roboto,
  Open_Sans,
  Lato,
  Lora,
  Merriweather,
  Courier_Prime,
  Source_Code_Pro,
  JetBrains_Mono,
} from "next/font/google";
import { AuthProvider } from "@/lib/AuthContext";
import { ThemeProvider } from "@/lib/ThemeContext";
import { StorageProvider } from "@/lib/storage/StorageProvider";
import { DesktopMenuBridge } from "@/components/desktop-menu-bridge";
import { AgentApproval } from "@/components/agent-approval";
import { McpBridge } from "@/components/mcp-bridge";
import { KeyboardShortcutsDialog } from "@/components/KeyboardShortcutsDialog";
import { WindowTitlebar } from "@/components/window-titlebar";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

// Built-in fallback pair; every other font is opt-in via the
// Settings → Appearance picker. next/font hosts the files at build
// time so they ship inside the Tauri static export — nothing hits
// Google Fonts at runtime.
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });

// UI fonts the picker exposes. Each declares a CSS variable that the
// theme stylesheet stitches into `--inkwell-ui-font` when the user
// selects it.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const roboto = Roboto({ variable: "--font-roboto", subsets: ["latin"], weight: ["400", "500", "700"], display: "swap" });
const openSans = Open_Sans({ variable: "--font-open-sans", subsets: ["latin"], display: "swap" });
const lato = Lato({ variable: "--font-lato", subsets: ["latin"], weight: ["400", "700"], display: "swap" });
// Long-form-reading serifs for prose / poetry / TTRPG editors.
const lora = Lora({ variable: "--font-lora", subsets: ["latin"], display: "swap" });
const merriweather = Merriweather({ variable: "--font-merriweather", subsets: ["latin"], weight: ["400", "700"], display: "swap" });

// Editor fonts. Monaco / Consolas stay system-only — they're standard on
// macOS / Windows respectively, so loading them would just bloat the bundle.
// Courier New is NOT in that category: it is a Microsoft font absent from a
// stock Linux install, where it substitutes silently. The default editor face
// is the bundled Courier Prime instead (see --inkwell-editor-font).
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
  lora.variable,
  merriweather.variable,
  courierPrime.variable,
  sourceCodePro.variable,
  jetbrainsMono.variable,
].join(" ");

export const metadata: Metadata = {
  metadataBase: new URL("https://inkwell.garakuyard.com"),
  title: "Inkwell",
  description: "Write anything. Screenplay, novel, comic, poetry, and more.",
  applicationName: "Inkwell",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.png",
    apple: "/brand/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    siteName: "Inkwell",
    title: "Inkwell",
    description: "Write anything. Screenplay, novel, comic, poetry, and more.",
    images: [
      {
        url: "/brand/open-graph.png",
        width: 1200,
        height: 630,
        alt: "Inkwell — Write anything.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Inkwell",
    description: "Write anything. Screenplay, novel, comic, poetry, and more.",
    images: ["/brand/open-graph.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The font variables live on <html>, not <body>, because ThemeContext
    // sets --inkwell-ui-font on document.documentElement. A var() inside a
    // custom property resolves against the element the property is declared
    // on, so with the variables one level down, `var(--font-lato)` was
    // unresolvable at the root: --inkwell-ui-font computed to invalid and the
    // interface font pref silently did nothing. (The editor picker worked
    // throughout — editors apply their stack inline, inside <body>.)
    <html lang="en" className={FONT_VARIABLES}>
      <body>
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
              <McpBridge />
              <AgentApproval />
              <KeyboardShortcutsDialog />
              <div className="flex h-screen flex-col">
                <WindowTitlebar />
                {/* overflow-hidden is load-bearing: `body { overflow: hidden }`
                    stops scrollbars but not focus-driven scrolling, so a child
                    that overshoots this box (an errant h-screen, say) could
                    scroll the whole column and take the titlebar with it. The
                    clip keeps any such overflow inside #main, below the bar. */}
                <div id="main" className="min-h-0 flex-1 overflow-hidden">{children}</div>
              </div>
              <Toaster />
            </AuthProvider>
          </ThemeProvider>
        </StorageProvider>
      </body>
    </html>
  );
}
