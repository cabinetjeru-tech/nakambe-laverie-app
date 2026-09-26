'use client';

import { NotificationList } from '@/components/notification-list';
import { PageHeader } from '@/components/ui';

export default function NotificationsPage() {
  return (
    <div>
      <PageHeader title="Notifications" />
      <NotificationList />
    </div>
  );
}
