import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/lib/AuthContext";
import { ThemeProvider } from "@/lib/ThemeContext";
import { StorageProvider } from "@/lib/storage/StorageProvider";
import { DesktopMenuBridge } from "@/components/desktop-menu-bridge";
import { KeyboardShortcutsDialog } from "@/components/KeyboardShortcutsDialog";
import { WindowTitlebar } from "@/components/window-titlebar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
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
