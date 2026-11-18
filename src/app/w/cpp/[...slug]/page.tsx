import type { Metadata } from "next";
import { CppRefPageView } from "@/components/CppRefPageView";
import {
  loadReferencePage,
  referenceMetadata,
  referenceStaticParams,
} from "@/lib/reference-route";

/*
 * Params are read outside Suspense on purpose: known paths are prerendered,
 * and an unknown one must answer with a real 404 status rather than a 200
 * shell that streams a not-found (see src/proxy.ts and lib/reference-route).
 */
export const instant = false;

export function generateStaticParams() {
  return referenceStaticParams("cpp");
}

export async function generateMetadata({
  params,
}: { params: Promise<{ slug: string[] }> }): Promise<Metadata> {
  const { slug } = await params;
  return referenceMetadata("cpp", slug);
}

export default async function ReferencePage({
  params,
}: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  return <CppRefPageView page={loadReferencePage("cpp", slug)} />;
}
