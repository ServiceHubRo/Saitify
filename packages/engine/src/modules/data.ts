import type { ImageRef } from '../schema/common';
import type { RichBlock } from './content';

/**
 * Data contracts between the host (which loads live module data on the server) and the module blocks (which render it).
 * Blocks are pure: they never fetch. Anything a visitor must not see is simply never put into these objects.
 */

/** A visitor form: where it posts, an anti-forgery/anti-spam token, and where to come back to. */
export type ActionCtx = { url: string; token: string; returnTo: string; section: string };
export type FormState = { errors: Record<string, string>; values: Record<string, string>; message?: string };
export type Paging = { page: number; pages: number; total: number };
/** The module behind a section is switched off or not set up: the section shows a neutral notice instead. */
export type Unavailable = { unavailable: true; message: string };
export const isUnavailable = (d: unknown): d is Unavailable => typeof d === 'object' && d !== null && (d as { unavailable?: unknown }).unavailable === true;

export type Named = { slug: string; name: string };

/* Forms */
export type FormFieldType = 'text' | 'email' | 'phone' | 'textarea' | 'number' | 'select' | 'multiselect' | 'checkbox' | 'radio' | 'date';
export type FormFieldDef = { id: string; label: string; type: FormFieldType; required: boolean; placeholder?: string; options: string[] };
export type FormBlockData = {
  form: { title: string; description?: string; fields: FormFieldDef[]; submitLabel: string } | null;
  action: ActionCtx;
  state?: FormState;
  sent?: string;
};

/* Blog */
export type PostCard = { slug: string; title: string; excerpt?: string; cover?: ImageRef; date: string; author?: string; categories: Named[]; membersOnly: boolean };
export type BlogData =
  | { mode: 'list'; posts: PostCard[]; paging: Paging; categories: Named[]; category?: string; tag?: string; q?: string }
  | { mode: 'post'; post: PostCard & { body: RichBlock[] | null; tags: string[]; loginHref: string | null }; related: PostCard[] };

/* Store */
export type ProductCard = { slug: string; title: string; price: number; compareAt?: number; image?: ImageRef; available: boolean; featured: boolean };
export type ProductDetail = ProductCard & {
  description?: string;
  images: ImageRef[];
  sku?: string;
  variants: { id: string; title: string; price: number; available: boolean }[];
  categories: Named[];
};
export type StoreData =
  | { mode: 'list'; currency: string; products: ProductCard[]; paging: Paging; categories: Named[]; category?: string; q?: string; sort: string; cartHref: string | null; cartCount: number }
  | { mode: 'product'; currency: string; product: ProductDetail; action: ActionCtx; state?: FormState; cartHref: string | null; cartCount: number; added: boolean };

export type CartLine = { key: string; title: string; variantTitle?: string; href: string | null; unit: number; qty: number; line: number; problem?: string; max: number | null };
export type CartTotals = { subtotal: number; shipping: number; total: number };
export type CartData =
  | { mode: 'cart'; currency: string; lines: CartLine[]; totals: CartTotals; action: ActionCtx; checkoutHref: string; shopHref: string | null; canCheckout: boolean }
  | {
      mode: 'checkout';
      currency: string;
      lines: CartLine[];
      totals: CartTotals;
      action: ActionCtx;
      state?: FormState;
      paymentMethods: { id: string; label: string; note?: string }[];
      requireDelivery: boolean;
      cartHref: string;
    }
  | {
      mode: 'order';
      currency: string;
      order: { number: number; status: string; paymentStatus: string; paymentMethod: string; instructions?: string; lines: CartLine[]; totals: CartTotals; createdAt: string; customerName: string };
    }
  | { mode: 'missing' };

/* Booking */
export type BookingStep = 'service' | 'staff' | 'date' | 'time' | 'details' | 'review' | 'done';
export type BookingData = {
  step: BookingStep;
  timezone: string;
  services: { slug: string; title: string; description?: string; duration: number; priceText?: string }[];
  staff: Named[];
  selected: { service?: string; staff?: string; date?: string; time?: string };
  days: { date: string; available: boolean }[];
  slots: string[];
  summary?: { service: string; staff?: string; date: string; time: string; duration: number; priceText?: string };
  action: ActionCtx;
  state?: FormState;
  done?: { reference: string; status: 'pending' | 'confirmed'; when: string };
  policy?: string;
  /** Online booking is temporarily not accepted (for example a plan limit). */
  paused?: string;
};

/* Events */
export type EventCard = { slug: string; title: string; startsAt: string; endsAt?: string; timezone: string; location?: string; online: boolean; cover?: ImageRef; category?: string; status: 'published' | 'cancelled' };
export type EventsData =
  | { mode: 'list'; upcoming: EventCard[]; past: EventCard[] }
  | {
      mode: 'event';
      event: EventCard & { description?: string; organizer?: string; onlineUrl?: string; spotsLeft: number | null; registration: 'open' | 'closed' | 'full' | 'ended' | 'none' };
      action: ActionCtx;
      state?: FormState;
      registered?: { reference: string };
    };

/* Directory */
export type ListingCard = { slug: string; title: string; summary?: string; image?: ImageRef; category?: Named; location?: string; featured: boolean };
export type DirectoryData =
  | { mode: 'list'; listings: ListingCard[]; paging: Paging; categories: Named[]; category?: string; q?: string; sort: string }
  | { mode: 'listing'; listing: ListingCard & { description?: string; images: ImageRef[]; phone?: string; email?: string; website?: string; fields: { label: string; value: string }[] } };

/* Memberships */
export type MemberPlan = { slug: string; title: string; description?: string; priceText?: string; access: 'free' | 'approval'; status?: 'pending' | 'active' };
export type MemberAreaData = {
  view: 'login' | 'register' | 'account';
  member: { name: string; email: string } | null;
  allowSignup: boolean;
  plans: MemberPlan[];
  courses: { title: string; href: string; progress: number; status: 'pending' | 'active' }[];
  action: ActionCtx;
  state?: FormState;
  notice?: string;
  welcome?: string;
};
export type GateData = { allowed: boolean; loginHref: string | null; signedIn: boolean };

/* Courses */
export type CourseCard = { slug: string; title: string; summary?: string; cover?: ImageRef; instructor?: string; lessons: number; access: 'free' | 'members' | 'approval'; priceText?: string };
export type CourseLessonLink = { slug: string; title: string; completed: boolean; preview: boolean; href: string | null };
export type CourseOutline = CourseCard & {
  description?: string;
  sections: { title: string; lessons: CourseLessonLink[] }[];
  enrollment: 'pending' | 'active' | null;
  progress: number;
  canEnroll: boolean;
  reason?: string;
  continueHref: string | null;
  loginHref: string | null;
};
export type CoursesData =
  | { mode: 'list'; courses: CourseCard[] }
  | { mode: 'course'; course: CourseOutline; action: ActionCtx; state?: FormState }
  | {
      mode: 'lesson';
      course: CourseOutline;
      lesson: { slug: string; title: string; body: RichBlock[]; video?: string; downloads: { label: string; href: string }[]; completed: boolean };
      prev: string | null;
      next: string | null;
      action: ActionCtx;
    };
