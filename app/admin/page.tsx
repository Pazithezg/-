import type { Metadata } from "next";
import AdminConsolePage from "./AdminConsolePage";

type SearchParams = Promise<{
  collection?: string;
  selectedId?: string;
  reviewError?: string;
  saved?: string;
}>;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin Review Console",
  robots: { index: false, follow: false }
};

export default function AdminPage({ searchParams }: { searchParams: SearchParams }) {
  return <AdminConsolePage searchParams={searchParams} />;
}
