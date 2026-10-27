import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Skeleton } from '../../components/ui/skeleton';
import { formatPaise, formatDate, toUtcDateString } from '../../lib/utils';
import {
  CalendarCheck2,
  CalendarX2,
  AlertCircle,
  CheckCircle2,
  Lock,
  Layers,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';

export default function AdminAvailabilityPage() {
  const [searchParams] = useSearchParams();

  const [properties, setProperties] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState(
    searchParams.get('property_id') || ''
  );
  const [selectedRoomId, setSelectedRoomId] = useState(searchParams.get('room_id') || '');
  const [loading, setLoading] = useState(true);

  // Block modal/form
  const [blockForm, setBlockForm] = useState({
    start_date: '',
    end_date: '',
    reason: 'Maintenance & Renovations',
  });
  const [isBlocking, setIsBlocking] = useState(false);
  const [blockError, setBlockError] = useState('');

  // Unblock modal/form
  const [unblockForm, setUnblockForm] = useState({
    start_date: '',
    end_date: '',
  });
  const [isUnblocking, setIsUnblocking] = useState(false);
  const [unblockError, setUnblockError] = useState('');

  // Fetch properties and rooms
  useEffect(() => {
    const init = async () => {
      try {
        const [propsRes, roomsRes] = await Promise.all([
          api.get('/admin/properties'),
          api.get('/admin/rooms'),
        ]);

        const propList = propsRes.data.properties || [];
        const roomList = roomsRes.data.rooms || [];
        setProperties(propList);
        setRooms(roomList);

        if (!selectedPropertyId && propList.length > 0) {
          setSelectedPropertyId(propList[0].property_id);
        }

        if (!selectedRoomId && roomList.length > 0) {
          const matchingRoom = roomList.find((r) => r.property_id === (selectedPropertyId || propList[0]?.property_id));
          if (matchingRoom) {
            setSelectedRoomId(matchingRoom.room_id);
          }
        }
      } catch (err) {
        toast.error(getErrorMessage(err, 'Failed to load availability management.'));
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  // Update selected room when property changes
  const handlePropertyChange = (propId) => {
    setSelectedPropertyId(propId);
    const roomsForProp = rooms.filter((r) => r.property_id === propId);
    if (roomsForProp.length > 0) {
      setSelectedRoomId(roomsForProp[0].room_id);
    } else {
      setSelectedRoomId('');
    }
  };

  // Block dates call
  const handleBlockDates = async (e) => {
    e.preventDefault();
    if (!selectedRoomId) return;

    setIsBlocking(true);
    setBlockError('');

    try {
      const res = await api.post(`/admin/rooms/${selectedRoomId}/block`, {
        start_date: blockForm.start_date,
        end_date: blockForm.end_date,
        reason: blockForm.reason || 'BLOCKED',
      });
      toast.success(
        `Successfully blocked ${res.data.blocked_nights} nights for room ${selectedRoomId}.`
      );
      setBlockForm({ start_date: '', end_date: '', reason: 'Maintenance & Renovations' });
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to block room dates.');
      setBlockError(msg);
      toast.error(msg);
    } finally {
      setIsBlocking(false);
    }
  };

  // Unblock dates call
  const handleUnblockDates = async (e) => {
    e.preventDefault();
    if (!selectedRoomId) return;

    setIsUnblocking(true);
    setUnblockError('');

    try {
      const res = await api.post(`/admin/rooms/${selectedRoomId}/unblock`, {
        start_date: unblockForm.start_date,
        end_date: unblockForm.end_date,
      });
      toast.success(
        `Successfully unblocked ${res.data.unblocked_count} nights for room ${selectedRoomId}.`
      );
      setUnblockForm({ start_date: '', end_date: '' });
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to unblock room dates.');
      setUnblockError(msg);
      toast.error(msg);
    } finally {
      setIsUnblocking(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64 rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-3xl" />
      </div>
    );
  }

  const filteredRooms = rooms.filter((r) => r.property_id === selectedPropertyId);
  const activeRoom = rooms.find((r) => r.room_id === selectedRoomId);

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-extrabold text-foreground tracking-tight">
          Room Availability & Date Blocking
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Create or delete BLOCKED inventory documents for maintenance, owner stays, or renovations. Rejects blocking nights that have existing reservations.
        </p>
      </div>

      {/* Target Selectors */}
      <Card className="rounded-3xl border-border p-6 bg-card shadow-soft space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Select Property</label>
            <select
              value={selectedPropertyId}
              onChange={(e) => handlePropertyChange(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-input bg-background text-xs font-bold focus:outline-none"
            >
              {properties.map((p) => (
                <option key={p.property_id} value={p.property_id}>
                  {p.name} ({p.property_id})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Select Physical Room</label>
            <select
              value={selectedRoomId}
              onChange={(e) => setSelectedRoomId(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-input bg-background text-xs font-bold focus:outline-none"
            >
              {filteredRooms.map((r) => (
                <option key={r.room_id} value={r.room_id}>
                  Room {r.room_number} ({r.room_id} • Floor {r.floor} • {r.status})
                </option>
              ))}
            </select>
          </div>
        </div>

        {activeRoom && (
          <div className="p-3.5 rounded-2xl bg-muted/40 border border-border flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              <span className="font-bold text-foreground">
                Currently Selected: Room {activeRoom.room_number}
              </span>
              <Badge
                variant={
                  ['ACTIVE', 'AVAILABLE'].includes(activeRoom.status) ? 'success' : 'warning'
                }
              >
                {activeRoom.status}
              </Badge>
            </div>
            <span className="text-muted-foreground">Max Guests: {activeRoom.max_guests}</span>
          </div>
        )}
      </Card>

      {/* Two Column Actions: Block Dates (Left) vs Unblock Dates (Right) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        {/* BLOCK DATES FORM */}
        <Card className="rounded-3xl border-border p-6 sm:p-8 bg-card shadow-soft space-y-6">
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
              <CalendarX2 className="h-5 w-5 text-amber-500" />
              Block Room Dates
            </h3>
            <p className="text-xs text-muted-foreground">
              Creates BLOCKED inventory entries. Refuses if dates overlap with confirmed bookings.
            </p>
          </div>

          <form onSubmit={handleBlockDates} className="space-y-4 text-xs">
            {blockError && (
              <div className="p-3.5 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{blockError}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-foreground">Start Date</label>
                <Input
                  type="date"
                  value={blockForm.start_date}
                  onChange={(e) => setBlockForm({ ...blockForm, start_date: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">End Date</label>
                <Input
                  type="date"
                  value={blockForm.end_date}
                  min={blockForm.start_date}
                  onChange={(e) => setBlockForm({ ...blockForm, end_date: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-foreground">Reason for Blocking</label>
              <Input
                value={blockForm.reason}
                onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })}
                placeholder="e.g. Scheduled Painting, Plumbing Maintenance"
                required
              />
            </div>

            <Button
              type="submit"
              variant="default"
              disabled={isBlocking || !selectedRoomId}
              className="w-full rounded-2xl font-bold h-11"
            >
              {isBlocking ? 'Blocking Dates...' : 'Create BLOCKED Hold'}
            </Button>
          </form>
        </Card>

        {/* UNBLOCK DATES FORM */}
        <Card className="rounded-3xl border-border p-6 sm:p-8 bg-card shadow-soft space-y-6">
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
              <CalendarCheck2 className="h-5 w-5 text-primary" />
              Unblock Room Dates
            </h3>
            <p className="text-xs text-muted-foreground">
              Removes BLOCKED inventory entries and restores room availability for guests.
            </p>
          </div>

          <form onSubmit={handleUnblockDates} className="space-y-4 text-xs">
            {unblockError && (
              <div className="p-3.5 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{unblockError}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-foreground">Start Date</label>
                <Input
                  type="date"
                  value={unblockForm.start_date}
                  onChange={(e) => setUnblockForm({ ...unblockForm, start_date: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">End Date</label>
                <Input
                  type="date"
                  value={unblockForm.end_date}
                  min={unblockForm.start_date}
                  onChange={(e) => setUnblockForm({ ...unblockForm, end_date: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-muted/40 text-[11px] text-muted-foreground">
              Note: Unblocking will only remove documents with status <span className="font-bold text-foreground">BLOCKED</span>. Booked nights with real reservations will never be affected.
            </div>

            <Button
              type="submit"
              variant="secondary"
              disabled={isUnblocking || !selectedRoomId}
              className="w-full rounded-2xl font-bold h-11"
            >
              {isUnblocking ? 'Unblocking...' : 'Unblock Selected Dates'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
