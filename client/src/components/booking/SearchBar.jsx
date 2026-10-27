import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/button';
import { Calendar, Users, MapPin, Search } from 'lucide-react';
import { toUtcDateString } from '../../lib/utils';

export default function SearchBar({
  initialProperty = '',
  initialCheckIn = '',
  initialCheckOut = '',
  initialGuests = 2,
  onSearch,
  properties = [],
}) {
  const navigate = useNavigate();

  // Default to tomorrow and 3 days later if not set
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const threeDaysLater = new Date();
  threeDaysLater.setDate(threeDaysLater.getDate() + 4);

  const [propertyId, setPropertyId] = useState(initialProperty || '');
  const [checkIn, setCheckIn] = useState(initialCheckIn || toUtcDateString(tomorrow));
  const [checkOut, setCheckOut] = useState(initialCheckOut || toUtcDateString(threeDaysLater));
  const [guests, setGuests] = useState(initialGuests || 2);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (onSearch) {
      onSearch({ propertyId, checkIn, checkOut, guests });
    } else {
      const params = new URLSearchParams();
      if (propertyId) params.append('property_id', propertyId);
      if (checkIn) params.append('check_in', checkIn);
      if (checkOut) params.append('check_out', checkOut);
      if (guests) params.append('guests', guests);
      navigate(`/explore?${params.toString()}`);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-card/95 backdrop-blur-md p-3 sm:p-4 rounded-3xl border border-border/80 shadow-soft-lg flex flex-col md:flex-row items-center gap-3 w-full"
    >
      {/* Property Selector */}
      <div className="flex-1 w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-muted/40 hover:bg-muted/70 transition-colors">
        <MapPin className="h-5 w-5 text-primary shrink-0" />
        <div className="flex flex-col w-full text-left">
          <label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
            Destination / Property
          </label>
          <select
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            className="bg-transparent text-sm font-semibold text-foreground focus:outline-none cursor-pointer w-full dark:[color-scheme:dark] [color-scheme:light] [&>option]:bg-white [&>option]:text-slate-900 dark:[&>option]:bg-slate-900 dark:[&>option]:text-slate-100"
          >
            <option value="" className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100">
              All Destinations
            </option>
            {properties.map((p) => (
              <option
                key={p.property_id}
                value={p.property_id}
                className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100"
              >
                {p.name} ({p.city})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Check-In Date */}
      <div className="w-full md:w-44 flex items-center gap-3 px-4 py-3 rounded-2xl bg-muted/40 hover:bg-muted/70 transition-colors">
        <Calendar className="h-5 w-5 text-primary shrink-0" />
        <div className="flex flex-col text-left">
          <label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
            Check-In
          </label>
          <input
            type="date"
            value={checkIn}
            min={toUtcDateString(new Date())}
            onChange={(e) => setCheckIn(e.target.value)}
            className="bg-transparent text-sm font-semibold text-foreground focus:outline-none cursor-pointer dark:[color-scheme:dark] [color-scheme:light]"
            required
          />
        </div>
      </div>

      {/* Check-Out Date */}
      <div className="w-full md:w-44 flex items-center gap-3 px-4 py-3 rounded-2xl bg-muted/40 hover:bg-muted/70 transition-colors">
        <Calendar className="h-5 w-5 text-primary shrink-0" />
        <div className="flex flex-col text-left">
          <label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
            Check-Out
          </label>
          <input
            type="date"
            value={checkOut}
            min={checkIn || toUtcDateString(new Date())}
            onChange={(e) => setCheckOut(e.target.value)}
            className="bg-transparent text-sm font-semibold text-foreground focus:outline-none cursor-pointer dark:[color-scheme:dark] [color-scheme:light]"
            required
          />
        </div>
      </div>

      {/* Guests Selector */}
      <div className="w-full md:w-36 flex items-center gap-3 px-4 py-3 rounded-2xl bg-muted/40 hover:bg-muted/70 transition-colors">
        <Users className="h-5 w-5 text-primary shrink-0" />
        <div className="flex flex-col text-left">
          <label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
            Guests
          </label>
          <select
            value={guests}
            onChange={(e) => setGuests(Number(e.target.value))}
            className="bg-transparent text-sm font-semibold text-foreground focus:outline-none cursor-pointer dark:[color-scheme:dark] [color-scheme:light] [&>option]:bg-white [&>option]:text-slate-900 dark:[&>option]:bg-slate-900 dark:[&>option]:text-slate-100"
          >
            {[1, 2, 3, 4, 5, 6].map((num) => (
              <option
                key={num}
                value={num}
                className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100"
              >
                {num} {num === 1 ? 'Guest' : 'Guests'}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Search Button */}
      <Button
        type="submit"
        variant="gold"
        className="w-full md:w-auto h-14 px-8 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-glow hover:scale-[1.02] transition-transform"
      >
        <Search className="h-5 w-5" />
        <span>Search</span>
      </Button>
    </form>
  );
}
