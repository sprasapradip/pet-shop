/**
 * Seeds reference data (services, hours, kennels, categories, breeds) and demo content.
 * Idempotent: safe to run more than once. Run with `npm run db:seed`.
 * Set SEED_DEMO=0 to skip demo products, pets, shelter animals and posts.
 */
import 'dotenv/config';
import { PrismaClient, type ServiceType, type Species } from '@prisma/client';
import argon2 from 'argon2';
import sharp from 'sharp';
import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const prisma = new PrismaClient();
const withDemo = process.env.SEED_DEMO !== '0';
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const rs = (rupees: number) => Math.round(rupees * 100);

// ---------- Placeholder images (WebP, 3 sizes) ----------
async function placeholder(folder: string, title: string, subtitle: string, hue: number): Promise<string> {
  const dir = path.resolve('public/uploads', folder, 'seed');
  await fs.mkdir(dir, { recursive: true });
  const base = randomUUID();
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},45%,88%)"/><stop offset="1" stop-color="hsl(${hue},40%,72%)"/></linearGradient></defs>
    <rect width="1200" height="1200" fill="url(#g)"/>
    <g fill="hsl(${hue},35%,55%)" opacity=".55" transform="translate(600 520)">
      <ellipse cx="0" cy="70" rx="150" ry="120"/><circle cx="-180" cy="-80" r="62"/><circle cx="-70" cy="-180" r="62"/><circle cx="70" cy="-180" r="62"/><circle cx="180" cy="-80" r="62"/>
    </g>
    <text x="600" y="900" font-family="Segoe UI, Arial, sans-serif" font-size="78" font-weight="800" text-anchor="middle" fill="hsl(${hue},45%,22%)">${esc(title)}</text>
    <text x="600" y="985" font-family="Segoe UI, Arial, sans-serif" font-size="46" text-anchor="middle" fill="hsl(${hue},30%,32%)">${esc(subtitle)}</text>
  </svg>`);
  await Promise.all(
    [400, 800, 1200].map((w) => sharp(svg).resize(w, w).webp({ quality: 78 }).toFile(path.join(dir, `${base}-${w}.webp`))),
  );
  return `uploads/${folder}/seed/${base}`;
}

// ---------- Reference data ----------

const SERVICES: {
  type: ServiceType;
  name: string;
  slug: string;
  shortDesc: string;
  basePrice: number | null;
  duration: number;
  capacity: number;
  lead: number;
  advance: number;
  included: string[];
  content: string;
}[] = [
  {
    type: 'HOUSE_CALL',
    name: 'Vet House Call',
    slug: 'house-call-vet',
    shortDesc: 'A registered veterinarian visits your home anywhere in Kathmandu, Lalitpur or Bhaktapur for check ups, illness and injuries.',
    basePrice: 1500,
    duration: 60,
    capacity: 1,
    lead: 180,
    advance: 0,
    included: ['Full physical examination', 'Temperature, weight and heart check', 'Advice on diet, deworming and vaccination', 'Basic treatment and injections', 'Prescription and follow up plan', 'Records saved to your pet’s profile'],
    content: '<p>Stress free veterinary care at home. Ideal for senior pets, puppies, anxious animals and families who cannot travel.</p><h2>When to call us</h2><ul><li>Loss of appetite, vomiting or diarrhoea</li><li>Skin problems, ticks and fleas</li><li>Limping or injury</li><li>Routine check ups and vaccination</li></ul>',
  },
  {
    type: 'VACCINATION',
    name: 'Vaccination',
    slug: 'vaccination',
    shortDesc: 'Core vaccines (DHPPiL), rabies and kennel cough for dogs, and Tricat for cats, at our shop or at your home.',
    basePrice: 800,
    duration: 20,
    capacity: 3,
    lead: 60,
    advance: 0,
    included: ['Health check before vaccination', 'Quality cold chain vaccines', 'Vaccination card and online record', 'SMS reminders before the next dose'],
    content: '<h2>Puppy vaccination schedule</h2><ul><li>6 to 8 weeks: first DHPPiL</li><li>9 to 11 weeks: second DHPPiL</li><li>12 to 14 weeks: third DHPPiL and anti-rabies</li><li>Every year: booster and anti-rabies</li></ul>',
  },
  {
    type: 'TREATMENT',
    name: 'Treatment',
    slug: 'treatment',
    shortDesc: 'Diagnosis and treatment for skin, stomach, ear and eye problems, wounds and infections at our clinic.',
    basePrice: 1000,
    duration: 30,
    capacity: 2,
    lead: 60,
    advance: 0,
    included: ['Consultation and examination', 'Wound dressing and minor procedures', 'Injections and medicines (charged separately)', 'Follow up advice'],
    content: '<p>Our veterinary team treats common illnesses and injuries for dogs, cats and small pets.</p>',
  },
  {
    type: 'TRAINING',
    name: 'Dog Training',
    slug: 'dog-training',
    shortDesc: 'Puppy manners, obedience, leash walking and behaviour training, at our centre or at your home.',
    basePrice: 2000,
    duration: 60,
    capacity: 2,
    lead: 1440,
    advance: 0,
    included: ['Assessment session', 'Sit, stay, come, down and heel', 'Leash walking without pulling', 'House training guidance', 'Homework plan for owners'],
    content: '<h2>Packages</h2><ul><li>Puppy start: 4 sessions</li><li>Basic obedience: 8 sessions</li><li>Advanced and guard training: on request</li></ul>',
  },
  {
    type: 'MATING',
    name: 'Mating / Stud Service',
    slug: 'mating-stud-service',
    shortDesc: 'Healthy, vaccinated and registered studs of popular breeds. By appointment only.',
    basePrice: 10000,
    duration: 120,
    capacity: 1,
    lead: 2880,
    advance: 2000,
    included: ['Health and vaccination check of both dogs', 'Supervised, safe mating', 'Pedigree details of the stud', 'Repeat mating if the first does not take (terms apply)'],
    content: '<p>Please bring your female’s vaccination record. Best results between day 10 and 14 of heat.</p>',
  },
  {
    type: 'BOARDING',
    name: 'Dog Boarding',
    slug: 'dog-boarding-kathmandu',
    shortDesc: 'Safe, clean kennels with daily walks, your pet’s own food schedule and daily care updates while you travel.',
    basePrice: 800,
    duration: 1440,
    capacity: 1,
    lead: 1440,
    advance: 1,
    included: ['Individual kennel', 'Two walks a day', 'Meals on your pet’s schedule', 'Medicines given as instructed', 'Daily care log and photo on request', 'Vet on call'],
    content: '<p>All boarders must be vaccinated (DHPPiL and rabies) and free of ticks. Check in and check out at 12:00.</p>',
  },
];

const CATEGORIES = [
  ['Dog Food', 'Dry and wet food for puppies, adults and seniors from trusted brands.'],
  ['Cat Food', 'Kitten and adult cat food, wet pouches and treats.'],
  ['Bird Feed', 'Seed mixes and treats for budgies, lovebirds and parrots.'],
  ['Accessories', 'Collars, leashes, harnesses, beds, bowls, cages and carriers.'],
  ['Kennel Accessories', 'Kennels, crates, mats and feeders.'],
  ['Toys', 'Chew toys, balls, ropes and puzzles.'],
  ['Supplements', 'Vitamins, calcium, joint and coat supplements.'],
  ['Grooming', 'Shampoos, brushes, tick and flea control.'],
] as const;

const BREEDS: [Species, string][] = [
  ['DOG', 'Labrador Retriever'],
  ['DOG', 'German Shepherd'],
  ['DOG', 'Golden Retriever'],
  ['DOG', 'Siberian Husky'],
  ['DOG', 'Pug'],
  ['DOG', 'Shih Tzu'],
  ['DOG', 'Beagle'],
  ['DOG', 'Rottweiler'],
  ['DOG', 'Pomeranian'],
  ['DOG', 'Tibetan Mastiff'],
  ['DOG', 'Saint Bernard'],
  ['DOG', 'Doberman'],
  ['DOG', 'Local (Nepali) breed'],
  ['CAT', 'Persian Cat'],
  ['CAT', 'Local (Nepali) cat'],
  ['BIRD', 'Budgerigar'],
  ['BIRD', 'Lovebird'],
  ['RABBIT', 'Rabbit'],
];

async function seedReference() {
  for (const [i, s] of SERVICES.entries()) {
    const data = {
      name: s.name,
      slug: s.slug,
      shortDesc: s.shortDesc,
      content: s.content,
      included: s.included,
      basePricePaisa: s.basePrice === null ? null : rs(s.basePrice),
      durationMinutes: s.duration,
      slotCapacity: s.capacity,
      leadMinutes: s.lead,
      advancePaisa: rs(s.advance),
      sortOrder: i,
      metaTitle: `${s.name} in Kathmandu | The Everest Kennel`.slice(0, 70),
      metaDesc: s.shortDesc.slice(0, 160),
    };
    await prisma.service.upsert({ where: { type: s.type }, create: { type: s.type, ...data }, update: {} });
  }

  // Sunday to Friday 09:00 to 19:00, Saturday 10:00 to 17:00 (confirm with owner)
  for (let d = 0; d < 7; d++) {
    const data = d === 6 ? { opensAt: '10:00', closesAt: '17:00', isClosed: false } : { opensAt: '09:00', closesAt: '19:00', isClosed: false };
    await prisma.businessHour.upsert({ where: { weekday: d }, create: { weekday: d, ...data }, update: {} });
  }

  for (let i = 1; i <= 10; i++) {
    const size = i <= 4 ? 'SMALL' : i <= 8 ? 'MEDIUM' : 'LARGE';
    const rate = size === 'SMALL' ? 800 : size === 'MEDIUM' ? 1000 : 1300;
    const code = `K${String(i).padStart(2, '0')}`;
    await prisma.kennelUnit.upsert({ where: { code }, create: { code, size, dailyRate: rs(rate) }, update: {} });
  }

  for (const [i, [name, description]] of CATEGORIES.entries()) {
    const slug = slugify(name);
    await prisma.category.upsert({
      where: { slug },
      create: { name, slug, description, sortOrder: i, metaTitle: `${name} in Kathmandu | The Everest Kennel`.slice(0, 70) },
      update: {},
    });
  }

  for (const [species, name] of BREEDS) {
    const slug = slugify(name.replace(/\(.*\)/, '').trim()) + (name.includes('Nepali') ? `-nepali-${species.toLowerCase()}` : '');
    await prisma.breed.upsert({ where: { species_name: { species, name } }, create: { species, name, slug }, update: {} });
  }

  for (const [key, value] of Object.entries({ home: {}, delivery: {} })) {
    await prisma.setting.upsert({ where: { key }, create: { key, value }, update: {} });
  }
}

async function seedAdmin() {
  const email = 'admin@everestkennel.local';
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin user already exists: ${email}`);
    return;
  }
  const password = process.env.ADMIN_PASSWORD || randomBytes(9).toString('base64url');
  await prisma.user.create({
    data: {
      name: 'Rajkumar Panta',
      email,
      phone: '9800000000',
      role: 'ADMIN',
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      phoneVerifiedAt: new Date(),
    },
  });
  console.log('\n========================================');
  console.log(' Admin login (shown once, save it now):');
  console.log(`   email:    ${email}`);
  console.log(`   phone:    9800000000`);
  console.log(`   password: ${password}`);
  console.log('========================================\n');
}

// ---------- Demo content ----------

async function seedDemo() {
  if ((await prisma.product.count()) > 0) {
    console.log('Demo content already present, skipping');
    return;
  }
  const cat = async (slug: string) => (await prisma.category.findUniqueOrThrow({ where: { slug } })).id;
  const brand = async (name: string) =>
    (await prisma.brand.upsert({ where: { slug: slugify(name) }, create: { name, slug: slugify(name) }, update: {} })).id;
  const breed = async (name: string) => (await prisma.breed.findFirstOrThrow({ where: { name } })).id;

  const products: {
    name: string;
    cat: string;
    brand?: string;
    species?: Species;
    life?: string;
    short: string;
    featured?: boolean;
    variants: [string, number, number, number?][]; // label, price, stock, weight grams
  }[] = [
    { name: 'Pedigree Puppy Chicken & Milk', cat: 'dog-food', brand: 'Pedigree', species: 'DOG', life: 'puppy', short: 'Complete nutrition for puppies with chicken and milk for strong bones.', featured: true, variants: [['1.2 kg', 650, 40, 1200], ['3 kg', 1450, 25, 3000], ['10 kg', 4400, 8, 10000]] },
    { name: 'Pedigree Adult Chicken & Vegetables', cat: 'dog-food', brand: 'Pedigree', species: 'DOG', life: 'adult', short: 'Balanced daily food for adult dogs.', featured: true, variants: [['3 kg', 1300, 30, 3000], ['10 kg', 3900, 12, 10000], ['20 kg', 7400, 4, 20000]] },
    { name: 'Royal Canin Maxi Puppy', cat: 'dog-food', brand: 'Royal Canin', species: 'DOG', life: 'puppy', short: 'For large breed puppies up to 15 months.', featured: true, variants: [['4 kg', 5800, 10, 4000], ['15 kg', 18500, 3, 15000]] },
    { name: 'Drools Focus Adult Super Premium', cat: 'dog-food', brand: 'Drools', species: 'DOG', life: 'adult', short: 'High protein food for active adult dogs.', variants: [['4 kg', 3200, 14, 4000], ['12 kg', 8600, 2, 12000]] },
    { name: 'Whiskas Kitten Ocean Fish', cat: 'cat-food', brand: 'Whiskas', species: 'CAT', life: 'puppy', short: 'Dry food for kittens 2 to 12 months.', featured: true, variants: [['450 g', 520, 30, 450], ['1.1 kg', 1150, 18, 1100]] },
    { name: 'Me-O Adult Tuna', cat: 'cat-food', brand: 'Me-O', species: 'CAT', life: 'adult', short: 'Tasty tuna recipe for adult cats.', variants: [['1.2 kg', 980, 20, 1200], ['7 kg', 4900, 5, 7000]] },
    { name: 'Budgie Seed Mix', cat: 'bird-feed', species: 'BIRD', short: 'Millet and canary seed blend for budgies and lovebirds.', variants: [['500 g', 250, 50, 500], ['1 kg', 450, 30, 1000]] },
    { name: 'Nylon Adjustable Dog Collar', cat: 'accessories', species: 'DOG', short: 'Durable collar with quick release buckle.', variants: [['Small', 350, 25, 80], ['Medium', 450, 20, 100], ['Large', 550, 3, 120]] },
    { name: 'Padded Dog Harness and Leash Set', cat: 'accessories', species: 'DOG', short: 'No pull harness with 1.5 m leash.', featured: true, variants: [['Medium', 1450, 12, 300], ['Large', 1750, 6, 400]] },
    { name: 'Stainless Steel Bowl', cat: 'accessories', short: 'Rust proof, easy to clean feeding bowl.', variants: [['500 ml', 300, 40, 200], ['1.5 L', 550, 22, 350]] },
    { name: 'Foldable Metal Dog Crate', cat: 'kennel-accessories', species: 'DOG', short: 'Two door crate with removable tray, folds flat.', variants: [['24 inch', 5500, 4, 9000], ['36 inch', 8500, 2, 15000]] },
    { name: 'Rope Tug Toy', cat: 'toys', species: 'DOG', short: 'Cotton rope toy for tug and chewing, cleans teeth.', variants: [['One size', 300, 35, 150]] },
    { name: 'Squeaky Rubber Ball', cat: 'toys', species: 'DOG', short: 'Bouncy squeaky ball for fetch.', variants: [['One size', 250, 0, 100]] },
    { name: 'Calcium Bone Supplement', cat: 'supplements', species: 'DOG', short: 'Calcium and phosphorus for growing puppies and nursing mothers.', variants: [['60 tablets', 650, 18, 150]] },
    { name: 'Tick and Flea Shampoo', cat: 'grooming', species: 'DOG', short: 'Gentle shampoo that removes ticks and fleas.', variants: [['200 ml', 450, 26, 250]] },
  ];

  for (const [pi, p] of products.entries()) {
    const image = await placeholder('products', p.name.split(' ').slice(0, 3).join(' '), p.variants.map((v) => v[0]).join(' · '), (pi * 37) % 360);
    const prefix = p.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 5);
    await prisma.product.create({
      data: {
        name: p.name,
        slug: slugify(p.name),
        categoryId: await cat(p.cat),
        brandId: p.brand ? await brand(p.brand) : null,
        species: p.species,
        lifeStage: p.life,
        shortDesc: p.short,
        description: `${p.short}\n\nAvailable at The Everest Kennel, Soaltee Mode. Delivery across the Kathmandu Valley and Nepal.`,
        isFeatured: !!p.featured,
        images: { create: [{ path: image, alt: p.name }] },
        variants: {
          create: p.variants.map(([label, price, stock, grams], vi) => ({
            label,
            sku: `${prefix}-${slugify(label).toUpperCase()}-${pi}${vi}`.slice(0, 60),
            pricePaisa: rs(price),
            comparePaisa: vi === 0 && p.featured ? rs(Math.round(price * 1.1)) : null,
            stock,
            weightGrams: grams,
            stockMovements: stock ? { create: { change: stock, reason: 'INITIAL' } } : undefined,
          })),
        },
      },
    });
  }

  const monthsAgo = (m: number) => {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() - m);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  };
  const pets: { title: string; breed: string; species: Species; gender: 'MALE' | 'FEMALE'; months: number; origin: 'LOCAL' | 'IMPORTED'; price: number; color: string; reg?: string; status?: 'AVAILABLE' | 'SOLD' }[] = [
    { title: 'German Shepherd puppy, black and tan', breed: 'German Shepherd', species: 'DOG', gender: 'MALE', months: 2, origin: 'LOCAL', price: 35000, color: 'Black and tan', reg: 'KCI-GSD-2026-114' },
    { title: 'Golden Retriever puppy', breed: 'Golden Retriever', species: 'DOG', gender: 'FEMALE', months: 3, origin: 'IMPORTED', price: 85000, color: 'Golden', reg: 'KCI-GR-2026-031' },
    { title: 'Siberian Husky puppy, blue eyes', breed: 'Siberian Husky', species: 'DOG', gender: 'MALE', months: 2, origin: 'IMPORTED', price: 95000, color: 'Grey and white' },
    { title: 'Labrador Retriever puppy', breed: 'Labrador Retriever', species: 'DOG', gender: 'FEMALE', months: 2, origin: 'LOCAL', price: 30000, color: 'Yellow' },
    { title: 'Shih Tzu puppy', breed: 'Shih Tzu', species: 'DOG', gender: 'MALE', months: 3, origin: 'LOCAL', price: 40000, color: 'White and brown' },
    { title: 'Persian kitten, doll face', breed: 'Persian Cat', species: 'CAT', gender: 'FEMALE', months: 3, origin: 'IMPORTED', price: 45000, color: 'White' },
    { title: 'Pug puppy', breed: 'Pug', species: 'DOG', gender: 'MALE', months: 3, origin: 'LOCAL', price: 38000, color: 'Fawn', status: 'SOLD' },
  ];
  for (const [i, p] of pets.entries()) {
    const image = await placeholder('pets', p.breed, `${p.gender === 'MALE' ? 'Male' : 'Female'} · ${p.months} months`, (i * 53 + 20) % 360);
    await prisma.petListing.create({
      data: {
        code: `PUP${String(1001 + i)}`,
        title: p.title,
        slug: `${slugify(p.title)}-${randomBytes(2).toString('hex')}`,
        species: p.species,
        breedId: await breed(p.breed),
        gender: p.gender,
        dateOfBirth: monthsAgo(p.months),
        color: p.color,
        origin: p.origin,
        pricePaisa: rs(p.price),
        depositPaisa: rs(5000),
        vaccinated: true,
        dewormed: true,
        healthCertificate: p.origin === 'IMPORTED',
        registrationNo: p.reg,
        parentsInfo: 'Father and mother are healthy, vaccinated and can be seen at our kennel.',
        description: `A healthy, playful ${p.breed.toLowerCase()} raised with care at The Everest Kennel. Comes with vaccination card, deworming record and a starter food pack.`,
        status: p.status ?? 'AVAILABLE',
        soldAt: p.status === 'SOLD' ? new Date() : null,
        images: { create: [{ path: image, alt: p.title }] },
      },
    });
  }

  const animals: { name: string; species: Species; breedText: string; gender: 'MALE' | 'FEMALE'; ageText: string; temperament: string; story: string; status: 'ADOPTABLE' | 'IN_CARE' | 'ADOPTED' }[] = [
    { name: 'Bhote', species: 'DOG', breedText: 'Local street dog', gender: 'MALE', ageText: 'About 2 years', temperament: 'Gentle, loves walks, good with children', story: 'Bhote was found with an injured leg near Kalanki. After surgery and two months of care he is fully healed and ready for a family.', status: 'ADOPTABLE' },
    { name: 'Maya', species: 'DOG', breedText: 'Local mix', gender: 'FEMALE', ageText: 'About 1 year', temperament: 'Shy at first, very loyal', story: 'Maya was rescued as a puppy during the monsoon. She is sterilized and vaccinated.', status: 'ADOPTABLE' },
    { name: 'Kale', species: 'CAT', breedText: 'Local cat', gender: 'MALE', ageText: '6 months', temperament: 'Playful and curious', story: 'Kale was found alone in a parking lot. He is litter trained and loves people.', status: 'ADOPTABLE' },
    { name: 'Tiger', species: 'DOG', breedText: 'Local street dog', gender: 'MALE', ageText: 'About 4 years', temperament: 'Calm', story: 'Recovering from a skin infection.', status: 'IN_CARE' },
    { name: 'Laxmi', species: 'DOG', breedText: 'Local mix', gender: 'FEMALE', ageText: '3 years', temperament: 'Friendly', story: 'Adopted by a family in Lalitpur.', status: 'ADOPTED' },
  ];
  for (const [i, a] of animals.entries()) {
    const image = await placeholder('shelter', a.name, a.breedText, (i * 71 + 30) % 360);
    await prisma.shelterAnimal.create({
      data: {
        ...a,
        slug: `${slugify(a.name)}-${randomBytes(2).toString('hex')}`,
        vaccinated: a.status !== 'IN_CARE',
        sterilized: a.status !== 'IN_CARE',
        photoPath: image,
        intakeDate: monthsAgo(i + 1),
      },
    });
  }

  await prisma.testimonial.createMany({
    data: [
      { name: 'Sujata K., Kalanki', content: 'Our Labrador puppy came healthy with all vaccination records. Rajkumar ji still calls to check on her!', rating: 5, sortOrder: 1 },
      { name: 'Anil S., Lalitpur', content: 'The vet house call saved us a stressful trip with our old dog. Very professional and kind.', rating: 5, sortOrder: 2 },
      { name: 'Pratiksha T., Baneshwor', content: 'We boarded Bruno during Dashain. Daily photos and he came back happy. Highly recommended.', rating: 5, sortOrder: 3 },
      { name: 'Ramesh B., Soaltee Mode', content: 'Good dog food prices and quick delivery. Cash on delivery is convenient.', rating: 4, sortOrder: 4 },
    ],
  });

  await prisma.faq.createMany({
    data: [
      { group: 'general', question: 'Where is The Everest Kennel?', answer: 'We are at Soaltee Mode, Kathmandu. Call 01-5234516 for directions.', sortOrder: 1 },
      { group: 'general', question: 'What are your opening hours?', answer: 'Sunday to Friday 9:00 to 19:00 and Saturday 10:00 to 17:00.', sortOrder: 2 },
      { group: 'shop', question: 'Do you deliver outside Kathmandu?', answer: 'Yes. We deliver pet food and accessories across Nepal. Charges depend on weight and are shown at checkout.', sortOrder: 1 },
      { group: 'shop', question: 'Which payment methods do you accept?', answer: 'Cash on delivery, eSewa and Khalti.', sortOrder: 2 },
      { group: 'pets', question: 'At what age do puppies go home?', answer: 'From 8 weeks, after their first vaccination and deworming.', sortOrder: 1 },
      { group: 'pets', question: 'Can I reserve a puppy?', answer: 'Yes. Pay a deposit online with eSewa or Khalti and the puppy is held for you for 72 hours.', sortOrder: 2 },
      { group: 'service:VACCINATION', question: 'Can you vaccinate my dog at home?', answer: 'Yes. Book a vaccination or a vet house call and choose your address. House calls cover the Kathmandu Valley.', sortOrder: 1 },
      { group: 'service:VACCINATION', question: 'Will I get a reminder for the next dose?', answer: 'Yes. If your pet is in your account, we send an SMS 7 days and 1 day before the next dose is due.', sortOrder: 2 },
      { group: 'service:BOARDING', question: 'What do I need to bring for boarding?', answer: 'Your dog’s food, any medicines, and the vaccination card. Bedding and bowls are provided.', sortOrder: 1 },
      { group: 'service:BOARDING', question: 'Is my dog walked every day?', answer: 'Yes, twice a day, and we keep a daily care log.', sortOrder: 2 },
      { group: 'service:HOUSE_CALL', question: 'Which areas do house calls cover?', answer: 'Kathmandu, Lalitpur and Bhaktapur districts.', sortOrder: 1 },
      { group: 'service:MATING', question: 'Why is an advance required?', answer: 'Stud appointments are limited, so a small advance confirms your slot. It is adjusted in the final fee.', sortOrder: 1 },
      { group: 'service:TRAINING', question: 'How old should my puppy be for training?', answer: 'Puppy classes start from 3 months, after vaccinations.', sortOrder: 1 },
    ],
  });

  const posts = [
    {
      title: 'Puppy vaccination schedule in Nepal: a complete guide',
      excerpt: 'Which vaccines your puppy needs, when to give them and why rabies vaccination is essential in Kathmandu.',
      content: '<p>Vaccination protects your puppy from deadly diseases like parvovirus and distemper, which are common in the Kathmandu Valley.</p><h2>Recommended schedule</h2><ul><li><strong>6 to 8 weeks:</strong> first DHPPiL</li><li><strong>9 to 11 weeks:</strong> second DHPPiL</li><li><strong>12 to 14 weeks:</strong> third DHPPiL and anti-rabies</li><li><strong>Every year:</strong> booster and anti-rabies</li></ul><h2>Deworming</h2><p>Deworm every 2 weeks until 3 months, then every 3 months.</p><p>Keep your puppy indoors until the course is complete.</p>',
    },
    {
      title: 'How to choose the right dog breed for a Kathmandu home',
      excerpt: 'Apartment or house, cold winters or hot summers: match the breed to your lifestyle.',
      content: '<p>Before buying a puppy, think about space, climate and time.</p><h2>Small homes</h2><p>Shih Tzu, Pug and Pomeranian adapt well to apartments.</p><h2>Active families</h2><p>Labradors and Golden Retrievers need daily exercise and love children.</p><h2>Cold climate breeds</h2><p>Huskies and Tibetan Mastiffs suffer in summer heat; they need shade and cooling.</p>',
    },
    {
      title: 'Ticks and fleas during monsoon: prevention tips',
      excerpt: 'Monsoon brings ticks. Here is how to keep your dog safe.',
      content: '<p>Ticks spread blood parasites that can be fatal. Check your dog daily, especially ears, neck and paws.</p><ul><li>Use a vet approved tick shampoo or spot on</li><li>Keep bedding clean and dry</li><li>Avoid long grass during walks</li></ul><p>If your dog is weak or has pale gums, call a vet immediately.</p>',
    },
  ];
  for (const [i, p] of posts.entries()) {
    const cover = await placeholder('blog', p.title.split(':')[0]!.split(' ').slice(0, 4).join(' '), 'Pet care tips', (i * 90 + 140) % 360);
    await prisma.post.create({
      data: { ...p, slug: slugify(p.title), coverPath: cover, publishedAt: new Date(Date.now() - (i + 1) * 5 * 86_400_000) },
    });
  }

  // A demo vet so house call slots have capacity.
  await prisma.user.upsert({
    where: { phone: '9800000001' },
    create: {
      name: 'Dr. Demo Vet',
      phone: '9800000001',
      email: 'vet@everestkennel.local',
      role: 'VET',
      passwordHash: await argon2.hash(randomBytes(12).toString('hex'), { type: argon2.argon2id }),
    },
    update: {},
  });
  console.log('Demo products, pets, shelter animals, testimonials, FAQs and posts created');
}

async function main() {
  await seedReference();
  await seedAdmin();
  if (withDemo) await seedDemo();
  console.log('Seed complete');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
