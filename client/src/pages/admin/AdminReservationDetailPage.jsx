import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { formatPaise, formatDate, calculateNights } from '../../lib/utils';
import {
  CalendarDays,
  User,
  MapPin,
  Clock,
  CreditCard,
  RotateCcw,
  CheckCircle2,
  XCircle,
  LogIn,
  LogOut as CheckOutIcon,
  ChevronLeft,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';

export default function AdminReservationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [reservation, setReservation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);

  const fetchReservation = useCallback(async () => {
    try {
      const res = await api.get(`/admin/reservations/${id}`);
      setReservation(res.data.reservation);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to fetch reservation details.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchReservation();
  }, [fetchReservation]);

  // Transition actions
  const handleCheckIn = async () => {
    setIsActing(true);
    try {
      await api.post(`/reservations/${reservation.reservation_id}/check-in`);
      toast.success('Guest successfully checked in!');
      fetchReservation();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Check-in failed.'));
    } finally {
      setIsActing(false);
    }
  };

  const handleCheckOut = async () => {
    setIsActing(true);
    try {
      await api.post(`/reservations/${reservation.reservation_id}/check-out`);
      toast.success('Guest successfully checked out!');
      fetchReservation();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Check-out failed.'));
    } finally {
      setIsActing(false);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm('Are you sure you want to cancel this reservation? Inventory will be released.')) return;
    setIsActing(true);
    try {
      await api.post(`/reservations/${reservation.reservation_id}/cancel`);
      toast.success('Reservation cancelled successfully.');
      fetchReservation();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Cancellation failed.'));
    } finally {
      setIsActing(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-4xl">
        <Skeleton className="h-10 w-64 rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-3xl" />
      </div>
    );
  }

  if (!reservation) {
    return (
      <div className="text-center py-12 space-y-4">
        <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
        <h2 className="text-xl font-bold">Reservation Not Found</h2>
        <Button onClick={() => navigate('/admin/reservations')} variant="outline">
          Back to List
        </Button>
      </div>
    );
  }

  const status = reservation.status;

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Top Navigation & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/admin/reservations')}
            className="rounded-xl h-9 px-2 text-muted-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-muted-foreground">
                {reservation.reservation_number}
              </span>
              <Badge variant="outline">{status}</Badge>
            </div>
            <h1 className="text-2xl font-extrabold text-foreground tracking-tight">
              Reservation Details
            </h1>
          </div>
        </div>

        {/* State Machine Transition Action Bar */}
        <div className="flex flex-wrap items-center gap-2">
          {status === 'CONFIRMED' && (
            <>
              <Button
                variant="default"
                size="sm"
                onClick={handleCheckIn}
                disabled={isActing}
                className="rounded-xl font-bold gap-1.5"
              >
                <LogIn className="h-4 w-4" /> Check In Guest
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
                disabled={isActing}
                className="rounded-xl text-destructive hover:bg-destructive/10 text-xs"
              >
                Cancel Stay
              </Button>
            </>
          )}

          {status === 'CHECKED_IN' && (
            <Button
              variant="default"
              size="sm"
              onClick={handleCheckOut}
              disabled={isActing}
              className="rounded-xl font-bold gap-1.5"
            >
              <CheckOutIcon className="h-4 w-4" /> Check Out Guest
            </Button>
          )}

          {status === 'PENDING' && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleCancel}
              disabled={isActing}
              className="rounded-xl font-bold"
            >
              Cancel Hold
            </Button>
          )}

          {status === 'REFUND_PENDING' && (
            <Button
              variant="gold"
              size="sm"
              onClick={() => navigate('/admin/refunds')}
              className="rounded-xl font-bold gap-1.5"
            >
              <RotateCcw className="h-4 w-4" /> Go to Refund Queue
            </Button>
          )}

          {['CHECKED_OUT', 'CANCELLED', 'REFUNDED', 'EXPIRED'].includes(status) && (
            <span className="text-xs text-muted-foreground italic">
              Terminal status ({status}). No further state transitions allowed.
            </span>
          )}
        </div>
      </div>

      {/* Grid: Overview & Financials */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Details (Left 2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Guest Information */}
          <Card className="rounded-3xl border-border p-6 bg-card shadow-soft space-y-4">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <User className="h-4 w-4 text-primary" /> Primary Guest Information
            </h3>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase font-bold">Name</span>
                <span className="font-semibold text-foreground text-sm">
                  {reservation.guest?.first_name} {reservation.guest?.last_name || ''}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase font-bold">Guest ID</span>
                <span className="font-mono text-foreground">{reservation.guest_id}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase font-bold">Email</span>
                <span className="text-foreground">{reservation.guest?.email || 'N/A'}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase font-bold">Phone</span>
                <span className="text-foreground">{reservation.guest?.phone || 'N/A'}</span>
              </div>
            </div>
          </Card>

          {/* Stay & Room Details */}
          <Card className="rounded-3xl border-border p-6 bg-card shadow-soft space-y-4">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" /> Stay Itinerary
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase font-bold">Property</span>
                <span className="font-bold text-foreground">{reservation.property_name || reservation.property_id}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase font-bold">Room Assigned</span>
                <span className="font-bold text-foreground">Room {reservation.room_number || reservation.room_id}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase font-bold">Guests Count</span>
                <span className="font-semibold text-foreground">{reservation.guests_count} Guests</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase font-bold">Check-In</span>
                <span className="font-semibold text-foreground">{formatDate(reservation.check_in_date)}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase font-bold">Check-Out</span>
                <span className="font-semibold text-foreground">{formatDate(reservation.check_out_date)}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase font-bold">Nights</span>
                <span className="font-semibold text-foreground">
                  {calculateNights(reservation.check_in_date, reservation.check_out_date)} Nights
                </span>
              </div>
            </div>
          </Card>
        </div>

        {/* Financial Breakdown (Right Column) */}
        <div className="space-y-6">
          <Card className="rounded-3xl border-border p-6 bg-card shadow-soft space-y-4">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" /> Financial Accounting
            </h3>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Base Amount</span>
                <span>{formatPaise(reservation.base_amount)}</span>
              </div>
              {reservation.discount_amount > 0 && (
                <div className="flex justify-between text-emerald-600 font-bold">
                  <span>Coupon Discount</span>
                  <span>-{formatPaise(reservation.discount_amount)}</span>
                </div>
              )}
              <div className="flex justify-between text-muted-foreground">
                <span>GST Tax (12%)</span>
                <span>{formatPaise(reservation.tax_amount)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Service Fee</span>
                <span>{formatPaise(reservation.service_fee)}</span>
              </div>
              <div className="pt-3 border-t border-border flex justify-between font-black text-sm text-foreground">
                <span>Total Amount</span>
                <span className="text-primary text-base">{formatPaise(reservation.total_amount)}</span>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-muted/40 text-[11px] text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground">Database Verification</p>
              <p>Values strictly stored as integer paise to prevent floating-point discrepancies.</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
