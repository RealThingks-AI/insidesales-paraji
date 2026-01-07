import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { Task, TaskStatus, TaskPriority, TaskModuleType } from '@/types/task';
import { format } from 'date-fns';

interface ImportResult {
  success: number;
  failed: number;
  errors: string[];
}

export const useTasksImportExport = (tasks: Task[], onRefresh: () => void) => {
  const { user } = useAuth();
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const exportToCSV = async () => {
    setExporting(true);
    try {
      const headers = [
        'Title',
        'Description',
        'Status',
        'Priority',
        'Due Date',
        'Due Time',
        'Module Type',
        'Account Name',
        'Contact Name',
        'Lead Name',
        'Deal Name',
        'Meeting Subject',
        'Assigned To',
        'Created By',
        'Created At',
        'Completed At',
      ];

      const rows = tasks.map(task => [
        task.title,
        task.description || '',
        task.status,
        task.priority,
        task.due_date || '',
        task.due_time || '',
        task.module_type || '',
        task.account_name || '',
        task.contact_name || '',
        task.lead_name || '',
        task.deal_name || '',
        task.meeting_subject || '',
        task.assigned_user_name || '',
        task.created_by_name || '',
        task.created_at ? format(new Date(task.created_at), 'yyyy-MM-dd HH:mm:ss') : '',
        task.completed_at ? format(new Date(task.completed_at), 'yyyy-MM-dd HH:mm:ss') : '',
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `tasks_export_${format(new Date(), 'yyyy-MM-dd_HHmmss')}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({ title: 'Success', description: `Exported ${tasks.length} tasks to CSV` });
    } catch (error: any) {
      console.error('Export error:', error);
      toast({ title: 'Error', description: 'Failed to export tasks', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const parseCSV = (content: string): string[][] => {
    const lines = content.split('\n');
    const result: string[][] = [];
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      const row: string[] = [];
      let cell = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            cell += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          row.push(cell.trim());
          cell = '';
        } else {
          cell += char;
        }
      }
      row.push(cell.trim());
      result.push(row);
    }
    
    return result;
  };

  const importFromCSV = async (file: File): Promise<ImportResult> => {
    if (!user?.id) {
      return { success: 0, failed: 0, errors: ['User not authenticated'] };
    }

    setImporting(true);
    const result: ImportResult = { success: 0, failed: 0, errors: [] };

    try {
      const content = await file.text();
      const rows = parseCSV(content);
      
      if (rows.length < 2) {
        throw new Error('CSV file is empty or has no data rows');
      }

      const headers = rows[0].map(h => h.toLowerCase().trim());
      const dataRows = rows.slice(1);

      const titleIndex = headers.findIndex(h => h.includes('title'));
      const descIndex = headers.findIndex(h => h.includes('description'));
      const statusIndex = headers.findIndex(h => h.includes('status'));
      const priorityIndex = headers.findIndex(h => h.includes('priority'));
      const dueDateIndex = headers.findIndex(h => h.includes('due') && h.includes('date'));
      const dueTimeIndex = headers.findIndex(h => h.includes('due') && h.includes('time'));

      if (titleIndex === -1) {
        throw new Error('CSV must have a "Title" column');
      }

      const validStatuses: TaskStatus[] = ['open', 'in_progress', 'completed', 'cancelled'];
      const validPriorities: TaskPriority[] = ['high', 'medium', 'low'];

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const rowNum = i + 2;

        try {
          const title = row[titleIndex]?.trim();
          if (!title) {
            result.errors.push(`Row ${rowNum}: Title is required`);
            result.failed++;
            continue;
          }

          let status: TaskStatus = 'open';
          if (statusIndex !== -1 && row[statusIndex]) {
            const statusValue = row[statusIndex].toLowerCase().trim().replace(' ', '_');
            if (validStatuses.includes(statusValue as TaskStatus)) {
              status = statusValue as TaskStatus;
            }
          }

          let priority: TaskPriority = 'medium';
          if (priorityIndex !== -1 && row[priorityIndex]) {
            const priorityValue = row[priorityIndex].toLowerCase().trim();
            if (validPriorities.includes(priorityValue as TaskPriority)) {
              priority = priorityValue as TaskPriority;
            }
          }

          let due_date: string | null = null;
          if (dueDateIndex !== -1 && row[dueDateIndex]) {
            const dateStr = row[dueDateIndex].trim();
            const parsedDate = new Date(dateStr);
            if (!isNaN(parsedDate.getTime())) {
              due_date = format(parsedDate, 'yyyy-MM-dd');
            }
          }

          let due_time: string | null = null;
          if (dueTimeIndex !== -1 && row[dueTimeIndex]) {
            due_time = row[dueTimeIndex].trim();
          }

          const { error } = await supabase.from('tasks').insert({
            title,
            description: descIndex !== -1 ? row[descIndex]?.trim() || null : null,
            status,
            priority,
            due_date,
            due_time,
            created_by: user.id,
          });

          if (error) {
            result.errors.push(`Row ${rowNum}: ${error.message}`);
            result.failed++;
          } else {
            result.success++;
          }
        } catch (err: any) {
          result.errors.push(`Row ${rowNum}: ${err.message}`);
          result.failed++;
        }
      }

      if (result.success > 0) {
        onRefresh();
      }

      toast({
        title: 'Import Complete',
        description: `${result.success} tasks imported, ${result.failed} failed`,
        variant: result.failed > 0 ? 'destructive' : 'default',
      });

    } catch (error: any) {
      console.error('Import error:', error);
      result.errors.push(error.message);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setImporting(false);
    }

    return result;
  };

  return {
    importing,
    exporting,
    exportToCSV,
    importFromCSV,
  };
};
