# The Everest Kennel: Website Project Blueprint (Node.js)

> Pet shop, kennel, veterinary home service and animal care shelter website.
> Stack: Node.js 20 LTS, Express 5, TypeScript, Prisma, MySQL 8, EJS (SSR), Tailwind CSS, Alpine.js.
> Version: 1.0.0 | Prepared: October 2026

---

## 1. Business Profile

| Field | Value |
|---|---|
| Business name | The Everest Kennel |
| Tagline (proposed) | Pets, Care and Kennel Services in Kathmandu |
| Owner / Contact person | Rajkumar Panta |
| Landline | +977-1-5234516 (01-5234516) |
| Mobile / WhatsApp | `+977-98XXXXXXXX` (TODO: number was incomplete in the brief) |
| Location | Soaltee Mode (Soltimode), Kathmandu, Nepal |
| Service area | Kathmandu Valley (house calls), nationwide for product delivery |
| Wing | Animal Care Shelter |

### 1.1 Products

- Pet animals for sale: locally bred and imported (outsourced) puppies, kittens, birds and small pets
- Pet food and feed (dog food is the primary line)
- Accessories: collars, leashes, harnesses, beds, bowls, cages, carriers
- Kennel accessories: kennels, crates, kennel mats, feeders
- Toys
- Supplements and health products

### 1.2 Services

| Code | Service | Mode |
|---|---|---|
| `HOUSE_CALL` | House call visit | At customer address |
| `TREATMENT` | Treatment | In shop or house call |
| `VACCINATION` | Vaccination | In shop or house call |
| `PUPPY_TRADE` | Puppy buying and selling | In shop, listings online |
| `MATING` | Mating / stud service | In shop, by appointment |
| `TRAINING` | Dog training | In shop or at home, packages |
| `BOARDING` | Kennel boarding | In shop, date range |
| `SHELTER` | Animal care shelter, rescue and adoption | Inquiry based |

---

## 2. Project Goals

1. Generate calls, WhatsApp chats and bookings from Kathmandu customers searching on Google.
2. Sell food, accessories and supplements online with eSewa, Khalti and Cash on Delivery.
3. Show available puppies and pets with health records so buyers trust the shop.
4. Let customers book house calls, vaccinations, boarding, training and mating online.
5. Give staff one admin panel for inventory, orders, bookings, pet listings and shelter animals.
6. Send automatic vaccination due reminders to returning customers (repeat revenue).

### 2.1 Success metrics

| Metric | Target (6 months after launch) |
|---|---|
| Google Business Profile + organic calls | 150+ per month |
| Online bookings | 60+ per month |
| Online orders | 100+ per month |
| Lighthouse (mobile) | Performance 90+, Accessibility 95+, SEO 100 |
| Page load (LCP on 4G) | Under 2.5 s |

---

## 3. User Roles

| Role | Access |
|---|---|
| `GUEST` | Browse, cart, checkout as guest, inquiries, bookings with phone verification |
| `CUSTOMER` | Account, own pets, vaccination history, orders, bookings, reminders |
| `STAFF` | Orders, inventory, bookings, boarding check in/out |
| `VET` | Bookings assigned to them, medical and vaccination records |
| `ADMIN` | Everything, including users, settings, payments, reports, audit log |

---

## 4. Sitemap

```
/
├── /shop
│   ├── /shop/category/:slug          (dog-food, cat-food, accessories, toys, supplements, kennel-accessories)
│   └── /shop/product/:slug
├── /pets                             (pets for sale)
│   ├── /pets?species=dog&origin=imported
│   └── /pets/:slug
├── /sell-your-pet                    (customer offers a puppy/pet to the shop)
├── /services
│   ├── /services/house-call-vet
│   ├── /services/vaccination
│   ├── /services/treatment
│   ├── /services/dog-boarding-kathmandu
│   ├── /services/dog-training
│   └── /services/mating-stud-service
├── /book                             (multi-step booking)
├── /shelter
│   ├── /shelter/adopt
│   ├── /shelter/adopt/:slug
│   └── /shelter/report-animal
├── /blog  and  /blog/:slug           (pet care articles, local SEO)
├── /about
├── /contact
├── /faq
├── /cart  /checkout  /checkout/success  /checkout/failed
├── /account
│   ├── /account/orders
│   ├── /account/bookings
│   ├── /account/pets  and  /account/pets/:id
│   └── /account/profile
├── /login  /register  /forgot-password  /reset-password/:token
├── /privacy-policy  /terms  /refund-policy  /animal-sale-policy
├── /sitemap.xml  /robots.txt
└── /admin  (separate layout, see section 5.3)
```

---

## 5. Feature Specification

### 5.1 Public website

**Home page**
- Hero: "Pet Shop, Vet House Call and Dog Boarding in Kathmandu" with Call, WhatsApp and Book buttons
- Service cards (8 services)
- Featured puppies (status `AVAILABLE`)
- Best selling products
- Why us: experience, house call coverage, imported breeds, health guarantee
- Testimonials, Google rating badge
- Shelter call to action (adopt / report an animal)
- Map embed (lazy loaded, click to load to protect performance and privacy)
- Sticky mobile bar: Call | WhatsApp | Book

**Shop**
- Category, brand, species (dog/cat/bird), life stage (puppy/adult/senior), price filters
- Server side search on name, brand, SKU (MySQL FULLTEXT index)
- Variants: weight (1 kg, 3 kg, 10 kg, 20 kg), size, color
- Stock badge, low stock warning, out of stock "Notify me"
- Related products, recently viewed (client side)

**Pets for sale**
- Filters: species, breed, gender, age range, price range, origin (`LOCAL` / `IMPORTED`)
- Listing page shows: photos, short video, DOB, gender, color, vaccination status, deworming, microchip, KCI/registration papers, parents info, price
- Actions: "Reserve with deposit" (eSewa/Khalti), "Ask on WhatsApp" (prefilled message with listing code), "Schedule a visit"
- Status: `AVAILABLE`, `RESERVED`, `SOLD`, `HIDDEN`. Sold pets kept for 30 days as social proof, then hidden

**Sell your pet**
- Form: species, breed, age, gender, photos (max 6), asking price, location, phone
- Creates an `Inquiry` of type `PET_SELL_OFFER` for admin review

**Services and booking**
- Each service page: description, what is included, price or "starting from", FAQ, booking button
- Booking wizard (Alpine.js, progressive enhancement, works without JS as plain form):
  1. Choose service
  2. Choose pet (from account) or enter pet details
  3. Date and slot (house call/vaccination/training/mating) or check in and check out dates (boarding)
  4. Address and map pin (house call only, Kathmandu Valley only)
  5. Contact details and OTP verification for guests
  6. Confirm, optional advance payment
- Capacity rules per service (section 9)

**Shelter**
- Adoptable animals with story, age, temperament, vaccination status
- Adoption application form, home check questions
- Report an injured/stray animal form with photo and location
- Donation section (eSewa/Khalti, optional phase 2)

**Contact**
- Phone (click to call), WhatsApp, email, address, opening hours, map, contact form with honeypot and rate limiting

### 5.2 Customer account

- Register/login with phone or email, password hashed with Argon2id
- My pets: profile, photo, breed, DOB, weight log, vaccination and medical history
- Vaccination reminders by SMS/email (7 days and 1 day before due date)
- Orders with status timeline, invoice PDF download
- Bookings with reschedule (up to 12 hours before) and cancel

### 5.3 Admin panel (`/admin`)

| Module | Capabilities |
|---|---|
| Dashboard | Today's bookings, pending orders, low stock, boarding occupancy, revenue chart |
| Products | CRUD, variants, images (auto WebP), stock adjustments with reason, CSV import/export |
| Categories / Brands | CRUD, ordering, SEO fields |
| Pet listings | CRUD, gallery, video URL, status, reserve/sell flow linked to customer |
| Orders | Status updates, packing slip, invoice, refunds, COD reconciliation |
| Bookings | Calendar view, assign vet/staff, status, notes |
| Boarding | Kennel units, occupancy calendar, check in/out, daily care log |
| Medical | Vaccination records, treatment notes, prescriptions per pet |
| Shelter | Animals, adoption applications, reports |
| Inquiries | Contact, sell offers, mating requests, shelter reports |
| Customers | List, pets, history, notes |
| Content | Blog posts, FAQs, testimonials, pages, banners |
| Settings | Business info, hours, slot rules, payment keys, SMS keys, SEO defaults |
| Reports | Sales, top products, service revenue, bookings by service |
| Audit log | Every admin write action with user, IP, before/after |

---

## 6. Architecture Decisions

| Decision | Choice | Reason |
|---|---|---|
| Runtime | Node.js 20 LTS | Stable, supported by cPanel Node.js App (Passenger) and Docker |
| Framework | Express 5 + TypeScript | Mature, small, easy to host; async error handling built in |
| Rendering | Server side rendering with EJS | Best for local SEO and speed on low end phones; no SPA needed |
| Interactivity | Alpine.js + small vanilla modules | Lightweight (about 15 KB), no build complexity |
| CSS | Tailwind CSS 3 (CLI build, purged) | Small final CSS, consistent design tokens |
| ORM | Prisma 5 | Type safety, migrations, works well with MySQL |
| Database | MySQL 8 | Matches existing hosting skills and cPanel availability |
| Sessions | `express-session` + MySQL store | Works on shared hosting without Redis |
| Cache (optional) | Redis on VPS, in memory LRU on cPanel | Abstracted behind `cache` service |
| Validation | Zod | One schema for forms and API |
| Images | Multer + Sharp | Resize to 400/800/1200 px WebP, strip EXIF |
| Logging | Pino + pino-roll | Fast JSON logs, daily rotation |
| Email | Nodemailer (SMTP) | Works with cPanel mail or any SMTP |
| SMS | Sparrow SMS or Aakash SMS (Nepal) | Local delivery for OTP and reminders |
| Payments | eSewa ePay v2, Khalti KPG-2, COD | Most used gateways in Nepal |
| Jobs | `node-cron` in a separate worker process | Reminders, cleanup, sitemap regeneration |
| Money | Stored as integer paisa | No floating point rounding bugs |
| Testing | Vitest + Supertest + Playwright | Unit, integration, E2E |

**Pattern:** modular monolith. Each domain lives in `src/modules/<domain>` with `schema` (Zod), `service` (business logic, Prisma), `controller` (HTTP), `routes`. Controllers never call Prisma directly. A JSON API under `/api/v1` reuses the same services so a mobile app can be added later.

---

## 7. Folder Structure

```
everest-kennel/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── public/
│   ├── assets/
│   │   ├── css/app.css            (built)
│   │   ├── js/app.js
│   │   ├── js/booking.js
│   │   └── img/
│   ├── uploads/                   (gitignored, user uploads)
│   ├── favicon.ico
│   └── manifest.webmanifest
├── src/
│   ├── app.ts
│   ├── server.ts
│   ├── worker.ts                  (cron jobs)
│   ├── config/
│   │   ├── env.ts
│   │   └── constants.ts
│   ├── lib/
│   │   ├── prisma.ts
│   │   ├── logger.ts
│   │   ├── cache.ts
│   │   ├── mailer.ts
│   │   ├── sms.ts
│   │   ├── money.ts
│   │   ├── slug.ts
│   │   └── errors.ts
│   ├── middleware/
│   │   ├── auth.ts
│   │   ├── csrf.ts
│   │   ├── error-handler.ts
│   │   ├── locals.ts
│   │   ├── rate-limit.ts
│   │   ├── upload.ts
│   │   └── validate.ts
│   ├── modules/
│   │   ├── auth/
│   │   ├── products/
│   │   ├── categories/
│   │   ├── cart/
│   │   ├── orders/
│   │   ├── payments/
│   │   │   ├── esewa.ts
│   │   │   └── khalti.ts
│   │   ├── pets/                  (pet listings for sale)
│   │   ├── customer-pets/         (customers' own pets, medical records)
│   │   ├── bookings/
│   │   ├── boarding/
│   │   ├── shelter/
│   │   ├── inquiries/
│   │   ├── blog/
│   │   ├── seo/
│   │   ├── settings/
│   │   └── admin/
│   ├── routes/
│   │   ├── web.ts
│   │   ├── api.ts
│   │   └── admin.ts
│   ├── jobs/
│   │   ├── vaccination-reminders.ts
│   │   ├── expire-reservations.ts
│   │   └── sitemap.ts
│   └── views/
│       ├── layouts/  (main.ejs, admin.ejs, auth.ejs)
│       ├── partials/ (header.ejs, footer.ejs, seo.ejs, flash.ejs, product-card.ejs, pet-card.ejs, mobile-bar.ejs)
│       ├── pages/
│       ├── shop/
│       ├── pets/
│       ├── services/
│       ├── booking/
│       ├── shelter/
│       ├── account/
│       ├── admin/
│       └── errors/   (404.ejs, 500.ejs)
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── storage/logs/
├── tailwind.config.js
├── tsconfig.json
├── vitest.config.ts
├── Dockerfile
├── docker-compose.yml
├── ecosystem.config.cjs           (PM2)
├── .env.example
├── .gitignore
└── package.json
```

---

## 8. Database Schema (`prisma/schema.prisma`)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

// ---------- Users ----------

enum Role {
  CUSTOMER
  STAFF
  VET
  ADMIN
}

model User {
  id              Int       @id @default(autoincrement())
  name            String    @db.VarChar(120)
  email           String?   @unique @db.VarChar(191)
  phone           String    @unique @db.VarChar(20)
  passwordHash    String    @db.VarChar(255)
  role            Role      @default(CUSTOMER)
  phoneVerifiedAt DateTime?
  emailVerifiedAt DateTime?
  isActive        Boolean   @default(true)
  lastLoginAt     DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  deletedAt       DateTime?

  addresses        Address[]
  pets             CustomerPet[]
  orders           Order[]
  bookings         Booking[]       @relation("CustomerBookings")
  assignedBookings Booking[]       @relation("AssignedBookings")
  passwordResets   PasswordReset[]
  auditLogs        AuditLog[]

  @@index([role])
}

model PasswordReset {
  id        Int       @id @default(autoincrement())
  userId    Int
  tokenHash String    @unique @db.Char(64)
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model OtpCode {
  id        Int      @id @default(autoincrement())
  phone     String   @db.VarChar(20)
  codeHash  String   @db.Char(64)
  purpose   String   @db.VarChar(30)
  attempts  Int      @default(0)
  expiresAt DateTime
  createdAt DateTime @default(now())

  @@index([phone, purpose])
}

model Address {
  id        Int      @id @default(autoincrement())
  userId    Int
  label     String   @db.VarChar(40)
  fullName  String   @db.VarChar(120)
  phone     String   @db.VarChar(20)
  line1     String   @db.VarChar(191)
  area      String   @db.VarChar(120)
  city      String   @db.VarChar(80)
  district  String   @db.VarChar(80)
  latitude  Decimal? @db.Decimal(10, 7)
  longitude Decimal? @db.Decimal(10, 7)
  isDefault Boolean  @default(false)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model Session {
  id        String   @id @db.VarChar(128)
  sid       String   @unique @db.VarChar(128)
  data      String   @db.MediumText
  expiresAt DateTime

  @@index([expiresAt])
}

// ---------- Catalog ----------

enum Species {
  DOG
  CAT
  BIRD
  FISH
  RABBIT
  OTHER
}

model Category {
  id          Int        @id @default(autoincrement())
  parentId    Int?
  name        String     @db.VarChar(120)
  slug        String     @unique @db.VarChar(140)
  description String?    @db.Text
  imagePath   String?    @db.VarChar(255)
  sortOrder   Int        @default(0)
  isActive    Boolean    @default(true)
  metaTitle   String?    @db.VarChar(70)
  metaDesc    String?    @db.VarChar(160)
  parent      Category?  @relation("CategoryTree", fields: [parentId], references: [id])
  children    Category[] @relation("CategoryTree")
  products    Product[]
}

model Brand {
  id       Int       @id @default(autoincrement())
  name     String    @db.VarChar(120)
  slug     String    @unique @db.VarChar(140)
  logoPath String?   @db.VarChar(255)
  products Product[]
}

model Product {
  id          Int              @id @default(autoincrement())
  categoryId  Int
  brandId     Int?
  name        String           @db.VarChar(191)
  slug        String           @unique @db.VarChar(191)
  shortDesc   String?          @db.VarChar(300)
  description String?          @db.Text
  species     Species?
  lifeStage   String?          @db.VarChar(30)
  isFeatured  Boolean          @default(false)
  isActive    Boolean          @default(true)
  metaTitle   String?          @db.VarChar(70)
  metaDesc    String?          @db.VarChar(160)
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
  category    Category         @relation(fields: [categoryId], references: [id])
  brand       Brand?           @relation(fields: [brandId], references: [id])
  variants    ProductVariant[]
  images      ProductImage[]

  @@index([categoryId, isActive])
  @@index([species])
  @@fulltext([name, shortDesc])
}

model ProductVariant {
  id             Int             @id @default(autoincrement())
  productId      Int
  sku            String          @unique @db.VarChar(60)
  label          String          @db.VarChar(80)
  pricePaisa     Int
  comparePaisa   Int?
  stock          Int             @default(0)
  lowStockAlert  Int             @default(5)
  weightGrams    Int?
  isActive       Boolean         @default(true)
  product        Product         @relation(fields: [productId], references: [id], onDelete: Cascade)
  orderItems     OrderItem[]
  cartItems      CartItem[]
  stockMovements StockMovement[]

  @@index([productId])
}

model ProductImage {
  id        Int     @id @default(autoincrement())
  productId Int
  path      String  @db.VarChar(255)
  alt       String  @db.VarChar(191)
  sortOrder Int     @default(0)
  product   Product @relation(fields: [productId], references: [id], onDelete: Cascade)
}

model StockMovement {
  id        Int            @id @default(autoincrement())
  variantId Int
  change    Int
  reason    String         @db.VarChar(40)
  reference String?        @db.VarChar(80)
  userId    Int?
  createdAt DateTime       @default(now())
  variant   ProductVariant @relation(fields: [variantId], references: [id])

  @@index([variantId, createdAt])
}

// ---------- Pets for sale ----------

enum PetOrigin {
  LOCAL
  IMPORTED
}

enum ListingStatus {
  AVAILABLE
  RESERVED
  SOLD
  HIDDEN
}

enum Gender {
  MALE
  FEMALE
}

model Breed {
  id       Int          @id @default(autoincrement())
  species  Species
  name     String       @db.VarChar(120)
  slug     String       @unique @db.VarChar(140)
  listings PetListing[]
  pets     CustomerPet[]

  @@unique([species, name])
}

model PetListing {
  id              Int             @id @default(autoincrement())
  code            String          @unique @db.VarChar(20)
  title           String          @db.VarChar(191)
  slug            String          @unique @db.VarChar(191)
  species         Species
  breedId         Int
  gender          Gender
  dateOfBirth     DateTime        @db.Date
  color           String?         @db.VarChar(60)
  origin          PetOrigin
  pricePaisa      Int
  depositPaisa    Int             @default(0)
  vaccinated      Boolean         @default(false)
  dewormed        Boolean         @default(false)
  microchipNo     String?         @db.VarChar(40)
  registrationNo  String?         @db.VarChar(60)
  parentsInfo     String?         @db.Text
  description     String?         @db.Text
  videoUrl        String?         @db.VarChar(255)
  status          ListingStatus   @default(AVAILABLE)
  reservedUntil   DateTime?
  soldAt          DateTime?
  buyerUserId     Int?
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
  breed           Breed           @relation(fields: [breedId], references: [id])
  images          PetListingImage[]

  @@index([species, status])
  @@index([breedId, status])
}

model PetListingImage {
  id        Int        @id @default(autoincrement())
  listingId Int
  path      String     @db.VarChar(255)
  alt       String     @db.VarChar(191)
  sortOrder Int        @default(0)
  listing   PetListing @relation(fields: [listingId], references: [id], onDelete: Cascade)
}

// ---------- Customers' own pets and medical ----------

model CustomerPet {
  id           Int                 @id @default(autoincrement())
  userId       Int
  name         String              @db.VarChar(80)
  species      Species
  breedId      Int?
  gender       Gender?
  dateOfBirth  DateTime?           @db.Date
  weightKg     Decimal?            @db.Decimal(5, 2)
  photoPath    String?             @db.VarChar(255)
  notes        String?             @db.Text
  createdAt    DateTime            @default(now())
  user         User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  breed        Breed?              @relation(fields: [breedId], references: [id])
  vaccinations VaccinationRecord[]
  medicals     MedicalRecord[]
  bookings     Booking[]

  @@index([userId])
}

model VaccinationRecord {
  id           Int         @id @default(autoincrement())
  petId        Int
  vaccine      String      @db.VarChar(120)
  batchNo      String?     @db.VarChar(60)
  givenOn      DateTime    @db.Date
  nextDueOn    DateTime?   @db.Date
  givenBy      String?     @db.VarChar(120)
  reminderSent Boolean     @default(false)
  bookingId    Int?
  pet          CustomerPet @relation(fields: [petId], references: [id], onDelete: Cascade)

  @@index([nextDueOn, reminderSent])
}

model MedicalRecord {
  id           Int         @id @default(autoincrement())
  petId        Int
  visitDate    DateTime
  complaint    String      @db.Text
  diagnosis    String?     @db.Text
  treatment    String?     @db.Text
  prescription String?     @db.Text
  vetName      String?     @db.VarChar(120)
  bookingId    Int?
  pet          CustomerPet @relation(fields: [petId], references: [id], onDelete: Cascade)

  @@index([petId, visitDate])
}

// ---------- Services and bookings ----------

enum ServiceType {
  HOUSE_CALL
  TREATMENT
  VACCINATION
  MATING
  TRAINING
  BOARDING
}

enum BookingStatus {
  PENDING
  CONFIRMED
  IN_PROGRESS
  COMPLETED
  CANCELLED
  NO_SHOW
}

model Service {
  id               Int         @id @default(autoincrement())
  type             ServiceType @unique
  name             String      @db.VarChar(120)
  slug             String      @unique @db.VarChar(140)
  shortDesc        String      @db.VarChar(300)
  content          String?     @db.Text
  basePricePaisa   Int?
  durationMinutes  Int         @default(60)
  slotCapacity     Int         @default(1)
  advancePaisa     Int         @default(0)
  isActive         Boolean     @default(true)
  metaTitle        String?     @db.VarChar(70)
  metaDesc         String?     @db.VarChar(160)
  bookings         Booking[]
}

model Booking {
  id              Int           @id @default(autoincrement())
  reference       String        @unique @db.VarChar(20)
  serviceId       Int
  userId          Int?
  petId           Int?
  assignedToId    Int?
  contactName     String        @db.VarChar(120)
  contactPhone    String        @db.VarChar(20)
  petSummary      String?       @db.VarChar(255)
  startAt         DateTime
  endAt           DateTime
  addressText     String?       @db.VarChar(255)
  latitude        Decimal?      @db.Decimal(10, 7)
  longitude       Decimal?      @db.Decimal(10, 7)
  kennelUnitId    Int?
  notes           String?       @db.Text
  status          BookingStatus @default(PENDING)
  pricePaisa      Int?
  paidPaisa       Int           @default(0)
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  service         Service       @relation(fields: [serviceId], references: [id])
  user            User?         @relation("CustomerBookings", fields: [userId], references: [id])
  assignedTo      User?         @relation("AssignedBookings", fields: [assignedToId], references: [id])
  pet             CustomerPet?  @relation(fields: [petId], references: [id])
  kennelUnit      KennelUnit?   @relation(fields: [kennelUnitId], references: [id])
  careLogs        BoardingLog[]

  @@index([serviceId, startAt, status])
  @@index([kennelUnitId, startAt, endAt])
  @@index([userId])
}

model KennelUnit {
  id        Int       @id @default(autoincrement())
  code      String    @unique @db.VarChar(20)
  size      String    @db.VarChar(20)
  dailyRate Int
  isActive  Boolean   @default(true)
  bookings  Booking[]
}

model BoardingLog {
  id        Int      @id @default(autoincrement())
  bookingId Int
  logDate   DateTime @db.Date
  fed       Boolean  @default(false)
  walked    Boolean  @default(false)
  medsGiven Boolean  @default(false)
  notes     String?  @db.Text
  photoPath String?  @db.VarChar(255)
  booking   Booking  @relation(fields: [bookingId], references: [id], onDelete: Cascade)

  @@unique([bookingId, logDate])
}

model BusinessHour {
  id        Int     @id @default(autoincrement())
  weekday   Int
  opensAt   String  @db.VarChar(5)
  closesAt  String  @db.VarChar(5)
  isClosed  Boolean @default(false)

  @@unique([weekday])
}

model BlockedDate {
  id     Int      @id @default(autoincrement())
  date   DateTime @db.Date @unique
  reason String?  @db.VarChar(120)
}

// ---------- Cart, orders, payments ----------

model Cart {
  id        Int        @id @default(autoincrement())
  token     String     @unique @db.Char(36)
  userId    Int?       @unique
  updatedAt DateTime   @updatedAt
  items     CartItem[]
}

model CartItem {
  id        Int            @id @default(autoincrement())
  cartId    Int
  variantId Int
  quantity  Int
  cart      Cart           @relation(fields: [cartId], references: [id], onDelete: Cascade)
  variant   ProductVariant @relation(fields: [variantId], references: [id])

  @@unique([cartId, variantId])
}

enum OrderStatus {
  PENDING_PAYMENT
  PLACED
  CONFIRMED
  PACKED
  OUT_FOR_DELIVERY
  DELIVERED
  CANCELLED
  REFUNDED
}

enum PaymentMethod {
  ESEWA
  KHALTI
  COD
}

model Order {
  id              Int           @id @default(autoincrement())
  orderNo         String        @unique @db.VarChar(20)
  userId          Int?
  customerName    String        @db.VarChar(120)
  customerPhone   String        @db.VarChar(20)
  customerEmail   String?       @db.VarChar(191)
  shippingAddress String        @db.Text
  subtotalPaisa   Int
  deliveryPaisa   Int           @default(0)
  discountPaisa   Int           @default(0)
  totalPaisa      Int
  paymentMethod   PaymentMethod
  status          OrderStatus   @default(PENDING_PAYMENT)
  notes           String?       @db.Text
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  user            User?         @relation(fields: [userId], references: [id])
  items           OrderItem[]
  payments        Payment[]

  @@index([status, createdAt])
  @@index([customerPhone])
}

model OrderItem {
  id         Int            @id @default(autoincrement())
  orderId    Int
  variantId  Int
  name       String         @db.VarChar(191)
  sku        String         @db.VarChar(60)
  unitPaisa  Int
  quantity   Int
  totalPaisa Int
  order      Order          @relation(fields: [orderId], references: [id], onDelete: Cascade)
  variant    ProductVariant @relation(fields: [variantId], references: [id])
}

enum PaymentStatus {
  INITIATED
  COMPLETED
  FAILED
  REFUNDED
}

model Payment {
  id            Int           @id @default(autoincrement())
  orderId       Int?
  bookingId     Int?
  listingId     Int?
  gateway       PaymentMethod
  transactionId String        @unique @db.VarChar(80)
  gatewayRef    String?       @db.VarChar(120)
  amountPaisa   Int
  status        PaymentStatus @default(INITIATED)
  rawResponse   Json?
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt
  order         Order?        @relation(fields: [orderId], references: [id])

  @@index([status])
}

// ---------- Shelter ----------

enum ShelterStatus {
  IN_CARE
  ADOPTABLE
  ADOPTION_PENDING
  ADOPTED
  DECEASED
}

model ShelterAnimal {
  id           Int                  @id @default(autoincrement())
  name         String               @db.VarChar(80)
  slug         String               @unique @db.VarChar(120)
  species      Species
  breedText    String?              @db.VarChar(120)
  gender       Gender?
  ageText      String?              @db.VarChar(40)
  story        String?              @db.Text
  temperament  String?              @db.VarChar(191)
  vaccinated   Boolean              @default(false)
  sterilized   Boolean              @default(false)
  photoPath    String?              @db.VarChar(255)
  status       ShelterStatus        @default(IN_CARE)
  intakeDate   DateTime             @db.Date
  createdAt    DateTime             @default(now())
  applications AdoptionApplication[]

  @@index([status])
}

model AdoptionApplication {
  id         Int           @id @default(autoincrement())
  animalId   Int
  name       String        @db.VarChar(120)
  phone      String        @db.VarChar(20)
  address    String        @db.VarChar(255)
  answers    Json
  status     String        @default("NEW") @db.VarChar(20)
  createdAt  DateTime      @default(now())
  animal     ShelterAnimal @relation(fields: [animalId], references: [id])
}

// ---------- Inquiries, content, system ----------

enum InquiryType {
  CONTACT
  PET_SELL_OFFER
  PET_BUY_REQUEST
  MATING_REQUEST
  SHELTER_REPORT
  STOCK_NOTIFY
}

model Inquiry {
  id        Int         @id @default(autoincrement())
  type      InquiryType
  name      String      @db.VarChar(120)
  phone     String      @db.VarChar(20)
  email     String?     @db.VarChar(191)
  subject   String?     @db.VarChar(191)
  message   String      @db.Text
  meta      Json?
  status    String      @default("NEW") @db.VarChar(20)
  ip        String?     @db.VarChar(45)
  createdAt DateTime    @default(now())

  @@index([type, status])
}

model Post {
  id          Int       @id @default(autoincrement())
  title       String    @db.VarChar(191)
  slug        String    @unique @db.VarChar(191)
  excerpt     String?   @db.VarChar(300)
  content     String    @db.MediumText
  coverPath   String?   @db.VarChar(255)
  publishedAt DateTime?
  metaTitle   String?   @db.VarChar(70)
  metaDesc    String?   @db.VarChar(160)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([publishedAt])
}

model Testimonial {
  id        Int     @id @default(autoincrement())
  name      String  @db.VarChar(120)
  content   String  @db.Text
  rating    Int     @default(5)
  isActive  Boolean @default(true)
  sortOrder Int     @default(0)
}

model Faq {
  id        Int     @id @default(autoincrement())
  question  String  @db.VarChar(255)
  answer    String  @db.Text
  group     String  @db.VarChar(40)
  sortOrder Int     @default(0)
}

model Setting {
  key   String @id @db.VarChar(80)
  value Json
}

model AuditLog {
  id        Int      @id @default(autoincrement())
  userId    Int?
  action    String   @db.VarChar(60)
  entity    String   @db.VarChar(60)
  entityId  String?  @db.VarChar(40)
  before    Json?
  after     Json?
  ip        String?  @db.VarChar(45)
  createdAt DateTime @default(now())
  user      User?    @relation(fields: [userId], references: [id])

  @@index([entity, entityId])
  @@index([createdAt])
}
```

---

## 9. Business Rules

### 9.1 Booking rules

| Service | Slot length | Capacity per slot | Lead time | Advance |
|---|---|---|---|---|
| House call | 60 min | Number of active vets | 3 hours | Optional |
| Vaccination | 20 min | 3 | 1 hour | No |
| Treatment | 30 min | 2 | 1 hour | No |
| Training | 60 min | 2 | 24 hours | Package based |
| Mating | 120 min | 1 | 48 hours | Yes |
| Boarding | Daily | Number of free kennel units | 24 hours | 1 night |

- Slots generated from `BusinessHour` minus `BlockedDate` minus fully booked slots
- Double booking prevented inside a serializable transaction (see section 12.6)
- House calls accepted only inside Kathmandu Valley (Kathmandu, Lalitpur, Bhaktapur)
- Customer reschedule/cancel allowed until 12 hours before `startAt`
- `PENDING` bookings with unpaid required advance auto cancel after 30 minutes (worker)

### 9.2 Pet listing reservation

- Deposit payment moves listing to `RESERVED` with `reservedUntil = now + 72 h`
- Worker returns expired reservations to `AVAILABLE`
- Only one active reservation per listing (row lock on listing during payment verification)

### 9.3 Orders and stock

- Stock is decremented when order becomes `PLACED` (COD) or payment `COMPLETED` (online)
- Every stock change writes a `StockMovement`
- `PENDING_PAYMENT` orders older than 30 minutes are cancelled by the worker
- Delivery fee: inside Ring Road flat rate, valley flat rate, outside valley by weight (configurable in settings)

### 9.4 Vaccination reminders

- Daily at 08:00 NPT, select `VaccinationRecord` where `nextDueOn` is 7 days or 1 day away and `reminderSent = false`
- Send SMS + email, set `reminderSent = true` after the 1 day reminder

---

## 10. Routes

### 10.1 Web routes (SSR)

| Method | Path | Description |
|---|---|---|
| GET | `/` | Home |
| GET | `/shop`, `/shop/category/:slug`, `/shop/product/:slug` | Catalog |
| GET | `/pets`, `/pets/:slug` | Pets for sale |
| GET/POST | `/sell-your-pet` | Sell offer form |
| GET | `/services`, `/services/:slug` | Service pages |
| GET/POST | `/book` | Booking wizard |
| GET | `/book/confirmation/:reference` | Booking confirmation |
| GET | `/shelter`, `/shelter/adopt`, `/shelter/adopt/:slug` | Shelter |
| POST | `/shelter/adopt/:slug/apply` | Adoption application |
| GET/POST | `/shelter/report-animal` | Report stray/injured animal |
| GET/POST | `/contact` | Contact |
| GET | `/cart` | Cart |
| GET/POST | `/checkout` | Checkout |
| GET | `/payments/esewa/success`, `/payments/esewa/failure` | eSewa callbacks |
| GET | `/payments/khalti/return` | Khalti callback |
| GET/POST | `/login`, `/register`, `/logout`, `/forgot-password`, `/reset-password/:token` | Auth |
| GET | `/account/*` | Customer area |
| GET | `/sitemap.xml`, `/robots.txt` | SEO |

### 10.2 JSON API (`/api/v1`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/products?category=&species=&q=&sort=&page=` | Public | Product search |
| GET | `/api/v1/pet-listings?species=&breed=&origin=&page=` | Public | Pet listings |
| GET | `/api/v1/services/:type/slots?date=YYYY-MM-DD` | Public | Available slots |
| GET | `/api/v1/boarding/availability?from=&to=` | Public | Free kennel units |
| POST | `/api/v1/cart/items` | Public (cart token) | Add item |
| PATCH | `/api/v1/cart/items/:id` | Public (cart token) | Change quantity |
| DELETE | `/api/v1/cart/items/:id` | Public (cart token) | Remove item |
| POST | `/api/v1/otp` | Public, rate limited | Send OTP |
| POST | `/api/v1/otp/verify` | Public, rate limited | Verify OTP |
| POST | `/api/v1/bookings` | Session or verified OTP | Create booking |
| POST | `/api/v1/bookings/:reference/cancel` | Owner | Cancel booking |
| GET | `/api/v1/me/pets` | Customer | Own pets |
| POST | `/api/v1/me/pets` | Customer | Add pet |

Response envelope: `{ "data": ..., "meta": ... }` on success, `{ "error": { "code", "message", "details" } }` on failure. Status codes: 201 for create with `Location`, 409 for slot conflict, 422 for validation, 429 for rate limit.

### 10.3 Admin routes (`/admin`, role `STAFF`, `VET` or `ADMIN`)

`/admin`, `/admin/products`, `/admin/categories`, `/admin/brands`, `/admin/pets`, `/admin/orders`, `/admin/bookings`, `/admin/boarding`, `/admin/medical`, `/admin/shelter`, `/admin/inquiries`, `/admin/customers`, `/admin/posts`, `/admin/faqs`, `/admin/testimonials`, `/admin/settings` (ADMIN only), `/admin/users` (ADMIN only), `/admin/reports`, `/admin/audit-log` (ADMIN only).

---

## 11. SEO and Local SEO

### 11.1 Target keywords

- pet shop in Kathmandu, pet shop Soaltee Mode
- dog food Kathmandu, dog accessories Nepal
- puppies for sale in Kathmandu, imported puppies Nepal, German Shepherd / Labrador / Husky puppy price in Nepal
- dog boarding Kathmandu, pet hotel Kathmandu
- vet home visit Kathmandu, dog vaccination at home Kathmandu
- dog training Kathmandu
- animal shelter Kathmandu, adopt a dog Nepal

### 11.2 Technical SEO

- Unique `<title>` (max 60 chars) and meta description (max 155 chars) on every page, editable in admin
- Canonical URLs, clean slugs, `noindex` on cart, checkout, account, admin, filtered pages with more than one filter
- Auto `sitemap.xml` (products, pets AVAILABLE, services, posts, shelter animals), regenerated hourly by worker
- Open Graph and Twitter cards with 1200x630 images
- Breadcrumbs with `BreadcrumbList` schema
- `Product` + `Offer` schema on product pages, `FAQPage` on service pages, `Article` on blog posts
- WebP images with `width`/`height`, `loading="lazy"`, descriptive alt text
- `hreflang` ready for an optional Nepali version (`/ne/`) in phase 4

### 11.3 LocalBusiness JSON-LD (`views/partials/seo.ejs`)

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": ["PetStore", "LocalBusiness"],
  "@id": "<%= baseUrl %>/#business",
  "name": "The Everest Kennel",
  "url": "<%= baseUrl %>",
  "logo": "<%= baseUrl %>/assets/img/logo.png",
  "image": "<%= baseUrl %>/assets/img/storefront.webp",
  "telephone": "+977-1-5234516",
  "priceRange": "Rs",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Soaltee Mode",
    "addressLocality": "Kathmandu",
    "addressRegion": "Bagmati",
    "postalCode": "44600",
    "addressCountry": "NP"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": <%= settings.geoLat %>,
    "longitude": <%= settings.geoLng %>
  },
  "areaServed": ["Kathmandu", "Lalitpur", "Bhaktapur"],
  "openingHoursSpecification": <%- JSON.stringify(openingHoursSchema) %>,
  "founder": { "@type": "Person", "name": "Rajkumar Panta" },
  "makesOffer": [
    { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Veterinary house call" } },
    { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Pet vaccination" } },
    { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Dog boarding" } },
    { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Dog training" } },
    { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Stud and mating service" } }
  ],
  "sameAs": <%- JSON.stringify(settings.socialLinks || []) %>
}
</script>
```

Off site: claim and verify Google Business Profile with exactly the same name, address and phone (NAP) as the website, category "Pet store" plus "Pet boarding service", weekly photo posts, ask every buyer for a review with a short link.

---

## 12. Core Code

### 12.1 `package.json`

```json
{
  "name": "everest-kennel",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20.11" },
  "scripts": {
    "dev": "concurrently -k \"tsx watch src/server.ts\" \"npm:css:watch\"",
    "build": "npm run css:build && tsc -p tsconfig.json && npm run copy:views",
    "copy:views": "cpy \"src/views/**/*\" dist/views --cwd=. --parents=false",
    "start": "node dist/server.js",
    "worker": "node dist/worker.js",
    "css:build": "tailwindcss -i ./src/styles/app.css -o ./public/assets/css/app.css --minify",
    "css:watch": "tailwindcss -i ./src/styles/app.css -o ./public/assets/css/app.css --watch",
    "db:migrate": "prisma migrate deploy",
    "db:migrate:dev": "prisma migrate dev",
    "db:seed": "tsx prisma/seed.ts",
    "lint": "eslint . --ext .ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@prisma/client": "^5.22.0",
    "argon2": "^0.41.1",
    "compression": "^1.7.5",
    "cookie-parser": "^1.4.7",
    "csrf-csrf": "^3.1.0",
    "dotenv": "^16.4.5",
    "ejs": "^3.1.10",
    "express": "^5.0.1",
    "express-ejs-layouts": "^2.5.1",
    "express-mysql-session": "^3.0.3",
    "express-rate-limit": "^7.4.1",
    "express-session": "^1.18.1",
    "helmet": "^8.0.0",
    "multer": "^1.4.5-lts.1",
    "node-cron": "^3.0.3",
    "nodemailer": "^6.9.16",
    "pino": "^9.5.0",
    "pino-http": "^10.3.0",
    "pino-roll": "^2.1.0",
    "sanitize-html": "^2.13.1",
    "sharp": "^0.33.5",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@playwright/test": "^1.48.2",
    "@types/compression": "^1.7.5",
    "@types/cookie-parser": "^1.4.7",
    "@types/express": "^5.0.0",
    "@types/express-session": "^1.18.0",
    "@types/multer": "^1.4.12",
    "@types/node": "^20.17.6",
    "@types/node-cron": "^3.0.11",
    "@types/nodemailer": "^6.4.16",
    "@types/sanitize-html": "^2.13.0",
    "@types/supertest": "^6.0.2",
    "concurrently": "^9.1.0",
    "cpy-cli": "^5.0.0",
    "eslint": "^9.14.0",
    "pino-pretty": "^13.0.0",
    "prisma": "^5.22.0",
    "supertest": "^7.0.0",
    "tailwindcss": "^3.4.14",
    "tsx": "^4.19.2",
    "typescript": "^5.6.3",
    "vitest": "^2.1.5"
  }
}
```

### 12.2 `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"]
}
```

### 12.3 `src/config/env.ts`

```ts
import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  APP_URL: z.string().url(),
  TRUST_PROXY: z.coerce.number().default(1),
  DATABASE_URL: z.string().min(1),
  DB_HOST: z.string(),
  DB_PORT: z.coerce.number().default(3306),
  DB_USER: z.string(),
  DB_PASSWORD: z.string(),
  DB_NAME: z.string(),
  SESSION_SECRET: z.string().min(32),
  CSRF_SECRET: z.string().min(32),
  SMTP_HOST: z.string(),
  SMTP_PORT: z.coerce.number().default(465),
  SMTP_USER: z.string(),
  SMTP_PASS: z.string(),
  MAIL_FROM: z.string(),
  ADMIN_NOTIFY_EMAIL: z.string().email(),
  SMS_PROVIDER: z.enum(['sparrow', 'aakash', 'log']).default('log'),
  SMS_TOKEN: z.string().optional(),
  SMS_FROM: z.string().optional(),
  ESEWA_PRODUCT_CODE: z.string(),
  ESEWA_SECRET_KEY: z.string(),
  ESEWA_FORM_URL: z.string().url(),
  ESEWA_STATUS_URL: z.string().url(),
  KHALTI_SECRET_KEY: z.string(),
  KHALTI_BASE_URL: z.string().url(),
  WHATSAPP_NUMBER: z.string(),
  UPLOAD_MAX_MB: z.coerce.number().default(5),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
```

### 12.4 `src/lib/prisma.ts`, `src/lib/logger.ts`, `src/lib/errors.ts`

```ts
// src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';
import { isProd } from '../config/env.js';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: isProd ? ['error'] : ['warn', 'error'] });

if (!isProd) globalForPrisma.prisma = prisma;
```

```ts
// src/lib/logger.ts
import pino from 'pino';
import { env, isProd } from '../config/env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: ['req.headers.cookie', 'req.headers.authorization', '*.password', '*.passwordHash', '*.otp'],
  transport: isProd
    ? { target: 'pino-roll', options: { file: 'storage/logs/app', frequency: 'daily', mkdir: true, limit: { count: 14 } } }
    : { target: 'pino-pretty', options: { colorize: true } },
});
```

```ts
// src/lib/errors.ts
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Resource') => new AppError(404, 'not_found', `${what} not found`);
export const conflict = (message: string) => new AppError(409, 'conflict', message);
export const forbidden = () => new AppError(403, 'forbidden', 'You do not have access to this resource');
```

### 12.5 `src/app.ts` and `src/server.ts`

```ts
// src/app.ts
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import MySQLStoreFactory from 'express-mysql-session';
import expressLayouts from 'express-ejs-layouts';
import { pinoHttp } from 'pino-http';
import { env, isProd } from './config/env.js';
import { logger } from './lib/logger.js';
import { csrfProtection } from './middleware/csrf.js';
import { locals } from './middleware/locals.js';
import { globalLimiter } from './middleware/rate-limit.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import webRoutes from './routes/web.js';
import apiRoutes from './routes/api.js';
import adminRoutes from './routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MySQLStore = MySQLStoreFactory(session as never);

export function createApp() {
  const app = express();

  app.set('trust proxy', env.TRUST_PROXY);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.set('layout', 'layouts/main');
  app.disable('x-powered-by');

  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url?.startsWith('/assets') ?? false } }));

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'script-src': ["'self'"],
          'img-src': ["'self'", 'data:', 'https://*.googleusercontent.com'],
          'frame-src': ['https://www.google.com'],
          'form-action': ["'self'", new URL(env.ESEWA_FORM_URL).origin, 'https://*.khalti.com'],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.use(compression());
  app.use(
    '/assets',
    express.static(path.join(__dirname, '../public/assets'), { maxAge: isProd ? '30d' : 0, immutable: isProd }),
  );
  app.use('/uploads', express.static(path.join(__dirname, '../public/uploads'), { maxAge: '7d', dotfiles: 'deny' }));
  app.use(express.static(path.join(__dirname, '../public'), { index: false, maxAge: '1d' }));

  app.use(express.urlencoded({ extended: false, limit: '200kb' }));
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser(env.SESSION_SECRET));

  app.use(
    session({
      name: 'ek.sid',
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      store: new MySQLStore({
        host: env.DB_HOST,
        port: env.DB_PORT,
        user: env.DB_USER,
        password: env.DB_PASSWORD,
        database: env.DB_NAME,
        createDatabaseTable: true,
        clearExpired: true,
        checkExpirationInterval: 15 * 60 * 1000,
      }),
      cookie: {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 14,
      },
    }),
  );

  app.use(globalLimiter);
  app.use(expressLayouts);
  app.use(locals);

  // eSewa/Khalti callbacks are GET redirects, so CSRF only applies to state changing methods
  app.use('/api/v1', csrfProtection, apiRoutes);
  app.use('/admin', csrfProtection, adminRoutes);
  app.use('/', csrfProtection, webRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
```

```ts
// src/server.ts
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';

const app = createApp();
const server = app.listen(env.PORT, () => logger.info(`Everest Kennel running on ${env.APP_URL} (port ${env.PORT})`));

server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down');
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => logger.error({ reason }, 'Unhandled rejection'));
```

### 12.6 Middleware

```ts
// src/middleware/csrf.ts
import { doubleCsrf } from 'csrf-csrf';
import type { RequestHandler } from 'express';
import { env, isProd } from '../config/env.js';

const { doubleCsrfProtection, generateToken } = doubleCsrf({
  getSecret: () => env.CSRF_SECRET,
  cookieName: isProd ? '__Host-ek.csrf' : 'ek.csrf',
  cookieOptions: { sameSite: 'lax', secure: isProd, httpOnly: true, path: '/' },
  getTokenFromRequest: (req) => (req.body?._csrf as string) ?? (req.headers['x-csrf-token'] as string),
});

export const csrfProtection: RequestHandler = (req, res, next) => {
  res.locals.csrfToken = generateToken(req, res);
  doubleCsrfProtection(req, res, next);
};
```

```ts
// src/middleware/rate-limit.ts
import rateLimit from 'express-rate-limit';

export const globalLimiter = rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false });
export const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false });
export const formLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 15, standardHeaders: 'draft-7', legacyHeaders: false });
export const otpLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false });
```

```ts
// src/middleware/auth.ts
import type { RequestHandler } from 'express';
import type { Role } from '@prisma/client';

declare module 'express-session' {
  interface SessionData {
    user?: { id: number; name: string; role: Role };
    cartToken?: string;
    verifiedPhone?: string;
  }
}

export const requireAuth: RequestHandler = (req, res, next) => {
  if (req.session.user) return next();
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({ error: { code: 'unauthenticated', message: 'Login required' } });
  }
  return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
};

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, res, next) => {
    const user = req.session.user;
    if (!user) return res.redirect('/login');
    if (!roles.includes(user.role)) return res.status(403).render('errors/403', { layout: 'layouts/main' });
    return next();
  };
```

```ts
// src/middleware/validate.ts
import type { RequestHandler } from 'express';
import type { ZodSchema } from 'zod';
import { AppError } from '../lib/errors.js';

export const validate =
  (schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body'): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(
        new AppError(
          422,
          'validation_error',
          'Please correct the highlighted fields',
          result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message, code: i.code })),
        ),
      );
    }
    (req as unknown as Record<string, unknown>)[`validated${source[0]!.toUpperCase()}${source.slice(1)}`] = result.data;
    return next();
  };
```

```ts
// src/middleware/error-handler.ts
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export const notFoundHandler: RequestHandler = (req, res) => {
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(404).json({ error: { code: 'not_found', message: 'Endpoint not found' } });
  }
  return res.status(404).render('errors/404', { title: 'Page not found' });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let appErr: AppError;

  if (err instanceof AppError) appErr = err;
  else if (err?.code === 'EBADCSRFTOKEN' || err?.message === 'invalid csrf token')
    appErr = new AppError(403, 'csrf_invalid', 'Your session expired. Please refresh and try again.');
  else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
    appErr = new AppError(409, 'duplicate', 'This record already exists');
  else {
    logger.error({ err, url: req.originalUrl }, 'Unhandled error');
    appErr = new AppError(500, 'internal_error', 'Something went wrong. Please try again.');
  }

  if (req.originalUrl.startsWith('/api/') || req.accepts(['html', 'json']) === 'json') {
    return res
      .status(appErr.status)
      .json({ error: { code: appErr.code, message: appErr.message, details: appErr.details } });
  }

  if (appErr.status === 422 && req.method === 'POST') {
    req.session && ((req.session as unknown as Record<string, unknown>).flashErrors = appErr.details);
    return res.redirect(303, req.get('Referer') ?? '/');
  }

  return res.status(appErr.status).render(appErr.status === 404 ? 'errors/404' : 'errors/500', { title: 'Error' });
};
```

### 12.7 Reference module: bookings

All other modules follow this structure.

```ts
// src/modules/bookings/booking.schema.ts
import { z } from 'zod';

const nepalPhone = z
  .string()
  .trim()
  .regex(/^(\+977-?)?(98|97|96)\d{8}$|^(\+977-?)?0?1-?\d{7}$/, 'Enter a valid Nepali phone number');

export const createBookingSchema = z
  .object({
    serviceType: z.enum(['HOUSE_CALL', 'TREATMENT', 'VACCINATION', 'MATING', 'TRAINING', 'BOARDING']),
    petId: z.coerce.number().int().positive().optional(),
    petSummary: z.string().trim().max(255).optional(),
    contactName: z.string().trim().min(2).max(120),
    contactPhone: nepalPhone,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    slot: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    addressText: z.string().trim().max(255).optional(),
    latitude: z.coerce.number().min(26).max(31).optional(),
    longitude: z.coerce.number().min(80).max(89).optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.serviceType === 'BOARDING' && !v.endDate)
      ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'Check out date is required' });
    if (v.serviceType !== 'BOARDING' && !v.slot)
      ctx.addIssue({ code: 'custom', path: ['slot'], message: 'Please choose a time slot' });
    if (v.serviceType === 'HOUSE_CALL' && !v.addressText)
      ctx.addIssue({ code: 'custom', path: ['addressText'], message: 'Address is required for house calls' });
    if (!v.petId && !v.petSummary)
      ctx.addIssue({ code: 'custom', path: ['petSummary'], message: 'Tell us about your pet' });
  });

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
```

```ts
// src/modules/bookings/booking.service.ts
import { Prisma, type ServiceType } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { AppError, conflict, notFound } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import type { CreateBookingInput } from './booking.schema.js';

const TZ_OFFSET = '+05:45'; // Nepal Time

const toNpt = (date: string, time = '00:00') => new Date(`${date}T${time}:00${TZ_OFFSET}`);
const reference = () => `EK${randomBytes(4).toString('hex').toUpperCase()}`;

export async function listSlots(type: ServiceType, date: string) {
  const service = await prisma.service.findUnique({ where: { type } });
  if (!service || !service.isActive || type === 'BOARDING') throw notFound('Service');

  const day = toNpt(date);
  const weekday = Number(new Intl.DateTimeFormat('en-US', { weekday: 'numeric' as never, timeZone: 'Asia/Kathmandu' }).format(day)) || day.getUTCDay();

  const [hours, blocked] = await Promise.all([
    prisma.businessHour.findUnique({ where: { weekday } }),
    prisma.blockedDate.findUnique({ where: { date: new Date(`${date}T00:00:00Z`) } }),
  ]);
  if (!hours || hours.isClosed || blocked) return [];

  const dayStart = toNpt(date, hours.opensAt);
  const dayEnd = toNpt(date, hours.closesAt);

  const taken = await prisma.booking.groupBy({
    by: ['startAt'],
    where: { serviceId: service.id, startAt: { gte: dayStart, lt: dayEnd }, status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] } },
    _count: { _all: true },
  });
  const takenMap = new Map(taken.map((t) => [t.startAt.getTime(), t._count._all]));

  const slots: { time: string; available: number }[] = [];
  const step = service.durationMinutes * 60_000;
  const earliest = Date.now() + 60 * 60_000;

  for (let t = dayStart.getTime(); t + step <= dayEnd.getTime(); t += step) {
    if (t < earliest) continue;
    const available = service.slotCapacity - (takenMap.get(t) ?? 0);
    if (available > 0) {
      const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kathmandu' }).format(new Date(t));
      slots.push({ time, available });
    }
  }
  return slots;
}

export async function createBooking(input: CreateBookingInput, userId?: number) {
  const service = await prisma.service.findUnique({ where: { type: input.serviceType } });
  if (!service || !service.isActive) throw notFound('Service');

  if (input.petId && userId) {
    const ownsPet = await prisma.customerPet.count({ where: { id: input.petId, userId } });
    if (!ownsPet) throw new AppError(403, 'forbidden', 'Pet not found in your account');
  }

  const isBoarding = input.serviceType === 'BOARDING';
  const startAt = isBoarding ? toNpt(input.date, '12:00') : toNpt(input.date, input.slot);
  const endAt = isBoarding
    ? toNpt(input.endDate!, '12:00')
    : new Date(startAt.getTime() + service.durationMinutes * 60_000);

  if (endAt <= startAt) throw new AppError(422, 'validation_error', 'End must be after start');
  if (startAt.getTime() < Date.now() + 60 * 60_000) throw new AppError(422, 'validation_error', 'Please choose a later time');

  try {
    return await prisma.$transaction(
      async (tx) => {
        let kennelUnitId: number | undefined;

        if (isBoarding) {
          const busy = await tx.booking.findMany({
            where: {
              serviceId: service.id,
              status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] },
              startAt: { lt: endAt },
              endAt: { gt: startAt },
              kennelUnitId: { not: null },
            },
            select: { kennelUnitId: true },
          });
          const busyIds = busy.map((b) => b.kennelUnitId!);
          const free = await tx.kennelUnit.findFirst({
            where: { isActive: true, id: { notIn: busyIds.length ? busyIds : [0] } },
            orderBy: { id: 'asc' },
          });
          if (!free) throw conflict('No kennel is free for these dates. Please try other dates.');
          kennelUnitId = free.id;
        } else {
          const count = await tx.booking.count({
            where: { serviceId: service.id, startAt, status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] } },
          });
          if (count >= service.slotCapacity) throw conflict('This slot was just booked. Please pick another time.');
        }

        return tx.booking.create({
          data: {
            reference: reference(),
            serviceId: service.id,
            userId,
            petId: input.petId,
            petSummary: input.petSummary,
            contactName: input.contactName,
            contactPhone: input.contactPhone,
            startAt,
            endAt,
            addressText: input.addressText,
            latitude: input.latitude,
            longitude: input.longitude,
            notes: input.notes,
            kennelUnitId,
            pricePaisa: service.basePricePaisa,
          },
          include: { service: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 },
    );
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
      logger.warn({ input }, 'Booking serialization conflict');
      throw conflict('This slot was just booked. Please pick another time.');
    }
    throw err;
  }
}
```

```ts
// src/modules/bookings/booking.controller.ts
import type { Request, Response } from 'express';
import { createBooking, listSlots } from './booking.service.js';
import { notifyNewBooking } from '../../lib/notify.js';
import { AppError } from '../../lib/errors.js';
import type { CreateBookingInput } from './booking.schema.js';
import type { ServiceType } from '@prisma/client';

export async function getSlots(req: Request, res: Response) {
  const date = String(req.query.date ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AppError(422, 'validation_error', 'date must be YYYY-MM-DD');
  const slots = await listSlots(req.params.type as ServiceType, date);
  res.set('Cache-Control', 'no-store').json({ data: slots });
}

export async function postBooking(req: Request, res: Response) {
  const input = (req as unknown as { validatedBody: CreateBookingInput }).validatedBody;
  const userId = req.session.user?.id;

  if (!userId && req.session.verifiedPhone !== input.contactPhone) {
    throw new AppError(403, 'phone_unverified', 'Please verify your phone number first');
  }

  const booking = await createBooking(input, userId);
  void notifyNewBooking(booking); // fire and forget, errors logged inside

  if (req.originalUrl.startsWith('/api/')) {
    return res.status(201).location(`/book/confirmation/${booking.reference}`).json({ data: { reference: booking.reference } });
  }
  return res.redirect(303, `/book/confirmation/${booking.reference}`);
}
```

```ts
// src/modules/bookings/booking.routes.ts
import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { formLimiter } from '../../middleware/rate-limit.js';
import { createBookingSchema } from './booking.schema.js';
import { getSlots, postBooking } from './booking.controller.js';

export const bookingApi = Router();
bookingApi.get('/services/:type/slots', getSlots);
bookingApi.post('/bookings', formLimiter, validate(createBookingSchema), postBooking);
```

Express 5 forwards rejected promises from async handlers to the error handler automatically, so no `asyncHandler` wrapper is needed.

### 12.8 eSewa ePay v2 signature and verification

```ts
// src/modules/payments/esewa.ts
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';

const sign = (message: string) => createHmac('sha256', env.ESEWA_SECRET_KEY).update(message).digest('base64');

export function buildEsewaForm(transactionUuid: string, amountRupees: string) {
  const fields = {
    amount: amountRupees,
    tax_amount: '0',
    total_amount: amountRupees,
    transaction_uuid: transactionUuid,
    product_code: env.ESEWA_PRODUCT_CODE,
    product_service_charge: '0',
    product_delivery_charge: '0',
    success_url: `${env.APP_URL}/payments/esewa/success`,
    failure_url: `${env.APP_URL}/payments/esewa/failure`,
    signed_field_names: 'total_amount,transaction_uuid,product_code',
  };
  const signature = sign(
    `total_amount=${fields.total_amount},transaction_uuid=${fields.transaction_uuid},product_code=${fields.product_code}`,
  );
  return { action: env.ESEWA_FORM_URL, fields: { ...fields, signature } };
}

/** Verifies the base64 `data` query param eSewa sends to success_url, then confirms with the status API. */
export async function verifyEsewaCallback(encoded: string) {
  const payload = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as Record<string, string>;
  const message = payload.signed_field_names!
    .split(',')
    .map((f) => `${f}=${payload[f]}`)
    .join(',');
  const expected = Buffer.from(sign(message));
  const received = Buffer.from(payload.signature ?? '');
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new Error('eSewa signature mismatch');
  }

  const url = new URL(env.ESEWA_STATUS_URL);
  url.searchParams.set('product_code', env.ESEWA_PRODUCT_CODE);
  url.searchParams.set('total_amount', payload.total_amount!);
  url.searchParams.set('transaction_uuid', payload.transaction_uuid!);
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  const status = (await res.json()) as { status: string; ref_id?: string };

  return { ok: status.status === 'COMPLETE', transactionUuid: payload.transaction_uuid!, refId: status.ref_id, payload };
}
```

Khalti KPG-2: `POST {KHALTI_BASE_URL}/epayment/initiate/` with header `Authorization: Key <secret>` and amount in paisa, redirect to returned `payment_url`, then on return call `POST /epayment/lookup/` with `pidx` and accept only `status === "Completed"` with matching amount. Never trust query string status alone for either gateway. Always compare the verified amount with the order total in the database before marking paid, inside a transaction that also decrements stock.

### 12.9 `src/worker.ts`

```ts
import cron from 'node-cron';
import { logger } from './lib/logger.js';
import { sendVaccinationReminders } from './jobs/vaccination-reminders.js';
import { expireReservations } from './jobs/expire-reservations.js';
import { generateSitemap } from './jobs/sitemap.js';

const tz = { timezone: 'Asia/Kathmandu' };
const run = (name: string, fn: () => Promise<unknown>) => async () => {
  const started = Date.now();
  try {
    await fn();
    logger.info({ job: name, ms: Date.now() - started }, 'Job finished');
  } catch (err) {
    logger.error({ job: name, err }, 'Job failed');
  }
};

cron.schedule('0 8 * * *', run('vaccination-reminders', sendVaccinationReminders), tz);
cron.schedule('*/10 * * * *', run('expire-reservations', expireReservations), tz);
cron.schedule('5 * * * *', run('sitemap', generateSitemap), tz);

logger.info('Worker started');
```

### 12.10 Image upload pipeline (`src/middleware/upload.ts`)

```ts
import multer from 'multer';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.UPLOAD_MAX_MB * 1024 * 1024, files: 6 },
  fileFilter: (_req, file, cb) =>
    ALLOWED.has(file.mimetype) ? cb(null, true) : cb(new AppError(422, 'invalid_file', 'Only JPG, PNG or WebP images')),
});

export const processImages =
  (folder: string): RequestHandler =>
  async (req, _res, next) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const dir = path.resolve('public/uploads', folder, new Date().toISOString().slice(0, 7));
    await fs.mkdir(dir, { recursive: true });

    const saved: string[] = [];
    for (const file of files) {
      const meta = await sharp(file.buffer).metadata(); // throws on non image content
      if (!meta.width) throw new AppError(422, 'invalid_file', 'Invalid image');
      const base = randomUUID();
      await Promise.all(
        [400, 800, 1200].map((w) =>
          sharp(file.buffer).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 78 }).toFile(path.join(dir, `${base}-${w}.webp`)),
        ),
      );
      saved.push(path.relative('public', path.join(dir, base)).replaceAll('\\', '/'));
    }
    (req as unknown as { uploadedImages: string[] }).uploadedImages = saved;
    next();
  };
```

Views render `<img srcset="/<path>-400.webp 400w, /<path>-800.webp 800w, /<path>-1200.webp 1200w" sizes="(max-width: 640px) 100vw, 400px">`.

---

## 13. Security Checklist

- [ ] Argon2id password hashing, minimum 8 characters, block top 10k common passwords
- [ ] Session regenerated on login and privilege change (`req.session.regenerate`)
- [ ] CSRF double submit token on every form and `X-CSRF-Token` header on fetch
- [ ] Helmet with strict CSP, no inline scripts (Alpine loaded from `/assets`, data passed via `data-*` attributes; use Alpine CSP build)
- [ ] Rate limits on login, OTP, forms, booking
- [ ] OTP: 6 digits, SHA-256 hashed, 5 minute expiry, max 5 attempts, max 5 sends per hour per phone
- [ ] Honeypot field + minimum submit time on public forms
- [ ] All input validated with Zod, blog HTML sanitized with `sanitize-html`, EJS `<%=` escaping everywhere (`<%-` only for trusted JSON-LD built server side)
- [ ] Uploads: MIME + Sharp decode check, re-encoded to WebP, random names, no executable paths, `/uploads` served without directory listing
- [ ] Ownership checks on every customer resource (orders, bookings, pets)
- [ ] Payment amounts verified server side against DB, gateway status API called, idempotent callbacks (unique `transactionId`)
- [ ] Admin actions written to `AuditLog`
- [ ] Prisma parameterized queries only, no `$queryRawUnsafe`
- [ ] Secrets only in `.env`, never committed; separate test and live gateway keys
- [ ] HTTPS everywhere, HSTS after SSL confirmed, `secure` cookies in production
- [ ] `npm audit` and Dependabot weekly
- [ ] Daily MySQL backup with 14 day retention, uploads folder backup weekly

---

## 14. Performance and Accessibility

- SSR HTML with critical CSS under 20 KB, total JS under 40 KB on public pages
- Cache category trees, settings and featured products in LRU/Redis for 5 minutes, bust on admin save
- Indexes defined in schema for all filter and sort columns; avoid `OFFSET` beyond page 50 on public listings
- `Cache-Control: public, max-age=300` on anonymous catalog pages (Vary on cookie handled by not caching when session exists)
- Fonts: system font stack or one self hosted WOFF2 with `font-display: swap`
- Google Map loaded only on click
- WCAG 2.2 AA: color contrast 4.5:1, focus visible, skip link, labelled form fields, error messages linked with `aria-describedby`, booking wizard announces step changes with `aria-live`
- Tap targets 44x44 px, sticky mobile action bar does not cover content

---

## 15. Environment (`.env.example`)

```dotenv
NODE_ENV=production
PORT=3000
APP_URL=https://www.everestkennel.com.np
TRUST_PROXY=1

DATABASE_URL="mysql://ek_user:CHANGE_ME@127.0.0.1:3306/everest_kennel"
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=ek_user
DB_PASSWORD=CHANGE_ME
DB_NAME=everest_kennel

SESSION_SECRET=generate_with_openssl_rand_hex_32
CSRF_SECRET=generate_with_openssl_rand_hex_32

SMTP_HOST=mail.everestkennel.com.np
SMTP_PORT=465
SMTP_USER=no-reply@everestkennel.com.np
SMTP_PASS=CHANGE_ME
MAIL_FROM="The Everest Kennel <no-reply@everestkennel.com.np>"
ADMIN_NOTIFY_EMAIL=info@everestkennel.com.np

SMS_PROVIDER=sparrow
SMS_TOKEN=CHANGE_ME
SMS_FROM=EverestKnl

# eSewa test values (switch to live values from eSewa merchant panel)
ESEWA_PRODUCT_CODE=EPAYTEST
ESEWA_SECRET_KEY=8gBm/:&EnhH.1/q
ESEWA_FORM_URL=https://rc-epay.esewa.com.np/api/epay/main/v2/form
ESEWA_STATUS_URL=https://rc.esewa.com.np/api/epay/transaction/status/

# Khalti sandbox (live: https://khalti.com/api/v2)
KHALTI_SECRET_KEY=CHANGE_ME
KHALTI_BASE_URL=https://dev.khalti.com/api/v2

WHATSAPP_NUMBER=97798XXXXXXXX
UPLOAD_MAX_MB=5
LOG_LEVEL=info
```

Generate secrets with `openssl rand -hex 32`. Domain shown is a suggestion; confirm availability at register.com.np (free `.com.np` for Nepali registered businesses).

---

## 16. Local Development

```bash
git clone git@github.com:<org>/everest-kennel.git
cd everest-kennel
cp .env.example .env              # set NODE_ENV=development and local DB values
docker compose up -d mysql        # or use local MySQL 8
npm ci
npx prisma migrate dev --name init
npm run db:seed                   # services, breeds, categories, hours, kennel units, admin user
npm run dev                       # http://localhost:3000
```

Seed creates admin `admin@everestkennel.local` with a random password printed once to the console.

### 16.1 Seed data (minimum)

- Services: 6 records from section 1.2 with durations and capacities from section 9.1
- Business hours: Sunday to Friday 09:00 to 19:00, Saturday 10:00 to 17:00 (confirm with owner)
- Kennel units: K01 to K10 (small/medium/large)
- Categories: Dog Food, Cat Food, Bird Feed, Accessories, Kennel Accessories, Toys, Supplements, Grooming
- Breeds: Labrador Retriever, German Shepherd, Golden Retriever, Siberian Husky, Pug, Shih Tzu, Beagle, Rottweiler, Pomeranian, Tibetan Mastiff, Saint Bernard, Doberman, Persian Cat, Local (Nepali) breed

---

## 17. Docker

```dockerfile
# Dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build && npm prune --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/prisma ./prisma
COPY --from=build --chown=app:app /app/package.json ./
RUN mkdir -p storage/logs public/uploads && chown -R app:app storage public/uploads
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
```

```yaml
# docker-compose.yml
services:
  app:
    build: .
    env_file: .env
    environment:
      DB_HOST: mysql
      DATABASE_URL: mysql://${DB_USER}:${DB_PASSWORD}@mysql:3306/${DB_NAME}
    ports: ["3000:3000"]
    volumes:
      - uploads:/app/public/uploads
      - logs:/app/storage/logs
    depends_on:
      mysql: { condition: service_healthy }
    restart: unless-stopped

  worker:
    build: .
    env_file: .env
    environment:
      DB_HOST: mysql
      DATABASE_URL: mysql://${DB_USER}:${DB_PASSWORD}@mysql:3306/${DB_NAME}
    command: ["node", "dist/worker.js"]
    depends_on:
      mysql: { condition: service_healthy }
    restart: unless-stopped

  mysql:
    image: mysql:8.4
    environment:
      MYSQL_DATABASE: ${DB_NAME}
      MYSQL_USER: ${DB_USER}
      MYSQL_PASSWORD: ${DB_PASSWORD}
      MYSQL_ROOT_PASSWORD: ${DB_PASSWORD}_root
    command: ["--character-set-server=utf8mb4", "--collation-server=utf8mb4_unicode_ci"]
    volumes: [dbdata:/var/lib/mysql]
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "127.0.0.1"]
      interval: 10s
      retries: 10
    restart: unless-stopped

volumes:
  dbdata:
  uploads:
  logs:
```

Add a `/healthz` route in `web.ts` that runs `SELECT 1` through Prisma and returns `{ "status": "ok" }`.

---

## 18. Deployment

### 18.1 Option A: VPS (recommended, Ubuntu 24.04)

1. Create user `deploy`, disable root SSH and password login, enable UFW (22, 80, 443).
2. Install Node 20 (NodeSource), MySQL 8, Nginx, Certbot, PM2.
3. Clone repo to `/var/www/everest-kennel`, add `.env`, `npm ci && npx prisma generate && npm run build && npx prisma migrate deploy`.
4. PM2 `ecosystem.config.cjs`:

```js
module.exports = {
  apps: [
    { name: 'ek-web', script: 'dist/server.js', instances: 2, exec_mode: 'cluster', max_memory_restart: '400M', env: { NODE_ENV: 'production' } },
    { name: 'ek-worker', script: 'dist/worker.js', instances: 1, env: { NODE_ENV: 'production' } },
  ],
};
```

5. `pm2 start ecosystem.config.cjs && pm2 save && pm2 startup`
6. Nginx reverse proxy:

```nginx
server {
    listen 80;
    server_name everestkennel.com.np www.everestkennel.com.np;
    return 301 https://www.everestkennel.com.np$request_uri;
}

server {
    listen 443 ssl http2;
    server_name www.everestkennel.com.np;

    ssl_certificate     /etc/letsencrypt/live/everestkennel.com.np/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/everestkennel.com.np/privkey.pem;

    client_max_body_size 32m;
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;

    location /assets/ {
        alias /var/www/everest-kennel/public/assets/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location /uploads/ {
        alias /var/www/everest-kennel/public/uploads/;
        expires 7d;
        location ~* \.(php|js|html|sh)$ { deny all; }
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

7. `certbot --nginx -d everestkennel.com.np -d www.everestkennel.com.np`
8. Cron: `0 2 * * * mysqldump --single-transaction everest_kennel | gzip > /backups/ek-$(date +\%F).sql.gz && find /backups -mtime +14 -delete`

### 18.2 Option B: cPanel (Setup Node.js App)

1. cPanel > Setup Node.js App > Create: Node 20, mode Production, app root `everest-kennel`, startup file `dist/server.js`.
2. Upload build (or `git pull` via cPanel Git Version Control), run `npm ci --omit=dev` from the app's virtual env terminal.
3. Add environment variables in the Node.js App screen (or `.env` outside `public_html`).
4. Run `npx prisma migrate deploy` from terminal.
5. Worker: cPanel cron every 10 minutes running a one shot script (`node dist/worker-once.js`) instead of a long running process, since shared hosting kills background daemons.
6. Prisma on shared hosting: set `binaryTargets = ["native", "debian-openssl-1.1.x"]` (or the target matching the server's OpenSSL) in `generator client` and generate on the server.

### 18.3 CI (GitHub Actions)

On push to `main`: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test` (MySQL service container), build Docker image, deploy over SSH (`git pull && npm ci && npm run build && npx prisma migrate deploy && pm2 reload ecosystem.config.cjs`).

---

## 19. Testing Plan

| Layer | Tool | Must cover |
|---|---|---|
| Unit | Vitest | money formatting, slot generation, phone validation, eSewa signature, delivery fee calc |
| Integration | Vitest + Supertest + test MySQL | booking capacity and conflicts, boarding overlap, checkout stock decrement, payment callback idempotency, ownership checks, CSRF rejection |
| E2E | Playwright (mobile + desktop) | browse > add to cart > COD checkout, book vaccination as guest with OTP (SMS provider `log`), admin confirms booking, reserve puppy with eSewa sandbox |
| Load | k6 | 100 concurrent users on home/shop, 20 concurrent bookings on same slot (must create exactly `slotCapacity`) |
| Audit | Lighthouse CI, axe | thresholds from section 2.1 |

---

## 20. Delivery Phases

| Phase | Duration | Scope | Done when |
|---|---|---|---|
| 0. Discovery | 3 days | Collect content (section 21), logo, photos, prices, hours, domain, gateway accounts | Content sheet signed off |
| 1. Foundation | 1 week | Repo, Docker, schema, auth, layouts, design system, home, about, contact, services pages, SEO base, deploy staging | Staging live, Lighthouse targets met |
| 2. Catalog and pets | 1 week | Products, categories, pet listings, sell your pet, admin CRUD, image pipeline | Owner can add products and puppies alone |
| 3. Booking | 1 week | Slots, booking wizard, OTP, boarding units, admin calendar, notifications | 20 parallel booking test passes |
| 4. Commerce | 1 week | Cart, checkout, COD, eSewa, Khalti, invoices, stock movements, pet reservation | Sandbox payments pass, live keys tested with Rs 10 |
| 5. Customer area and shelter | 1 week | Accounts, my pets, vaccination records, reminders worker, shelter adoption and reports | Reminder SMS received in test |
| 6. Launch | 3 days | Live payment keys, Google Business Profile, Search Console, sitemap submit, backups, monitoring (UptimeRobot) | Production live |
| 7. Growth (optional) | ongoing | Blog content plan, Nepali language version, PWA install, loyalty points, training packages | |

---

## 21. Content Needed from the Client

- [ ] Full mobile/WhatsApp number (brief only had `+977`)
- [ ] Email address and preferred domain name
- [ ] Logo (SVG/PNG) and brand colors
- [ ] Exact shop location pin on Google Maps and opening hours
- [ ] Photos: storefront, kennels, staff, products, current puppies (landscape, good light)
- [ ] Service prices or "starting from" prices: house call, vaccination per vaccine, boarding per night by size, training packages, mating fee
- [ ] Vet name and Nepal Veterinary Council registration number (shown on treatment pages for trust and compliance)
- [ ] Delivery areas and charges
- [ ] Return/refund policy for products and health guarantee policy for puppies
- [ ] eSewa and Khalti merchant accounts (PAN/VAT and company/firm registration required)
- [ ] SMS provider account (Sparrow SMS or Aakash SMS) with approved sender ID
- [ ] Social media links (Facebook, Instagram, TikTok)
- [ ] 5 to 10 customer testimonials

---

## 22. Compliance Notes (Nepal)

- Treatment and vaccination must be performed by a registered veterinarian or a supervised technician; display the vet's registration on service pages.
- Imported animals need quarantine and import permits from the Department of Livestock Services; listing pages for `IMPORTED` pets should show permit/health certificate availability.
- Keep vaccination and deworming records for every animal sold; the listing form makes these fields visible to buyers.
- Animal sale policy page: minimum puppy age at handover (8 weeks recommended), health check at handover, return terms.
- Collect only needed personal data, show a privacy policy, and allow customers to delete their account.

---

## 23. Definition of Done (every feature)

- [ ] Zod validation on all inputs, friendly error messages in the form
- [ ] Authorization and ownership checks
- [ ] Logged errors with context, no stack traces shown to users
- [ ] Unit/integration test added
- [ ] Works on a 360 px wide phone, keyboard navigable, axe shows no serious issues
- [ ] Title, meta description and canonical set (public pages)
- [ ] Admin action recorded in audit log
- [ ] Documented in this file if it changes routes, schema or env
