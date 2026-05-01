import PatientDetailClient from "./PatientDetailClient";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PatientDetailClient patientId={id} />;
}
