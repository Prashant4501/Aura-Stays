import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Skeleton } from '../../components/ui/skeleton';
import { formatPaise, formatDate, calculateNights } from '../../lib/utils';
import { CalendarDays, Search, ArrowRight, Eye, User, MapPin } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminReservationsPage() {
  const navigate = useNavigate();

  const [reservations, setReservations] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [propertyFilter, setPropertyFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });

  const fetchReservations = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', page);
      params.append('limit', 15);
      if (statusFilter) params.append('status', statusFilter);
      if (propertyFilter) params.append('property_id', propertyFilter);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());

      const [resvRes, propsRes] = await Promise.all([
        api.get(`/admin/reservations?${params.toString()}`),
        api.get('/admin/properties'),
      ]);

      setReservations(resvRes.data.reservations || []);
      setPagination(resvRes.data.pagination || { total: 0, pages: 1 });
      setProperties(propsRes.data.properties || []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to fetch reservations.'));
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, propertyFilter, searchQuery]);

  useEffect(() => {
    fetchReservations();
  }, [fetchReservations]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchReservations();
  };

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'CONFIRMED':
        return <Badge variant="success">Confirmed</Badge>;
      case 'CHECKED_IN':
        return <Badge variant="info">Checked In</Badge>;
      case 'CHECKED_OUT':
        return <Badge variant="secondary">Checked Out</Badge>;
      case 'PENDING':
        return <Badge variant="warning">Hold (Pending)</Badge>;
      case 'CANCELLED':
        return <Badge variant="destructive">Cancelled</Badge>;
      case 'REFUND_PENDING':
        return <Badge variant="warning">Refund Pending</Badge>;
      case 'REFUNDED':
        return <Badge variant="default">Refunded</Badge>;
      case 'EXPIRED':
        return <Badge variant="outline">Expired</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-extrabold text-foreground tracking-tight">
          Reservations Manager
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Browse, filter, search, and manage guest reservation lifecycles across properties.
        </p>
      </div>

      {/* Filter and Search Bar */}
      <Card className="rounded-3xl border-border p-4 bg-card shadow-soft">
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3 items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by reservation #, guest name or email..."
              className="pl-10 h-10 rounded-xl text-xs"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="w-full sm:w-44 h-10 px-3 rounded-xl border border-input bg-background text-xs font-semibold focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="CONFIRMED">CONFIRMED</option>
            <option value="CHECKED_IN">CHECKED_IN</option>
            <option value="CHECKED_OUT">CHECKED_OUT</option>
            <option value="PENDING">PENDING (HOLD)</option>
            <option value="CANCELLED">CANCELLED</option>
            <option value="REFUND_PENDING">REFUND_PENDING</option>
            <option value="REFUNDED">REFUNDED</option>
            <option value="EXPIRED">EXPIRED</option>
          </select>

          <select
            value={propertyFilter}
            onChange={(e) => {
              setPropertyFilter(e.target.value);
              setPage(1);
            }}
            className="w-full sm:w-48 h-10 px-3 rounded-xl border border-input bg-background text-xs font-semibold focus:outline-none"
          >
            <option value="">All Properties</option>
            {properties.map((p) => (
              <option key={p.property_id} value={p.property_id}>
                {p.name}
              </option>
            ))}
          </select>

          <Button type="submit" variant="secondary" className="h-10 px-5 rounded-xl font-bold text-xs">
            Filter
          </Button>
        </form>
      </Card>

      {/* Table */}
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
                  <th className="py-3.5 px-4">Reservation #</th>
                  <th className="py-3.5 px-4">Guest</th>
                  <th className="py-3.5 px-4">Property & Room</th>
                  <th className="py-3.5 px-4">Dates & Nights</th>
                  <th className="py-3.5 px-4">Amount</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {reservations.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground">
                      No reservations found matching this query.
                    </td>
                  </tr>
                ) : (
                  reservations.map((r) => (
                    <tr
                      key={r.reservation_id}
                      onClick={() => navigate(`/admin/reservations/${r.reservation_id}`)}
                      className="hover:bg-muted/30 transition-colors cursor-pointer"
                    >
                      <td className="py-3.5 px-4">
                        <span className="font-mono font-bold text-foreground block">
                          {r.reservation_number}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {r.reservation_id}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-foreground block">
                          {r.guest?.first_name} {r.guest?.last_name || ''}
                        </span>
                        <span className="text-muted-foreground text-[10px]">
                          {r.guest?.email || r.guest_id}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="text-foreground font-medium block">
                          {r.property_name || r.property_id}
                        </span>
                        <span className="text-muted-foreground text-[10px]">
                          Room {r.room_number || r.room_id}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="text-foreground block">
                          {formatDate(r.check_in_date)} – {formatDate(r.check_out_date)}
                        </span>
                        <span className="text-muted-foreground text-[10px]">
                          {calculateNights(r.check_in_date, r.check_out_date)} Nights • {r.guests_count} Guests
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-primary">
                        {formatPaise(r.total_amount)}
                      </td>
                      <td className="py-3.5 px-4">{renderStatusBadge(r.status)}</td>
                      <td className="py-3.5 px-4 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/admin/reservations/${r.reservation_id}`);
                          }}
                          className="h-8 w-8 p-0"
                        >
                          <Eye className="h-4 w-4 text-primary" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
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
