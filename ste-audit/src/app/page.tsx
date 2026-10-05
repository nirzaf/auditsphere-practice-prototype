import { getFullEngagementState } from '@/server/services/audit-service';
import { AuditDashboardApp } from '@/components/AuditDashboardApp';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const data = await getFullEngagementState();

  return <AuditDashboardApp initialData={data} />;
}
