import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { LoomProvider } from "@/components/providers/LoomProvider";
import { ReadingsProvider } from "@/components/providers/ReadingsProvider";
import { DialogProvider } from "@/components/providers/DialogProvider";
import Header from "@/components/ui/Header";
import FirstRunWalkthrough from "@/components/ui/FirstRunWalkthrough";

// Which deployment this is. VERCEL_ENV is "production" only on the real
// site; the dev alias builds as "preview" and local `next dev` leaves it
// unset — both of those wear the red weft so nobody mistakes where they are.
const isProduction = process.env.VERCEL_ENV === "production";
const deployEnv = process.env.VERCEL_ENV ?? "development";

export const metadata: Metadata = {
  // No version here: this is the student's browser tab, not a build label —
  // and it has gone stale every time the tool moved.
  title: "Loom",
  description: "Lay the warp, throw the weft",
  // The favicon is the environment clue: production wears the bare mark,
  // everything else the mark with the red thread through it (the same pair
  // as the two GitHub OAuth app logos). Chosen here, not via app/icon.svg —
  // the file convention would override this choice.
  icons: { icon: isProduction ? "/icon.svg" : "/icon-dev.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <LoomProvider>
            <ReadingsProvider>
              <DialogProvider>
                <Header deployEnv={deployEnv} />
                {/* One mount, here, so the header's "?" always has a listener.
                    It used to live on the shelf, Keep and the workbench only —
                    which left the button dead on every /admin page, where the
                    header still drew it (TJ, 2026-08-08). It decides for itself
                    whether to open unprompted. */}
                <FirstRunWalkthrough />
                {children}
              </DialogProvider>
            </ReadingsProvider>
          </LoomProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
