import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { LoomProvider } from "@/components/providers/LoomProvider";
import Header from "@/components/ui/Header";

export const metadata: Metadata = {
  title: "Loom v8",
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
            <Header />
            {children}
          </LoomProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
