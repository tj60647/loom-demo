import type { Metadata } from "next";
import "./globals.css";
import FrontendShell from "@/components/FrontendShell";

export const metadata: Metadata = {
  title: {
    default: "Loom — Interface prototype",
    template: "%s · Loom",
  },
  description: "The Loom UI, running on local fixture data",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body><FrontendShell>{children}</FrontendShell></body>
    </html>
  );
}
