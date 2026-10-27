import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api, { getErrorMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Skeleton } from '../components/ui/skeleton';
import { formatPaise, formatDate, generateIdempotencyKey } from '../lib/utils';
import {
  ShieldCheck,
  Clock,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  CalendarDays,
  User,
  MapPin,
  Lock,
  ArrowRight,
  Download,
  Building,
} from 'lucide-react';
import { toast } from 'sonner';

export default function CheckoutPage() {
  const { reservationId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [reservation, setReservation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(1); // 1: Details, 2: Review, 3: Payment, 4: Confirmation

  // Form details
  const [guestDetails, setGuestDetails] = useState({
    firstName: user?.first_name || '',
    lastName: user?.last_name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    specialRequests: '',
  });

  // Payment method
  const [paymentMethod, setPaymentMethod] = useState('CARD');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentResult, setPaymentResult] = useState(null);

  // Generate once per checkout session
  const idempotencyKey = useMemo(() => generateIdempotencyKey(), []);

  // Countdown timer for 15m hold
  const [secondsRemaining, setSecondsRemaining] = useState(null);

  // Fetch reservation details
  useEffect(() => {
    const fetchReservation = async () => {
      try {
        const res = await api.get(`/reservations/${reservationId}`);
        const data = res.data.reservation;
        setReservation(data);

        // Calculate hold expiry
        if (data.status === 'PENDING' && data.hold_expires_at) {
          const expiryTime = new Date(data.hold_expires_at).getTime();
          const now = Date.now();
          const diff = Math.max(0, Math.floor((expiryTime - now) / 1000));
          setSecondsRemaining(diff);
        } else if (data.status === 'CONFIRMED') {
          setCurrentStep(4);
        }
      } catch (err) {
        toast.error(getErrorMessage(err, 'Failed to retrieve reservation details.'));
      } finally {
        setLoading(false);
      }
    };

    fetchReservation();
  }, [reservationId]);

  // Live timer tick
  useEffect(() => {
    if (secondsRemaining === null || secondsRemaining <= 0) return;

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [secondsRemaining]);

  // Format timer MM:SS
  const formatTime = (secs) => {
    if (secs === null) return '--:--';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Payment submission
  const handlePayNow = async () => {
    if (secondsRemaining === 0) {
      toast.error('Your hold time has expired. Please select new dates.');
      return;
    }

    setIsProcessingPayment(true);
    try {
      const res = await api.post(
        '/payments',
        {
          reservation_id: reservation.reservation_id,
          payment_method: paymentMethod,
        },
        {
          headers: {
            'Idempotency-Key': idempotencyKey,
          },
        }
      );

      setPaymentResult(res.data.payment);
      setCurrentStep(4);
      toast.success('Payment authorized and reservation confirmed!');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Payment processing failed. Please try again.'));
    } finally {
      setIsProcessingPayment(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-4xl space-y-6">
        <Skeleton className="h-12 w-64 rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-3xl" />
      </div>
    );
  }

  if (!reservation) {
    return (
      <div className="container mx-auto px-4 py-16 text-center space-y-4 max-w-md">
        <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
        <h2 className="text-2xl font-bold">Reservation Not Found</h2>
        <p className="text-sm text-muted-foreground">
          The requested reservation does not exist or has already expired.
        </p>
        <Button onClick={() => navigate('/explore')} variant="default">
          Browse Available Stays
        </Button>
      </div>
    );
  }

  const isHoldExpired = secondsRemaining === 0 && reservation.status === 'PENDING';

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8 max-w-5xl">
      {/* 15-Minute Hold Countdown Banner */}
      {reservation.status === 'PENDING' && (
        <div
          className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-3 text-sm font-medium ${
            isHoldExpired
              ? 'bg-destructive/10 border-destructive/20 text-destructive'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300'
          }`}
        >
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 shrink-0" />
            <div>
              {isHoldExpired ? (
                <span>Hold Expired — This reservation hold has ended and rooms have been released.</span>
              ) : (
                <span>
                  Room Hold Active: <strong className="font-extrabold">{formatTime(secondsRemaining)}</strong> remaining to complete payment.
                </span>
              )}
            </div>
          </div>
          {isHoldExpired && (
            <Button size="sm" variant="destructive" onClick={() => navigate('/explore')}>
              Pick Other Dates
            </Button>
          )}
        </div>
      )}

      {/* Stepper Progress Bar */}
      <div className="flex items-center justify-between max-w-2xl mx-auto py-2">
        {[
          { step: 1, label: 'Guest Details' },
          { step: 2, label: 'Review Stay' },
          { step: 3, label: 'Payment' },
          { step: 4, label: 'Confirmation' },
        ].map((s) => (
          <div key={s.step} className="flex flex-col items-center flex-1 relative">
            <div
              className={`h-9 w-9 rounded-full flex items-center justify-center font-bold text-xs transition-colors ${
                currentStep === s.step
                  ? 'bg-primary text-white shadow-soft ring-4 ring-primary/20'
                  : currentStep > s.step
                  ? 'bg-emerald-600 text-white'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {currentStep > s.step ? <CheckCircle2 className="h-4 w-4" /> : s.step}
            </div>
            <span
              className={`text-xs mt-2 font-medium hidden sm:block ${
                currentStep === s.step ? 'text-primary font-bold' : 'text-muted-foreground'
              }`}
            >
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Form & Actions */}
        <div className="lg:col-span-2">
          {/* STEP 1: Guest Details */}
          {currentStep === 1 && (
            <Card className="rounded-3xl border-border p-6 sm:p-8 space-y-6">
              <div>
                <h2 className="text-xl font-bold text-foreground">Guest Information</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  We will send your check-in code and booking confirmation to this address.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">First Name</label>
                  <Input
                    value={guestDetails.firstName}
                    onChange={(e) =>
                      setGuestDetails({ ...guestDetails, firstName: e.target.value })
                    }
                    placeholder="Aditya"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Last Name</label>
                  <Input
                    value={guestDetails.lastName}
                    onChange={(e) =>
                      setGuestDetails({ ...guestDetails, lastName: e.target.value })
                    }
                    placeholder="Sharma"
                    required
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-semibold text-foreground">Email Address</label>
                  <Input
                    type="email"
                    value={guestDetails.email}
                    onChange={(e) =>
                      setGuestDetails({ ...guestDetails, email: e.target.value })
                    }
                    placeholder="aditya@example.com"
                    required
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-semibold text-foreground">Contact Phone</label>
                  <Input
                    type="tel"
                    value={guestDetails.phone}
                    onChange={(e) =>
                      setGuestDetails({ ...guestDetails, phone: e.target.value })
                    }
                    placeholder="+91 98765 43210"
                    required
                  />
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <Button
                  variant="gold"
                  onClick={() => setCurrentStep(2)}
                  className="rounded-2xl font-bold px-8"
                >
                  Continue to Review <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </Card>
          )}

          {/* STEP 2: Review Booking */}
          {currentStep === 2 && (
            <Card className="rounded-3xl border-border p-6 sm:p-8 space-y-6">
              <div>
                <h2 className="text-xl font-bold text-foreground">Review Stay & Details</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Please verify your stay itinerary before proceeding to payment.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-muted/30 border border-border space-y-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Primary Guest:</span>
                  <span className="font-bold text-foreground">
                    {guestDetails.firstName} {guestDetails.lastName} ({guestDetails.email})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Phone Number:</span>
                  <span className="font-bold text-foreground">{guestDetails.phone || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Check-in:</span>
                  <span className="font-bold text-foreground">{formatDate(reservation.check_in_date)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Check-out:</span>
                  <span className="font-bold text-foreground">{formatDate(reservation.check_out_date)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Duration:</span>
                  <span className="font-bold text-foreground">{reservation.nights} Nights</span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-teal-500/10 border border-primary/20 text-xs text-muted-foreground space-y-1">
                <p className="font-bold text-primary flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-primary" /> Flexible Cancellation Policy
                </p>
                <p>Full 100% refund up to 48 hours before check-in; 50% refund between 24 and 48 hours.</p>
              </div>

              <div className="pt-4 flex justify-between">
                <Button variant="outline" onClick={() => setCurrentStep(1)} className="rounded-xl">
                  Back
                </Button>
                <Button
                  variant="gold"
                  onClick={() => setCurrentStep(3)}
                  className="rounded-2xl font-bold px-8"
                >
                  Proceed to Payment <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </Card>
          )}

          {/* STEP 3: Payment */}
          {currentStep === 3 && (
            <Card className="rounded-3xl border-border p-6 sm:p-8 space-y-6">
              <div>
                <h2 className="text-xl font-bold text-foreground">Secure Payment</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Transactions are encrypted and idempotent. Amount is calculated server-side.
                </p>
              </div>

              {/* Payment Methods */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: 'CARD', label: 'Card / Debit' },
                  { id: 'UPI', label: 'UPI / QR' },
                  { id: 'NET_BANKING', label: 'Net Banking' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id)}
                    className={`p-3.5 rounded-2xl border text-xs font-bold transition-all text-center ${
                      paymentMethod === m.id
                        ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/20'
                        : 'border-border bg-card hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    <CreditCard className="h-4 w-4 mx-auto mb-1 text-primary" />
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Mock Payment Details Display */}
              <div className="p-4 rounded-2xl bg-muted/40 border border-border space-y-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Payment Gateway</span>
                  <Badge variant="default">Aura Pay (Mock Sandbox)</Badge>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Idempotency Key</span>
                  <span className="font-mono text-[10px] text-foreground">{idempotencyKey.slice(0, 18)}...</span>
                </div>
                <div className="flex items-center justify-between text-sm font-bold text-foreground pt-2 border-t border-border">
                  <span>Charge Total</span>
                  <span className="text-primary text-base">{formatPaise(reservation.total_amount)}</span>
                </div>
              </div>

              <div className="pt-4 flex justify-between">
                <Button variant="outline" onClick={() => setCurrentStep(2)} className="rounded-xl">
                  Back
                </Button>
                <Button
                  variant="gold"
                  onClick={handlePayNow}
                  disabled={isProcessingPayment || isHoldExpired}
                  className="rounded-2xl font-bold px-8 shadow-soft"
                >
                  {isProcessingPayment
                    ? 'Authorizing...'
                    : `Pay ${formatPaise(reservation.total_amount)}`}
                </Button>
              </div>
            </Card>
          )}

          {/* STEP 4: Confirmation */}
          {currentStep === 4 && (
            <Card className="rounded-3xl border-emerald-500/30 bg-card p-6 sm:p-10 space-y-6 text-center">
              <div className="h-16 w-16 rounded-3xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-8 w-8" />
              </div>

              <div>
                <Badge variant="success" className="mb-2">
                  Reservation Confirmed
                </Badge>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground">
                  You're Going on a Getaway!
                </h2>
                <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                  Your reservation reference is{' '}
                  <strong className="text-foreground font-mono">{reservation.reservation_number}</strong>.
                  A digital confirmation has been registered to your profile.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-muted/30 border border-border max-w-md mx-auto space-y-3 text-xs text-left">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Property:</span>
                  <span className="font-bold text-foreground">{reservation.property?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Room:</span>
                  <span className="font-bold text-foreground">Room {reservation.room?.room_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Dates:</span>
                  <span className="font-bold text-foreground">
                    {formatDate(reservation.check_in_date)} – {formatDate(reservation.check_out_date)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Paid:</span>
                  <span className="font-bold text-primary">{formatPaise(reservation.total_amount)}</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-center gap-3 pt-4">
                <Button variant="default" onClick={() => navigate('/my-bookings')} className="rounded-xl">
                  View My Bookings
                </Button>
                <Button variant="outline" onClick={() => navigate('/')} className="rounded-xl">
                  Back to Home
                </Button>
              </div>
            </Card>
          )}
        </div>

        {/* Right Column: Order Summary */}
        <div className="w-full">
          <Card className="rounded-3xl border-border shadow-soft bg-card p-6 space-y-6">
            <h3 className="text-base font-bold text-foreground">Reservation Summary</h3>

            {/* Room & Property Info */}
            <div className="space-y-1 pb-4 border-b border-border">
              <span className="text-xs uppercase font-bold text-amber-500">
                {reservation.property?.name}
              </span>
              <h4 className="font-bold text-foreground text-sm">
                Room {reservation.room?.room_number} • {reservation.nights} Nights
              </h4>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5 text-primary" />
                {formatDate(reservation.check_in_date)} to {formatDate(reservation.check_out_date)}
              </p>
            </div>

            {/* Price Line Items */}
            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Base Accommodation</span>
                <span>{formatPaise(reservation.base_amount)}</span>
              </div>
              {reservation.discount_amount > 0 && (
                <div className="flex justify-between text-emerald-600 font-bold">
                  <span>Coupon Discount</span>
                  <span>-{formatPaise(reservation.discount_amount)}</span>
                </div>
              )}
              <div className="flex justify-between text-muted-foreground">
                <span>GST (12% Tax)</span>
                <span>{formatPaise(reservation.tax_amount)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Service Fee</span>
                <span>{formatPaise(reservation.service_fee)}</span>
              </div>
              <div className="pt-3 border-t border-border flex justify-between font-extrabold text-sm text-foreground">
                <span>Total Amount</span>
                <span className="text-primary text-base">{formatPaise(reservation.total_amount)}</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-muted/40 text-[11px] text-muted-foreground flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary shrink-0" />
              <span>Payments protected with end-to-end atomic database verification.</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
