import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api, { getErrorMessage } from '../lib/api';
import SearchBar from '../components/booking/SearchBar';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { EmptyState } from '../components/ui/empty-state';
import { getRoomTypeImages } from '../lib/unsplash';
import { formatPaise, toUtcDateString, calculateNights } from '../lib/utils';
import { Users, Bed, Layers, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function SearchResultsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const propertyIdParam = searchParams.get('property_id') || '';
  const checkInParam = searchParams.get('check_in') || '';
  const checkOutParam = searchParams.get('check_out') || '';
  const guestsParam = Number(searchParams.get('guests')) || 2;

  const [properties, setProperties] = useState([]);
  const [availableRooms, setAvailableRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initialize dates if empty
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const threeDaysLater = new Date();
  threeDaysLater.setDate(threeDaysLater.getDate() + 4);

  const checkIn = checkInParam || toUtcDateString(tomorrow);
  const checkOut = checkOutParam || toUtcDateString(threeDaysLater);
  const guests = guestsParam || 2;
  const nights = calculateNights(checkIn, checkOut);

  // Load properties list for the filter bar
  useEffect(() => {
    api.get('/properties')
      .then((res) => setProperties(res.data.properties || []))
      .catch((err) => console.error('Failed to load properties:', err));
  }, []);

  const searchRooms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams();
      if (propertyIdParam) queryParams.append('property_id', propertyIdParam);
      queryParams.append('check_in', checkIn);
      queryParams.append('check_out', checkOut);
      queryParams.append('guests', guests);

      const res = await api.get(`/rooms/search?${queryParams.toString()}`);
      setAvailableRooms(res.data.available_rooms || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to fetch available rooms. Please adjust your criteria.'));
      setAvailableRooms([]);
    } finally {
      setLoading(false);
    }
  }, [propertyIdParam, checkIn, checkOut, guests]);

  useEffect(() => {
    searchRooms();
  }, [searchRooms]);

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Search Header Bar */}
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight">
            Available Rooms & Suites
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Displaying live availability for stays from{' '}
            <span className="font-semibold text-foreground">{checkIn}</span> to{' '}
            <span className="font-semibold text-foreground">{checkOut}</span> ({nights} {nights === 1 ? 'night' : 'nights'})
          </p>
        </div>

        <SearchBar
          initialProperty={propertyIdParam}
          initialCheckIn={checkIn}
          initialCheckOut={checkOut}
          initialGuests={guests}
          properties={properties}
        />
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive flex items-center gap-3 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Results Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="overflow-hidden rounded-3xl">
              <Skeleton className="h-60 w-full" />
              <div className="p-6 space-y-3">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-10 w-full mt-4" />
              </div>
            </Card>
          ))}
        </div>
      ) : availableRooms.length === 0 ? (
        <EmptyState
          icon={Bed}
          title="No Available Rooms Found"
          description="All rooms matching your selected dates or guest capacity are currently booked or undergoing maintenance. Please select alternate dates or browse another property."
          actionLabel="View All Properties"
          onAction={() => navigate('/explore')}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {availableRooms.map((room) => {
            const images = getRoomTypeImages(room.room_type?.room_type_id);
            const quote = room.pricing_quote;

            return (
              <Card
                key={room.room_id}
                className="overflow-hidden rounded-3xl border-border/80 hover:shadow-soft-lg transition-all duration-300 flex flex-col justify-between group"
              >
                <div>
                  {/* Photo Header */}
                  <div className="relative h-60 w-full overflow-hidden">
                    <img
                      src={images.primary}
                      alt={room.room_type?.name || 'Room'}
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

                    <div className="absolute top-3 left-3">
                      <Badge className="bg-black/60 text-white backdrop-blur-md border-white/20 gap-1 text-xs">
                        <CheckCircle2 className="h-3 w-3 text-emerald-400" /> Available
                      </Badge>
                    </div>

                    <div className="absolute bottom-3 left-4 right-4 text-white">
                      <p className="text-xs uppercase font-bold tracking-wider text-amber-400">
                        {room.property?.name}
                      </p>
                      <h3 className="text-xl font-bold leading-tight">
                        {room.room_type?.name}
                      </h3>
                      <p className="text-xs text-slate-300 mt-0.5">
                        Room {room.room_number} • Floor {room.floor}
                      </p>
                    </div>
                  </div>

                  {/* Card Content */}
                  <CardContent className="p-6 space-y-4">
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5 font-medium">
                        <Users className="h-4 w-4 text-primary" />
                        Up to {room.max_guests} Guests
                      </span>
                      <span className="flex items-center gap-1.5 font-medium">
                        <Layers className="h-4 w-4 text-primary" />
                        Floor {room.floor}
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {room.room_type?.description ||
                        'Elegantly appointed boutique quarters with premium plush bedding, en-suite marble bath, and dedicated concierge services.'}
                    </p>

                    {/* Pricing Breakdown Preview */}
                    {quote && (
                      <div className="rounded-2xl bg-muted/40 p-3.5 space-y-1 text-xs">
                        <div className="flex justify-between text-muted-foreground">
                          <span>Nightly average</span>
                          <span className="font-semibold text-foreground">
                            {formatPaise(Math.round(quote.base_amount / (quote.nights_count || quote.nights || nights || 1)))}
                          </span>
                        </div>
                        {quote.weekend_surcharge_amount > 0 && (
                          <div className="flex justify-between text-amber-600 dark:text-amber-400">
                            <span>Weekend surcharge</span>
                            <span>+{formatPaise(quote.weekend_surcharge_amount)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-muted-foreground">
                          <span>Taxes & fees</span>
                          <span>{formatPaise(quote.tax_amount + quote.service_fee)}</span>
                        </div>
                        <div className="pt-1.5 border-t border-border/80 flex justify-between font-bold text-sm text-foreground">
                          <span>Total ({quote.nights_count || quote.nights || nights} nights)</span>
                          <span className="text-primary">{formatPaise(quote.total_amount)}</span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </div>

                {/* Card Action Footer */}
                <div className="p-6 pt-0">
                  <Button
                    variant="gold"
                    onClick={() =>
                      navigate(
                        `/rooms/${room.room_id}?property_id=${room.property_id}&check_in=${checkIn}&check_out=${checkOut}&guests=${guests}`
                      )
                    }
                    className="w-full rounded-2xl font-bold shadow-soft"
                  >
                    Select & Reserve
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
