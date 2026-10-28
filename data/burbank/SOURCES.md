# Burbank data sources

## BT-1: LA County CAMS Address Points (checked 2026-10-28)

Layer: CAMS Address Points, `https://rpgis.isd.lacounty.gov/arcgis/rest/services/GISNET_Public/MapServer/402` (Enterprise GIS Section, LA County Internal Services Department).

### License
- The layer metadata says the data is "for informational purposes" and may not be suitable for legal or engineering use.
- The county "reserves the right to change, restrict or discontinue access at any time".
- Users of the county's maps and data, and anyone deriving data from its REST URLs, agree to the Terms of Use on the County of LA eGIS Hub. The metadata links to those terms; **the full Terms of Use text was not read in this check**, so redistribution rights for derived data are unconfirmed.
- No separate credits or terms field is published. The copyright field names the county's Geographic Information Officer.
- What we commit is derived: `blocks.csv` holds segment ids, hundred-block numbers and address ranges, not address points. Raw address points are not committed.

### Burbank coverage
Query `LegalComm='Burbank'` returned **27,881** address points.

| Source field | Points |
| --- | --- |
| Office of Assessor | 27,197 |
| Assessor | 646 |
| (blank) | 31 |
| LACO DPW Add | 5 |
| Glendale GIS | 1 |
| LA City | 1 |

Findings:
- Burbank points come almost entirely from the Assessor, not a city database. The layer notes that Assessor-sourced cities may show only the primary address per parcel, so multi-address parcels (shopping centers, apartments) are under-represented.
- Block numbering needs only one address per block face, so coverage is likely adequate for most residential blocks. Commercial blocks and parcels with several addresses may still need hand entry.
- Parklas's existing report (178 of 2,582 blocks numbered) was built from a different address source, so CAMS should improve on it. The real match rate is only known after task 1.4.
- Points use California State Plane V (EPSG:2229, feet); the script must request or convert to WGS84.
- The layer allows 2,000 records per request, so the script pages through results.

## Reused from Parklas (author-owned)
Street segments and the existing blocks report come from `https://github.com/sherburnec/Parklas`.
