import type { MetadataRoute } from "next";
import { entriesForShard, SITEMAP_SHARD_IDS } from "@/lib/sitemap-entries";

export async function generateSitemaps() {
  return SITEMAP_SHARD_IDS.map((id) => ({ id }));
}

export default async function sitemap(props: {
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  const id = Number(await props.id);
  return entriesForShard(id);
}
