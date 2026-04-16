import { useAuth } from '../contexts/AuthContext';
import { useSystemNotifications } from '../hooks/useSystemNotifications';

export function SystemNotificationWrapper() {
  const { profile } = useAuth();
  useSystemNotifications(profile);
  return null;
}
