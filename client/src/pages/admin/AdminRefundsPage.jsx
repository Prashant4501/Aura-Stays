import React, { useEffect, useState, useCallback } from 'react';
import api, { getErrorMessage } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Card } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { formatPaise, formatDate } from '../../lib/utils';
import { RotateCcw, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminRefundsPage() {
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  const fetchRefunds = useCallback(async () => {
    try {
      const res = await api.get('/refunds');
      setRefunds(res.data.refunds || []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to fetch refunds queue.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRefunds();
  }, [fetchRefunds]);

  const handleProcessRefund = async (refundId) => {
    setProcessingId(refundId);
    try {
      const res = await api.post(`/refunds/${refundId}/process`);
      toast.success(res.data.message || 'Refund successfully processed to original source.');
      fetchRefunds();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to process refund.'));
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground tracking-tight">
            Refunds Queue & Authorization
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Process pending refunds resulting from cancellations. Idempotent and concurrency-safe.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setLoading(true);
            fetchRefunds();
          }}
          className="rounded-xl font-bold flex items-center gap-1.5 self-start sm:self-auto"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh Queue
        </Button>
      </div>

      <Card className="rounded-3xl border-border overflow-hidden shadow-soft">
        {loading ? (
          <div className="p-8 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 border-b border-border text-muted-foreground uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Refund ID</th>
                  <th className="py-3.5 px-4">Reservation ID</th>
                  <th className="py-3.5 px-4">Original Charged</th>
                  <th className="py-3.5 px-4">Refund Amount</th>
                  <th className="py-3.5 px-4">Date Initiated</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {refunds.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground">
                      No refund requests in the queue.
                    </td>
                  </tr>
                ) : (
                  refunds.map((ref) => (
                    <tr key={ref.refund_id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3.5 px-4">
                        <span className="font-mono font-bold text-foreground block">
                          {ref.refund_reference}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {ref.refund_id}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-medium text-foreground">
                        {ref.reservation_id}
                      </td>
                      <td className="py-3.5 px-4 text-muted-foreground">
                        {formatPaise(ref.original_amount)}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-emerald-600 dark:text-emerald-400">
                        {formatPaise(ref.refund_amount)}
                      </td>
                      <td className="py-3.5 px-4 text-muted-foreground">
                        {formatDate(ref.created_at)}
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge
                          variant={
                            ref.status === 'PROCESSED'
                              ? 'success'
                              : ref.status === 'PENDING'
                              ? 'warning'
                              : 'destructive'
                          }
                        >
                          {ref.status}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {ref.status === 'PENDING' ? (
                          <Button
                            size="sm"
                            variant="gold"
                            onClick={() => handleProcessRefund(ref.refund_id)}
                            disabled={processingId === ref.refund_id}
                            className="rounded-xl font-bold text-xs"
                          >
                            {processingId === ref.refund_id ? 'Processing...' : 'Process Refund'}
                          </Button>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">Completed</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
