# Campaign Template Setup Guide

## Quick Start

To create a new campaign, follow these steps:

### 1. Create the Campaign's Google Sheet

1. Duplicate the KSY Google Sheet (or create a new one)
2. Ensure it has these tabs with the correct column headers:

#### Pledges Tab (Columns A-P)
| A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Pledge ID | Customer ID | Created Date | Donor | Campaign | Amount | Status | Amount Paid | Balance | Display Name | Memo | Anonymous | Teams | Method | Schedule ID | Notes |

#### Transactions Tab (Columns A-L)
| A | B | C | D | E | F | G | H | I | J | K | L |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Timestamp | Reference | Amount Charged | Donor Name | Pledge ID | Customer ID | Result | Method | Card Type | Payment # | Funded | Funded Date |

#### Customers Tab (Columns A-K)
| A | B | C | D | E | F | G | H | I | J | K |
|---|---|---|---|---|---|---|---|---|---|---|
| Customer ID | First Name | Last Name | Email | Phone | Street | City | State | Zip | Created Date | Source |

#### Scheduled Payments Tab (Columns A-M)
| A | B | C | D | E | F | G | H | I | J | K | L | M |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Created | Schedule ID | Pledge ID | Customer ID | Donor | Per-Payment Amt | Total Pledge | Frequency | Total Payments | Payment # | Due Date | Status | Transaction Ref |

#### Teams Tab (Columns A-F)
| A | B | C | D | E | F |
|---|---|---|---|---|---|
| Team ID | Team Name | Team Contact Name | Team Contact Email | Notify on New Donation | Team Goal |

#### LinkClicks Tab (Columns A-F)
| A | B | C | D | E | F |
|---|---|---|---|---|---|
| Timestamp | First Name | Last Name | Email | Link Clicked | Campaign |

#### Campaigns Tab (Campaign-Level Config)
| Column | Header |
|--------|--------|
| A | Short Code |
| B | Long Name Eng |
| C | Goal |
| D | Manager Email |
| E | Manager Name |
| F | Notify on New Donation |

### 2. Set Up the Campaign Backend

1. Create a new Google Apps Script project (or copy the existing Code.gs)
2. Set Script Properties:
   - `LOG_SHEET_ID` — The campaign's Google Sheet ID
   - `CARDKNOX_API_KEY` — Cardknox server API key
   - `USAEPAY_SOURCE_KEY` — USAePay source key (optional, if using USAePay)
   - `USAEPAY_PIN` — USAePay API PIN (optional)
   - `TURNSTILE_SECRET` — Cloudflare Turnstile secret key
   - `ADMIN_KEY` — Admin passphrase (for legacy admin access)
   - `CAMPAIGN_SHEETS` — JSON mapping: `{"campaign_id": "SHEET_ID"}`
3. Deploy as Web App: Execute as **Me**, Access: **Anyone**
4. Copy the deployment URL

### 3. Copy and Configure Template Files

#### Donation Page
1. Copy `templates/donation-page/template.html` to the project root
2. Rename to your campaign slug (e.g., `purim-2026.html`)
3. Replace all `{{...}}` placeholders in the `CAMPAIGN_CONFIG` block:

```javascript
const CAMPAIGN_CONFIG = {
    id: 'purim-2026',                    // Unique slug
    name: 'Purim 2026',                  // Display name
    nameHebrew: 'פורים תשפ"ו',          // Hebrew name
    subtitle: 'Give joy this Purim',     // Subtitle
    // ... etc
};
```

#### Admin Page
1. Copy `templates/admin-page/template.html` to `admin/your-campaign/index.html`
2. Replace `{{...}}` placeholders in `CAMPAIGN_CONFIG`

#### Donor Wall
1. Copy `templates/wall-page/template.html` to `wall/your-campaign/index.html`
2. Replace `{{...}}` placeholders in `WALL_CONFIG`

### 4. Register in Master Sheet

Add a row to the **Campaigns** tab of the Master Sheet:

| Column | Value |
|--------|-------|
| A (Campaign ID) | `purim-2026` |
| B (Campaign Name) | `Purim 2026` |
| C (Status) | `Active` |
| D (Campaign Sheet ID) | Your Google Sheet ID |
| E (Apps Script URL) | Your deployment URL |
| F (Primary Gateway) | `cardknox` or `usaepay` |
| G-J (API Keys) | Your gateway keys |
| K (Goal Amount) | `50000` |
| L-M (Dates) | Start/End dates |
| N-P (URLs) | Page URLs |
| Q (Wall Enabled) | `Yes` |

### 5. Deploy

1. Commit all new files to git
2. Push to GitHub — pages go live automatically via GitHub Pages
3. Test the donation flow end-to-end in sandbox mode first

## Rollback

If anything goes wrong with the campaign:
1. Set campaign status to `Inactive` in the Master Sheet
2. Delete or rename the page files
3. The campaign disappears from the general donation page selector

## Gateway Configuration

Each campaign can use either or both gateways:

- **Cardknox**: Set iFields Key (client) + Server Key (backend)
- **USAePay**: Set Public Key (client) + Source Key + PIN (backend)
- **Primary Gateway**: Which to try first. The other is automatic failover.

## Funded/Cleared Tracking

- Gateway transactions auto-set to `Funded = Pending`
- Manually mark as `Cleared` when funds hit the bank via Admin Console
- Bulk-clear multiple transactions at once
