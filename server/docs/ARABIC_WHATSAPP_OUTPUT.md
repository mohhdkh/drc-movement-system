# Arabic WhatsApp Movement Output

Phase 14 adds server-generated, copy-ready Arabic text for one final-approved movement. It does not send messages or connect to WhatsApp.

## Endpoint

`GET /api/area-manager/movements/:id/whatsapp-text`

The endpoint uses the existing Area Manager authentication middleware and returns:

```json
{
  "data": {
    "movementId": "MOV-EXAMPLE",
    "text": "Arabic copy-ready text"
  }
}
```

Only `FINAL_APPROVED` movements are available. A missing, rejected, or in-progress movement returns `404`, so the endpoint cannot be used to preview unapproved operational data.

## Architecture

- `whatsAppMovementMapper.js` resolves persisted movement relationships to a message-neutral data shape.
- `whatsAppMovementFormatter.js` owns all Arabic labels and message layout.
- `whatsAppMovementService.js` reads through the existing operational data boundary. Under the PostgreSQL provider, request middleware refreshes these collections from PostgreSQL before generation.
- `whatsAppMovementController.js` exposes the result as non-cacheable JSON.

The formatter can be revised later without changing persistence or relationship mapping.

## Field Rules

- Passenger count is the count of unique passengers across all persisted segments.
- The passenger list preserves first appearance across chronological segments.
- Each segment also shows its own passenger list and count.
- Segment order follows persisted sequence and supports any number of segments.
- Phone lines and coordinates appear only when persisted master data contains them.
- Location coordinates require an exact, case-insensitive location-name match.
- `NO_GPS` is rendered explicitly; no WhatsApp API or direct-send behavior is included.
