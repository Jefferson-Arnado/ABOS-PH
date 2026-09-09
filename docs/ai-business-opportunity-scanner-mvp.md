🚀 AI Business Opportunity Scanner — Detailed MVP
One-sentence product definition

Find local businesses with weak or missing online presence, identify what they are missing, score the opportunity, and give freelancers a reason to contact them.

The MVP should not try to become a full CRM, email automation platform, or giant business intelligence system yet.

1. 🎯 MVP Target Customer

Start with one customer type:

Web developers / freelance web designers

Their problem:

"I need clients, but finding businesses that actually need a website takes forever."

Your solution:

"Give me a location and business category, and show me the businesses most likely to need my services."

Example:

Freelancer
   ↓
Davao City
Restaurants
10 km
   ↓
SCAN
   ↓
247 businesses
   ↓
43 opportunities
   ↓
Top prospects
2. 🧠 What the MVP actually does

The complete V1 flow:

                USER
                  │
                  ▼
         Select location
                  │
                  ▼
         Select business type
                  │
                  ▼
           Select radius
                  │
                  ▼
              SCAN
                  │
                  ▼
       Business Data Provider
                  │
                  ▼
        Normalize businesses
                  │
                  ▼
       Website verification
                  │
                  ▼
       Website quality analysis
                  │
                  ▼
        Opportunity scoring
                  │
                  ▼
            Lead results
                  │
                  ▼
         Business details
                  │
                  ▼
       AI opportunity analysis
                  │
                  ▼
       Save as potential lead
3. 🔎 Search Screen

This is the first screen users see.

┌──────────────────────────────────────────┐
│ AI Business Opportunity Scanner           │
│                                          │
│ Find businesses that need your services. │
│                                          │
│ Location                                 │
│ ┌──────────────────────────────────────┐ │
│ │ Davao City                           │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ Business Category                        │
│ ┌──────────────────────────────────────┐ │
│ │ Restaurants                       ▼ │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ Radius                                   │
│ ┌──────────────────────────────────────┐ │
│ │ 10 km                             ▼ │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ Opportunity Type                         │
│                                          │
│ ☑ No Website                             │
│ ☑ Weak Website                           │
│ ☑ No Online Booking                      │
│ ☐ Poor Online Presence                   │
│                                          │
│             [ 🔍 Scan Businesses ]       │
└──────────────────────────────────────────┘
V1 categories

Don't create 100 categories.

Start with maybe:

Restaurants
Dental Clinics
Beauty Salons
Barbershops
Gyms
Auto Repair
Real Estate
Hotels
Medical Clinics
Pet Shops

You can expand later.

4. 📍 Location

For the $0 MVP, I'd initially avoid building complicated location search.

Allow:

City
Latitude
Longitude
Radius

Example:

{
  "latitude": 7.0731,
  "longitude": 125.6128,
  "radius": 10000
}

Later you can add a map/location autocomplete.

5. 🏪 Business Data Collection

For your $0 development phase, use:

OpenStreetMap + Overpass API

Your provider abstraction should look like:

BusinessProvider
       │
       ├── OpenStreetMapProvider
       │
       └── GooglePlacesProvider

V1:

OpenStreetMapProvider

After getting a customer:

GooglePlacesProvider

This is important because you don't want your entire application dependent on one provider.

6. 📦 Business Data Model

Normalize whatever provider returns into your own format.

interface Business {
  id: string;

  name: string;

  category?: string;

  address?: string;

  latitude?: number;
  longitude?: number;

  phone?: string;

  website?: string;

  source: string;
  sourceId: string;
}

Eventually add:

rating?: number;
reviewCount?: number;

facebookUrl?: string;
instagramUrl?: string;

openingHours?: string;

But don't make these mandatory.

7. 🌐 Website Detection

This is one of the most important parts.

For every business:

Business
   ↓
website exists?
   │
   ├── NO → No Website
   │
   └── YES
        ↓
   Check website

Your backend performs an HTTP request.

Example:

https://abc-restaurant.com

Check:

HTTP status
HTTPS
redirect
response time
HTML

Possible result:

{
  "websiteExists": true,
  "statusCode": 200,
  "https": true,
  "responseTime": 842
}
8. 🧪 Website Analyzer

If a website exists, analyze the homepage.

V1 checks
Technical
HTTPS
Mobile viewport
HTTP status
Page load response
Content
Title
Meta description
Phone
Email
Address
Business functionality

Look for:

Booking
Appointment
Reservation
Order
Shop
Cart
Payment
Contact form

For example:

Website Analysis

✓ HTTPS
✓ Mobile viewport
✓ Contact information

❌ Online booking
❌ Online ordering

⚠️ Missing meta description
⚠️ Slow response
9. 🔥 Opportunity Scoring

This is the core algorithm.

Don't use AI for this initially.

Use deterministic rules.

Example:

Condition	Points
No website	+40
Website unavailable/broken	+30
No mobile viewport	+15
No booking	+15
No online ordering	+15
No contact form	+5
Missing metadata	+5
Slow website	+10

Then:

Score = sum(points)

Normalize to:

0–100
10. Example scoring
Business A
ABC Restaurant

No website          +40
No booking          +15
No online ordering  +15
Active business     +10
────────────────────────
Opportunity Score    80

Result:

🔥 HIGH OPPORTUNITY
Business B
XYZ Restaurant

Website ✓
Mobile ✓
Booking ✓
Ordering ✓
HTTPS ✓

Score: 12

🟢 LOW OPPORTUNITY
11. 🧠 Don't call AI for every business

This is extremely important if you're trying to stay at $0.

Suppose you scan:

500 businesses

Don't send 500 businesses to an LLM.

Instead:

500 businesses
      ↓
Rule-based scoring
      ↓
Top 20
      ↓
AI analysis

This reduces AI usage massively.

12. 🤖 AI Opportunity Analysis

For the top prospects, AI generates the explanation.

Input:

{
  "business": "ABC Dental",
  "website": null,
  "category": "Dental Clinic",
  "location": "Davao City",
  "opportunityScore": 92,
  "issues": [
    "No website",
    "No online booking"
  ]
}

AI output:

Why this is a good prospect:

ABC Dental appears to have an established
customer base but does not have a dedicated
website or online appointment system.

Potential services:

1. Business website
2. Online appointment booking
3. Service/pricing pages

Sales angle:

Focus on making appointment scheduling easier
for existing and potential patients.
13. 🏆 Results Dashboard

This should be your main product screen.

┌──────────────────────────────────────────────────┐
│ Scan Results                                     │
│                                                  │
│ Davao City · Restaurants · 10 km                 │
│                                                  │
│ 247 businesses found                             │
│ 43 opportunities                                 │
│                                                  │
│ [All] [High] [Medium] [No Website]               │
│                                                  │
│ Sort: Opportunity Score ▼                        │
├──────────────────────────────────────────────────┤
│                                                  │
│ 🔥 92  ABC Restaurant                            │
│                                                  │
│ 📍 Davao City                                    │
│ ❌ No website                                    │
│ ❌ No online ordering                            │
│                                                  │
│ Opportunity: HIGH                               │
│                                                  │
│ [View Analysis] [Save Lead]                      │
│                                                  │
├──────────────────────────────────────────────────┤
│                                                  │
│ 🔥 88  XYZ Restaurant                            │
│                                                  │
│ 📍 Davao City                                    │
│ ⚠️ Weak website                                  │
│ ❌ No booking                                    │
│                                                  │
│ [View Analysis] [Save Lead]                      │
└──────────────────────────────────────────────────┘
14. 🔍 Business Detail Page

Clicking a business opens:

ABC Restaurant

Opportunity Score
        92
       /100

🔥 HIGH OPPORTUNITY
Business information
Category:
Restaurant

Location:
Davao City

Phone:
+63 XXX XXX XXXX

Website:
None

Source:
OpenStreetMap
Problems
❌ No website
❌ No online ordering
❌ No booking
Recommended services
🌐 Website
🔥 HIGH

🛒 Online ordering
🔥 HIGH

📅 Reservation system
🟡 MEDIUM
AI Analysis
WHY THIS BUSINESS?

ABC Restaurant appears to have an established
local presence but lacks a dedicated website...

15. 💾 Save Lead

User clicks:

Save Lead

Business moves into:

My Leads

Database:

lead
 ├── business_id
 ├── status
 ├── notes
 ├── score
 ├── created_at

Statuses:

New
Contacted
Interested
Proposal
Won
Lost

That's enough for V1.

16. 📊 Basic Lead Dashboard
MY LEADS

Total Leads             37

New                     21
Contacted                9
Interested               4
Proposal                 2
Won                      1

Don't build a sophisticated CRM yet.

17. 📤 CSV Export

This is very important for the MVP.

Allow:

Export CSV

Example:

Business,Category,Phone,Website,Score,Opportunity
ABC Restaurant,Restaurant,+63..., ,92,No Website
XYZ Dental,Dental,+63...,https://...,81,Weak Website

Why?

Because your first customer may simply want:

"Give me a list of prospects I can contact myself."

You can provide value without building email automation.

18. ✉️ AI Outreach — optional V1.5

I'd actually make this the first feature after the core MVP.

Button:

Generate Outreach

AI generates:

Subject:
Quick idea for ABC Restaurant

Hi ABC Restaurant team,

I came across your business and noticed that
you have a strong local presence but don't
currently have a dedicated website...


You could offer:

[Copy Message]

Don't build automatic emailing yet.

That introduces additional infrastructure and deliverability problems.

19. 🗄️ Supabase Database

I'd keep the schema small.

profiles
id
email
name
created_at
scans
id
user_id
location
latitude
longitude
radius
category
created_at
businesses
id
name
category
address
latitude
longitude
phone
website
source
source_id
created_at
updated_at
business_analysis
id
business_id

website_exists
website_status
https
mobile_friendly

booking_available
ordering_available
contact_form

opportunity_score

analysis
created_at
leads
id
user_id
business_id

status
notes

created_at
updated_at
20. 🔌 API Endpoints

Since you're comfortable with TypeScript, I'd use Next.js initially.

Scan
POST /api/scans

Request:

{
  "latitude": 7.0731,
  "longitude": 125.6128,
  "radius": 10000,
  "category": "restaurant"
}
Get scan
GET /api/scans/:id
Get businesses
GET /api/businesses

Filters:

score
category
website status
location
Analyze website
POST /api/businesses/:id/analyze
AI analysis
POST /api/businesses/:id/ai-analysis
Save lead
POST /api/leads
Update lead
PATCH /api/leads/:id
Export
GET /api/leads/export
21. 📁 Next.js Project Structure

I'd structure it like this:

src/
│
├── app/
│   ├── page.tsx
│   │
│   ├── dashboard/
│   │   ├── page.tsx
│   │   ├── scans/
│   │   │   └── page.tsx
│   │   ├── businesses/
│   │   │   └── [id]/
│   │   │       └── page.tsx
│   │   └── leads/
│   │       └── page.tsx
│   │
│   └── api/
│       ├── scans/
│       ├── businesses/
│       └── leads/
│
├── components/
│   ├── scanner/
│   ├── businesses/
│   ├── leads/
│   └── ui/
│
├── lib/
│   ├── supabase/
│   ├── business-providers/
│   │   ├── types.ts
│   │   └── osm.ts
│   │
│   ├── website-analyzer/
│   │   ├── analyzer.ts
│   │   ├── mobile.ts
│   │   └── features.ts
│   │
│   ├── scoring/
│   │   └── opportunity-score.ts
│   │
│   └── ai/
│       └── analyzer.ts
│
└── types/
    ├── business.ts
    ├── scan.ts
    └── lead.ts
22. 🔄 Most important architectural decision

Make providers interchangeable.

BusinessProvider

Interface:

interface BusinessProvider {
  search(params: SearchParams): Promise<Business[]>;
  getDetails(id: string): Promise<Business>;
}

Then:

business-providers/
│
├── osm.ts
└── google.ts
Development
OSM
 ↓
$0
First paying customer
Google Places
 ↓
Better data
 ↓
Better coverage

You simply change:

BUSINESS_PROVIDER=google

instead of rewriting your application.

23. 🤖 Same approach for AI
interface AIProvider {
  analyzeBusiness(data: BusinessData): Promise<Analysis>;
}

Development:

Ollama

Production:

OpenAI

or another provider.

So:

AIProvider
    │
    ├── OllamaProvider
    │
    └── OpenAIProvider

Again:

Don't lock yourself into a paid API before you have revenue.

24. 💰 Your actual $0 stack

For development:

Component	Choice	Cost
Frontend	Next.js	₱0
UI	Tailwind + shadcn	₱0
Database	Supabase Free	₱0
Auth	Supabase Auth	₱0
Business data	OSM/Overpass	₱0
Website analysis	Your code	₱0
AI	Ollama/local model	₱0
Hosting	Localhost initially	₱0
Git	GitHub Free	₱0
Total
₱0

You can build the entire prototype without spending money.

25. ⚠️ One thing I would NOT do

Don't scrape Google Maps.

There's a huge difference between:

Google Places API

and:

Scraping Google Maps HTML

For your eventual commercial product, use an API/provider whose terms allow your intended use rather than trying to bypass API restrictions.

26. 🧪 MVP acceptance criteria

Before calling V1 "done", it should be able to do this:

Test #1
Input:
Davao City
Restaurants
10km

System returns:

Businesses found
Test #2

Each business gets:

Website exists

or:

No website
Test #3

Businesses with websites get:

Website analysis
Test #4

Every business receives:

Opportunity Score: 0–100
Test #5

User can filter:

No Website
High Opportunity
Weak Website
Test #6

User can open:

Business → Detailed Analysis
Test #7

User can:

Save Lead
Test #8

User can:

Export CSV
Test #9

Top leads can receive:

AI-generated sales explanation
27. 🚫 Features deliberately excluded from MVP

Don't build these yet:

❌ Email automation
❌ SMS
❌ Full CRM
❌ Stripe
❌ Team accounts
❌ Advanced analytics
❌ Mobile app
❌ Browser extension
❌ AI chatbot
❌ Automated cold outreach
❌ 50+ integrations
❌ Complex maps
❌ Enterprise permissions

Those are distractions before you've proven demand.

28. 🛣️ After first paying customer

Once someone actually pays:

Upgrade #1

Google Places API

Better business coverage.

↓

Upgrade #2

Paid AI API

Better analysis and outreach.

↓

Upgrade #3

Custom domain

↓

Upgrade #4

Better hosting

↓

Upgrade #5

Add more data:

Google reviews
Competitor analysis
Social presence
SEO analysis
PageSpeed

↓

Upgrade #6

Turn it into a real prospecting platform.

29. The eventual product

The long-term vision could become:

                    LOCAL LEAD AI
                         │
       ┌─────────────────┼─────────────────┐
       ▼                 ▼                 ▼
   Discovery         Opportunity       Competitor
   Engine              Engine            Engine
       │                 │                 │
       └─────────────────┼─────────────────┘
                         ▼
                    Lead Scoring
                         │
                         ▼
                  AI Sales Insights
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
        AI Outreach              CRM
              │                     │
              └──────────┬──────────┘
                         ▼
                    CONVERSION