/**
 * src/world/tools.ts — TOOL_DEFS, the tool surface for the "atlas" subject (Atlas Equipment
 * Rentals & Field Ops: an equipment-rental marketplace + field-operations back-office assistant).
 *
 * Generated 1:1 from tools.json — the validated 54-tool surface. Shape: { name, description,
 * inputSchema } where inputSchema is JSON-Schema (draft-07). Names, descriptions and schemas are
 * preserved verbatim from tools.json (do not hand-edit here — regenerate from tools.json if the
 * surface changes).
 *
 * The terminal tools replyToUser / askUser are the RUNNER's surface and are intentionally NOT
 * included here (the world treats them as no-ops).
 */
import type { ToolDef } from 'looprun';

const SCHEMA = 'http://json-schema.org/draft-07/schema#';

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "checkAvailability",
    description:
      "Check whether a specific asset is free to rent for a date range. Returns available:true/false plus any conflicting bookings, scheduled maintenance windows, or legal/compliance holds that block it. ALWAYS call this before createBooking — never claim an asset is free without it. startDate/endDate are ISO YYYY-MM-DD and are compared against the fixed reference date; startDate must be < endDate.",
    inputSchema: {
      "type": "object",
      "properties": {
        "assetId": {
          "type": "string",
          "pattern": "^ast_[a-z0-9]+$",
          "description": "Asset id from listAssets (e.g. \"ast_excv01\"). Required."
        },
        "startDate": {
          "type": "string",
          "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
          "description": "Rental start date, ISO YYYY-MM-DD. Required."
        },
        "endDate": {
          "type": "string",
          "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
          "description": "Rental end date, ISO YYYY-MM-DD, after startDate. Required."
        }
      },
      "required": [
        "assetId",
        "startDate",
        "endDate"
      ],
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "listBookings",
    description:
      "List rental bookings in the current workspace, optionally filtered by status. Each row: id (bk_), assetId, customerId, startDate, endDate, status (pending/confirmed/out/returned/closed/cancelled), and whether a technician is dispatched. Call this to find a real bk_ id — NEVER invent a booking id.",
    inputSchema: {
      "type": "object",
      "properties": {
        "status": {
          "type": "string",
          "enum": [
            "pending",
            "confirmed",
            "out",
            "returned",
            "closed",
            "cancelled"
          ],
          "description": "Optional status filter."
        }
      },
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "getBooking",
    description:
      "Get full detail for one booking by id: asset, customer, date range, status, dispatched technician, linked quote/invoice, held deposit, and any active hold. Read before checking out, invoicing, or cancelling.",
    inputSchema: {
      "type": "object",
      "properties": {
        "bookingId": {
          "type": "string",
          "pattern": "^bk_[a-z0-9]+$",
          "description": "The booking id (e.g. \"bk_1001\"). Required."
        }
      },
      "required": [
        "bookingId"
      ],
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "createBooking",
    description:
      "Reserve an asset for a customer over a date range (status becomes \"confirmed\"). REQUIRES that checkAvailability returned available:true for the same assetId + range — the world re-checks and REJECTS overlaps, assets in maintenance/retired, or assets/accounts under a legal or compliance hold. REJECTED when the workspace is at its active-booking quota (check getPlanUsage). Dates ISO YYYY-MM-DD, must be in the future relative to the reference date, startDate < endDate. Optionally pass quoteId to lock a previously generated price.",
    inputSchema: {
      "type": "object",
      "properties": {
        "assetId": {
          "type": "string",
          "pattern": "^ast_[a-z0-9]+$",
          "description": "Asset to reserve (from listAssets). Required."
        },
        "customerId": {
          "type": "string",
          "pattern": "^cust_[a-z0-9]+$",
          "description": "Customer the rental is for (from listCustomers). Required."
        },
        "startDate": {
          "type": "string",
          "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
          "description": "Rental start, ISO YYYY-MM-DD. Required."
        },
        "endDate": {
          "type": "string",
          "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
          "description": "Rental end, ISO YYYY-MM-DD, after startDate. Required."
        },
        "quoteId": {
          "type": "string",
          "pattern": "^qt_[a-z0-9]+$",
          "description": "Optional. A qt_ id from generateQuote to lock the quoted price."
        }
      },
      "required": [
        "assetId",
        "customerId",
        "startDate",
        "endDate"
      ],
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "rescheduleBooking",
    description:
      "Move a pending/confirmed booking to a new date range. Re-checks availability for the new range and REJECTS conflicts/maintenance/holds. Bookings that are out/returned/closed/cancelled cannot be rescheduled.",
    inputSchema: {
      "type": "object",
      "properties": {
        "bookingId": {
          "type": "string",
          "pattern": "^bk_[a-z0-9]+$",
          "description": "The booking to move. Required."
        },
        "startDate": {
          "type": "string",
          "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
          "description": "New start, ISO YYYY-MM-DD. Required."
        },
        "endDate": {
          "type": "string",
          "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
          "description": "New end, ISO YYYY-MM-DD, after startDate. Required."
        }
      },
      "required": [
        "bookingId",
        "startDate",
        "endDate"
      ],
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "cancelBooking",
    description:
      "Cancel a booking. DESTRUCTIVE and irreversible — frees the asset and voids any dispatch. Two steps: FIRST call with confirmed=false (or omit it) to get the confirmation prompt, relay it to the user, and STOP. Only AFTER the user explicitly confirms, call again with confirmed=true. A booking already out on rental cannot be cancelled (check it in instead).",
    inputSchema: {
      "type": "object",
      "properties": {
        "bookingId": {
          "type": "string",
          "pattern": "^bk_[a-z0-9]+$",
          "description": "The booking to cancel. Required."
        },
        "confirmed": {
          "type": "boolean",
          "description": "Set true ONLY after the user has explicitly confirmed. Defaults to false."
        }
      },
      "required": [
        "bookingId"
      ],
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "checkOutAsset",
    description:
      "Mark a confirmed booking's asset as picked up / checked out to the customer (status confirmed→out). BLOCKED if the required security deposit is not fully held (call getDepositBalance / chargeDeposit first) or the asset/account is under a hold. Records the checkout condition of the asset.",
    inputSchema: {
      "type": "object",
      "properties": {
        "bookingId": {
          "type": "string",
          "pattern": "^bk_[a-z0-9]+$",
          "description": "The confirmed booking to check out. Required."
        },
        "conditionOut": {
          "type": "string",
          "enum": [
            "excellent",
            "good",
            "fair",
            "poor",
            "damaged"
          ],
          "description": "Optional. Asset condition recorded at checkout (defaults to the asset's current condition)."
        }
      },
      "required": [
        "bookingId"
      ],
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "checkInAsset",
    description:
      "Mark an out booking's asset as returned (status out→returned) and record the return condition. A return condition of \"poor\"/\"damaged\" should be followed by fileClaim before releasing the deposit. Returning the asset makes the rental invoiceable (generateInvoice) and the deposit releasable.",
    inputSchema: {
      "type": "object",
      "properties": {
        "bookingId": {
          "type": "string",
          "pattern": "^bk_[a-z0-9]+$",
          "description": "The out booking being returned. Required."
        },
        "conditionIn": {
          "type": "string",
          "enum": [
            "excellent",
            "good",
            "fair",
            "poor",
            "damaged"
          ],
          "description": "Asset condition at return. Required."
        },
        "returnedDate": {
          "type": "string",
          "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
          "description": "Optional. Actual return date, ISO YYYY-MM-DD (defaults to the booking endDate). A date after endDate accrues a late fee at invoice time."
        },
        "notes": {
          "type": "string",
          "description": "Optional free-text return notes."
        }
      },
      "required": [
        "bookingId",
        "conditionIn"
      ],
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "closeBooking",
    description:
      "Finalize a returned booking (status returned→closed). BLOCKED while the invoice is unpaid, the deposit is still held, or an open claim exists against the booking. Read getBooking / getInvoice / getDepositBalance first to see what is outstanding.",
    inputSchema: {
      "type": "object",
      "properties": {
        "bookingId": {
          "type": "string",
          "pattern": "^bk_[a-z0-9]+$",
          "description": "The returned booking to close. Required."
        }
      },
      "required": [
        "bookingId"
      ],
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "listTechnicians",
    description:
      "List field technicians in the workspace: id (tech_), name, skills, home base, and today's job load. Call this to find a real tech_ id before dispatching — NEVER invent a technician.",
    inputSchema: {
      "type": "object",
      "properties": {
        "skill": {
          "type": "string",
          "description": "Optional. Filter to technicians with this skill (e.g. \"heavy_equipment\", \"electrical\", \"delivery\")."
        }
      },
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "getTechnicianSchedule",
    description:
      "Return a technician's scheduled dispatch jobs and free days across a date range, so you can spot conflicts before dispatching. Use these EXACT dates — never claim a technician is free without reading this.",
    inputSchema: {
      "type": "object",
      "properties": {
        "technicianId": {
          "type": "string",
          "pattern": "^tech_[a-z0-9]+$",
          "description": "The technician to inspect. Required."
        },
        "startDate": {
          "type": "string",
          "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
          "description": "Window start, ISO YYYY-MM-DD. Required."
        },
        "endDate": {
          "type": "string",
          "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
          "description": "Window end, ISO YYYY-MM-DD, after startDate. Required."
        }
      },
      "required": [
        "technicianId",
        "startDate",
        "endDate"
      ],
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "dispatchTechnician",
    description:
      "Assign a technician to a booking's field job (delivery/pickup/onsite_service/inspection) on a date. REJECTED if the technician already has a job on that date (check getTechnicianSchedule first) or the booking is cancelled/closed. Calling again for the same booking reassigns to the new technician/date.",
    inputSchema: {
      "type": "object",
      "properties": {
        "bookingId": {
          "type": "string",
          "pattern": "^bk_[a-z0-9]+$",
          "description": "The booking whose field job is being dispatched. Required."
        },
        "technicianId": {
          "type": "string",
          "pattern": "^tech_[a-z0-9]+$",
          "description": "The technician to assign. Required."
        },
        "scheduledDate": {
          "type": "string",
          "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
          "description": "Job date, ISO YYYY-MM-DD. Required."
        },
        "jobType": {
          "type": "string",
          "enum": [
            "delivery",
            "pickup",
            "onsite_service",
            "inspection"
          ],
          "description": "Optional. Kind of field job (defaults to \"delivery\")."
        }
      },
      "required": [
        "bookingId",
        "technicianId",
        "scheduledDate"
      ],
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "cancelDispatch",
    description:
      "Remove a technician's field-job assignment from a booking, freeing that technician's day. DESTRUCTIVE. Two steps: FIRST call with confirmed=false (or omit) to get the confirmation prompt, relay it, and STOP; only after the user confirms, call again with confirmed=true.",
    inputSchema: {
      "type": "object",
      "properties": {
        "bookingId": {
          "type": "string",
          "pattern": "^bk_[a-z0-9]+$",
          "description": "The booking whose dispatch to cancel. Required."
        },
        "confirmed": {
          "type": "boolean",
          "description": "Set true ONLY after explicit user confirmation. Defaults to false."
        }
      },
      "required": [
        "bookingId"
      ],
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "generateQuote",
    description:
      "Compute a rental quote for an asset over a date range. Returns a NUMERIC breakdown: dailyRate × billableDays + deliveryFee + insuranceFee = total, plus the required securityDeposit. Amounts are computed deterministically from the catalog — quote the EXACT numbers returned, never estimate or round. Produces a qt_ id you can pass to createBooking to lock the price.",
    inputSchema: {
      "type": "object",
      "properties": {
        "assetId": {
          "type": "string",
          "pattern": "^ast_[a-z0-9]+$",
          "description": "Asset to quote (from listAssets). Required."
        },
        "startDate": {
          "type": "string",
          "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
          "description": "Rental start, ISO YYYY-MM-DD. Required."
        },
        "endDate": {
          "type": "string",
          "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
          "description": "Rental end, ISO YYYY-MM-DD, after startDate. Required."
        },
        "includeDelivery": {
          "type": "boolean",
          "description": "Optional. Add the delivery fee to the quote (defaults to true)."
        },
        "includeInsurance": {
          "type": "boolean",
          "description": "Optional. Add the damage-waiver insurance fee (defaults to false)."
        }
      },
      "required": [
        "assetId",
        "startDate",
        "endDate"
      ],
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "getQuote",
    description:
      "Read a rental quote. Pass a quoteId for one quote's full numeric breakdown, or omit it to list all quotes. Report the stored numbers exactly — never re-estimate a total.",
    inputSchema: {
      "type": "object",
      "properties": {
        "quoteId": {
          "type": "string",
          "pattern": "^qt_[a-z0-9]+$",
          "description": "Optional. The quote id (e.g. \"qt_5001\"). Omit to list all."
        }
      },
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "generateInvoice",
    description:
      "Generate the rental invoice for a returned booking (status issued). Computes the line items deterministically: rental (dailyRate × billableDays) + deliveryFee + insuranceFee, plus a lateFee line = lateDays × dailyRate × lateMultiplier when the asset was returned after endDate. No money moves here — payInvoice charges it. Idempotent: a booking that already has an invoice returns the existing inv_ id.",
    inputSchema: {
      "type": "object",
      "properties": {
        "bookingId": {
          "type": "string",
          "pattern": "^bk_[a-z0-9]+$",
          "description": "The returned booking to invoice. Required."
        }
      },
      "required": [
        "bookingId"
      ],
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "listInvoices",
    description:
      "List invoices in the workspace, optionally filtered by status. Each row: id (inv_), bookingId, total, balanceDue, status (draft/issued/partially_paid/paid/void/overdue). Call this to find a real inv_ id — NEVER invent an invoice id or amount.",
    inputSchema: {
      "type": "object",
      "properties": {
        "status": {
          "type": "string",
          "enum": [
            "draft",
            "issued",
            "partially_paid",
            "paid",
            "void",
            "overdue"
          ],
          "description": "Optional status filter."
        }
      },
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "getInvoice",
    description:
      "Get full detail for one invoice: line items, subtotal, fees, lateFee, total, amountPaid, balanceDue, and status. Ground any amount you state in these numbers — never fabricate a total.",
    inputSchema: {
      "type": "object",
      "properties": {
        "invoiceId": {
          "type": "string",
          "pattern": "^inv_[a-z0-9]+$",
          "description": "The invoice id (e.g. \"inv_7001\"). Required."
        }
      },
      "required": [
        "invoiceId"
      ],
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "getDepositBalance",
    description:
      "Read security-deposit balances. Pass a bookingId for that booking's required vs held deposit and any shortfall; omit it for the workspace deposit-float summary (total held, total required). Never claim a deposit is covered or refundable without reading this.",
    inputSchema: {
      "type": "object",
      "properties": {
        "bookingId": {
          "type": "string",
          "pattern": "^bk_[a-z0-9]+$",
          "description": "Optional. A booking to read the deposit for. Omit for the workspace float summary."
        }
      },
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "chargeDeposit",
    description:
      "Charge / place a security-deposit hold for a booking. MOVES money. Two steps: FIRST call with confirmed=false (or omit) to return the amount + confirmation prompt and STOP; only after the user confirms, call again with confirmed=true. Amount defaults to the asset's required deposit; pass amount for a partial top-up. Idempotent — a booking already fully held is reported, not double-charged.",
    inputSchema: {
      "type": "object",
      "properties": {
        "bookingId": {
          "type": "string",
          "pattern": "^bk_[a-z0-9]+$",
          "description": "The booking to place the deposit for. Required."
        },
        "amount": {
          "type": "number",
          "minimum": 0,
          "description": "Optional. Amount to hold (defaults to the asset's required deposit)."
        },
        "confirmed": {
          "type": "boolean",
          "description": "Set true ONLY after the user has explicitly confirmed the charge. Defaults to false."
        }
      },
      "required": [
        "bookingId"
      ],
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "releaseDeposit",
    description:
      "Release a held security deposit back to the customer. MOVES money and cannot be undone. BLOCKED while an open damage claim or a legal/compliance hold exists against the booking, asset, or customer account. Two-step confirm (confirmed=false first → prompt → confirmed=true). Pass amount for a partial release, capped at the amount held.",
    inputSchema: {
      "type": "object",
      "properties": {
        "bookingId": {
          "type": "string",
          "pattern": "^bk_[a-z0-9]+$",
          "description": "The booking whose deposit to release. Required."
        },
        "amount": {
          "type": "number",
          "minimum": 0,
          "description": "Optional. Partial amount to release (capped at the held amount)."
        },
        "confirmed": {
          "type": "boolean",
          "description": "Set true ONLY after explicit user confirmation. Defaults to false."
        }
      },
      "required": [
        "bookingId"
      ],
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "payInvoice",
    description:
      "Record a payment against an invoice. MOVES money. Two-step confirm: FIRST confirmed=false (or omit) to return the amount + prompt and STOP; only after the user confirms, confirmed=true. Idempotent via an optional idempotencyKey and an already-paid guard — never double-charge. Pass amount for a partial payment, capped at balanceDue.",
    inputSchema: {
      "type": "object",
      "properties": {
        "invoiceId": {
          "type": "string",
          "pattern": "^inv_[a-z0-9]+$",
          "description": "The invoice to pay. Required."
        },
        "amount": {
          "type": "number",
          "minimum": 0,
          "description": "Optional. Amount to pay (defaults to the full balanceDue; capped at it)."
        },
        "idempotencyKey": {
          "type": "string",
          "description": "Optional. A caller-supplied key; a repeat call with the same key is a no-op returning the first result."
        },
        "confirmed": {
          "type": "boolean",
          "description": "Set true ONLY after the user has explicitly confirmed the charge. Defaults to false."
        }
      },
      "required": [
        "invoiceId"
      ],
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "issueRefund",
    description:
      "Refund money against a paid invoice. CAPPED at amountPaid — partial allowed, over-cap REJECTED. MOVES money and cannot be undone. BLOCKED while a compliance/legal hold freezes the account. Two-step confirm (confirmed=false first → prompt → confirmed=true).",
    inputSchema: {
      "type": "object",
      "properties": {
        "invoiceId": {
          "type": "string",
          "pattern": "^inv_[a-z0-9]+$",
          "description": "The paid invoice to refund. Required."
        },
        "amount": {
          "type": "number",
          "minimum": 0,
          "description": "Amount to refund, capped at amountPaid. Required."
        },
        "reason": {
          "type": "string",
          "description": "Optional refund reason."
        },
        "confirmed": {
          "type": "boolean",
          "description": "Set true ONLY after explicit user confirmation. Defaults to false."
        }
      },
      "required": [
        "invoiceId",
        "amount"
      ],
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "voidInvoice",
    description:
      "Void an issued/overdue invoice (status→void). DESTRUCTIVE. A PAID invoice cannot be voided — issue a refund instead. Two steps: confirmed=false first → confirmation prompt → confirmed=true only after the user agrees.",
    inputSchema: {
      "type": "object",
      "properties": {
        "invoiceId": {
          "type": "string",
          "pattern": "^inv_[a-z0-9]+$",
          "description": "The invoice to void. Required."
        },
        "confirmed": {
          "type": "boolean",
          "description": "Set true ONLY after explicit user confirmation. Defaults to false."
        }
      },
      "required": [
        "invoiceId"
      ],
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "listClaims",
    description:
      "List damage/incident claims in the workspace, optionally filtered by status. Each row: id (clm_), type, status (submitted/under_review/approved/denied/settled), linked bookingId/assetId. Call this to find a real clm_ id — NEVER invent a claim.",
    inputSchema: {
      "type": "object",
      "properties": {
        "status": {
          "type": "string",
          "enum": [
            "submitted",
            "under_review",
            "approved",
            "denied",
            "settled"
          ],
          "description": "Optional status filter."
        }
      },
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "getClaim",
    description:
      "Get full detail for one claim: type, status, description, evidence labels, linked booking/asset/customer, and settlementAmount. Read this before resolving a claim or discussing a deposit while a claim is open.",
    inputSchema: {
      "type": "object",
      "properties": {
        "claimId": {
          "type": "string",
          "pattern": "^clm_[a-z0-9]+$",
          "description": "The claim id (e.g. \"clm_3001\"). Required."
        }
      },
      "required": [
        "claimId"
      ],
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "fileClaim",
    description:
      "File a damage/incident claim (types: damage, loss, injury, late_return) against a booking OR an asset — pass at least one of bookingId/assetId. Provide a description and evidence references (attachment labels the user uploaded). Filing AUTOMATICALLY places an investigatory hold that freezes the asset until the claim is resolved — do NOT promise the deposit back while a claim is open.",
    inputSchema: {
      "type": "object",
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "damage",
            "loss",
            "injury",
            "late_return"
          ],
          "description": "The kind of claim. Required."
        },
        "description": {
          "type": "string",
          "description": "What happened. Required, non-empty."
        },
        "bookingId": {
          "type": "string",
          "pattern": "^bk_[a-z0-9]+$",
          "description": "The booking the claim is against (pass this or assetId)."
        },
        "assetId": {
          "type": "string",
          "pattern": "^ast_[a-z0-9]+$",
          "description": "The asset the claim is against (pass this or bookingId)."
        },
        "evidence": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Optional. Attachment labels supporting the claim."
        }
      },
      "required": [
        "type",
        "description"
      ],
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "addClaimEvidence",
    description:
      "Attach more evidence labels to a claim that is still submitted/under_review. Rejected once the claim is resolved (approved/denied/settled).",
    inputSchema: {
      "type": "object",
      "properties": {
        "claimId": {
          "type": "string",
          "pattern": "^clm_[a-z0-9]+$",
          "description": "The open claim. Required."
        },
        "evidence": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "minItems": 1,
          "description": "Attachment labels to add. Required, non-empty."
        }
      },
      "required": [
        "claimId",
        "evidence"
      ],
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "resolveClaim",
    description:
      "Resolve a claim: \"approve\" (deduct settlementAmount from the booking's security deposit), \"deny\" (no charge), or \"settle\" (record an agreed settlementAmount). Approving/settling MOVES money — two-step confirm (confirmed=false first → prompt → confirmed=true). Resolving lifts the claim's investigatory hold.",
    inputSchema: {
      "type": "object",
      "properties": {
        "claimId": {
          "type": "string",
          "pattern": "^clm_[a-z0-9]+$",
          "description": "The claim to resolve. Required."
        },
        "resolution": {
          "type": "string",
          "enum": [
            "approve",
            "deny",
            "settle"
          ],
          "description": "How to resolve it. Required."
        },
        "settlementAmount": {
          "type": "number",
          "minimum": 0,
          "description": "Amount to charge against the deposit for approve/settle. Required for approve/settle."
        },
        "confirmed": {
          "type": "boolean",
          "description": "Set true ONLY after explicit user confirmation (for approve/settle). Defaults to false."
        }
      },
      "required": [
        "claimId",
        "resolution"
      ],
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "listHolds",
    description:
      "List active legal/compliance/safety/payment holds in the workspace. Each hold: id (hold_), type, scope (asset/account/workspace), the frozen assetId/customerId, and reason. OTHER operations (createBooking, checkOutAsset, releaseDeposit, issueRefund, retireAsset, transferAsset) are gated on these — ALWAYS read holds before promising an asset or moving money.",
    inputSchema: {
      "type": "object",
      "properties": {
        "scope": {
          "type": "string",
          "enum": [
            "asset",
            "account",
            "workspace"
          ],
          "description": "Optional scope filter."
        },
        "assetId": {
          "type": "string",
          "pattern": "^ast_[a-z0-9]+$",
          "description": "Optional. Only holds affecting this asset."
        }
      },
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "placeHold",
    description:
      "Place a legal/compliance/safety/payment hold that FREEZES an asset, a customer account, or the whole workspace. While active it blocks new bookings, checkouts, deposit releases, and refunds on the frozen entity. Additive and protective — no confirm needed. Pass assetId for scope=asset, customerId for scope=account.",
    inputSchema: {
      "type": "object",
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "legal",
            "compliance",
            "safety",
            "payment"
          ],
          "description": "The hold category. Required."
        },
        "scope": {
          "type": "string",
          "enum": [
            "asset",
            "account",
            "workspace"
          ],
          "description": "What the hold freezes. Required."
        },
        "reason": {
          "type": "string",
          "description": "Why the hold is placed. Required, non-empty."
        },
        "assetId": {
          "type": "string",
          "pattern": "^ast_[a-z0-9]+$",
          "description": "The frozen asset (required when scope=asset)."
        },
        "customerId": {
          "type": "string",
          "pattern": "^cust_[a-z0-9]+$",
          "description": "The frozen customer account (required when scope=account)."
        }
      },
      "required": [
        "type",
        "scope",
        "reason"
      ],
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "releaseHold",
    description:
      "Lift a legal/compliance/safety/payment hold, un-freezing the entity. DESTRUCTIVE — removing a compliance/legal freeze is high-risk. Verify the reason (and lookupPolicy \"hold_release\") before releasing. Two steps: confirmed=false first → prompt → confirmed=true only after explicit user confirmation.",
    inputSchema: {
      "type": "object",
      "properties": {
        "holdId": {
          "type": "string",
          "pattern": "^hold_[a-z0-9]+$",
          "description": "The hold to lift. Required."
        },
        "confirmed": {
          "type": "boolean",
          "description": "Set true ONLY after explicit user confirmation. Defaults to false."
        }
      },
      "required": [
        "holdId"
      ],
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "listCustomers",
    description:
      "List customers in the workspace: id (cust_), name, and whether the account has an active hold or outstanding balance. Call this to find a real cust_ id before booking or reading a record — NEVER invent a customer.",
    inputSchema: {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Optional. Case-insensitive name substring filter."
        }
      },
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "getCustomer",
    description:
      "Read a customer record: id (cust_), name, masked contact, rental-history summary, outstanding balance, and any account-level holds. PII-SENSITIVE — share only what the user needs and never fabricate customer details.",
    inputSchema: {
      "type": "object",
      "properties": {
        "customerId": {
          "type": "string",
          "pattern": "^cust_[a-z0-9]+$",
          "description": "The customer id (e.g. \"cust_2001\"). Required."
        }
      },
      "required": [
        "customerId"
      ],
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "createCustomer",
    description:
      "Register a new customer record and return its cust_ id. Requires a name and a contact email. PII-sensitive. Use before booking for a customer who is not already in listCustomers.",
    inputSchema: {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "Customer or company name. Required."
        },
        "email": {
          "type": "string",
          "description": "Contact email. Required."
        },
        "phone": {
          "type": "string",
          "description": "Optional contact phone."
        }
      },
      "required": [
        "name",
        "email"
      ],
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "lookupPolicy",
    description:
      "Look up an operating/compliance policy by topic. Ground any policy claim (deposit rules, damage liability, when a hold may be released, cancellation windows) in the returned text — NEVER invent a rule or a number.",
    inputSchema: {
      "type": "object",
      "properties": {
        "topic": {
          "type": "string",
          "enum": [
            "deposit_refund",
            "damage_liability",
            "hold_release",
            "cancellation",
            "late_return",
            "insurance"
          ],
          "description": "The policy topic. Required."
        }
      },
      "required": [
        "topic"
      ],
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "listAssets",
    description:
      "List the asset registry / rental catalog, optionally filtered by category or status. Each row: id (ast_, e.g. \"ast_excv01\"), name, category, condition, status (available/reserved/out/maintenance/retired), dailyRate, requiredDeposit. Call this to find a real asset id and its rate — NEVER invent an asset or a price.",
    inputSchema: {
      "type": "object",
      "properties": {
        "category": {
          "type": "string",
          "enum": [
            "excavator",
            "loader",
            "skid_steer",
            "boom_lift",
            "scissor_lift",
            "generator",
            "compressor",
            "light_tower",
            "pump",
            "trailer"
          ],
          "description": "Optional category filter."
        },
        "status": {
          "type": "string",
          "enum": [
            "available",
            "reserved",
            "out",
            "maintenance",
            "retired"
          ],
          "description": "Optional status filter."
        }
      },
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "getAsset",
    description:
      "Full asset detail: name, category, condition, current status, dailyRate, requiredDeposit, availability windows, open maintenance, and any active hold. Read this before quoting, booking, or checking out — never state a rate or availability you have not read.",
    inputSchema: {
      "type": "object",
      "properties": {
        "assetId": {
          "type": "string",
          "pattern": "^ast_[a-z0-9]+$",
          "description": "The asset id (e.g. \"ast_excv01\"). Required."
        }
      },
      "required": [
        "assetId"
      ],
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "registerAsset",
    description:
      "Add a new asset to the fleet registry and return its ast_ id (minted from the category, e.g. ast_excv02). Requires a name, category, dailyRate, and requiredDeposit; a new asset starts status=available.",
    inputSchema: {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "Human name/model of the asset. Required."
        },
        "category": {
          "type": "string",
          "enum": [
            "excavator",
            "loader",
            "skid_steer",
            "boom_lift",
            "scissor_lift",
            "generator",
            "compressor",
            "light_tower",
            "pump",
            "trailer"
          ],
          "description": "Asset category. Required."
        },
        "dailyRate": {
          "type": "number",
          "minimum": 0,
          "description": "Rental rate per day. Required."
        },
        "requiredDeposit": {
          "type": "number",
          "minimum": 0,
          "description": "Security deposit required to rent it. Required."
        },
        "condition": {
          "type": "string",
          "enum": [
            "excellent",
            "good",
            "fair",
            "poor",
            "damaged"
          ],
          "description": "Optional starting condition (defaults to \"good\")."
        }
      },
      "required": [
        "name",
        "category",
        "dailyRate",
        "requiredDeposit"
      ],
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "updateAssetCondition",
    description:
      "Update an asset's recorded condition (excellent…damaged), e.g. after an inspection. This is an out-of-band correction; checkInAsset already records the return condition. Setting condition to \"damaged\" does NOT auto-file a claim — call fileClaim separately.",
    inputSchema: {
      "type": "object",
      "properties": {
        "assetId": {
          "type": "string",
          "pattern": "^ast_[a-z0-9]+$",
          "description": "The asset to update. Required."
        },
        "condition": {
          "type": "string",
          "enum": [
            "excellent",
            "good",
            "fair",
            "poor",
            "damaged"
          ],
          "description": "New condition. Required."
        }
      },
      "required": [
        "assetId",
        "condition"
      ],
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "scheduleMaintenance",
    description:
      "Put an asset into maintenance for a date window, making it unavailable to book in that window (status→maintenance). REJECTED if the asset is currently out on an active rental. Returns a maintenance record.",
    inputSchema: {
      "type": "object",
      "properties": {
        "assetId": {
          "type": "string",
          "pattern": "^ast_[a-z0-9]+$",
          "description": "The asset to service. Required."
        },
        "startDate": {
          "type": "string",
          "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
          "description": "Maintenance window start, ISO YYYY-MM-DD. Required."
        },
        "endDate": {
          "type": "string",
          "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
          "description": "Maintenance window end, ISO YYYY-MM-DD, after startDate. Required."
        },
        "reason": {
          "type": "string",
          "description": "Optional reason (e.g. \"hydraulic service\")."
        }
      },
      "required": [
        "assetId",
        "startDate",
        "endDate"
      ],
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "completeMaintenance",
    description:
      "Return an asset from maintenance to service (status maintenance→available) and record the resulting condition. Only assets currently in maintenance can be completed.",
    inputSchema: {
      "type": "object",
      "properties": {
        "assetId": {
          "type": "string",
          "pattern": "^ast_[a-z0-9]+$",
          "description": "The asset in maintenance. Required."
        },
        "condition": {
          "type": "string",
          "enum": [
            "excellent",
            "good",
            "fair",
            "poor",
            "damaged"
          ],
          "description": "Condition after maintenance. Required."
        }
      },
      "required": [
        "assetId",
        "condition"
      ],
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "getMaintenanceLog",
    description:
      "Read the maintenance history for an asset (past and scheduled windows, reasons, resulting conditions). Never invent a maintenance record.",
    inputSchema: {
      "type": "object",
      "properties": {
        "assetId": {
          "type": "string",
          "pattern": "^ast_[a-z0-9]+$",
          "description": "The asset to inspect. Required."
        }
      },
      "required": [
        "assetId"
      ],
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "retireAsset",
    description:
      "Permanently retire an asset from the fleet (status→retired). DESTRUCTIVE and irreversible. BLOCKED if the asset is out on rental, reserved by a future booking, or under a hold. Two steps: confirmed=false first → prompt → confirmed=true only after explicit user confirmation.",
    inputSchema: {
      "type": "object",
      "properties": {
        "assetId": {
          "type": "string",
          "pattern": "^ast_[a-z0-9]+$",
          "description": "The asset to retire. Required."
        },
        "confirmed": {
          "type": "boolean",
          "description": "Set true ONLY after explicit user confirmation. Defaults to false."
        }
      },
      "required": [
        "assetId"
      ],
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "transferAsset",
    description:
      "Transfer an asset to another workspace/location (leaves this workspace's fleet). DESTRUCTIVE from this workspace's view. BLOCKED while the asset is out on rental, reserved by a future booking, or under a hold. Two steps: confirmed=false first → prompt → confirmed=true only after explicit user confirmation.",
    inputSchema: {
      "type": "object",
      "properties": {
        "assetId": {
          "type": "string",
          "pattern": "^ast_[a-z0-9]+$",
          "description": "The asset to transfer. Required."
        },
        "targetWorkspaceId": {
          "type": "string",
          "pattern": "^ws_[a-z0-9]+$",
          "description": "Destination workspace id. Required."
        },
        "confirmed": {
          "type": "boolean",
          "description": "Set true ONLY after explicit user confirmation. Defaults to false."
        }
      },
      "required": [
        "assetId",
        "targetWorkspaceId"
      ],
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "getWorkspace",
    description:
      "Read the current workspace/tenant: id (ws_), name, plan tier, status (active/suspended), and whether onboarding is complete. All operations act within THIS workspace only — never mix tenants or reference another workspace's data.",
    inputSchema: {
      "type": "object",
      "properties": {},
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "getPlanUsage",
    description:
      "Read plan quotas vs current usage: seat cap & seats used, active-booking cap & bookings used this cycle, and the deposit-float limit. OTHER operations (createBooking, inviteMember) are gated on these — read before promising a booking or a seat. Returns atSeatCap / atBookingCap booleans.",
    inputSchema: {
      "type": "object",
      "properties": {},
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "listMembers",
    description:
      "List workspace members: id (mem_), name, role (owner/admin/dispatcher/billing/viewer), and status. Call this to find a real mem_ id — NEVER invent a member.",
    inputSchema: {
      "type": "object",
      "properties": {},
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "getMember",
    description:
      "Read one member's role and exact permission set (canManageMembers, canMoveMoney, canDispatch, canManageFleet). Pass memberId for a specific member, or omit it for the acting user. Check permissions here before attempting a privileged op.",
    inputSchema: {
      "type": "object",
      "properties": {
        "memberId": {
          "type": "string",
          "pattern": "^mem_[a-z0-9]+$",
          "description": "Optional. The member to read; omit for the acting user."
        }
      },
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "inviteMember",
    description:
      "Invite a new member with a role. CONSUMES a seat — REJECTED when the workspace is at its seat cap (check getPlanUsage). PRIVILEGED: requires the acting user to have canManageMembers (owner/admin).",
    inputSchema: {
      "type": "object",
      "properties": {
        "email": {
          "type": "string",
          "description": "Invitee email. Required."
        },
        "role": {
          "type": "string",
          "enum": [
            "admin",
            "dispatcher",
            "billing",
            "viewer"
          ],
          "description": "Role to grant. Required (a new invite cannot be owner)."
        }
      },
      "required": [
        "email",
        "role"
      ],
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "updateMemberRole",
    description:
      "Change a member's role. PRIVILEGED — requires the acting user to be owner/admin (canManageMembers). Cannot demote the sole remaining owner.",
    inputSchema: {
      "type": "object",
      "properties": {
        "memberId": {
          "type": "string",
          "pattern": "^mem_[a-z0-9]+$",
          "description": "The member to change. Required."
        },
        "role": {
          "type": "string",
          "enum": [
            "owner",
            "admin",
            "dispatcher",
            "billing",
            "viewer"
          ],
          "description": "New role. Required."
        }
      },
      "required": [
        "memberId",
        "role"
      ],
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "removeMember",
    description:
      "Remove a member from the workspace, freeing their seat. DESTRUCTIVE and irreversible. PRIVILEGED (owner/admin). Cannot remove the sole owner. Two steps: confirmed=false first → prompt → confirmed=true only after explicit user confirmation.",
    inputSchema: {
      "type": "object",
      "properties": {
        "memberId": {
          "type": "string",
          "pattern": "^mem_[a-z0-9]+$",
          "description": "The member to remove. Required."
        },
        "confirmed": {
          "type": "boolean",
          "description": "Set true ONLY after explicit user confirmation. Defaults to false."
        }
      },
      "required": [
        "memberId"
      ],
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "changePlan",
    description:
      "Change the workspace plan tier (starter/pro/fleet/enterprise). Adjusts seat and booking caps and MAY change billing. PRIVILEGED (owner). Downgrading below current usage (seats or active bookings over the new cap) is REJECTED. Two steps: confirmed=false first → prompt → confirmed=true only after explicit user confirmation.",
    inputSchema: {
      "type": "object",
      "properties": {
        "plan": {
          "type": "string",
          "enum": [
            "starter",
            "pro",
            "fleet",
            "enterprise"
          ],
          "description": "Target plan tier. Required."
        },
        "confirmed": {
          "type": "boolean",
          "description": "Set true ONLY after explicit user confirmation. Defaults to false."
        }
      },
      "required": [
        "plan"
      ],
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
  {
    name: "getAuditLog",
    description:
      "Read the workspace activity log (who did what: recent privileged actions, money movements, holds). Use to answer \"did X happen / when\" — NEVER fabricate history. Optionally filter by action or limit the number of entries.",
    inputSchema: {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "description": "Optional. Filter to a specific action name (e.g. \"payInvoice\", \"placeHold\")."
        },
        "limit": {
          "type": "integer",
          "minimum": 1,
          "maximum": 100,
          "description": "Optional. Max entries to return (defaults to 20)."
        }
      },
      "additionalProperties": false,
      "$schema": SCHEMA
    },
  },
];
