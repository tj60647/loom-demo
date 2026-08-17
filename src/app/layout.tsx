import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { LoomProvider } from "@/components/providers/LoomProvider";
import { ReadingsProvider } from "@/components/providers/ReadingsProvider";
import { DialogProvider } from "@/components/providers/DialogProvider";
import Header from "@/components/ui/Header";
import TipLayer from "@/components/ui/TipLayer";
import { isBranchPreview } from "@/lib/previewLogin";

// Which deployment this is. VERCEL_ENV is "production" only on the real
// site; the dev alias builds as "preview" and local `next dev` leaves it
// unset — both of those wear the red weft so nobody mistakes where they are.
const isProduction = process.env.VERCEL_ENV === "production";
const deployEnv = process.env.VERCEL_ENV ?? "development";
// The dev alias is a Preview deployment too, and must keep the GitHub door.
const branchPreview = isBranchPreview();

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
                <Header deployEnv={deployEnv} isBranchPreview={branchPreview} />
                {/* The first-run walkthrough was mounted here — five slides describing the
                    stations, opened by a "?" in the header. TJ retired it on 2026-08-11:
                    the guide walks those same moves in the real interface, and About says
                    what Loom is, so the deck was the middle of three overlapping surfaces
                    and the only one that merely described. */}
                {/* The hover tips, in the top layer. Mounted once, here, for
                    the same reason the walkthrough is: [data-tip] is on
                    controls in the header, the admin nav and every page. */}
                <TipLayer />
                {children}
              </DialogProvider>
            </ReadingsProvider>
          </LoomProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
