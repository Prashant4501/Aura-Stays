import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import SearchBar from '../components/booking/SearchBar';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { getPropertyImages } from '../lib/unsplash';
import { formatPaise } from '../lib/utils';
import {
  Compass,
  ReceiptText,
  ShieldCheck,
  Clock,
  RotateCcw,
  Star,
  MapPin,
  ArrowRight,
  Wifi,
  Coffee,
  Waves,
} from 'lucide-react';

export default function LandingPage() {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchProperties = async () => {
      try {
        const res = await api.get('/properties');
        setProperties(res.data.properties || []);
      } catch (err) {
        console.error('Failed to load properties:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchProperties();
  }, []);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="relative min-h-[85vh] flex items-center justify-center overflow-hidden px-4 sm:px-6 lg:px-8 py-20">
        {/* Background Image with Dark Vignette */}
        <div
          className="absolute inset-0 z-0 bg-cover bg-center transition-transform duration-1000 scale-105"
          style={{
            backgroundImage: `url('https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=2000&q=85')`,
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-black/40" />
        </div>

        {/* Content */}
        <div className="container relative z-10 mx-auto max-w-5xl text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/40 border border-white/20 backdrop-blur-md text-amber-300 text-xs font-bold tracking-wide uppercase animate-fade-in">
            <Compass className="h-3.5 w-3.5" /> Curated Luxury Stays & Villas
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white drop-shadow-md leading-[1.15]">
            Bespoke Sanctuaries for the{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500">
              Discerning Traveler
            </span>
          </h1>

          <p className="text-base sm:text-xl text-slate-200 max-w-2xl mx-auto font-normal leading-relaxed drop-shadow">
            Experience heritage grandeur, oceanfront tranquility, and authentic hospitality with guaranteed instant reservations.
          </p>

          {/* Floating Search Bar */}
          <div className="pt-4 max-w-4xl mx-auto">
            <SearchBar properties={properties} />
          </div>
        </div>
      </section>

      {/* Featured Properties Collection */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-4">
            <div>
              <Badge variant="gold" className="mb-2">
                Exclusive Portfolio
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
                Featured Boutique Destinations
              </h2>
              <p className="text-muted-foreground mt-2 max-w-xl">
                Immerse yourself in handpicked luxury hotels designed for seamless relaxation and cultural indulgence.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => navigate('/explore')}
              className="self-start md:self-auto gap-2 rounded-xl"
            >
              Browse All Stays <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <Skeleton className="h-[420px] rounded-3xl" />
              <Skeleton className="h-[420px] rounded-3xl" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {properties.map((property) => {
                const images = getPropertyImages(property.property_id);
                return (
                  <Card
                    key={property.property_id}
                    className="group overflow-hidden rounded-3xl border-border/80 hover:shadow-soft-lg transition-all duration-300 cursor-pointer"
                    onClick={() => navigate(`/explore?property_id=${property.property_id}`)}
                  >
                    <div className="relative h-72 w-full overflow-hidden">
                      <img
                        src={images.hero}
                        alt={property.name}
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                      <div className="absolute top-4 right-4">
                        <Badge className="bg-black/50 text-white backdrop-blur-md border-white/20 gap-1.5 px-3 py-1 text-xs">
                          <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" /> 4.95
                        </Badge>
                      </div>

                      <div className="absolute bottom-4 left-4 right-4 text-white">
                        <span className="text-xs uppercase font-bold tracking-widest text-amber-400">
                          {property.property_type}
                        </span>
                        <h3 className="text-2xl font-bold leading-snug">{property.name}</h3>
                        <p className="text-sm text-slate-300 flex items-center gap-1 mt-1">
                          <MapPin className="h-3.5 w-3.5 text-amber-400" /> {property.city}, {property.state || property.country}
                        </p>
                      </div>
                    </div>

                    <CardContent className="p-6 space-y-4">
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {property.description ||
                          `An iconic ${property.property_type.toLowerCase()} nestled in ${property.city}, offering bespoke luxury suites, authentic cuisine and tranquil retreats.`}
                      </p>

                      {/* Amenities Pills */}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {property.amenities?.slice(0, 4).map((amenity, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-muted text-muted-foreground font-medium"
                          >
                            {amenity.toLowerCase().includes('wifi') ? (
                              <Wifi className="h-3 w-3" />
                            ) : amenity.toLowerCase().includes('pool') ? (
                              <Waves className="h-3 w-3" />
                            ) : (
                              <Coffee className="h-3 w-3" />
                            )}
                            {amenity}
                          </span>
                        ))}
                      </div>

                      <div className="pt-3 border-t border-border flex items-center justify-between">
                        <div>
                          <span className="text-xs text-muted-foreground">Starting from</span>
                          <p className="text-lg font-bold text-foreground">
                            {formatPaise(property.room_types?.[0]?.base_price_per_night || 450000)}
                            <span className="text-xs font-normal text-muted-foreground"> / night</span>
                          </p>
                        </div>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/explore?property_id=${property.property_id}`);
                          }}
                          className="rounded-xl font-bold"
                        >
                          Check Availability
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Why Choose Aura Stays (Platform Guarantees) */}
      <section className="py-20 bg-muted/30 border-y border-border">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <Badge variant="default" className="mb-2">
              Thoughtfully Curated
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
              The Aura Stays Promise
            </h2>
            <p className="text-muted-foreground mt-2 text-sm sm:text-base">
              Hospitality built on trust, transparency, and serene travel experiences from check-in to departure.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Feature 1 */}
            <div className="p-6 rounded-3xl bg-card border border-border shadow-soft space-y-3">
              <div className="h-12 w-12 rounded-2xl bg-teal-500/10 text-primary flex items-center justify-center font-bold">
                <ShieldCheck className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-bold text-base text-foreground">Zero Double-Booking Guarantee</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Real-time room inventory locks your selected suite immediately upon selection. No overbooking, ever.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="p-6 rounded-3xl bg-card border border-border shadow-soft space-y-3">
              <div className="h-12 w-12 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
                <ReceiptText className="h-6 w-6 text-amber-600" />
              </div>
              <h3 className="font-bold text-base text-foreground">Transparent, Upfront Rates</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                All seasonal discounts, taxes, and fees are calculated with complete clarity. Zero hidden markups or surprises.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="p-6 rounded-3xl bg-card border border-border shadow-soft space-y-3">
              <div className="h-12 w-12 rounded-2xl bg-sky-500/10 text-sky-600 flex items-center justify-center font-bold">
                <Clock className="h-6 w-6 text-sky-600" />
              </div>
              <h3 className="font-bold text-base text-foreground">15-Minute Courtesy Hold</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Take your time to complete checkout. Once reserved, your room hold is protected exclusively for you for 15 minutes.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="p-6 rounded-3xl bg-card border border-border shadow-soft space-y-3">
              <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
                <RotateCcw className="h-6 w-6 text-emerald-600" />
              </div>
              <h3 className="font-bold text-base text-foreground">Flexible Cancellation</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Clear cancellation policies preview your refund amount before you confirm. Up to 100% refund on qualifying stays.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
