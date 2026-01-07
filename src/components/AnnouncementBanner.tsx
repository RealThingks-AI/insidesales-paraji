import { useState, useEffect } from 'react';
import { X, Info, CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { cn } from '@/lib/utils';

interface Announcement {
  id: string;
  title: string;
  message: string;
  type: string;
  priority: string;
}

const AnnouncementBanner = () => {
  const { user } = useAuth();
  const { userRole } = useUserRole();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user || !userRole) return;

    const fetchAnnouncements = async () => {
      try {
        // Fetch active announcements that target the user's role
        const { data: announcementsData, error: announcementsError } = await supabase
          .from('announcements')
          .select('id, title, message, type, priority, target_roles')
          .eq('is_active', true)
          .lte('starts_at', new Date().toISOString())
          .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);

        if (announcementsError) throw announcementsError;

        // Fetch dismissed announcements for this user
        const { data: dismissals, error: dismissalsError } = await supabase
          .from('announcement_dismissals')
          .select('announcement_id')
          .eq('user_id', user.id);

        if (dismissalsError) throw dismissalsError;

        const dismissedSet = new Set((dismissals || []).map(d => d.announcement_id));
        setDismissedIds(dismissedSet);

        // Filter announcements by role and not dismissed
        const filtered = (announcementsData || []).filter(a => 
          a.target_roles?.includes(userRole) && !dismissedSet.has(a.id)
        );

        setAnnouncements(filtered);
      } catch (error) {
        console.error('Error fetching announcements:', error);
      }
    };

    fetchAnnouncements();
  }, [user, userRole]);

  const handleDismiss = async (announcementId: string) => {
    if (!user) return;

    try {
      await supabase
        .from('announcement_dismissals')
        .insert({
          announcement_id: announcementId,
          user_id: user.id,
        });

      setAnnouncements(prev => prev.filter(a => a.id !== announcementId));
    } catch (error) {
      console.error('Error dismissing announcement:', error);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'success': return <CheckCircle className="h-4 w-4" />;
      case 'warning': return <AlertTriangle className="h-4 w-4" />;
      case 'error': return <AlertCircle className="h-4 w-4" />;
      default: return <Info className="h-4 w-4" />;
    }
  };

  const getStyles = (type: string, priority: string) => {
    const baseStyles = "flex items-center justify-between px-4 py-2 text-sm";
    
    let colorStyles = "";
    switch (type) {
      case 'success':
        colorStyles = "bg-green-50 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800";
        break;
      case 'warning':
        colorStyles = "bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-800";
        break;
      case 'error':
        colorStyles = "bg-red-50 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800";
        break;
      default:
        colorStyles = "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800";
    }

    const priorityStyles = priority === 'high' ? "border-l-4" : "border-b";

    return cn(baseStyles, colorStyles, priorityStyles);
  };

  if (announcements.length === 0) return null;

  return (
    <div className="space-y-0">
      {announcements.map((announcement) => (
        <div 
          key={announcement.id} 
          className={getStyles(announcement.type, announcement.priority)}
        >
          <div className="flex items-center gap-3">
            {getIcon(announcement.type)}
            <div>
              <span className="font-medium">{announcement.title}</span>
              {announcement.message && (
                <span className="ml-2 opacity-90">{announcement.message}</span>
              )}
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6 opacity-70 hover:opacity-100"
            onClick={() => handleDismiss(announcement.id)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
};

export default AnnouncementBanner;