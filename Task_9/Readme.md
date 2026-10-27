# Assessment: Hotel, Resort & Property Reservation Management Platform

Welcome to our technical assessment. Your task is to build a hotel and property reservation platform where guests can search available rooms, make reservations, manage bookings, and complete payments. Hotel administrators can manage properties, rooms, pricing, reservations, and room availability.

We are evaluating your ability to design reliable reservation systems where multiple users may attempt to reserve the same limited resource at the same time.

## Tech Stack

Use any modern frontend and backend frameworks. You must use a database.

## The Business Requirements

Build an application where Guests can:

*   Register and manage their profile.
*   Search properties.
*   Search rooms.
*   Select check-in and check-out dates.
*   View available rooms.
*   View room pricing.
*   Apply eligible coupons.
*   Make reservations.
*   View reservation history.
*   Cancel eligible reservations.
*   View payment information.

Hotel Administrators can:

*   Manage properties.
*   Manage rooms.
*   Manage room types.
*   Manage room availability.
*   Configure pricing.
*   Configure seasonal pricing.
*   Manage reservations.
*   Manage cancellations.
*   Manage refunds.
*   Manage coupons.
*   View reports.

The backend must enforce all important business rules.

### Challenge 1: The Double-Booking Problem

Imagine Hotel H001 has only one available room:

ROOM-101

Guest A searches for:
20 September → 25 September

Guest B searches for exactly the same dates.

Both guests send reservation requests at almost the exact same time.

Your system must guarantee that the same physical room cannot be successfully reserved by both guests for overlapping dates.

Only one reservation may succeed.

The final decision must be enforced by the backend/database.

A frontend availability check is NOT sufficient.

The evaluator will send concurrent reservation requests to reproduce race conditions.

### Challenge 2: The Date-Range Overlap Problem

The system must correctly detect overlapping reservations.

For example:

Existing reservation:
20 September → 25 September

New request:
23 September → 28 September

This is a conflict.

Another request:
18 September → 21 September

is also a conflict.

A request after the previous checkout:
25 September → 30 September

may be valid depending on the application's check-in/check-out convention.

The backend must correctly handle:

*   Same-day reservations.
*   Adjacent reservations.
*   Partial overlaps.
*   Complete overlaps.
*   Reservations spanning multiple days.
*   Cancelled reservations.
*   Expired reservations.

The frontend must never be trusted to determine availability.

### Challenge 3: The Price Manipulation Problem

Room prices must be calculated by the backend.

A reservation may contain:

*   Base room price.
*   Number of nights.
*   Seasonal price.
*   Weekend pricing.
*   Additional guests.
*   Taxes.
*   Service fees.
*   Discount.
*   Coupon.
*   Final amount.

A malicious user may modify:
`price`, `discount`, `tax`, `coupon`, `total_amount`
in the request.

The backend must ignore or reject manipulated financial values and calculate the final reservation amount using trusted server-side data.

For example, if the room costs ₹5,000 per night, a customer must not be able to change the request to:
`price = ₹500`
and successfully create a reservation.

### Challenge 4: The Coupon Abuse Problem

Guests may apply coupons to eligible reservations.

The backend must validate:

*   Coupon existence.
*   Coupon status.
*   Start date.
*   Expiry date.
*   Minimum booking amount.
*   Maximum discount.
*   Applicable room/property.
*   Usage limits.
*   Customer-specific restrictions where applicable.

The evaluator may attempt to:

*   Reuse an expired coupon.
*   Exceed the coupon usage limit.
*   Modify the discount amount.
*   Apply a coupon to an ineligible room.
*   Use another customer's restricted coupon.
*   Submit the same coupon redemption concurrently.

The backend must enforce coupon rules.

### Challenge 5: The Reservation State Machine Problem

Reservations must follow valid state transitions.

Example:
PENDING
↓
CONFIRMED
↓
CHECKED_IN
↓
CHECKED_OUT

Alternative cancellation flow:
PENDING
↓
CANCELLED

or:
CONFIRMED
↓
CANCELLED
↓
REFUND_PENDING
↓
REFUNDED

Invalid transitions must be rejected.

For example:
CHECKED_OUT → CONFIRMED
must not be allowed.

A cancelled reservation must not be checked in.

A refunded reservation must not be charged again as a new payment for the same reservation.

### Challenge 6: The Duplicate Payment Problem

A guest submits payment for a reservation.

The payment request reaches the backend, but the network response is lost.

The guest retries the request.

The system must not charge/process the same reservation twice.

The backend must use an appropriate idempotency mechanism or equivalent transaction-safe approach.

Only one successful payment should be associated with the same payment attempt.

### Challenge 7: The Cancellation & Refund Integrity Problem

Guests may cancel reservations according to the cancellation policy.

The backend must determine whether:

*   Cancellation is allowed.
*   A cancellation fee applies.
*   A full refund applies.
*   A partial refund applies.
*   No refund applies.

The guest must not be able to change:
`refund_amount`, `cancellation_fee`, `original_amount`
from the frontend.

Refund calculations must be performed server-side.

A refund must not be processed twice for the same reservation.

### Challenge 8: The Unauthorized Reservation Problem

Guests must only be able to access their own reservations.

A malicious user may change:
`reservation_id`, `guest_id`, `room_id`, `payment_id`, `refund_id`
in API requests.

For example:
`GET /api/reservations/RES-002`
when the authenticated guest owns RES-001.

The backend must reject unauthorized access.

Hotel administrators may have broader access according to their permissions.

Guests must not be able to modify room inventory, room pricing, or other guests' reservations.

## Important Business Rules

Implement appropriate server-side validation.

Examples:
*   Check-in date must be valid.
*   Check-out date must be after check-in date.
*   Past dates must be handled according to the business rules.
*   Room must exist.
*   Room must belong to the selected property.
*   Room must be active/bookable.
*   Room cannot have overlapping active reservations.
*   Cancelled reservations must not block inventory.
*   Number of guests must respect room capacity.
*   Price must be calculated server-side.
*   Taxes must be calculated server-side.
*   Coupon discounts must be validated server-side.
*   Expired coupons must be rejected.
*   Payment must correspond to the correct reservation.
*   Duplicate payments must be prevented.
*   Duplicate refunds must be prevented.
*   Invalid reservation state transitions must be rejected.
*   Guests cannot access other guests' reservations.
*   Guests cannot modify hotel room inventory.

## Evaluation Criteria

We will intentionally attempt to break your application by:
*   Sending simultaneous reservation requests for the same room.
*   Creating overlapping reservations.
*   Manipulating room IDs.
*   Manipulating guest IDs.
*   Manipulating prices.
*   Manipulating taxes.
*   Manipulating discounts.
*   Manipulating coupon values.
*   Reusing coupons.
*   Replaying payment requests.
*   Creating duplicate payments.
*   Creating duplicate refunds.
*   Cancelling completed reservations.
*   Checking into cancelled reservations.
*   Accessing another guest's reservation.
*   Accessing another guest's payment.
*   Booking inactive rooms.
*   Booking rooms above their guest capacity.
*   Using expired coupons.
*   Attempting invalid reservation state transitions.

We will bypass the frontend completely and communicate directly with your backend APIs.

Relying entirely on frontend validation will result in failure.

The application should demonstrate proper:
*   Authentication
*   Authorization / RBAC
*   Database transactions
*   Concurrency control
*   Date-range conflict detection
*   State-machine enforcement
*   Idempotency
*   Server-side price calculation
*   Coupon validation
*   Payment integrity
*   Refund integrity
*   Resource ownership validation
*   Error handling
*   Audit logging
*   Secure API design

## Submission

Submit exactly two links:

1.  **Public GitHub Repository**: Include a README with complete setup instructions.
2.  **Live Deployment URL**: A hosted, functional version of your application.

**Important:**
The application must be functional using the provided `mock_data.json` as the initial dataset.
Candidates may extend the dataset if required, but the core entities and relationships represented in the provided data must be supported.
