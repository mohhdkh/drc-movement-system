# Private workbook mount point

Operational Excel workbooks are intentionally excluded from Git and Docker images. In an authorized production
environment, mount the official macro-enabled workbook outside the repository and set
`MOVEMENT_PLAN_TEMPLATE_PATH` to its absolute path.
