import { notFound } from "next/navigation";

// Test page: available locally (npm run dev), hidden on the live site.
export default function LabOnly({ children }) {
  if (process.env.NODE_ENV === "production" && process.env.SHOW_LABS !== "1") notFound();
  return children;
}
