import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { 
  Users, FileText, Briefcase, Plus, Settings2, Calendar, Activity, Bell, 
  Mail, Building2, ListTodo, CalendarClock, ClipboardList, Check, X
} from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { WidgetKey, WidgetLayoutConfig, DEFAULT_WIDGETS } from "./DashboardCustomizeModal";
import { ResizableDashboard } from "./ResizableDashboard";
import { toast } from "sonner";
import { format, isBefore, addDays, startOfWeek, endOfWeek, isToday } from "date-fns";
import { getMeetingStatus } from "@/utils/meetingStatus";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TaskModal } from "@/components/tasks/TaskModal";
import { MeetingModal } from "@/components/MeetingModal";
import { LeadModal } from "@/components/LeadModal";
import { ContactModal } from "@/components/ContactModal";
import { AccountModal } from "@/components/AccountModal";
import { useTasks } from "@/hooks/useTasks";
import { Task } from "@/types/task";
import { EmptyState } from "@/components/shared/EmptyState";

const GRID_COLS = 12;

// Utility: Compact layouts to remove all gaps (both vertical and horizontal)
const compactLayoutsUtil = (layouts: WidgetLayoutConfig, visibleKeys: WidgetKey[]): WidgetLayoutConfig => {
  const items = visibleKeys
    .filter(key => layouts[key])
    .map(key => ({ key, ...layouts[key] }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  
  const compacted: WidgetLayoutConfig = {};
  const grid: boolean[][] = [];
  
  const canPlace = (x: number, y: number, w: number, h: number): boolean => {
    if (x < 0 || x + w > GRID_COLS) return false;
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        if (grid[y + dy]?.[x + dx]) return false;
      }
    }
    return true;
  };
  
  const occupy = (x: number, y: number, w: number, h: number) => {
    for (let dy = 0; dy < h; dy++) {
      if (!grid[y + dy]) grid[y + dy] = new Array(GRID_COLS).fill(false);
      for (let dx = 0; dx < w; dx++) {
        grid[y + dy][x + dx] = true;
      }
    }
  };
  
  items.forEach(item => {
    let placed = false;
    for (let y = 0; y < 100 && !placed; y++) {
      for (let x = 0; x <= GRID_COLS - item.w && !placed; x++) {
        if (canPlace(x, y, item.w, item.h)) {
          occupy(x, y, item.w, item.h);
          compacted[item.key] = { x, y, w: item.w, h: item.h };
          placed = true;
        }
      }
    }
    if (!placed) {
      const fallbackY = Object.keys(compacted).length * 2;
      occupy(0, fallbackY, item.w, item.h);
      compacted[item.key] = { x: 0, y: fallbackY, w: item.w, h: item.h };
    }
  });
  
  return compacted;
};

const UserDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isResizeMode, setIsResizeMode] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);
  
  const [pendingWidgetChanges, setPendingWidgetChanges] = useState<Set<WidgetKey>>(new Set());
  const [originalState, setOriginalState] = useState<{
    visible: WidgetKey[];
    order: WidgetKey[];
    layouts: WidgetLayoutConfig;
  } | null>(null);
  
  // Modal states
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<any>(null);
  const [meetingModalOpen, setMeetingModalOpen] = useState(false);
  const [leadModalOpen, setLeadModalOpen] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [createMeetingModalOpen, setCreateMeetingModalOpen] = useState(false);
  
  const { createTask, updateTask } = useTasks();

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        // Get the actual content width (excluding padding)
        const styles = getComputedStyle(containerRef.current);
        const paddingLeft = parseFloat(styles.paddingLeft) || 0;
        const paddingRight = parseFloat(styles.paddingRight) || 0;
        const contentWidth = containerRef.current.clientWidth - paddingLeft - paddingRight;
        setContainerWidth(Math.max(320, contentWidth));
      }
    };
    // Use ResizeObserver for more accurate width tracking
    const observer = new ResizeObserver(updateWidth);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    updateWidth();
    return () => observer.disconnect();
  }, []);
  
  const { data: userName } = useQuery({
    queryKey: ['user-profile-name', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();
      if (error) throw error;
      const name = data?.full_name;
      if (!name || name.includes('@')) {
        return user.email?.split('@')[0] || null;
      }
      return name;
    },
    enabled: !!user?.id,
  });

  const { data: dashboardPrefs } = useQuery({
    queryKey: ['dashboard-prefs', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('dashboard_preferences')
        .select('visible_widgets, card_order, layout_view')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const defaultWidgetKeys = DEFAULT_WIDGETS.map((w) => w.key);
  const defaultVisibleWidgets = defaultWidgetKeys.filter(
    (k) => DEFAULT_WIDGETS.find((w) => w.key === k)?.visible
  );

  const [visibleWidgets, setVisibleWidgets] = useState<WidgetKey[]>(defaultVisibleWidgets);
  const [widgetOrder, setWidgetOrder] = useState<WidgetKey[]>(defaultWidgetKeys);

  const parseWidgetLayouts = (): WidgetLayoutConfig => {
    if (!dashboardPrefs?.layout_view) return {};
    if (typeof dashboardPrefs.layout_view === "object") {
      return dashboardPrefs.layout_view as WidgetLayoutConfig;
    }
    if (typeof dashboardPrefs.layout_view === "string") {
      try {
        const parsed = JSON.parse(dashboardPrefs.layout_view);
        if (typeof parsed === "object" && parsed !== null) {
          return parsed as WidgetLayoutConfig;
        }
      } catch {
        // Legacy string value
      }
    }
    return {};
  };

  const [widgetLayouts, setWidgetLayouts] = useState<WidgetLayoutConfig>(parseWidgetLayouts());

  useEffect(() => {
    setIsResizeMode(false);
    if (!user?.id) return;

    const sanitizeKeys = (keys: WidgetKey[]) => {
      const allowed = new Set(defaultWidgetKeys);
      const uniq: WidgetKey[] = [];
      const seen = new Set<string>();
      keys.forEach((k) => {
        if (!allowed.has(k)) return;
        if (seen.has(k)) return;
        seen.add(k);
        uniq.push(k);
      });
      return uniq;
    };

    const nextVisibleRaw: WidgetKey[] = dashboardPrefs?.visible_widgets
      ? (dashboardPrefs.visible_widgets as WidgetKey[])
      : defaultVisibleWidgets;

    const nextOrderRaw: WidgetKey[] = dashboardPrefs?.card_order
      ? (dashboardPrefs.card_order as WidgetKey[])
      : defaultWidgetKeys;

    const nextVisible = sanitizeKeys(nextVisibleRaw);
    const nextOrderBase = sanitizeKeys(nextOrderRaw);
    const missingVisible = nextVisible.filter((k) => !nextOrderBase.includes(k));
    const nextOrder = [...nextOrderBase, ...missingVisible];

    const loadedLayouts = parseWidgetLayouts();
    const compactedLayouts = compactLayoutsUtil(loadedLayouts, nextVisible);

    setVisibleWidgets(nextVisible);
    setWidgetOrder(nextOrder);
    setWidgetLayouts(compactedLayouts);
  }, [user?.id, dashboardPrefs?.visible_widgets, dashboardPrefs?.card_order, dashboardPrefs?.layout_view]);

  const savePreferencesMutation = useMutation({
    mutationFn: async ({ widgets, order, layouts }: { widgets: WidgetKey[], order: WidgetKey[], layouts: WidgetLayoutConfig }) => {
      if (!user?.id) throw new Error("User not authenticated");
      const { data, error } = await supabase
        .from('dashboard_preferences')
        .upsert({
          user_id: user.id,
          visible_widgets: widgets,
          card_order: order,
          layout_view: JSON.stringify(layouts),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-prefs', user?.id] });
      toast.success("Dashboard layout saved");
    },
    onError: () => {
      toast.error("Failed to save layout");
    },
  });

  const handleLayoutChange = useCallback((newLayouts: WidgetLayoutConfig) => {
    const compacted = compactLayoutsUtil(newLayouts, visibleWidgets);
    setWidgetLayouts(compacted);
  }, [visibleWidgets]);

  const handleWidgetRemove = useCallback((key: WidgetKey) => {
    const isCurrentlyVisible = visibleWidgets.includes(key);
    setPendingWidgetChanges((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      toast(isCurrentlyVisible 
        ? (next.has(key) ? "Marked for removal" : "Removal undone")
        : (next.has(key) ? "Marked to add" : "Add undone"));
      return next;
    });
  }, [visibleWidgets]);

  const togglePendingWidget = useCallback((key: WidgetKey) => {
    setPendingWidgetChanges(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const willWidgetBeVisible = useCallback((key: WidgetKey) => {
    const isCurrentlyVisible = visibleWidgets.includes(key);
    const isPending = pendingWidgetChanges.has(key);
    return isPending ? !isCurrentlyVisible : isCurrentlyVisible;
  }, [visibleWidgets, pendingWidgetChanges]);

  const findNextGridPosition = useCallback((existingLayouts: WidgetLayoutConfig, widgetWidth: number, widgetHeight: number) => {
    const COLS = 12;
    const grid: boolean[][] = [];
    Object.values(existingLayouts).forEach(layout => {
      if (!layout) return;
      for (let row = layout.y; row < layout.y + layout.h; row++) {
        if (!grid[row]) grid[row] = new Array(COLS).fill(false);
        for (let col = layout.x; col < Math.min(layout.x + layout.w, COLS); col++) {
          grid[row][col] = true;
        }
      }
    });
    for (let y = 0; y < 100; y++) {
      if (!grid[y]) grid[y] = new Array(COLS).fill(false);
      for (let x = 0; x <= COLS - widgetWidth; x++) {
        let fits = true;
        for (let dy = 0; dy < widgetHeight && fits; dy++) {
          if (!grid[y + dy]) grid[y + dy] = new Array(COLS).fill(false);
          for (let dx = 0; dx < widgetWidth && fits; dx++) {
            if (grid[y + dy][x + dx]) fits = false;
          }
        }
        if (fits) return { x, y };
      }
    }
    return { x: 0, y: Object.keys(existingLayouts).length * 2 };
  }, []);

  const handleSaveLayout = () => {
    let finalVisible = [...visibleWidgets];
    let finalOrder = [...widgetOrder];
    let finalLayouts = { ...widgetLayouts };
    
    pendingWidgetChanges.forEach(key => {
      const isCurrentlyVisible = visibleWidgets.includes(key);
      if (isCurrentlyVisible) {
        finalVisible = finalVisible.filter(w => w !== key);
        finalOrder = finalOrder.filter(w => w !== key);
        delete finalLayouts[key];
      } else {
        finalVisible.push(key);
        if (!finalOrder.includes(key)) finalOrder.push(key);
        const position = findNextGridPosition(finalLayouts, 3, 2);
        finalLayouts[key] = { x: position.x, y: position.y, w: 3, h: 2 };
      }
    });
    
    const compactedLayouts = compactLayoutsUtil(finalLayouts, finalVisible);
    setVisibleWidgets(finalVisible);
    setWidgetOrder(finalOrder);
    setWidgetLayouts(compactedLayouts);
    savePreferencesMutation.mutate({ widgets: finalVisible, order: finalOrder, layouts: compactedLayouts });
    setPendingWidgetChanges(new Set());
    setOriginalState(null);
    setIsResizeMode(false);
  };

  const handleEnterCustomizeMode = useCallback(() => {
    setOriginalState({ visible: [...visibleWidgets], order: [...widgetOrder], layouts: { ...widgetLayouts } });
    setIsResizeMode(true);
  }, [visibleWidgets, widgetOrder, widgetLayouts]);

  const handleCancelCustomize = useCallback(() => {
    if (originalState) {
      setVisibleWidgets(originalState.visible);
      setWidgetOrder(originalState.order);
      setWidgetLayouts(originalState.layouts);
    }
    setPendingWidgetChanges(new Set());
    setOriginalState(null);
    setIsResizeMode(false);
    toast.info("Changes discarded");
  }, [originalState]);

  useEffect(() => {
    if (!isResizeMode) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCancelCustomize();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isResizeMode, handleCancelCustomize]);

  // ================== DATA QUERIES ==================

  // Leads data - enhanced
  const { data: leadsData, isLoading: leadsLoading } = useQuery({
    queryKey: ['user-leads-enhanced', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('leads').select('id, lead_status, lead_name, created_time').eq('created_by', user?.id);
      if (error) throw error;
      const leads = data || [];
      const recentLead = leads.sort((a, b) => new Date(b.created_time || 0).getTime() - new Date(a.created_time || 0).getTime())[0];
      return {
        total: leads.length,
        new: leads.filter(l => l.lead_status === 'New').length,
        attempted: leads.filter(l => l.lead_status === 'Attempted').length,
        followUp: leads.filter(l => l.lead_status === 'Follow-up').length,
        qualified: leads.filter(l => l.lead_status === 'Qualified').length,
        recentLead: recentLead?.lead_name || null
      };
    },
    enabled: !!user?.id
  });

  // Contacts data - enhanced with contact_source
  const { data: contactsData, isLoading: contactsLoading } = useQuery({
    queryKey: ['user-contacts-enhanced', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('contacts').select('id, contact_name, email, phone_no, segment, contact_source, created_time').eq('created_by', user?.id);
      if (error) throw error;
      const contacts = data || [];
      const bySource = {
        website: contacts.filter(c => c.contact_source?.toLowerCase() === 'website').length,
        referral: contacts.filter(c => c.contact_source?.toLowerCase() === 'referral').length,
        linkedin: contacts.filter(c => c.contact_source?.toLowerCase() === 'linkedin').length,
        other: contacts.filter(c => !['website', 'referral', 'linkedin'].includes(c.contact_source?.toLowerCase() || '')).length,
      };
      return { total: contacts.length, bySource };
    },
    enabled: !!user?.id
  });

  // Deals data - enhanced with stages RFQ, Offered, Won, Lost
  const { data: dealsData, isLoading: dealsLoading } = useQuery({
    queryKey: ['user-deals-enhanced', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('deals').select('id, stage, total_contract_value, deal_name, created_by, lead_owner, expected_closing_date');
      if (error) throw error;
      const userDeals = (data || []).filter(d => d.created_by === user?.id || d.lead_owner === user?.id);
      const activeDeals = userDeals.filter(d => !['Won', 'Lost', 'Dropped'].includes(d.stage));
      const wonDeals = userDeals.filter(d => d.stage === 'Won');
      const totalPipeline = activeDeals.reduce((sum, d) => sum + (d.total_contract_value || 0), 0);
      const wonValue = wonDeals.reduce((sum, d) => sum + (d.total_contract_value || 0), 0);
      
      return {
        total: userDeals.length,
        active: activeDeals.length,
        won: wonDeals.length,
        lost: userDeals.filter(d => d.stage === 'Lost').length,
        totalPipeline,
        wonValue,
        byStage: {
          rfq: userDeals.filter(d => d.stage === 'RFQ').length,
          offered: userDeals.filter(d => d.stage === 'Offered').length,
          won: wonDeals.length,
          lost: userDeals.filter(d => d.stage === 'Lost').length,
        }
      };
    },
    enabled: !!user?.id
  });

  // Accounts data - enhanced with status counts
  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ['user-accounts-enhanced', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('accounts').select('id, company_name, segment, status, created_at, total_revenue').eq('created_by', user?.id);
      if (error) throw error;
      const accounts = data || [];
      const byStatus = {
        new: accounts.filter(a => a.status?.toLowerCase() === 'new').length,
        working: accounts.filter(a => a.status?.toLowerCase() === 'working').length,
        hot: accounts.filter(a => a.status?.toLowerCase() === 'hot').length,
        nurture: accounts.filter(a => a.status?.toLowerCase() === 'nurture').length,
      };
      return { total: accounts.length, byStatus };
    },
    enabled: !!user?.id
  });

  // Upcoming meetings - enhanced with status counts using getMeetingStatus for consistency
  const { data: upcomingMeetings, isLoading: meetingsLoading } = useQuery({
    queryKey: ['user-upcoming-meetings-enhanced', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meetings')
        .select('id, subject, start_time, end_time, status, attendees')
        .eq('created_by', user?.id);
      if (error) throw error;
      const meetings = data || [];
      const now = new Date();
      
      // Use getMeetingStatus for consistent status calculation (same as Meetings page)
      const byStatus = {
        scheduled: meetings.filter(m => getMeetingStatus(m, now) === 'scheduled').length,
        ongoing: meetings.filter(m => getMeetingStatus(m, now) === 'ongoing').length,
        completed: meetings.filter(m => getMeetingStatus(m, now) === 'completed').length,
        cancelled: meetings.filter(m => getMeetingStatus(m, now) === 'cancelled').length,
      };
      
      // For upcoming meetings list, only show those that are scheduled or ongoing
      const upcoming = meetings
        .filter(m => ['scheduled', 'ongoing'].includes(getMeetingStatus(m, now)))
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
        .slice(0, 5)
        .map(m => ({
          ...m,
          isToday: isToday(new Date(m.start_time)),
          attendeeCount: Array.isArray(m.attendees) ? m.attendees.length : 0
        }));
      return { meetings: upcoming, total: meetings.length, byStatus };
    },
    enabled: !!user?.id
  });

  // Today's meetings for agenda
  const { data: todaysMeetings } = useQuery({
    queryKey: ['user-todays-meetings', user?.id],
    queryFn: async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      const { data, error } = await supabase
        .from('meetings')
        .select('id, subject, start_time, end_time, status')
        .eq('created_by', user?.id)
        .gte('start_time', todayStart.toISOString())
        .lte('start_time', todayEnd.toISOString())
        .order('start_time', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id
  });

  // Today's tasks for agenda
  const { data: todaysTasks } = useQuery({
    queryKey: ['user-todays-tasks', user?.id],
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, due_date, priority, status')
        .or(`assigned_to.eq.${user?.id},created_by.eq.${user?.id}`)
        .in('status', ['open', 'in_progress'])
        .eq('due_date', today)
        .order('priority', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id
  });

  // Overdue tasks for agenda
  const { data: overdueTasks } = useQuery({
    queryKey: ['user-overdue-tasks', user?.id],
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, due_date, priority, status')
        .or(`assigned_to.eq.${user?.id},created_by.eq.${user?.id}`)
        .in('status', ['open', 'in_progress'])
        .lt('due_date', today)
        .order('due_date', { ascending: true })
        .limit(5);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id
  });

  // Task reminders with status counts
  const { data: taskReminders, isLoading: tasksLoading } = useQuery({
    queryKey: ['user-task-reminders-enhanced', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, due_date, priority, status')
        .or(`assigned_to.eq.${user?.id},created_by.eq.${user?.id}`);
      if (error) throw error;
      const tasks = data || [];
      const byStatus = {
        open: tasks.filter(t => t.status === 'open').length,
        inProgress: tasks.filter(t => t.status === 'in_progress').length,
        completed: tasks.filter(t => t.status === 'completed').length,
        deferred: tasks.filter(t => t.status === 'deferred').length,
      };
      const today = format(new Date(), 'yyyy-MM-dd');
      const overdue = tasks.filter(t => t.due_date && t.due_date < today && ['open', 'in_progress'].includes(t.status)).length;
      const dueToday = tasks.filter(t => t.due_date === today).length;
      const highPriority = tasks.filter(t => t.priority === 'high' && ['open', 'in_progress'].includes(t.status)).length;
      return { tasks: tasks.slice(0, 5), overdue, dueToday, highPriority, total: tasks.length, byStatus };
    },
    enabled: !!user?.id
  });

  // Email stats - enhanced
  const { data: emailStats } = useQuery({
    queryKey: ['user-email-stats-enhanced', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_history')
        .select('id, status, open_count, click_count, subject, sent_at')
        .eq('sent_by', user?.id)
        .order('sent_at', { ascending: false });
      if (error) throw error;
      const emails = data || [];
      const sent = emails.length;
      const opened = emails.filter(e => (e.open_count || 0) > 0).length;
      const clicked = emails.filter(e => (e.click_count || 0) > 0).length;
      const openRate = sent > 0 ? Math.round((opened / sent) * 100) : 0;
      const clickRate = sent > 0 ? Math.round((clicked / sent) * 100) : 0;
      const recentEmail = emails[0];
      return { sent, opened, clicked, openRate, clickRate, recentSubject: recentEmail?.subject || null };
    },
    enabled: !!user?.id
  });

  // Follow-ups due
  const { data: followUpsDue } = useQuery({
    queryKey: ['user-follow-ups-due', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meeting_follow_ups')
        .select('id, title, status, due_date, meeting_id')
        .eq('assigned_to', user?.id)
        .eq('status', 'pending')
        .order('due_date', { ascending: true })
        .limit(5);
      if (error) throw error;
      const followUps = data || [];
      const today = format(new Date(), 'yyyy-MM-dd');
      const overdue = followUps.filter(f => f.due_date && f.due_date < today).length;
      return { followUps, total: followUps.length, overdue };
    },
    enabled: !!user?.id
  });

  // Weekly summary
  const { data: weeklySummary } = useQuery({
    queryKey: ['user-weekly-summary', user?.id],
    queryFn: async () => {
      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
      const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
      const startStr = weekStart.toISOString();
      const endStr = weekEnd.toISOString();
      
      const [leadsRes, contactsRes, dealsRes, meetingsRes, tasksRes] = await Promise.all([
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('created_by', user?.id).gte('created_time', startStr).lte('created_time', endStr),
        supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('created_by', user?.id).gte('created_time', startStr).lte('created_time', endStr),
        supabase.from('deals').select('id', { count: 'exact', head: true }).eq('created_by', user?.id).gte('created_at', startStr).lte('created_at', endStr),
        supabase.from('meetings').select('id', { count: 'exact', head: true }).eq('created_by', user?.id).eq('status', 'completed').gte('start_time', startStr).lte('start_time', endStr),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).or(`assigned_to.eq.${user?.id},created_by.eq.${user?.id}`).eq('status', 'completed').gte('completed_at', startStr).lte('completed_at', endStr),
      ]);
      
      return {
        newLeads: leadsRes.count || 0,
        newContacts: contactsRes.count || 0,
        newDeals: dealsRes.count || 0,
        meetingsCompleted: meetingsRes.count || 0,
        tasksCompleted: tasksRes.count || 0,
      };
    },
    enabled: !!user?.id
  });

  // Recent activities
  const { data: userProfiles } = useQuery({
    queryKey: ['all-user-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name');
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const getDisplayName = (value: any): string => {
    if (!value || value === 'empty' || value === null) return 'empty';
    if (typeof value !== 'string') return String(value);
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidPattern.test(value)) {
      const profile = userProfiles?.find(p => p.id === value);
      return profile?.full_name || 'Unknown User';
    }
    return value;
  };

  const { data: recentActivities } = useQuery({
    queryKey: ['user-recent-activities', user?.id, userProfiles],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('security_audit_log')
        .select('id, action, resource_type, resource_id, created_at, details, user_id')
        .eq('user_id', user?.id)
        .in('action', ['CREATE', 'UPDATE', 'DELETE'])
        .in('resource_type', ['contacts', 'leads', 'deals', 'accounts', 'meetings', 'tasks'])
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;

      return (data || []).map(log => {
        let detailedSubject = `${log.action} ${log.resource_type}`;
        const details = log.details as any;
        
        if (log.action === 'UPDATE' && details?.field_changes) {
          const changedFields = Object.keys(details.field_changes);
          if (changedFields.length > 0) {
            const fieldSummary = changedFields.slice(0, 2).map(field => {
              const change = details.field_changes[field];
              const oldVal = getDisplayName(change?.old ?? 'empty');
              const newVal = getDisplayName(change?.new ?? 'empty');
              return `${field}: "${oldVal}" → "${newVal}"`;
            }).join(', ');
            detailedSubject = `Updated ${log.resource_type} - ${fieldSummary}${changedFields.length > 2 ? ` (+${changedFields.length - 2} more)` : ''}`;
          }
        } else if (log.action === 'CREATE' && details?.record_data) {
          const recordName = details.record_data.lead_name || details.record_data.contact_name || 
                            details.record_data.deal_name || details.record_data.company_name || 
                            details.record_data.title || details.record_data.subject || '';
          if (recordName) detailedSubject = `Created ${log.resource_type} - "${recordName}"`;
        } else if (log.action === 'DELETE' && details?.deleted_data) {
          const recordName = details.deleted_data.lead_name || details.deleted_data.contact_name || 
                            details.deleted_data.deal_name || details.deleted_data.company_name || 
                            details.deleted_data.title || details.deleted_data.subject || '';
          if (recordName) detailedSubject = `Deleted ${log.resource_type} - "${recordName}"`;
        }
        
        return {
          id: log.id,
          subject: detailedSubject,
          activity_type: log.action,
          activity_date: log.created_at,
          resource_type: log.resource_type,
        };
      });
    },
    enabled: !!user?.id && !!userProfiles
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const isLoading = leadsLoading || contactsLoading || dealsLoading || accountsLoading;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 w-64 rounded-md skeleton-shimmer" />
          <div className="h-9 w-24 rounded-md skeleton-shimmer" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-32 rounded-lg skeleton-shimmer" style={{ animationDelay: `${i * 0.1}s` }} />
          ))}
        </div>
      </div>
    );
  }

  const renderWidget = (key: WidgetKey) => {
    switch (key) {
      case "leads":
        return (
          <Card className="h-full hover:shadow-lg transition-shadow animate-fade-in overflow-hidden flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between py-2 px-3 flex-shrink-0">
              <CardTitle className="text-sm font-medium truncate">My Leads</CardTitle>
              <Button variant="outline" size="sm" className="h-6 text-xs gap-1 flex-shrink-0" onClick={() => !isResizeMode && setLeadModalOpen(true)}>
                <Plus className="w-3 h-3" /> Add Lead
              </Button>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0 flex-1 min-h-0 flex flex-col">
              <div className="grid grid-cols-2 gap-1.5 flex-1 min-h-0">
                <div 
                  className="text-center p-1.5 bg-blue-50 dark:bg-blue-950/20 rounded cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-950/40 transition-colors flex flex-col items-center justify-center min-h-0"
                  onClick={(e) => { e.stopPropagation(); navigate('/leads?status=New&owner=me'); }}
                >
                  <p className="text-base font-bold text-blue-600 leading-tight">{leadsData?.new || 0}</p>
                  <p className="text-[9px] text-muted-foreground leading-tight">New</p>
                </div>
                <div 
                  className="text-center p-1.5 bg-yellow-50 dark:bg-yellow-950/20 rounded cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-950/40 transition-colors flex flex-col items-center justify-center min-h-0"
                  onClick={(e) => { e.stopPropagation(); navigate('/leads?status=Attempted&owner=me'); }}
                >
                  <p className="text-base font-bold text-yellow-600 leading-tight">{leadsData?.attempted || 0}</p>
                  <p className="text-[9px] text-muted-foreground leading-tight">Attempted</p>
                </div>
                <div 
                  className="text-center p-1.5 bg-orange-50 dark:bg-orange-950/20 rounded cursor-pointer hover:bg-orange-100 dark:hover:bg-orange-950/40 transition-colors flex flex-col items-center justify-center min-h-0"
                  onClick={(e) => { e.stopPropagation(); navigate('/leads?status=Follow-up&owner=me'); }}
                >
                  <p className="text-base font-bold text-orange-600 leading-tight">{leadsData?.followUp || 0}</p>
                  <p className="text-[9px] text-muted-foreground leading-tight">Follow-Up</p>
                </div>
                <div 
                  className="text-center p-1.5 bg-green-50 dark:bg-green-950/20 rounded cursor-pointer hover:bg-green-100 dark:hover:bg-green-950/40 transition-colors flex flex-col items-center justify-center min-h-0"
                  onClick={(e) => { e.stopPropagation(); navigate('/leads?status=Qualified&owner=me'); }}
                >
                  <p className="text-base font-bold text-green-600 leading-tight">{leadsData?.qualified || 0}</p>
                  <p className="text-[9px] text-muted-foreground leading-tight">Qualified</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );

      case "contacts":
        return (
          <Card className="h-full hover:shadow-lg transition-shadow animate-fade-in overflow-hidden flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between py-2 px-3 flex-shrink-0">
              <CardTitle className="text-sm font-medium truncate">My Contacts</CardTitle>
              <Button variant="outline" size="sm" className="h-6 text-xs gap-1 flex-shrink-0" onClick={() => !isResizeMode && setContactModalOpen(true)}>
                <Plus className="w-3 h-3" /> Add Contact
              </Button>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0 flex-1 min-h-0 flex flex-col">
              <div className="grid grid-cols-2 gap-1.5 flex-1 min-h-0">
                <div 
                  className="text-center p-1.5 bg-blue-50 dark:bg-blue-950/20 rounded cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-950/40 transition-colors flex flex-col items-center justify-center min-h-0"
                  onClick={(e) => { e.stopPropagation(); navigate('/contacts?source=Website&owner=me'); }}
                >
                  <p className="text-base font-bold text-blue-600 leading-tight">{contactsData?.bySource?.website || 0}</p>
                  <p className="text-[9px] text-muted-foreground leading-tight">Website</p>
                </div>
                <div 
                  className="text-center p-1.5 bg-purple-50 dark:bg-purple-950/20 rounded cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-950/40 transition-colors flex flex-col items-center justify-center min-h-0"
                  onClick={(e) => { e.stopPropagation(); navigate('/contacts?source=Referral&owner=me'); }}
                >
                  <p className="text-base font-bold text-purple-600 leading-tight">{contactsData?.bySource?.referral || 0}</p>
                  <p className="text-[9px] text-muted-foreground leading-tight">Referral</p>
                </div>
                <div 
                  className="text-center p-1.5 bg-cyan-50 dark:bg-cyan-950/20 rounded cursor-pointer hover:bg-cyan-100 dark:hover:bg-cyan-950/40 transition-colors flex flex-col items-center justify-center min-h-0"
                  onClick={(e) => { e.stopPropagation(); navigate('/contacts?source=LinkedIn&owner=me'); }}
                >
                  <p className="text-base font-bold text-cyan-600 leading-tight">{contactsData?.bySource?.linkedin || 0}</p>
                  <p className="text-[9px] text-muted-foreground leading-tight">LinkedIn</p>
                </div>
                <div 
                  className="text-center p-1.5 bg-gray-50 dark:bg-gray-950/20 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-950/40 transition-colors flex flex-col items-center justify-center min-h-0"
                  onClick={(e) => { e.stopPropagation(); navigate('/contacts?source=Other&owner=me'); }}
                >
                  <p className="text-base font-bold text-gray-600 leading-tight">{contactsData?.bySource?.other || 0}</p>
                  <p className="text-[9px] text-muted-foreground leading-tight">Other</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );

      case "deals":
        return (
          <Card className="h-full hover:shadow-lg transition-shadow animate-fade-in overflow-hidden flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between py-2 px-3 flex-shrink-0">
              <CardTitle className="text-sm font-medium truncate">My Deals</CardTitle>
              <Button variant="outline" size="sm" className="h-6 text-xs gap-1 flex-shrink-0" onClick={() => !isResizeMode && navigate('/deals')}>
                View All
              </Button>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0 flex-1 min-h-0 flex flex-col">
              <div className="grid grid-cols-2 gap-1.5 flex-1 min-h-0">
                <div 
                  className="text-center p-1.5 bg-blue-50 dark:bg-blue-950/20 rounded cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-950/40 transition-colors flex flex-col items-center justify-center min-h-0"
                  onClick={(e) => { e.stopPropagation(); navigate('/deals?stage=RFQ&owner=me'); }}
                >
                  <p className="text-base font-bold text-blue-600 leading-tight">{dealsData?.byStage?.rfq || 0}</p>
                  <p className="text-[9px] text-muted-foreground leading-tight">RFQ</p>
                </div>
                <div 
                  className="text-center p-1.5 bg-yellow-50 dark:bg-yellow-950/20 rounded cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-950/40 transition-colors flex flex-col items-center justify-center min-h-0"
                  onClick={(e) => { e.stopPropagation(); navigate('/deals?stage=Offered&owner=me'); }}
                >
                  <p className="text-base font-bold text-yellow-600 leading-tight">{dealsData?.byStage?.offered || 0}</p>
                  <p className="text-[9px] text-muted-foreground leading-tight">Offered</p>
                </div>
                <div 
                  className="text-center p-1.5 bg-green-50 dark:bg-green-950/20 rounded cursor-pointer hover:bg-green-100 dark:hover:bg-green-950/40 transition-colors flex flex-col items-center justify-center min-h-0"
                  onClick={(e) => { e.stopPropagation(); navigate('/deals?stage=Won&owner=me'); }}
                >
                  <p className="text-base font-bold text-green-600 leading-tight">{dealsData?.byStage?.won || 0}</p>
                  <p className="text-[9px] text-muted-foreground leading-tight">Won</p>
                </div>
                <div 
                  className="text-center p-1.5 bg-red-50 dark:bg-red-950/20 rounded cursor-pointer hover:bg-red-100 dark:hover:bg-red-950/40 transition-colors flex flex-col items-center justify-center min-h-0"
                  onClick={(e) => { e.stopPropagation(); navigate('/deals?stage=Lost&owner=me'); }}
                >
                  <p className="text-base font-bold text-red-600 leading-tight">{dealsData?.byStage?.lost || 0}</p>
                  <p className="text-[9px] text-muted-foreground leading-tight">Lost</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );

      case "accountsSummary":
        return (
          <Card className="h-full hover:shadow-lg transition-shadow animate-fade-in overflow-hidden flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between py-2 px-3 flex-shrink-0">
              <CardTitle className="text-sm font-medium truncate">My Accounts</CardTitle>
              <Button variant="outline" size="sm" className="h-6 text-xs gap-1 flex-shrink-0" onClick={() => !isResizeMode && setAccountModalOpen(true)}>
                <Plus className="w-3 h-3" /> Add Account
              </Button>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0 flex-1 min-h-0 flex flex-col">
              <div className="grid grid-cols-2 gap-1.5 flex-1 min-h-0">
                <div 
                  className="text-center p-1.5 bg-blue-50 dark:bg-blue-950/20 rounded cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-950/40 transition-colors flex flex-col items-center justify-center min-h-0"
                  onClick={(e) => { e.stopPropagation(); navigate('/accounts?status=New&owner=me'); }}
                >
                  <p className="text-base font-bold text-blue-600 leading-tight">{accountsData?.byStatus?.new || 0}</p>
                  <p className="text-[9px] text-muted-foreground leading-tight">New</p>
                </div>
                <div 
                  className="text-center p-1.5 bg-yellow-50 dark:bg-yellow-950/20 rounded cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-950/40 transition-colors flex flex-col items-center justify-center min-h-0"
                  onClick={(e) => { e.stopPropagation(); navigate('/accounts?status=Working&owner=me'); }}
                >
                  <p className="text-base font-bold text-yellow-600 leading-tight">{accountsData?.byStatus?.working || 0}</p>
                  <p className="text-[9px] text-muted-foreground leading-tight">Working</p>
                </div>
                <div 
                  className="text-center p-1.5 bg-red-50 dark:bg-red-950/20 rounded cursor-pointer hover:bg-red-100 dark:hover:bg-red-950/40 transition-colors flex flex-col items-center justify-center min-h-0"
                  onClick={(e) => { e.stopPropagation(); navigate('/accounts?status=Hot&owner=me'); }}
                >
                  <p className="text-base font-bold text-red-600 leading-tight">{accountsData?.byStatus?.hot || 0}</p>
                  <p className="text-[9px] text-muted-foreground leading-tight">Hot</p>
                </div>
                <div 
                  className="text-center p-1.5 bg-green-50 dark:bg-green-950/20 rounded cursor-pointer hover:bg-green-100 dark:hover:bg-green-950/40 transition-colors flex flex-col items-center justify-center min-h-0"
                  onClick={(e) => { e.stopPropagation(); navigate('/accounts?status=Nurture&owner=me'); }}
                >
                  <p className="text-base font-bold text-green-600 leading-tight">{accountsData?.byStatus?.nurture || 0}</p>
                  <p className="text-[9px] text-muted-foreground leading-tight">Nurture</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );

      case "quickActions":
        return (
          <Card className="h-full animate-fade-in overflow-hidden flex flex-col">
            <CardHeader className="py-2 px-3 flex-shrink-0">
              <CardTitle className="text-sm font-medium truncate">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0 flex-1 min-h-0 flex flex-col">
              <div className="grid grid-cols-2 gap-1.5 flex-1 min-h-0">
                <Button variant="outline" size="sm" className="justify-start gap-1.5 h-auto min-h-[28px] text-xs py-1" onClick={() => !isResizeMode && setLeadModalOpen(true)}>
                  <Plus className="w-3 h-3 flex-shrink-0" /> Lead
                </Button>
                <Button variant="outline" size="sm" className="justify-start gap-1.5 h-auto min-h-[28px] text-xs py-1" onClick={() => !isResizeMode && setContactModalOpen(true)}>
                  <Plus className="w-3 h-3 flex-shrink-0" /> Contact
                </Button>
                <Button variant="outline" size="sm" className="justify-start gap-1.5 h-auto min-h-[28px] text-xs py-1" onClick={() => !isResizeMode && setAccountModalOpen(true)}>
                  <Plus className="w-3 h-3 flex-shrink-0" /> Account
                </Button>
                <Button variant="outline" size="sm" className="justify-start gap-1.5 h-auto min-h-[28px] text-xs py-1" onClick={() => !isResizeMode && setCreateMeetingModalOpen(true)}>
                  <Plus className="w-3 h-3 flex-shrink-0" /> Meeting
                </Button>
              </div>
            </CardContent>
          </Card>
        );

      case "todaysAgenda":
        const totalAgendaItems = (todaysMeetings?.length || 0) + (todaysTasks?.length || 0) + (overdueTasks?.length || 0);
        return (
          <Card className="h-full animate-fade-in overflow-hidden flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between py-2 px-3 flex-shrink-0">
              <CardTitle className="flex items-center gap-1.5 text-sm font-medium truncate">
                <CalendarClock className="w-4 h-4 text-primary flex-shrink-0" />
                Today's Agenda
              </CardTitle>
              <span className="text-[9px] text-muted-foreground flex-shrink-0">{format(new Date(), 'EEE, MMM d')}</span>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0 flex-1 min-h-0 flex flex-col">
              {totalAgendaItems > 0 ? (
                <div className="flex-1 min-h-0 overflow-hidden space-y-1">
                  {(overdueTasks?.length || 0) > 0 && (
                    <div>
                      <p className="text-[9px] font-medium text-red-600 mb-0.5">⚠️ Overdue ({overdueTasks?.length})</p>
                      {overdueTasks?.slice(0, 1).map((task: any) => (
                        <div key={task.id} className="text-[9px] p-1 rounded bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 truncate">
                          {task.title}
                        </div>
                      ))}
                    </div>
                  )}
                  {(todaysMeetings?.length || 0) > 0 && (
                    <div>
                      <p className="text-[9px] font-medium text-muted-foreground mb-0.5">Meetings ({todaysMeetings?.length})</p>
                      {todaysMeetings?.slice(0, 1).map((meeting: any) => (
                        <div key={meeting.id} className="text-[9px] p-1 rounded bg-blue-50 dark:bg-blue-900/20 flex items-center gap-1">
                          <Calendar className="w-2.5 h-2.5 text-blue-600 flex-shrink-0" />
                          <span className="truncate flex-1 min-w-0">{meeting.subject}</span>
                          <span className="text-muted-foreground flex-shrink-0">{format(new Date(meeting.start_time), 'HH:mm')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {(todaysTasks?.length || 0) > 0 && (
                    <div>
                      <p className="text-[9px] font-medium text-muted-foreground mb-0.5">Tasks Due ({todaysTasks?.length})</p>
                      {todaysTasks?.slice(0, 1).map((task: any) => (
                        <div key={task.id} className="text-[9px] p-1 rounded bg-orange-50 dark:bg-orange-900/20 truncate">
                          {task.title}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 min-h-0 flex items-center justify-center">
                  <EmptyState
                    title="Clear day ahead"
                    description="No meetings or tasks scheduled for today"
                    illustration="calendar"
                    variant="compact"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        );

      case "upcomingMeetings":
        return (
          <Card className="h-full hover:shadow-lg transition-shadow animate-fade-in overflow-hidden flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between py-2 px-3 flex-shrink-0">
              <CardTitle className="text-sm font-medium truncate">My Meetings</CardTitle>
              <Button variant="outline" size="sm" className="h-6 text-xs gap-1 flex-shrink-0" onClick={() => !isResizeMode && setCreateMeetingModalOpen(true)}>
                <Plus className="w-3 h-3" /> Add Meeting
              </Button>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0 flex-1 min-h-0 flex flex-col">
              <div className="grid grid-cols-2 gap-1.5 flex-1 min-h-0">
                <div 
                  className="text-center p-1.5 bg-blue-50 dark:bg-blue-950/20 rounded cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-950/40 transition-colors flex flex-col items-center justify-center min-h-0"
                  onClick={(e) => { e.stopPropagation(); navigate('/meetings?status=scheduled&owner=me'); }}
                >
                  <p className="text-base font-bold text-blue-600 leading-tight">{upcomingMeetings?.byStatus?.scheduled || 0}</p>
                  <p className="text-[9px] text-muted-foreground leading-tight">Scheduled</p>
                </div>
                <div 
                  className="text-center p-1.5 bg-yellow-50 dark:bg-yellow-950/20 rounded cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-950/40 transition-colors flex flex-col items-center justify-center min-h-0"
                  onClick={(e) => { e.stopPropagation(); navigate('/meetings?status=ongoing&owner=me'); }}
                >
                  <p className="text-base font-bold text-yellow-600 leading-tight">{upcomingMeetings?.byStatus?.ongoing || 0}</p>
                  <p className="text-[9px] text-muted-foreground leading-tight">Ongoing</p>
                </div>
                <div 
                  className="text-center p-1.5 bg-green-50 dark:bg-green-950/20 rounded cursor-pointer hover:bg-green-100 dark:hover:bg-green-950/40 transition-colors flex flex-col items-center justify-center min-h-0"
                  onClick={(e) => { e.stopPropagation(); navigate('/meetings?status=completed&owner=me'); }}
                >
                  <p className="text-base font-bold text-green-600 leading-tight">{upcomingMeetings?.byStatus?.completed || 0}</p>
                  <p className="text-[9px] text-muted-foreground leading-tight">Completed</p>
                </div>
                <div 
                  className="text-center p-1.5 bg-red-50 dark:bg-red-950/20 rounded cursor-pointer hover:bg-red-100 dark:hover:bg-red-950/40 transition-colors flex flex-col items-center justify-center min-h-0"
                  onClick={(e) => { e.stopPropagation(); navigate('/meetings?status=cancelled&owner=me'); }}
                >
                  <p className="text-base font-bold text-red-600 leading-tight">{upcomingMeetings?.byStatus?.cancelled || 0}</p>
                  <p className="text-[9px] text-muted-foreground leading-tight">Cancelled</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );

      case "taskReminders":
        return (
          <Card className="h-full hover:shadow-lg transition-shadow animate-fade-in overflow-hidden flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between py-2 px-3 flex-shrink-0">
              <CardTitle className="text-sm font-medium truncate">My Tasks</CardTitle>
              <Button variant="outline" size="sm" className="h-6 text-xs gap-1 flex-shrink-0" onClick={() => { if (!isResizeMode) { setSelectedTask(null); setTaskModalOpen(true); }}}>
                <Plus className="w-3 h-3" /> Add Task
              </Button>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0 flex-1 min-h-0 flex flex-col">
              <div className="grid grid-cols-2 gap-1.5 flex-1 min-h-0">
                <div 
                  className="text-center p-1.5 bg-blue-50 dark:bg-blue-950/20 rounded cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-950/40 transition-colors flex flex-col items-center justify-center min-h-0"
                  onClick={(e) => { e.stopPropagation(); navigate('/tasks?status=open&owner=me'); }}
                >
                  <p className="text-base font-bold text-blue-600 leading-tight">{taskReminders?.byStatus?.open || 0}</p>
                  <p className="text-[9px] text-muted-foreground leading-tight">Open</p>
                </div>
                <div 
                  className="text-center p-1.5 bg-yellow-50 dark:bg-yellow-950/20 rounded cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-950/40 transition-colors flex flex-col items-center justify-center min-h-0"
                  onClick={(e) => { e.stopPropagation(); navigate('/tasks?status=in_progress&owner=me'); }}
                >
                  <p className="text-base font-bold text-yellow-600 leading-tight">{taskReminders?.byStatus?.inProgress || 0}</p>
                  <p className="text-[9px] text-muted-foreground leading-tight">In Progress</p>
                </div>
                <div 
                  className="text-center p-1.5 bg-green-50 dark:bg-green-950/20 rounded cursor-pointer hover:bg-green-100 dark:hover:bg-green-950/40 transition-colors flex flex-col items-center justify-center min-h-0"
                  onClick={(e) => { e.stopPropagation(); navigate('/tasks?status=completed&owner=me'); }}
                >
                  <p className="text-base font-bold text-green-600 leading-tight">{taskReminders?.byStatus?.completed || 0}</p>
                  <p className="text-[9px] text-muted-foreground leading-tight">Completed</p>
                </div>
                <div 
                  className="text-center p-1.5 bg-gray-50 dark:bg-gray-950/20 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-950/40 transition-colors flex flex-col items-center justify-center min-h-0"
                  onClick={(e) => { e.stopPropagation(); navigate('/tasks?status=deferred&owner=me'); }}
                >
                  <p className="text-base font-bold text-gray-600 leading-tight">{taskReminders?.byStatus?.deferred || 0}</p>
                  <p className="text-[9px] text-muted-foreground leading-tight">Deferred</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );

      case "recentActivities":
        return (
          <Card className="h-full animate-fade-in overflow-hidden flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between py-2 px-3 flex-shrink-0">
              <CardTitle className="flex items-center gap-1.5 text-sm font-medium truncate">
                <Activity className="w-4 h-4 text-primary flex-shrink-0" />
                Recent Activities
              </CardTitle>
              <Button variant="ghost" size="sm" className="h-6 text-xs flex-shrink-0" onClick={() => !isResizeMode && navigate('/notifications')}>View All</Button>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0 flex-1 min-h-0 flex flex-col">
              {recentActivities && recentActivities.length > 0 ? (
                <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5">
                  {recentActivities.slice(0, 5).map((activity) => (
                    <div key={activity.id} className="flex items-start gap-1.5 p-1.5 rounded bg-muted/50">
                      <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Activity className="w-2.5 h-2.5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-medium line-clamp-2">{activity.subject}</p>
                        <p className="text-[9px] text-muted-foreground">{format(new Date(activity.activity_date), 'MMM d, HH:mm')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex-1 min-h-0 flex items-center justify-center">
                  <EmptyState
                    title="No recent activities"
                    description="Activities will appear as you work"
                    illustration="activities"
                    variant="compact"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        );

      case "emailStats":
        return (
          <Card className="h-full animate-fade-in overflow-hidden flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between py-2 px-3 flex-shrink-0">
              <CardTitle className="text-sm font-medium truncate">Email Statistics</CardTitle>
              <Mail className="w-4 h-4 text-blue-600 flex-shrink-0" />
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0 flex-1 min-h-0 flex flex-col justify-center gap-2">
              <div className="grid grid-cols-3 gap-1.5 text-center">
                <div className="flex flex-col items-center justify-center">
                  <p className="text-base font-bold leading-tight">{emailStats?.sent || 0}</p>
                  <p className="text-[9px] text-muted-foreground leading-tight">Sent</p>
                </div>
                <div className="flex flex-col items-center justify-center">
                  <p className="text-base font-bold text-green-600 leading-tight">{emailStats?.opened || 0}</p>
                  <p className="text-[9px] text-muted-foreground leading-tight">Opened</p>
                </div>
                <div className="flex flex-col items-center justify-center">
                  <p className="text-base font-bold text-blue-600 leading-tight">{emailStats?.clicked || 0}</p>
                  <p className="text-[9px] text-muted-foreground leading-tight">Clicked</p>
                </div>
              </div>
              <div className="flex justify-between text-[9px] text-muted-foreground border-t pt-1.5">
                <span>Open Rate: <span className="font-medium text-foreground">{emailStats?.openRate || 0}%</span></span>
                <span>Click Rate: <span className="font-medium text-foreground">{emailStats?.clickRate || 0}%</span></span>
              </div>
            </CardContent>
          </Card>
        );

      case "weeklySummary":
        return (
          <Card className="h-full animate-fade-in overflow-hidden flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between py-2 px-3 flex-shrink-0">
              <CardTitle className="text-sm font-medium truncate">This Week</CardTitle>
              <ListTodo className="w-4 h-4 text-teal-600 flex-shrink-0" />
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0 flex-1 min-h-0 flex flex-col justify-center">
              <div className="grid grid-cols-5 gap-1 text-center">
                <div className="p-1 rounded bg-blue-50 dark:bg-blue-950/20 flex flex-col items-center justify-center">
                  <p className="text-sm font-bold text-blue-600 leading-tight">{weeklySummary?.newLeads || 0}</p>
                  <p className="text-[8px] text-muted-foreground leading-tight">Leads</p>
                </div>
                <div className="p-1 rounded bg-green-50 dark:bg-green-950/20 flex flex-col items-center justify-center">
                  <p className="text-sm font-bold text-green-600 leading-tight">{weeklySummary?.newContacts || 0}</p>
                  <p className="text-[8px] text-muted-foreground leading-tight">Contacts</p>
                </div>
                <div className="p-1 rounded bg-purple-50 dark:bg-purple-950/20 flex flex-col items-center justify-center">
                  <p className="text-sm font-bold text-purple-600 leading-tight">{weeklySummary?.newDeals || 0}</p>
                  <p className="text-[8px] text-muted-foreground leading-tight">Deals</p>
                </div>
                <div className="p-1 rounded bg-indigo-50 dark:bg-indigo-950/20 flex flex-col items-center justify-center">
                  <p className="text-sm font-bold text-indigo-600 leading-tight">{weeklySummary?.meetingsCompleted || 0}</p>
                  <p className="text-[8px] text-muted-foreground leading-tight">Meetings</p>
                </div>
                <div className="p-1 rounded bg-emerald-50 dark:bg-emerald-950/20 flex flex-col items-center justify-center">
                  <p className="text-sm font-bold text-emerald-600 leading-tight">{weeklySummary?.tasksCompleted || 0}</p>
                  <p className="text-[8px] text-muted-foreground leading-tight">Tasks</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );

      case "followUpsDue":
        return (
          <Card className="h-full animate-fade-in overflow-hidden flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between py-2 px-3 flex-shrink-0">
              <CardTitle className="text-sm font-medium truncate">Follow-Ups Due</CardTitle>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {(followUpsDue?.overdue || 0) > 0 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                    {followUpsDue?.overdue} overdue
                  </span>
                )}
                <ClipboardList className="w-4 h-4 text-amber-600" />
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0 flex-1 min-h-0 flex flex-col">
              {followUpsDue?.followUps && followUpsDue.followUps.length > 0 ? (
                <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5">
                  {followUpsDue.followUps.map((followUp: any) => {
                    const isOverdue = followUp.due_date && isBefore(new Date(followUp.due_date), new Date());
                    return (
                      <div key={followUp.id} className={`p-1.5 rounded text-[10px] ${isOverdue ? 'bg-red-50 dark:bg-red-900/20' : 'bg-muted/50'}`}>
                        <p className="font-medium truncate">{followUp.title}</p>
                        <p className={`text-[9px] text-muted-foreground ${isOverdue ? 'text-red-600' : ''}`}>
                          Due: {followUp.due_date ? format(new Date(followUp.due_date), 'MMM d') : 'No date'}
                        </p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex-1 min-h-0 flex items-center justify-center text-muted-foreground text-[10px]">
                  No pending follow-ups
                </div>
              )}
            </CardContent>
          </Card>
        );

      default:
        return null;
    }
  };

  return (
    <div className="p-4 space-y-4 w-full max-w-full overflow-x-hidden" ref={containerRef}>
      {/* Welcome Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground truncate">
            Welcome back{userName ? `, ${userName}` : ''}!
          </h1>
        </div>
        <div className="flex gap-2 flex-shrink-0 items-center">
          {isResizeMode ? (
            <>
              <div className="bg-primary/10 border border-primary/20 rounded-lg px-3 py-1.5 hidden sm:flex items-center">
                <p className="text-xs text-primary font-medium flex items-center gap-1.5">
                  <Settings2 className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Drag to move, resize edges, or press Escape to cancel</span>
                  <span className="md:hidden">Edit mode</span>
                </p>
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Plus className="w-4 h-4" />
                    Add Widget
                    {pendingWidgetChanges.size > 0 && (
                      <span className="bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full">
                        {pendingWidgetChanges.size}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0" align="end">
                  <div className="p-3 border-b">
                    <p className="text-sm font-medium">Toggle Widgets</p>
                    <p className="text-xs text-muted-foreground">Click to add/remove.</p>
                  </div>
                  <ScrollArea className="h-64">
                    <div className="p-2 space-y-1">
                      {DEFAULT_WIDGETS.map(widget => {
                        const willBeVisible = willWidgetBeVisible(widget.key);
                        const isPending = pendingWidgetChanges.has(widget.key);
                        return (
                          <Button
                            key={widget.key}
                            variant="ghost"
                            className={`w-full justify-between gap-2 ${isPending ? 'bg-primary/10' : ''}`}
                            onClick={() => togglePendingWidget(widget.key)}
                          >
                            <span className="flex items-center gap-2">
                              {widget.icon}
                              {widget.label}
                            </span>
                            {willBeVisible && <Check className="w-4 h-4 text-primary" />}
                          </Button>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>
              <Button variant="outline" onClick={handleCancelCustomize} className="gap-2">
                <X className="w-4 h-4" /> Cancel
              </Button>
              <Button onClick={handleSaveLayout} className="gap-2" disabled={savePreferencesMutation.isPending}>
                <Check className="w-4 h-4" /> {savePreferencesMutation.isPending ? 'Saving...' : 'Save'}
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={handleEnterCustomizeMode} className="gap-2">
              <Settings2 className="w-4 h-4" /> Customize
            </Button>
          )}
        </div>
      </div>

      {/* Resizable Grid Layout */}
      <ResizableDashboard
        isResizeMode={isResizeMode}
        visibleWidgets={visibleWidgets}
        widgetLayouts={widgetLayouts}
        pendingWidgetChanges={pendingWidgetChanges}
        onLayoutChange={handleLayoutChange}
        onWidgetRemove={handleWidgetRemove}
        renderWidget={renderWidget}
        containerWidth={containerWidth}
      />
      
      {/* Modals */}
      <TaskModal
        open={taskModalOpen}
        onOpenChange={(open) => { setTaskModalOpen(open); if (!open) setSelectedTask(null); }}
        task={selectedTask}
        onSubmit={createTask}
        onUpdate={async (taskId, updates, original) => {
          const result = await updateTask(taskId, updates, original);
          if (result) queryClient.invalidateQueries({ queryKey: ['user-task-reminders-enhanced', user?.id] });
          return result;
        }}
      />
      
      <MeetingModal
        open={meetingModalOpen}
        onOpenChange={(open) => { setMeetingModalOpen(open); if (!open) setSelectedMeeting(null); }}
        meeting={selectedMeeting}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['user-upcoming-meetings-enhanced', user?.id] });
          setMeetingModalOpen(false);
          setSelectedMeeting(null);
        }}
      />
      
      <MeetingModal
        open={createMeetingModalOpen}
        onOpenChange={setCreateMeetingModalOpen}
        meeting={null}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['user-upcoming-meetings-enhanced', user?.id] });
          setCreateMeetingModalOpen(false);
          toast.success("Meeting scheduled");
        }}
      />
      
      <LeadModal
        open={leadModalOpen}
        onOpenChange={(open) => { setLeadModalOpen(open); if (!open) queryClient.invalidateQueries({ queryKey: ['user-leads-enhanced', user?.id] }); }}
        lead={null}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['user-leads-enhanced', user?.id] });
          setLeadModalOpen(false);
          toast.success("Lead created");
        }}
      />
      
      <ContactModal
        open={contactModalOpen}
        onOpenChange={(open) => { setContactModalOpen(open); if (!open) queryClient.invalidateQueries({ queryKey: ['user-contacts-enhanced', user?.id] }); }}
        contact={null}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['user-contacts-enhanced', user?.id] });
          setContactModalOpen(false);
          toast.success("Contact created");
        }}
      />
      
      <AccountModal
        open={accountModalOpen}
        onOpenChange={(open) => { setAccountModalOpen(open); if (!open) queryClient.invalidateQueries({ queryKey: ['user-accounts-enhanced', user?.id] }); }}
        account={null}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['user-accounts-enhanced', user?.id] });
          setAccountModalOpen(false);
          toast.success("Account created");
        }}
      />
    </div>
  );
};

export default UserDashboard;
