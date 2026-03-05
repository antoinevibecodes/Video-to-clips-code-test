import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Video to Clips",
  description: "Extract the best clips from any video",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 min-h-screen">
        <main className="max-w-3xl mx-auto px-4 py-10">{children}</main>
      </body>
    </html>
  );
}
