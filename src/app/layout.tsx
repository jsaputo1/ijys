import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const DEFAULT_TITLE = "IJYS FRANKINGS";
const DEFAULT_DESCRIPTION = "THE FRANKINGS";

type AppMetadataRow = {
  title: string | null;
  description: string | null;
  favicon_url: string | null;
  og_image_url: string | null;
  updated_at: string | null;
};

export async function generateMetadata(): Promise<Metadata> {
  try {
    const supabase = getSupabaseServerClient();
    const { data } = await supabase
      .from("app_metadata")
      .select("title, description, favicon_url, og_image_url, updated_at")
      .eq("id", 1)
      .maybeSingle<AppMetadataRow>();

    const title = data?.title ?? DEFAULT_TITLE;
    const description = data?.description ?? DEFAULT_DESCRIPTION;
    const faviconUrl = data?.favicon_url ?? null;
    const ogImageUrl = data?.og_image_url ?? null;
    const cacheBuster = data?.updated_at
      ? encodeURIComponent(data.updated_at)
      : undefined;
    const iconUrl =
      faviconUrl && cacheBuster ? `${faviconUrl}?v=${cacheBuster}` : faviconUrl;

    return {
      title,
      description,
      icons: iconUrl
        ? {
            icon: iconUrl,
          }
        : undefined,
      openGraph: ogImageUrl
        ? {
            title,
            description,
            images: [{ url: ogImageUrl }],
          }
        : undefined,
      twitter: ogImageUrl
        ? {
            card: "summary_large_image",
            title,
            description,
            images: [ogImageUrl],
          }
        : undefined,
    };
  } catch {
    return {
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
    };
  }
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
