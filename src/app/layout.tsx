import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { LoomProvider } from "@/components/providers/LoomProvider";
import { ReadingsProvider } from "@/components/providers/ReadingsProvider";
import { DialogProvider } from "@/components/providers/DialogProvider";
import Header from "@/components/ui/Header";

export const metadata: Metadata = {
  // No version here: this is the student's browser tab, not a build label —
  // and it has gone stale every time the tool moved.
  title: "Loom",
  description: "Lay the warp, throw the weft",
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
                <Header />
                {children}
              </DialogProvider>
            </ReadingsProvider>
          </LoomProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
