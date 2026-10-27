import {
  Property,
  Room,
  Inventory,
  Reservation,
  Payment,
  Refund,
  CouponRedemption,
} from '../models/index.js';
import { assertCanManageProperty, getManagedPropertyIds } from '../middlewares/roleScope.js';
import { normalizeToUtcMidnight, generateNightsList } from '../utils/dates.js';

/**
 * Helper to resolve target property IDs for the requesting user.
 */
const resolveTargetPropertyIds = async (user, requestedPropertyId = null) => {
  const managedIds = await getManagedPropertyIds(user);

  if (requestedPropertyId) {
    if (managedIds !== null && !managedIds.includes(requestedPropertyId)) {
      await assertCanManageProperty(requestedPropertyId, user);
    }
    return [requestedPropertyId];
  }

  if (managedIds !== null) {
    return managedIds;
  }

  const allProps = await Property.find({}, { property_id: 1 }).lean();
  return allProps.map((p) => p.property_id);
};

/**
 * GET /api/v1/admin/reports/occupancy
 * Calculates occupancy rate by property and date range.
 * Occupancy Rate = (Booked Room Nights / Total Available Room Nights) * 100
 */
export const getOccupancyReport = async (req, res, next) => {
  try {
    const { property_id, start_date, end_date } = req.query;

    const targetPropertyIds = await resolveTargetPropertyIds(req.user, property_id);

    const now = new Date();
    const defaultStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const defaultEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

    const startUtc = start_date ? normalizeToUtcMidnight(start_date) : defaultStart;
    const endUtc = end_date ? normalizeToUtcMidnight(end_date) : defaultEnd;

    const nights = generateNightsList(startUtc, endUtc);
    const nightsCount = nights.length;

    const properties = await Property.find({ property_id: { $in: targetPropertyIds } }).lean();

    const results = [];
    let grandTotalCapacity = 0;
    let grandTotalOccupied = 0;

    for (const prop of properties) {
      const rooms = await Room.find({
        property_id: prop.property_id,
        status: { $in: ['ACTIVE', 'AVAILABLE', 'OCCUPIED', 'RESERVED'] },
      }).lean();

      const totalRooms = rooms.length;
      const capacityNights = totalRooms * nightsCount;
      const roomIds = rooms.map((r) => r.room_id);

      const occupiedNights = await Inventory.countDocuments({
        room_id: { $in: roomIds },
        date: { $in: nights },
        status: { $in: ['BOOKED', 'OCCUPIED'] },
      });

      const occupancyRate =
        capacityNights > 0 ? Number(((occupiedNights / capacityNights) * 100).toFixed(2)) : 0;

      grandTotalCapacity += capacityNights;
      grandTotalOccupied += occupiedNights;

      results.push({
        property_id: prop.property_id,
        property_name: prop.name,
        total_rooms: totalRooms,
        total_capacity_nights: capacityNights,
        occupied_nights: occupiedNights,
        occupancy_rate_percentage: occupancyRate,
      });
    }

    const overallOccupancyRate =
      grandTotalCapacity > 0
        ? Number(((grandTotalOccupied / grandTotalCapacity) * 100).toFixed(2))
        : 0;

    return res.status(200).json({
      start_date: startUtc.toISOString().split('T')[0],
      end_date: endUtc.toISOString().split('T')[0],
      nights_count: nightsCount,
      overall_capacity_nights: grandTotalCapacity,
      overall_occupied_nights: grandTotalOccupied,
      overall_occupancy_rate_percentage: overallOccupancyRate,
      properties: results,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/admin/reports/revenue
 * Aggregation pipeline: revenue by day or month and property.
 */
export const getRevenueReport = async (req, res, next) => {
  try {
    const { property_id, group_by = 'day', start_date, end_date } = req.query;

    const targetPropertyIds = await resolveTargetPropertyIds(req.user, property_id);

    const matchQuery = { status: 'SUCCESS' };
    if (start_date || end_date) {
      matchQuery.created_at = {};
      if (start_date) matchQuery.created_at.$gte = normalizeToUtcMidnight(start_date);
      if (end_date)
        matchQuery.created_at.$lte = new Date(
          normalizeToUtcMidnight(end_date).getTime() + 86400000
        );
    }

    const dateFormat = group_by === 'month' ? '%Y-%m' : '%Y-%m-%d';

    const pipeline = [
      { $match: matchQuery },
      {
        $lookup: {
          from: 'reservations',
          localField: 'reservation_id',
          foreignField: 'reservation_id',
          as: 'reservation',
        },
      },
      { $unwind: '$reservation' },
      {
        $match: {
          'reservation.property_id': { $in: targetPropertyIds },
        },
      },
      {
        $group: {
          _id: {
            period: { $dateToString: { format: dateFormat, date: '$created_at' } },
            property_id: '$reservation.property_id',
          },
          revenue_paise: { $sum: '$amount' },
          transactions_count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'properties',
          localField: '_id.property_id',
          foreignField: 'property_id',
          as: 'property',
        },
      },
      { $unwind: { path: '$property', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          period: '$_id.period',
          property_id: '$_id.property_id',
          property_name: '$property.name',
          revenue_paise: 1,
          transactions_count: 1,
        },
      },
      { $sort: { period: 1, property_id: 1 } },
    ];

    const revenueRows = await Payment.aggregate(pipeline);

    const totalRevenuePaise = revenueRows.reduce((sum, r) => sum + r.revenue_paise, 0);
    const totalTransactions = revenueRows.reduce((sum, r) => sum + r.transactions_count, 0);

    return res.status(200).json({
      group_by,
      total_revenue_paise: totalRevenuePaise,
      total_transactions: totalTransactions,
      items: revenueRows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/admin/reports/bookings
 * Bookings count and cancellation rate.
 */
export const getBookingsReport = async (req, res, next) => {
  try {
    const { property_id, start_date, end_date } = req.query;

    const targetPropertyIds = await resolveTargetPropertyIds(req.user, property_id);

    const matchQuery = { property_id: { $in: targetPropertyIds } };
    if (start_date || end_date) {
      matchQuery.created_at = {};
      if (start_date) matchQuery.created_at.$gte = normalizeToUtcMidnight(start_date);
      if (end_date)
        matchQuery.created_at.$lte = new Date(
          normalizeToUtcMidnight(end_date).getTime() + 86400000
        );
    }

    const statusCounts = await Reservation.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          total_amount_paise: { $sum: '$total_amount' },
        },
      },
    ]);

    let totalBookings = 0;
    let cancelledBookings = 0;
    const byStatus = {};

    for (const item of statusCounts) {
      totalBookings += item.count;
      byStatus[item._id] = {
        count: item.count,
        total_amount_paise: item.total_amount_paise,
      };

      if (['CANCELLED', 'REFUND_PENDING', 'REFUNDED'].includes(item._id)) {
        cancelledBookings += item.count;
      }
    }

    const cancellationRate =
      totalBookings > 0 ? Number(((cancelledBookings / totalBookings) * 100).toFixed(2)) : 0;

    return res.status(200).json({
      total_bookings: totalBookings,
      cancelled_bookings: cancelledBookings,
      cancellation_rate_percentage: cancellationRate,
      by_status: byStatus,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/admin/reports/coupons
 * Coupon usage and total discount given.
 */
export const getCouponsReport = async (req, res, next) => {
  try {
    const { property_id, start_date, end_date } = req.query;

    const targetPropertyIds = await resolveTargetPropertyIds(req.user, property_id);

    const matchQuery = {};
    if (start_date || end_date) {
      matchQuery.created_at = {};
      if (start_date) matchQuery.created_at.$gte = normalizeToUtcMidnight(start_date);
      if (end_date)
        matchQuery.created_at.$lte = new Date(
          normalizeToUtcMidnight(end_date).getTime() + 86400000
        );
    }

    const pipeline = [
      { $match: matchQuery },
      {
        $lookup: {
          from: 'reservations',
          localField: 'reservation_id',
          foreignField: 'reservation_id',
          as: 'reservation',
        },
      },
      { $unwind: '$reservation' },
      {
        $match: {
          'reservation.property_id': { $in: targetPropertyIds },
        },
      },
      {
        $lookup: {
          from: 'coupons',
          localField: 'coupon_id',
          foreignField: 'coupon_id',
          as: 'coupon',
        },
      },
      { $unwind: { path: '$coupon', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$coupon_id',
          code: { $first: '$coupon.code' },
          discount_type: { $first: '$coupon.discount_type' },
          total_redemptions: { $sum: 1 },
          total_discount_paise: { $sum: '$discount_amount' },
          unique_guests: { $addToSet: '$guest_id' },
        },
      },
      {
        $project: {
          _id: 0,
          coupon_id: '$_id',
          code: 1,
          discount_type: 1,
          total_redemptions: 1,
          total_discount_paise: 1,
          unique_guests_count: { $size: '$unique_guests' },
        },
      },
      { $sort: { total_discount_paise: -1 } },
    ];

    const couponItems = await CouponRedemption.aggregate(pipeline);

    const totalDiscountPaise = couponItems.reduce(
      (sum, item) => sum + item.total_discount_paise,
      0
    );
    const totalRedemptions = couponItems.reduce((sum, item) => sum + item.total_redemptions, 0);

    return res.status(200).json({
      total_redemptions: totalRedemptions,
      total_discount_paise: totalDiscountPaise,
      coupons: couponItems,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/admin/reports/kpi
 * Executive KPI dashboard summary.
 */
export const getKpiReport = async (req, res, next) => {
  try {
    const targetPropertyIds = await resolveTargetPropertyIds(req.user);

    // 1. Properties & Rooms
    const [propertiesCount, rooms] = await Promise.all([
      Property.countDocuments({ property_id: { $in: targetPropertyIds } }),
      Room.find({
        property_id: { $in: targetPropertyIds },
        status: { $in: ['ACTIVE', 'AVAILABLE', 'OCCUPIED', 'RESERVED'] },
      }).lean(),
    ]);

    const roomsCount = rooms.length;
    const roomIds = rooms.map((r) => r.room_id);

    // 2. Bookings & Cancellations
    const reservations = await Reservation.find({
      property_id: { $in: targetPropertyIds },
    }).lean();

    const totalBookings = reservations.length;
    const activeBookings = reservations.filter((r) =>
      ['CONFIRMED', 'CHECKED_IN'].includes(r.status)
    ).length;
    const cancelledBookings = reservations.filter((r) =>
      ['CANCELLED', 'REFUND_PENDING', 'REFUNDED'].includes(r.status)
    ).length;

    const cancellationRate =
      totalBookings > 0 ? Number(((cancelledBookings / totalBookings) * 100).toFixed(2)) : 0;

    // 3. Revenue from successful payments
    const payments = await Payment.aggregate([
      { $match: { status: 'SUCCESS' } },
      {
        $lookup: {
          from: 'reservations',
          localField: 'reservation_id',
          foreignField: 'reservation_id',
          as: 'reservation',
        },
      },
      { $unwind: '$reservation' },
      {
        $match: { 'reservation.property_id': { $in: targetPropertyIds } },
      },
      {
        $group: {
          _id: null,
          total_revenue_paise: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]);

    const totalRevenuePaise = payments[0]?.total_revenue_paise || 0;

    // 4. Refunds processed
    const refunds = await Refund.aggregate([
      { $match: { status: 'PROCESSED' } },
      {
        $lookup: {
          from: 'reservations',
          localField: 'reservation_id',
          foreignField: 'reservation_id',
          as: 'reservation',
        },
      },
      { $unwind: '$reservation' },
      {
        $match: { 'reservation.property_id': { $in: targetPropertyIds } },
      },
      {
        $group: {
          _id: null,
          total_refunded_paise: { $sum: '$refund_amount' },
        },
      },
    ]);

    const totalRefundedPaise = refunds[0]?.total_refunded_paise || 0;
    const netRevenuePaise = Math.max(0, totalRevenuePaise - totalRefundedPaise);

    // 5. Occupied nights (last 30 days)
    const now = new Date();
    const thirtyDaysAgo = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 30)
    );
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const recentNights = generateNightsList(thirtyDaysAgo, today);

    const occupiedNightsCount = await Inventory.countDocuments({
      room_id: { $in: roomIds },
      date: { $in: recentNights },
      status: { $in: ['BOOKED', 'OCCUPIED'] },
    });

    const recentCapacity = roomsCount * recentNights.length;
    const recentOccupancyRate =
      recentCapacity > 0 ? Number(((occupiedNightsCount / recentCapacity) * 100).toFixed(2)) : 0;

    // Average Daily Rate (ADR)
    const averageDailyRatePaise =
      occupiedNightsCount > 0 ? Math.round(totalRevenuePaise / occupiedNightsCount) : 0;

    return res.status(200).json({
      kpi: {
        total_properties: propertiesCount,
        total_rooms: roomsCount,
        total_bookings: totalBookings,
        active_bookings: activeBookings,
        cancelled_bookings: cancelledBookings,
        cancellation_rate_percentage: cancellationRate,
        total_revenue_paise: totalRevenuePaise,
        total_refunded_paise: totalRefundedPaise,
        net_revenue_paise: netRevenuePaise,
        occupied_room_nights_last_30_days: occupiedNightsCount,
        occupancy_rate_last_30_days_percentage: recentOccupancyRate,
        average_daily_rate_paise: averageDailyRatePaise,
      },
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getOccupancyReport,
  getRevenueReport,
  getBookingsReport,
  getCouponsReport,
  getKpiReport,
};
