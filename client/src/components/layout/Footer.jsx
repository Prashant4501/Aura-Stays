import React from 'react';
import { Heart } from 'lucide-react';
import { Link } from 'react-router-dom';
import BrandLogo from './BrandLogo';

export default function Footer() {
  return (
    <footer className="border-t border-border bg-card/60 backdrop-blur-sm text-card-foreground mt-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand Col */}
          <div className="space-y-3 md:col-span-1">
            <BrandLogo size="sm" subtitle="Boutique Collection" />
            <p className="text-sm text-muted-foreground leading-relaxed pt-1">
              Handcrafted luxury boutique stays, beach resorts and heritage villas designed for discerning travelers.
            </p>
          </div>

          {/* Stays */}
          <div>
            <h4 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wider">Destinations</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/explore" className="hover:text-primary transition-colors">Mumbai Heritage Collection</Link></li>
              <li><Link to="/explore" className="hover:text-primary transition-colors">Goa Sunset Coast</Link></li>
              <li><Link to="/explore" className="hover:text-primary transition-colors">Private Villas</Link></li>
              <li><Link to="/explore" className="hover:text-primary transition-colors">Executive Suites</Link></li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wider">Experience</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><span className="cursor-default">Concierge Assistance</span></li>
              <li><span className="cursor-default">Seasonal Offers & Coupons</span></li>
              <li><span className="cursor-default">Instant Confirmation</span></li>
              <li><span className="cursor-default">Flexible Cancellation</span></li>
            </ul>
          </div>

          {/* Guarantee */}
          <div>
            <h4 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wider">Trust & Integrity</h4>
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-xs text-muted-foreground space-y-2">
              <p className="font-semibold text-primary">Zero Double-Booking Guarantee</p>
              <p>Atomic inventory reservations with verified server-side rates and 100% transparent pricing.</p>
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-muted-foreground gap-4">
          <p>© {new Date().getFullYear()} Aura Stays Inc. All rights reserved.</p>
          <p className="flex items-center gap-1">
            Built with modern MERN architecture <Heart className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
          </p>
        </div>
      </div>
    </footer>
  );
}
