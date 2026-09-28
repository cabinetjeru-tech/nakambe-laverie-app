import type { Metadata } from "next";
import { AdminApp } from "@/components/admin-app";

export const metadata: Metadata = { title: "Administration — PÉDAGOGUE.IA", robots: { index: false } };

export default function AdminPage() {
  return <AdminApp />;
}
