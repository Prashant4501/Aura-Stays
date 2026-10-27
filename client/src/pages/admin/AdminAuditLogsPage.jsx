import React, { useEffect, useState, useCallback } from 'react';
import api, { getErrorMessage } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Skeleton } from '../../components/ui/skeleton';
import { formatDate } from '../../lib/utils';
import { History, Search, Shield, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', page);
      params.append('limit', 20);
      if (actionFilter) params.append('action', actionFilter);
      if (entityTypeFilter) params.append('entity_type', entityTypeFilter);

      const res = await api.get(`/admin/audit-logs?${params.toString()}`);
      setLogs(res.data.audit_logs || []);
      setPagination(res.data.pagination || { total: 0, pages: 1 });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to fetch audit logs.'));
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, entityTypeFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground tracking-tight">
            System Audit Trail & Security Logs
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Immutable log of state machine transitions, financial authorizations, room updates, and admin actions.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setLoading(true);
            fetchLogs();
          }}
          className="rounded-xl font-bold flex items-center gap-1.5 self-start sm:self-auto"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh Logs
        </Button>
      </div>

      {/* Filter Bar */}
      <Card className="rounded-3xl border-border p-4 bg-card shadow-soft flex flex-wrap gap-3 items-center">
        <select
          value={actionFilter}
          onChange={(e) => {
            setActionFilter(e.target.value);
            setPage(1);
          }}
          className="h-10 px-3 rounded-xl border border-input bg-background text-xs font-semibold focus:outline-none"
        >
          <option value="">All Actions</option>
          <option value="RESERVATION_CREATED">RESERVATION_CREATED</option>
          <option value="PAYMENT_CREATED">PAYMENT_CREATED</option>
          <option value="RESERVATION_STATUS_TRANSITION">RESERVATION_STATUS_TRANSITION</option>
          <option value="REFUND_PROCESSED">REFUND_PROCESSED</option>
          <option value="ROOM_DATES_BLOCKED">ROOM_DATES_BLOCKED</option>
          <option value="ROOM_DATES_UNBLOCKED">ROOM_DATES_UNBLOCKED</option>
          <option value="COUPON_CREATED">COUPON_CREATED</option>
          <option value="PROPERTY_CREATED">PROPERTY_CREATED</option>
        </select>

        <select
          value={entityTypeFilter}
          onChange={(e) => {
            setEntityTypeFilter(e.target.value);
            setPage(1);
          }}
          className="h-10 px-3 rounded-xl border border-input bg-background text-xs font-semibold focus:outline-none"
        >
          <option value="">All Entity Types</option>
          <option value="RESERVATION">RESERVATION</option>
          <option value="PAYMENT">PAYMENT</option>
          <option value="REFUND">REFUND</option>
          <option value="ROOM">ROOM</option>
          <option value="COUPON">COUPON</option>
          <option value="PROPERTY">PROPERTY</option>
        </select>
      </Card>

      {/* Audit Logs Table */}
      <Card className="rounded-3xl border-border overflow-hidden shadow-soft">
        {loading ? (
          <div className="p-8 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 border-b border-border text-muted-foreground uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Audit ID</th>
                  <th className="py-3.5 px-4">Timestamp (UTC)</th>
                  <th className="py-3.5 px-4">Actor</th>
                  <th className="py-3.5 px-4">Action</th>
                  <th className="py-3.5 px-4">Entity</th>
                  <th className="py-3.5 px-4">Metadata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted-foreground">
                      No audit logs found for this filter.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.audit_id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-foreground">
                        {log.audit_id}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">
                        {new Date(log.created_at).toISOString().replace('T', ' ').slice(0, 19)}
                      </td>
                      <td className="py-3 px-4 font-mono font-medium text-foreground">
                        {log.user_id}
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          variant={
                            log.action.includes('CREATED')
                              ? 'success'
                              : log.action.includes('CANCEL') || log.action.includes('REFUND')
                              ? 'warning'
                              : 'outline'
                          }
                        >
                          {log.action}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-foreground block">{log.entity_type}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">{log.entity_id}</span>
                      </td>
                      <td className="py-3 px-4 max-w-xs truncate font-mono text-[10px] text-muted-foreground">
                        {log.metadata ? JSON.stringify(log.metadata) : '{}'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="p-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Showing Page {pagination.page} of {pagination.pages} ({pagination.total} total)
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-8 rounded-lg"
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= pagination.pages}
                onClick={() => setPage((p) => p + 1)}
                className="h-8 rounded-lg"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
