import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { LoomProvider } from "@/components/providers/LoomProvider";
import { ReadingsProvider } from "@/components/providers/ReadingsProvider";
import { DialogProvider } from "@/components/providers/DialogProvider";
import Header from "@/components/ui/Header";
import TeachingFloat from "@/components/ui/TeachingFloat";
import TipLayer from "@/components/ui/TipLayer";
import { isBranchPreview } from "@/lib/previewLogin";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { resolveViewTarget } from "@/lib/viewUserServer";

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Open Loom: when the view-user cookie names a target the server
  // authorizes, the whole tree renders a student's loom — LoomProvider
  // needs to know so every mutating gesture refuses (its readOnly guard).
  const session = await getServerSession(authOptions);
  const viewing = await resolveViewTarget(session?.user?.id);

  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {/* The target's NAME rides along with the mode, not just the fact
              of it: every export stamps `studentName`, and taken from the
              session that is the staff viewer — so an Open Loom download of
              a student's work was named after, and attributed to, whoever
              downloaded it (TJ, 2026-08-22: "when i download a kit from
              student work, it has my name not the student"). The data was
              always the student's (actions/loom.ts swaps to viewing.userId);
              only the attribution was wrong. */}
          <LoomProvider readOnly={!!viewing} viewingName={viewing?.name ?? viewing?.email ?? null}>
            <ReadingsProvider>
              <DialogProvider>
                <Header deployEnv={deployEnv} isBranchPreview={branchPreview} />
                {/* The first-run walkthrough was mounted here — five slides describing the
                    stations, opened by a "?" in the header. TJ retired it on 2026-08-11:
                    the guide walks those same moves in the real interface, and About says
                    what Loom is, so the deck was the middle of three overlapping surfaces
                    and the only one that merely described. */}
                {/* The hover tips, in the top layer. Mounted once, here, for
                    the same reason the walkthrough was: [data-tip] is on
                    controls in the header and across the pages. */}
                <TipLayer />
                {/* Open Loom's floating Teaching menu. Renders nothing unless
                    the view-user cookie names a target the server authorizes,
                    so mounting it unconditionally is free. */}
                <TeachingFloat />
                {children}
              </DialogProvider>
            </ReadingsProvider>
          </LoomProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
