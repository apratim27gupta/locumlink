import AdminReportsPage from '../reports-page';

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminReportsPage initialReportId={id} />;
}
