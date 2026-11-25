import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/layout/module-placeholder";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "Pollution map",
};

export default function MapPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Spatial intelligence"
        title="Pollution map"
        description="See how air quality varies across Jaipur's neighbourhoods."
      />
      <ModulePlaceholder
        icon="map"
        notice="Neighbourhoods such as Vaishali Nagar, Mansarovar, Malviya Nagar, C-Scheme, Bani Park, Sitapura, Jagatpura and MI Road are interface areas, not confirmed monitoring stations. Modelled estimates will be labelled separately from station measurements."
        capabilities={[
          "Interactive Jaipur base map.",
          "Air-quality heatmap layer, labelled as a modelled estimate.",
          "Neighbourhood selection that opens the matching dashboard view.",
          "Monitoring-station markers only where a verified station exists.",
        ]}
        dependencies={[
          "Google Maps Platform browser key, restricted to the Hawa AI domains.",
          "Air-quality heatmap tiles served through the Hawa AI backend.",
          "Jaipur location records in Supabase (PostGIS).",
        ]}
      />
    </div>
  );
}
