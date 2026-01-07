import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { 
  Database, 
  HardDrive, 
  Users, 
  Activity, 
  RefreshCw, 
  CheckCircle, 
  AlertCircle,
  Clock,
  Server
} from 'lucide-react';
import { format } from 'date-fns';

interface TableStats {
  table_name: string;
  row_count: number;
}

interface SystemStats {
  tables: TableStats[];
  totalRecords: number;
  activeSessions: number;
  lastBackup: string | null;
  storageUsed: number;
}

const SystemStatusSettings = () => {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchSystemStats = async () => {
    setLoading(true);
    try {
      // Fetch table row counts for main tables
      const tableNames = ['leads', 'contacts', 'accounts', 'deals', 'meetings', 'tasks', 'email_history'];
      const tableStats: TableStats[] = [];
      let totalRecords = 0;

      for (const tableName of tableNames) {
        const { count } = await supabase
          .from(tableName as any)
          .select('*', { count: 'exact', head: true });
        
        const rowCount = count || 0;
        tableStats.push({ table_name: tableName, row_count: rowCount });
        totalRecords += rowCount;
      }

      // Fetch active sessions count
      const { count: sessionCount } = await supabase
        .from('user_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);

      // Fetch last backup
      const { data: lastBackupData } = await supabase
        .from('backups')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // Estimate storage (rough calculation based on records)
      const estimatedStorageMB = totalRecords * 0.001; // ~1KB per record average

      setStats({
        tables: tableStats,
        totalRecords,
        activeSessions: sessionCount || 0,
        lastBackup: lastBackupData?.created_at || null,
        storageUsed: estimatedStorageMB,
      });

      setLastRefresh(new Date());
    } catch (error) {
      console.error('Error fetching system stats:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSystemStats();
  }, []);

  const getHealthStatus = () => {
    if (!stats) return { status: 'unknown', color: 'text-muted-foreground' };
    
    // Simple health check based on data availability
    if (stats.totalRecords > 0) {
      return { status: 'Healthy', color: 'text-green-500' };
    }
    return { status: 'No Data', color: 'text-yellow-500' };
  };

  const healthStatus = getHealthStatus();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">System Status</h3>
          <p className="text-sm text-muted-foreground">
            Monitor system health and resource usage
          </p>
        </div>
        <Button variant="outline" onClick={fetchSystemStats} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Health Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium">System Health</span>
              </div>
              <Badge variant={healthStatus.status === 'Healthy' ? 'default' : 'secondary'}>
                {loading ? 'Checking...' : healthStatus.status}
              </Badge>
            </div>
            <div className="mt-2 flex items-center gap-2">
              {healthStatus.status === 'Healthy' ? (
                <CheckCircle className="h-8 w-8 text-green-500" />
              ) : (
                <AlertCircle className="h-8 w-8 text-yellow-500" />
              )}
              <span className={`text-lg font-semibold ${healthStatus.color}`}>
                {healthStatus.status}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Database className="h-5 w-5" />
              <span className="text-sm font-medium">Total Records</span>
            </div>
            <p className="text-3xl font-bold mt-2">
              {loading ? '...' : stats?.totalRecords.toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="h-5 w-5" />
              <span className="text-sm font-medium">Active Sessions</span>
            </div>
            <p className="text-3xl font-bold mt-2">
              {loading ? '...' : stats?.activeSessions}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground">
              <HardDrive className="h-5 w-5" />
              <span className="text-sm font-medium">Est. Storage</span>
            </div>
            <p className="text-3xl font-bold mt-2">
              {loading ? '...' : `${stats?.storageUsed.toFixed(2)} MB`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Database Tables */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database Tables
          </CardTitle>
          <CardDescription>Record counts for main CRM tables</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {stats?.tables.map((table) => {
                const percentage = stats.totalRecords > 0 
                  ? (table.row_count / stats.totalRecords) * 100 
                  : 0;
                
                return (
                  <div key={table.table_name} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium capitalize">
                        {table.table_name.replace('_', ' ')}
                      </span>
                      <span className="text-muted-foreground">
                        {table.row_count.toLocaleString()} records
                      </span>
                    </div>
                    <Progress value={percentage} className="h-2" />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* System Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            System Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Last Backup</span>
              </div>
              <span className="text-sm font-medium">
                {stats?.lastBackup 
                  ? format(new Date(stats.lastBackup), 'MMM d, yyyy HH:mm')
                  : 'Never'}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Last Refreshed</span>
              </div>
              <span className="text-sm font-medium">
                {format(lastRefresh, 'HH:mm:ss')}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SystemStatusSettings;