# Official XLSM Movement Tracker Export

## Endpoint And Access

The Safety-only export is available at:

```text
GET /api/safety/movements/export.xlsx
GET /api/safety/movements/export.xlsx?movementId=MOV-...
```

The URL is retained for compatibility. The response is an `.xlsm` file with the macro-enabled Excel MIME type.
The unfiltered endpoint exports all `FINAL_APPROVED` movements; the optional filter exports one movement only
when it is `FINAL_APPROVED`. Backend `SAFETY` authorization is authoritative. SharePoint is not involved.

## Official Template

The default template is:

```text
doc/Movement_Tracker_LIVE (1).xlsm
```

`MOVEMENT_PLAN_TEMPLATE_PATH` may override it with a trusted copy of the same official workbook. The renderer
resolves `Movement Tracker` by workbook sheet name and relationship. It replaces only export-dataset cells in
rows 4 through 5999 and leaves every other package part unchanged.

The output remains macro-enabled. Generation fails unless `xl/vbaProject.bin` is present, and its SHA-256 is
verified after rendering. Tests also verify that every package part except the target worksheet has identical
uncompressed bytes before and after generation.

## Mapping

Each application Movement Request is one deterministic `Pxx` plan. Plans are ordered by movement date, ETD,
and stable movement ID. Each persisted segment produces one row and retains/restarts its `M01`, `M02`, ...
number within its plan.

`A:AF` follow the official Movement Tracker headers. The Vehicle Leader is always in G; other passengers use
H:L; the driver is in M and is included in D. Passenger overflow is recorded in AF using `PAX_MANIFEST` and
`EXTRA_PAX_COUNT`. Missing optional coordinates and unsupported risk, marker, IMEI, and arrived values remain
blank. `FINAL_APPROVED` maps to the official validation value `YES` in AD.

All persisted text is written as inline string content, so formula-like input remains inert. Dates and numeric
coordinates are written as numeric cells. Helper values in BN:BP are regenerated for Plan Summary; formulas,
styles, validations, names, relationships, drawings, controls, and hidden content outside the dataset cells are
preserved.

## Official Limits

The renderer does not expand the workbook's existing boundaries:

- Plan Summary recognizes `P01` through `P50`.
- Plan Summary formulas read Movement Tracker rows 4 through 5999.
- The built-in VBA sorter handles rows 4 through 2500.

Exports exceeding 50 plans or 5,996 segment rows are rejected rather than silently truncated.
