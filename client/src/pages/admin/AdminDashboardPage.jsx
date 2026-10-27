import React, { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import { formatPaise } from '../../lib/utils';
import {
  TrendingUp,
  Building,
  BedDouble,
  CalendarCheck,
  RotateCcw,
  Percent,
  DollarSign,
  AlertCircle,
  Users,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

export default function AdminDashboardPage() {
  const { user, isAdmin } = useAuth();

  const [kpi, setKpi] = useState(null);
  const [revenueReport, setRevenueReport] = useState([]);
  const [bookingsReport, setBookingsReport] = useState(null);
  const [occupancyReport, setOccupancyReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [kpiRes, revRes, bookRes, occRes] = await Promise.all([
          api.get('/admin/reports/kpi'),
          api.get('/admin/reports/revenue?group_by=day'),
          api.get('/admin/reports/bookings'),
          api.get('/admin/reports/occupancy'),
        ]);

        setKpi(kpiRes.data.kpi);
        setRevenueReport(revRes.data.items || []);
        setBookingsReport(bookRes.data);
        setOccupancyReport(occRes.data);
      } catch (err) {
        console.error('Failed to load dashboard metrics:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64 rounded-2xl" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton className="h-32 rounded-3xl" />
          <Skeleton className="h-32 rounded-3xl" />
          <Skeleton className="h-32 rounded-3xl" />
          <Skeleton className="h-32 rounded-3xl" />
        </div>
        <Skeleton className="h-80 w-full rounded-3xl" />
      </div>
    );
  }

  // Data for bookings status pie chart
  const statusPieData = bookingsReport?.by_status
    ? Object.entries(bookingsReport.by_status).map(([status, val]) => ({
        name: status,
        value: val.count,
      }))
    : [];

  const COLORS = ['#0D9488', '#0EA5E9', '#8B5CF6', '#F59E0B', '#EF4444', '#64748B'];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
            Executive Operations Dashboard
          </h1>
          <Badge variant="gold">Live Metrics</Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {isAdmin
            ? 'Global portfolio metrics, financial aggregations, and platform operations.'
            : `Assigned operations for manager account: ${user?.first_name} ${user?.last_name || ''}.`}
        </p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Total Revenue */}
        <Card className="rounded-3xl border-border bg-card p-6 shadow-soft space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold">Net Revenue</span>
            <div className="h-8 w-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-2xl font-black text-foreground">
              {formatPaise(kpi?.net_revenue_paise || 0)}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Gross: {formatPaise(kpi?.total_revenue_paise || 0)}
            </p>
          </div>
        </Card>

        {/* KPI 2: Occupancy Rate */}
        <Card className="rounded-3xl border-border bg-card p-6 shadow-soft space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold">Occupancy Rate (30d)</span>
            <div className="h-8 w-8 rounded-xl bg-teal-500/10 text-teal-600 flex items-center justify-center">
              <Percent className="h-4 w-4" />
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-2xl font-black text-foreground">
              {kpi?.occupancy_rate_last_30_days_percentage || 0}%
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {kpi?.occupied_room_nights_last_30_days || 0} occupied room nights
            </p>
          </div>
        </Card>

        {/* KPI 3: Total Bookings */}
        <Card className="rounded-3xl border-border bg-card p-6 shadow-soft space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold">Total Bookings</span>
            <div className="h-8 w-8 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <CalendarCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-2xl font-black text-foreground">
              {kpi?.total_bookings || 0}
            </h3>
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
              {kpi?.active_bookings || 0} currently active
            </p>
          </div>
        </Card>

        {/* KPI 4: Cancellation Rate */}
        <Card className="rounded-3xl border-border bg-card p-6 shadow-soft space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold">Cancellation Rate</span>
            <div className="h-8 w-8 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center">
              <RotateCcw className="h-4 w-4" />
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-2xl font-black text-foreground">
              {kpi?.cancellation_rate_percentage || 0}%
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {kpi?.cancelled_bookings || 0} total cancellations
            </p>
          </div>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Area Chart */}
        <Card className="lg:col-span-2 rounded-3xl border-border p-6 shadow-soft">
          <CardHeader className="p-0 pb-6">
            <CardTitle className="text-base font-bold">Revenue Aggregation Pipeline</CardTitle>
            <CardDescription className="text-xs">
              Daily revenue from verified successful transactions (in ₹ Rupees).
            </CardDescription>
          </CardHeader>
          <div className="h-72 w-full">
            {revenueReport.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                No revenue records in this date window.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={revenueReport.map((r) => ({
                    date: r.period,
                    revenue: Math.round(r.revenue_paise / 100),
                    transactions: r.transactions_count,
                  }))}
                >
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0D9488" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#0D9488" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" stroke="#94A3B8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} />
                  <Tooltip
                    formatter={(value) => [`₹${value.toLocaleString('en-IN')}`, 'Revenue']}
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#334155',
                      borderRadius: '12px',
                      color: '#F8FAFC',
                      fontSize: '12px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#0D9488"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorRev)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Bookings Status Distribution Donut Chart */}
        <Card className="rounded-3xl border-border p-6 shadow-soft">
          <CardHeader className="p-0 pb-6">
            <CardTitle className="text-base font-bold">Bookings Status</CardTitle>
            <CardDescription className="text-xs">
              Distribution across all reservation lifecycle stages.
            </CardDescription>
          </CardHeader>
          <div className="h-72 w-full flex items-center justify-center">
            {statusPieData.length === 0 ? (
              <span className="text-xs text-muted-foreground">No bookings recorded.</span>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {statusPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#334155',
                      borderRadius: '12px',
                      color: '#F8FAFC',
                      fontSize: '12px',
                    }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* Property Occupancy Breakdown Table */}
      <Card className="rounded-3xl border-border p-6 shadow-soft space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-foreground">Property Occupancy Report</h3>
            <p className="text-xs text-muted-foreground">
              Capacity vs. Booked Nights Breakdown
            </p>
          </div>
          <Badge variant="default">
            Overall Occupancy: {occupancyReport?.overall_occupancy_rate_percentage || 0}%
          </Badge>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Property</th>
                <th className="py-3 px-4">Total Rooms</th>
                <th className="py-3 px-4">Capacity (Nights)</th>
                <th className="py-3 px-4">Occupied Nights</th>
                <th className="py-3 px-4 text-right">Occupancy Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {occupancyReport?.properties?.map((prop) => (
                <tr key={prop.property_id} className="hover:bg-muted/40 transition-colors">
                  <td className="py-3 px-4 font-bold text-foreground">
                    {prop.property_name} ({prop.property_id})
                  </td>
                  <td className="py-3 px-4">{prop.total_rooms}</td>
                  <td className="py-3 px-4">{prop.total_capacity_nights}</td>
                  <td className="py-3 px-4 font-semibold text-primary">{prop.occupied_nights}</td>
                  <td className="py-3 px-4 text-right font-bold text-foreground">
                    {prop.occupancy_rate_percentage}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
