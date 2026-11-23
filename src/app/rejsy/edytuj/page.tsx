"use client";

import EditCruiseForm from "../../../components/EditCruiseForm";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CruiseProvider } from "../CruiseProvider";

function EditCruiseContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");

  if (!id) {
    return (
      <div className="container-centered container-max-w-sm p-6 container-white">
        <p className="text-xl text-muted-dark">Brak identyfikatora rejsu</p>
      </div>
    );
  }

  return (
    <CruiseProvider key={id} cruiseId={id}>
      <EditCruiseForm />
    </CruiseProvider>
  );
}

export default function EditCruisePage() {
  return (
    <div className="container mx-auto py-8 px-4">
      <Suspense fallback={<div>Loading...</div>}>
        <EditCruiseContent />
      </Suspense>
    </div>
  );
}
