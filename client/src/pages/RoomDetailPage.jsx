import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import api, { getErrorMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Skeleton } from '../components/ui/skeleton';
import { getRoomTypeImages } from '../lib/unsplash';
import { formatPaise, toUtcDateString, calculateNights } from '../lib/utils';
import {
  Users,
  Layers,
  MapPin,
  Calendar as CalendarIcon,
  CheckCircle2,
  AlertCircle,
  Tag,
  Hotel,
  ConciergeBell,
  ShieldCheck,
  Coffee,
  Wifi,
  Waves,
  Lock,
} from 'lucide-react';
import { toast } from 'sonner';

export default function RoomDetailPage() {
  const { id: roomId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const propertyIdParam = searchParams.get('property_id') || '';
  const checkInParam = searchParams.get('check_in') || '';
  const checkOutParam = searchParams.get('check_out') || '';
  const guestsParam = Number(searchParams.get('guests')) || 2;

  // State
  const [property, setProperty] = useState(null);
  const [room, setRoom] = useState(null);
  const [checkIn, setCheckIn] = useState(checkInParam || '');
  const [checkOut, setCheckOut] = useState(checkOutParam || '');
  const [guests, setGuests] = useState(guestsParam || 2);
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState('');

  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState(null);
  const [couponFeedback, setCouponFeedback] = useState(null);
  const [isAvailable, setIsAvailable] = useState(true);
  const [availabilityMessage, setAvailabilityMessage] = useState(null);
  const [bookedDates, setBookedDates] = useState([]);

  const [isReserving, setIsReserving] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  // Load Room and Property details via new dedicated room endpoint
  useEffect(() => {
    const fetchRoomDetails = async () => {
      try {
        const roomRes = await api.get(`/rooms/${roomId}`);
        setRoom(roomRes.data.room);
        setProperty(roomRes.data.property);
        setBookedDates(roomRes.data.booked_dates || []);
      } catch (err) {
        // Graceful fallback to property endpoint
        try {
          const propId = propertyIdParam || 'PROP-001';
          const propRes = await api.get(`/properties/${propId}`);
          const propData = propRes.data.property;
          setProperty(propData);

          const foundRoom = propData.rooms?.find((r) => r.room_id === roomId) || {
            room_id: roomId,
            room_number: roomId.replace('ROOM-', ''),
            floor: 1,
            max_guests: 3,
            property_id: propData.property_id,
            room_type_id: propData.room_types?.[0]?.room_type_id || 'RTYP-001',
            room_type: propData.room_types?.[0],
          };
          setRoom(foundRoom);
        } catch (propErr) {
          console.error('Failed to load room details:', propErr);
        }
      } finally {
        setPageLoading(false);
      }
    };

    fetchRoomDetails();
  }, [roomId, propertyIdParam]);

  // Fetch trusted live price breakdown from /quote endpoint
  const fetchQuote = useCallback(async () => {
    if (!room || !checkIn || !checkOut) return;

    setQuoteLoading(true);
    setQuoteError(null);

    try {
      const payload = {
        property_id: room.property_id,
        room_id: room.room_id,
        check_in_date: checkIn,
        check_out_date: checkOut,
        guests_count: Number(guests),
      };
      if (appliedCoupon) {
        payload.coupon_code = appliedCoupon;
      }

      const res = await api.post('/reservations/quote', payload);
      setQuote(res.data.quote);

      if (res.data.is_available === false) {
        setIsAvailable(false);
        setAvailabilityMessage('These dates are already reserved for this room. Please choose different dates.');
      } else {
        setIsAvailable(true);
        setAvailabilityMessage(null);
      }

      if (appliedCoupon) {
        if (res.data.quote.discount_amount > 0) {
          setCouponFeedback({
            type: 'success',
            message: `Coupon ${appliedCoupon} applied! You saved ${formatPaise(res.data.quote.discount_amount)}`,
          });
        } else {
          setCouponFeedback({
            type: 'warning',
            message: 'Coupon code accepted, but minimum booking amount not reached.',
          });
        }
      } else {
        setCouponFeedback(null);
      }
    } catch (err) {
      const msg = getErrorMessage(err, 'Could not calculate pricing quote for selected dates.');
      setQuoteError(msg);
      if (err.response?.status === 409) {
        setIsAvailable(false);
        setAvailabilityMessage('These dates were just booked, please pick other dates.');
      }
      if (appliedCoupon) {
        setCouponFeedback({ type: 'error', message: msg });
        setAppliedCoupon('');
      }
    } finally {
      setQuoteLoading(false);
    }
  }, [room, checkIn, checkOut, guests, appliedCoupon]);

  useEffect(() => {
    if (checkIn && checkOut) {
      fetchQuote();
    }
  }, [fetchQuote, checkIn, checkOut]);

  // Handle applying a coupon
  const handleApplyCoupon = (e) => {
    e.preventDefault();
    if (!couponCode.trim()) return;
    setAppliedCoupon(couponCode.trim().toUpperCase());
  };

  const handleRemoveCoupon = () => {
    setCouponCode('');
    setAppliedCoupon('');
    setCouponFeedback(null);
  };

  // Handle creating a reservation
  const handleReserve = async () => {
    if (!isAuthenticated) {
      toast.info('Please sign in or create an account to proceed with your booking.');
      navigate('/login', {
        state: {
          from: `/rooms/${roomId}?property_id=${room.property_id}&check_in=${checkIn}&check_out=${checkOut}&guests=${guests}`,
        },
      });
      return;
    }

    setIsReserving(true);
    try {
      const payload = {
        property_id: room.property_id,
        room_id: room.room_id,
        check_in_date: checkIn,
        check_out_date: checkOut,
        guests_count: Number(guests),
      };
      if (appliedCoupon) {
        payload.coupon_code = appliedCoupon;
      }

      // Explicit security: NEVER send price, total_amount, or discount
      const res = await api.post('/reservations', payload);
      const reservationId = res.data.reservation.reservation_id;

      toast.success('Room held successfully! You have 15 minutes to complete payment.');
      navigate(`/checkout/${reservationId}`);
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to reserve room.');
      toast.error(msg);
      if (err.response?.status === 409) {
        setIsAvailable(false);
        setAvailabilityMessage('These dates were just booked, please pick other dates.');
      }
    } finally {
      setIsReserving(false);
    }
  };

  if (pageLoading) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-6xl space-y-6">
        <Skeleton className="h-12 w-3/4 rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-3xl" />
      </div>
    );
  }

  const images = getRoomTypeImages(room?.room_type?.room_type_id || room?.room_type_id);
  const nights = calculateNights(checkIn, checkOut);

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10 max-w-7xl">
      {/* Title & Location Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest">
          <Hotel className="h-3.5 w-3.5" /> {property?.name || 'Boutique Hotel'}
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
          {room?.room_type?.name || 'Luxury Boutique Suite'}
        </h1>
        <p className="text-sm text-muted-foreground flex items-center gap-1.5">
          <MapPin className="h-4 w-4 text-primary" />
          {property?.address}, {property?.city}, {property?.state || property?.country}
        </p>
      </div>

      {/* High-Resolution Photo Gallery */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 rounded-3xl overflow-hidden shadow-soft-lg">
        <div className="md:col-span-2 h-80 sm:h-[450px] relative overflow-hidden">
          <img
            src={images.primary}
            alt="Suite Primary"
            className="h-full w-full object-cover hover:scale-105 transition-transform duration-700"
          />
        </div>
        <div className="hidden md:flex flex-col gap-4 h-[450px]">
          {images.gallery.slice(0, 2).map((imgUrl, idx) => (
            <div key={idx} className="h-1/2 relative overflow-hidden rounded-2xl">
              <img
                src={imgUrl}
                alt={`Suite View ${idx + 1}`}
                className="h-full w-full object-cover hover:scale-105 transition-transform duration-700"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Main Grid: Details (Left) + Sticky Booking Summary (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 items-start">
        {/* Left Column: Room Details, Amenities, Policies */}
        <div className="lg:col-span-2 space-y-10">
          {/* Key Specs Bar */}
          <div className="flex flex-wrap items-center gap-6 p-6 rounded-2xl bg-card border border-border shadow-soft">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Capacity</p>
                <p className="text-sm font-bold text-foreground">Up to {room?.max_guests} Guests</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                <Layers className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Location</p>
                <p className="text-sm font-bold text-foreground">Floor {room?.floor}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Identifier</p>
                <p className="text-sm font-bold text-foreground">Room {room?.room_number}</p>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-foreground">About This Stay</h3>
            <p className="text-muted-foreground leading-relaxed text-sm sm:text-base">
              {room?.room_type?.description ||
                'Immerse yourself in thoughtfully curated interiors featuring custom hardwood accents, organic cotton linens, and a spa-inspired en-suite bathroom. Crafted for restorative peace and indulgent comfort.'}
            </p>
          </div>

          {/* Amenities */}
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-foreground">Room Amenities</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {[
                { icon: Wifi, label: 'High-speed WiFi' },
                { icon: Coffee, label: 'Gourmet Coffee Bar' },
                { icon: Waves, label: 'Infinity Pool Access' },
                { icon: ShieldCheck, label: 'In-Room Safe' },
                { icon: ConciergeBell, label: 'Daily Turndown Service' },
                { icon: Layers, label: 'Climate Control' },
              ].map((amenity, idx) => {
                const Icon = amenity.icon;
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-3 p-3.5 rounded-2xl bg-muted/30 border border-border/60 text-sm font-medium"
                  >
                    <Icon className="h-4 w-4 text-primary" />
                    <span>{amenity.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Platform Guarantees Banner */}
          <div className="p-6 rounded-3xl bg-teal-500/5 border border-primary/20 space-y-3">
            <h4 className="font-bold text-sm text-primary flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Aura Stays Verified Protection
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              When you reserve this room, a 15-minute hold document is created in our atomic inventory database. No double-bookings, guaranteed. Full refund preview is available anytime prior to cancellation.
            </p>
          </div>
        </div>

        {/* Right Column: Sticky Booking Summary Card with Live Server Quote */}
        <div className="sticky top-28 w-full">
          <Card className="rounded-3xl border-border shadow-soft-lg overflow-hidden bg-card">
            {/* Header with Base Rate */}
            <div className="p-6 border-b border-border/80 bg-muted/20 flex items-baseline justify-between">
              <div>
                <span className="text-2xl font-extrabold text-foreground">
                  {formatPaise(room?.room_type?.base_price_per_night || 450000)}
                </span>
                <span className="text-xs text-muted-foreground font-normal"> / night base</span>
              </div>
              <Badge variant="gold">Best Rate Guaranteed</Badge>
            </div>

            <CardContent className="p-6 space-y-6">
              {/* Date & Guest Selectors */}
              <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl bg-muted/40 border border-border">
                <div className="flex flex-col text-left">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                    Check-In
                  </label>
                  <input
                    type="date"
                    value={checkIn}
                    min={toUtcDateString(new Date())}
                    onChange={(e) => setCheckIn(e.target.value)}
                    className="bg-transparent text-xs font-bold text-foreground focus:outline-none cursor-pointer mt-1"
                  />
                </div>
                <div className="flex flex-col text-left border-l border-border pl-3">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                    Check-Out
                  </label>
                  <input
                    type="date"
                    value={checkOut}
                    min={checkIn || toUtcDateString(new Date())}
                    onChange={(e) => setCheckOut(e.target.value)}
                    className="bg-transparent text-xs font-bold text-foreground focus:outline-none cursor-pointer mt-1"
                  />
                </div>
              </div>

              {/* Guest Count */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-muted/40 border border-border">
                <span className="text-xs font-semibold text-muted-foreground">Guests</span>
                <select
                  value={guests}
                  onChange={(e) => setGuests(Number(e.target.value))}
                  className="bg-transparent text-xs font-bold text-foreground focus:outline-none cursor-pointer dark:[color-scheme:dark] [color-scheme:light] [&>option]:bg-white [&>option]:text-slate-900 dark:[&>option]:bg-slate-900 dark:[&>option]:text-slate-100"
                >
                  {[...Array(room?.max_guests || 3)].map((_, i) => (
                    <option
                      key={i + 1}
                      value={i + 1}
                      className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100"
                    >
                      {i + 1} {i === 0 ? 'Guest' : 'Guests'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Coupon Field with Instant Feedback */}
              <form onSubmit={handleApplyCoupon} className="space-y-2">
                <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5 text-amber-500" /> Have a Promo Code?
                </label>
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g. SUMMER20, FLAT1500"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    disabled={!!appliedCoupon}
                    className="rounded-xl uppercase font-semibold text-xs tracking-wider h-10"
                  />
                  {appliedCoupon ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleRemoveCoupon}
                      className="rounded-xl text-xs h-10 px-3 text-destructive hover:bg-destructive/10"
                    >
                      Remove
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      variant="secondary"
                      size="sm"
                      disabled={!couponCode.trim() || quoteLoading}
                      className="rounded-xl text-xs h-10 px-4 font-bold"
                    >
                      Apply
                    </Button>
                  )}
                </div>

                {couponFeedback && (
                  <div
                    className={`flex items-center gap-2 p-2.5 rounded-xl text-xs font-medium ${
                      couponFeedback.type === 'success'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : couponFeedback.type === 'warning'
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        : 'bg-destructive/10 text-destructive'
                    }`}
                  >
                    {couponFeedback.type === 'success' ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 shrink-0" />
                    )}
                    <span>{couponFeedback.message}</span>
                  </div>
                )}
              </form>

              {/* Availability Alert if room is already booked */}
              {availabilityMessage && (
                <div className="p-3.5 rounded-2xl bg-destructive/15 border border-destructive/30 text-destructive text-xs font-semibold flex items-center gap-2.5 animate-fade-in">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{availabilityMessage}</span>
                </div>
              )}

              {/* Live Price Breakdown from Server Quote */}
              {quoteLoading ? (
                <div className="space-y-2 py-4">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ) : quoteError ? (
                <div className="p-3 rounded-xl bg-destructive/10 text-destructive text-xs flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{quoteError}</span>
                </div>
              ) : quote ? (
                <div className="space-y-2.5 pt-4 border-t border-border text-xs">
                  {/* Nights */}
                  <div className="flex justify-between text-muted-foreground">
                    <span>
                      Accommodation ({quote.nights} {quote.nights === 1 ? 'night' : 'nights'})
                    </span>
                    <span className="font-semibold text-foreground">
                      {formatPaise(quote.base_amount)}
                    </span>
                  </div>

                  {/* Seasonal or Weekend Surcharges */}
                  {quote.weekend_surcharge_amount > 0 && (
                    <div className="flex justify-between text-amber-600 dark:text-amber-400 font-medium">
                      <span>Weekend Surcharge (Fri/Sat)</span>
                      <span>+{formatPaise(quote.weekend_surcharge_amount)}</span>
                    </div>
                  )}

                  {quote.extra_guest_charge > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Extra Guest Surcharge</span>
                      <span>+{formatPaise(quote.extra_guest_charge)}</span>
                    </div>
                  )}

                  {/* Coupon Discount */}
                  {quote.discount_amount > 0 && (
                    <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-bold">
                      <span>Promo Discount ({appliedCoupon})</span>
                      <span>-{formatPaise(quote.discount_amount)}</span>
                    </div>
                  )}

                  {/* Taxes & Fee */}
                  <div className="flex justify-between text-muted-foreground">
                    <span>GST (12% Accommodation Tax)</span>
                    <span>{formatPaise(quote.tax_amount)}</span>
                  </div>

                  <div className="flex justify-between text-muted-foreground">
                    <span>Concierge & Service Fee</span>
                    <span>{formatPaise(quote.service_fee)}</span>
                  </div>

                  {/* Grand Total */}
                  <div className="pt-3 border-t border-border/80 flex items-baseline justify-between text-base font-extrabold text-foreground">
                    <span>Total Amount</span>
                    <span className="text-xl text-primary font-black">
                      {formatPaise(quote.total_amount)}
                    </span>
                  </div>
                </div>
              ) : null}

              {/* Reserve Button */}
              <Button
                variant={isAvailable ? 'gold' : 'secondary'}
                size="lg"
                onClick={handleReserve}
                disabled={isReserving || quoteLoading || !quote || !isAvailable}
                className="w-full rounded-2xl font-bold shadow-soft tracking-wide text-sm"
              >
                {isReserving
                  ? 'Securing Hold...'
                  : !isAvailable
                  ? 'Dates Already Reserved'
                  : 'Reserve with 15-Min Hold'}
              </Button>

              <p className="text-[11px] text-center text-muted-foreground">
                You will not be charged yet. Holds are locked for 15 minutes to guarantee availability.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
