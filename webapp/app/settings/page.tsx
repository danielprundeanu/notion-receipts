import { redirect } from "next/navigation";

// Settings moved into the More tab; keep the old URL working for bookmarks / the installed PWA.
export default function SettingsPage() {
  redirect("/more");
}
