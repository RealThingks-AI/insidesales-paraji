-- Add delivered_at column to email_history for email tracking
ALTER TABLE public.email_history ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

-- Create backup_schedules table for scheduled backups
CREATE TABLE IF NOT EXISTS public.backup_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  is_enabled BOOLEAN DEFAULT false,
  frequency TEXT NOT NULL DEFAULT 'daily', -- daily, weekly
  day_of_week INTEGER, -- 0-6 for weekly (0 = Sunday)
  time_of_day TIME NOT NULL DEFAULT '00:00',
  retention_days INTEGER DEFAULT 30,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.backup_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage backup schedules" ON public.backup_schedules
  FOR ALL USING (is_user_admin());

-- Create report_schedules table for scheduled reports
CREATE TABLE IF NOT EXISTS public.report_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  report_type TEXT NOT NULL, -- deals_summary, leads_activity, pipeline_status, revenue_forecast, team_performance
  frequency TEXT NOT NULL DEFAULT 'weekly', -- daily, weekly, monthly
  day_of_week INTEGER, -- 0-6 for weekly
  day_of_month INTEGER, -- 1-31 for monthly
  time_of_day TIME NOT NULL DEFAULT '08:00',
  recipients JSONB DEFAULT '[]'::jsonb, -- array of email addresses
  filters JSONB, -- optional filters for the report
  is_enabled BOOLEAN DEFAULT true,
  last_sent_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage report schedules" ON public.report_schedules
  FOR ALL USING (is_user_admin());

CREATE POLICY "Authenticated users can view report schedules" ON public.report_schedules
  FOR SELECT USING (true);

-- Create announcements table
CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info', -- info, warning, success, error
  priority TEXT DEFAULT 'normal', -- low, normal, high
  is_active BOOLEAN DEFAULT true,
  starts_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  target_roles TEXT[] DEFAULT ARRAY['user', 'manager', 'admin'],
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage announcements" ON public.announcements
  FOR ALL USING (is_user_admin());

CREATE POLICY "Authenticated users can view active announcements" ON public.announcements
  FOR SELECT USING (
    is_active = true AND
    (starts_at IS NULL OR starts_at <= now()) AND
    (expires_at IS NULL OR expires_at > now())
  );

-- Create announcement_dismissals table
CREATE TABLE IF NOT EXISTS public.announcement_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  dismissed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(announcement_id, user_id)
);

ALTER TABLE public.announcement_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own dismissals" ON public.announcement_dismissals
  FOR ALL USING (user_id = auth.uid());

-- Create approval_workflows table
CREATE TABLE IF NOT EXISTS public.approval_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL, -- deals, leads, quotes
  trigger_conditions JSONB, -- e.g., {"field": "total_revenue", "operator": ">=", "value": 100000}
  approval_steps JSONB NOT NULL, -- ordered list of approvers
  is_enabled BOOLEAN DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.approval_workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage approval workflows" ON public.approval_workflows
  FOR ALL USING (is_user_admin());

CREATE POLICY "Authenticated users can view approval workflows" ON public.approval_workflows
  FOR SELECT USING (true);

-- Create approval_requests table
CREATE TABLE IF NOT EXISTS public.approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES public.approval_workflows(id),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  current_step INTEGER DEFAULT 1,
  status TEXT DEFAULT 'pending', -- pending, approved, rejected
  submitted_by UUID,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view all approval requests" ON public.approval_requests
  FOR SELECT USING (true);

CREATE POLICY "Users can create approval requests" ON public.approval_requests
  FOR INSERT WITH CHECK (submitted_by = auth.uid());

CREATE POLICY "Admins and approvers can update approval requests" ON public.approval_requests
  FOR UPDATE USING (is_user_admin() OR submitted_by = auth.uid());

-- Create approval_actions table
CREATE TABLE IF NOT EXISTS public.approval_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  approver_id UUID NOT NULL,
  action TEXT NOT NULL, -- approved, rejected
  comments TEXT,
  acted_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.approval_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view approval actions" ON public.approval_actions
  FOR SELECT USING (true);

CREATE POLICY "Approvers can create approval actions" ON public.approval_actions
  FOR INSERT WITH CHECK (approver_id = auth.uid());

-- Create branding_settings table (single row table)
CREATE TABLE IF NOT EXISTS public.branding_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_name TEXT DEFAULT 'CRM',
  logo_url TEXT,
  favicon_url TEXT,
  primary_color TEXT DEFAULT '#0284c7',
  secondary_color TEXT DEFAULT '#334155',
  accent_color TEXT DEFAULT '#f8fafc',
  font_family TEXT DEFAULT 'Inter',
  custom_css TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.branding_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage branding settings" ON public.branding_settings
  FOR ALL USING (is_user_admin());

CREATE POLICY "Authenticated users can view branding settings" ON public.branding_settings
  FOR SELECT USING (true);

-- Insert default branding settings if not exists
INSERT INTO public.branding_settings (id) 
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Create updated_at triggers for new tables
CREATE TRIGGER update_backup_schedules_updated_at
  BEFORE UPDATE ON public.backup_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_report_schedules_updated_at
  BEFORE UPDATE ON public.report_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_announcements_updated_at
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_approval_workflows_updated_at
  BEFORE UPDATE ON public.approval_workflows
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_approval_requests_updated_at
  BEFORE UPDATE ON public.approval_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_branding_settings_updated_at
  BEFORE UPDATE ON public.branding_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();