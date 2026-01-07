import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';

interface ActionItem {
  id: string;
  deal_id: string;
  next_action: string;
  assigned_to: string | null;
  due_date: string | null;
  status: 'Open' | 'Ongoing' | 'Closed';
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface DealActionItemsSectionProps {
  dealId: string;
  disabled?: boolean;
}

export const DealActionItemsSection = ({ dealId, disabled }: DealActionItemsSectionProps) => {
  const { user } = useAuth();
  const [newAction, setNewAction] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Fetch users for assignment dropdown
  const { data: users = [] } = useQuery({
    queryKey: ['profiles-for-action-items'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name');
      return data || [];
    },
  });

  // Fetch action items for this deal
  const { data: actionItems = [], refetch, isLoading } = useQuery({
    queryKey: ['deal-action-items', dealId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_action_items')
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return (data || []) as ActionItem[];
    },
    enabled: !!dealId,
  });

  const handleAddActionItem = async () => {
    if (!newAction.trim() || !dealId || !user?.id) return;
    setSaving(true);

    try {
      const { error } = await supabase.from('deal_action_items').insert({
        deal_id: dealId,
        next_action: newAction.trim(),
        due_date: newDueDate || null,
        assigned_to: newAssignee || null,
        status: 'Open',
        created_by: user.id,
      });

      if (error) throw error;

      setNewAction('');
      setNewDueDate('');
      setNewAssignee('');
      refetch();
      toast({ title: 'Success', description: 'Action item added' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (itemId: string, newStatus: 'Open' | 'Ongoing' | 'Closed') => {
    try {
      const { error } = await supabase
        .from('deal_action_items')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', itemId);

      if (error) throw error;
      refetch();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (itemId: string) => {
    try {
      const { error } = await supabase
        .from('deal_action_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;
      refetch();
      toast({ title: 'Deleted', description: 'Action item removed' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'Closed':
        return 'default';
      case 'Ongoing':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getUserName = (userId: string | null) => {
    if (!userId) return 'Unassigned';
    const user = users.find(u => u.id === userId);
    return user?.full_name || 'Unknown';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Action Items</h3>
        <span className="text-xs text-muted-foreground">
          {actionItems.filter(i => i.status !== 'Closed').length} open
        </span>
      </div>

      {/* Add new action item */}
      <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
        <Input
          placeholder="Add an action item..."
          value={newAction}
          onChange={(e) => setNewAction(e.target.value)}
          disabled={disabled || saving}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newAction.trim()) {
              e.preventDefault();
              handleAddActionItem();
            }
          }}
        />
        <div className="flex gap-2">
          <Input
            type="date"
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.target.value)}
            disabled={disabled || saving}
            className="w-40"
            placeholder="Due date"
          />
          <Select value={newAssignee} onValueChange={setNewAssignee} disabled={disabled || saving}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Assign to..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Unassigned</SelectItem>
              {users.map(u => (
                <SelectItem key={u.id} value={u.id}>
                  {u.full_name || 'Unknown'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={handleAddActionItem}
            disabled={!newAction.trim() || disabled || saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Action items list */}
      {actionItems.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          No action items yet. Add one above.
        </p>
      ) : (
        <div className="space-y-2">
          {actionItems.map(item => (
            <div
              key={item.id}
              className={`flex items-start gap-3 p-3 border rounded-lg transition-colors ${
                item.status === 'Closed' ? 'bg-muted/50 opacity-60' : 'bg-card hover:bg-accent/10'
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${item.status === 'Closed' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                  {item.next_action}
                </p>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <span>{getUserName(item.assigned_to)}</span>
                  {item.due_date && (
                    <>
                      <span>•</span>
                      <span>Due: {format(new Date(item.due_date), 'MMM d, yyyy')}</span>
                    </>
                  )}
                </div>
              </div>

              <Select
                value={item.status}
                onValueChange={(val) => handleUpdateStatus(item.id, val as 'Open' | 'Ongoing' | 'Closed')}
                disabled={disabled}
              >
                <SelectTrigger className="w-24 h-7 text-xs">
                  <Badge variant={getStatusBadgeVariant(item.status)} className="text-xs">
                    {item.status}
                  </Badge>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Open">Open</SelectItem>
                  <SelectItem value="Ongoing">Ongoing</SelectItem>
                  <SelectItem value="Closed">Closed</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => handleDelete(item.id)}
                disabled={disabled}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
