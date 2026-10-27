import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { getErrorMessage } from '../lib/api';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { EmptyState } from '../components/ui/empty-state';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../components/ui/dialog';
import { formatPaise, formatDate, calculateNights } from '../lib/utils';
import {
  CalendarDays,
  MapPin,
  Clock,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  XCircle,
  HelpCircle,
} from 'lucide-react';
import { toast } from 'sonner';

export default function MyBookingsPage() {
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ALL');
  const navigate = useNavigate();

  // Cancel dialog state
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [selectedResv, setSelectedResv] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [cancelPreview, setCancelPreview] = useState(null);
  const [cancelError, setCancelError] = useState(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const fetchBookings = useCallback(async () => {
    try {
      const res = await api.get('/reservations');
      setReservations(res.data.reservations || []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to retrieve your bookings.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  // Open cancellation modal and load cancellation preview from server
  const handleOpenCancelDialog = async (resv) => {
    setSelectedResv(resv);
    setCancelPreview(null);
    setCancelError(null);
    setCancelModalOpen(true);
    setPreviewLoading(true);

    try {
      const res = await api.get(`/reservations/${resv.reservation_id}/cancellation-preview`);
      setCancelPreview(res.data);
    } catch (err) {
      setCancelError(getErrorMessage(err, 'Could not retrieve cancellation preview.'));
    } finally {
      setPreviewLoading(false);
    }
  };

  // Confirm cancellation
  const handleConfirmCancel = async () => {
    if (!selectedResv) return;

    setIsCancelling(true);
    try {
      const res = await api.post(`/reservations/${selectedResv.reservation_id}/cancel`);
      toast.success(res.data.message || 'Reservation cancelled successfully.');
      setCancelModalOpen(false);
      setSelectedResv(null);
      fetchBookings();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to cancel reservation.'));
    } finally {
      setIsCancelling(false);
    }
  };

  // Helper for status badge
  const renderStatusBadge = (status) => {
    switch (status) {
      case 'CONFIRMED':
        return <Badge variant="success">Confirmed</Badge>;
      case 'CHECKED_IN':
        return <Badge variant="info">Checked In</Badge>;
      case 'CHECKED_OUT':
        return <Badge variant="secondary">Checked Out</Badge>;
      case 'PENDING':
        return <Badge variant="warning">Hold (Pending Payment)</Badge>;
      case 'CANCELLED':
        return <Badge variant="destructive">Cancelled</Badge>;
      case 'REFUND_PENDING':
        return <Badge variant="warning">Refund Pending</Badge>;
      case 'REFUNDED':
        return <Badge variant="default">Refunded</Badge>;
      case 'EXPIRED':
        return <Badge variant="outline">Expired Hold</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Filter reservations based on active tab
  const filteredReservations = reservations.filter((r) => {
    if (activeTab === 'CONFIRMED') return ['CONFIRMED', 'CHECKED_IN'].includes(r.status);
    if (activeTab === 'COMPLETED') return r.status === 'CHECKED_OUT';
    if (activeTab === 'CANCELLED') return ['CANCELLED', 'REFUND_PENDING', 'REFUNDED', 'EXPIRED'].includes(r.status);
    return true;
  });

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8 max-w-5xl">
      {/* Page Title */}
      <div>
        <h1 className="text-3xl font-extrabold text-foreground tracking-tight">
          My Reservations & Stays
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review your upcoming getaways, view digital check-in passes, or manage cancellations.
        </p>
      </div>

      {/* Filter Tabs */}
      <div className="flex border-b border-border space-x-4 text-sm font-semibold">
        {[
          { id: 'ALL', label: `All Stays (${reservations.length})` },
          { id: 'CONFIRMED', label: 'Confirmed & Active' },
          { id: 'COMPLETED', label: 'Past Stays' },
          { id: 'CANCELLED', label: 'Cancelled & Refunds' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`pb-3 transition-colors relative ${
              activeTab === tab.id
                ? 'text-primary border-b-2 border-primary font-bold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Bookings List */}
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-44 w-full rounded-3xl" />
          <Skeleton className="h-44 w-full rounded-3xl" />
        </div>
      ) : filteredReservations.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No Reservations in this Category"
          description="You don't have any bookings matching this filter. Explore our curated boutique stays to plan your next retreat."
          actionLabel="Find a Stay"
          onAction={() => navigate('/explore')}
        />
      ) : (
        <div className="space-y-6">
          {filteredReservations.map((resv) => (
            <Card
              key={resv.reservation_id}
              className="p-6 rounded-3xl border-border/80 shadow-soft hover:shadow-soft-lg transition-all bg-card"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border/80">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-muted-foreground">
                      {resv.reservation_number}
                    </span>
                    {renderStatusBadge(resv.status)}
                  </div>
                  <h3 className="text-xl font-bold text-foreground">
                    {resv.property_name || 'Boutique Hotel'}
                  </h3>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-primary" />
                    Room {resv.room_number || resv.room_id} • {resv.guests_count} Guests
                  </p>
                </div>

                <div className="text-left md:text-right">
                  <span className="text-xs text-muted-foreground">Total Paid</span>
                  <p className="text-xl font-black text-primary">
                    {formatPaise(resv.total_amount)}
                  </p>
                </div>
              </div>

              {/* Booking Metadata & Action Bar */}
              <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-6 text-xs text-muted-foreground">
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-muted-foreground">Check-In</span>
                    <span className="font-semibold text-foreground">{formatDate(resv.check_in_date)}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-muted-foreground">Check-Out</span>
                    <span className="font-semibold text-foreground">{formatDate(resv.check_out_date)}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-muted-foreground">Nights</span>
                    <span className="font-semibold text-foreground">
                      {calculateNights(resv.check_in_date, resv.check_out_date)} Nights
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  {resv.status === 'PENDING' && (
                    <Button
                      size="sm"
                      variant="gold"
                      onClick={() => navigate(`/checkout/${resv.reservation_id}`)}
                      className="rounded-xl font-bold"
                    >
                      Complete Payment
                    </Button>
                  )}

                  {['CONFIRMED', 'PENDING'].includes(resv.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenCancelDialog(resv)}
                      className="rounded-xl text-destructive hover:bg-destructive/10 text-xs"
                    >
                      Cancel Reservation
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Cancellation Dialog with Live Preview */}
      <Dialog open={cancelModalOpen} onOpenChange={setCancelModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Cancel Reservation
            </DialogTitle>
            <DialogDescription>
              Review the refund breakdown computed server-side from your check-in date before confirming.
            </DialogDescription>
          </DialogHeader>

          {previewLoading ? (
            <div className="py-6 space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : cancelError ? (
            <div className="p-4 rounded-xl bg-destructive/10 text-destructive text-xs">
              {cancelError}
            </div>
          ) : cancelPreview ? (
            <div className="space-y-4 py-2 text-xs">
              {/* Applicable Tier Badge */}
              <div className="p-3.5 rounded-2xl bg-muted/50 border border-border space-y-1">
                <span className="text-[10px] uppercase font-bold text-muted-foreground">
                  Applicable Policy
                </span>
                <p className="font-bold text-foreground text-sm">
                  {cancelPreview.policy?.policy_tier || 'Cancellation Policy Tier'}
                </p>
                <p className="text-muted-foreground text-[11px]">
                  {cancelPreview.policy?.tier_description}
                </p>
              </div>

              {/* Financial Calculation Breakdown */}
              <div className="p-4 rounded-2xl bg-card border border-border space-y-2">
                <div className="flex justify-between text-muted-foreground">
                  <span>Paid Amount:</span>
                  <span className="font-semibold text-foreground">
                    {formatPaise(cancelPreview.original_amount)}
                  </span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Cancellation Fee ({cancelPreview.cancellation_fee_percentage}%):</span>
                  <span className="text-destructive font-semibold">
                    -{formatPaise(cancelPreview.cancellation_fee)}
                  </span>
                </div>
                <div className="pt-2 border-t border-border flex justify-between font-extrabold text-sm text-foreground">
                  <span>Calculated Refund:</span>
                  <span className="text-emerald-600 dark:text-emerald-400 text-base">
                    {formatPaise(cancelPreview.refund_amount)}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Cancelling will permanently release this room hold. If eligible for a refund, it will be queued to the original payment source.
              </p>
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setCancelModalOpen(false)}
              disabled={isCancelling}
              className="rounded-xl text-xs"
            >
              Keep Reservation
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmCancel}
              disabled={isCancelling || previewLoading || !!cancelError}
              className="rounded-xl text-xs font-bold"
            >
              {isCancelling ? 'Processing...' : 'Confirm Cancellation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
