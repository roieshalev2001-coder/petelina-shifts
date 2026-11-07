import type { ReactNode } from "react";
import { CONTACT, LEGAL_UPDATED } from "@/lib/legal";

/*
 * אבני הבניין של דפי המידע. טקסט רציף ברוחב קריא, כותרות משנה, ורשימות —
 * בלי כרטיסים ובלי קישוטים: אלה מסמכים שקוראים, לא מסכים שמפעילים.
 */

export function DocTitle({ title, lead }: { title: string; lead: ReactNode }) {
  return (
    <div className="mb-8">
      <h1 className="text-2xl font-bold tracking-tight sm:text-[1.75rem]">{title}</h1>
      <p className="mt-3 leading-relaxed">{lead}</p>
    </div>
  );
}

export function DocSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8 space-y-3 leading-relaxed">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

export function DocList({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-2 ps-5 marker:text-muted">{children}</ul>;
}

/** פרטי הקשר — אותו בלוק בשלושת הדפים */
export function ContactDetails({ role }: { role?: string }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-s-2 border-line ps-4">
      <dt className="text-muted">{role ?? "איש קשר"}</dt>
      <dd className="font-medium">{CONTACT.name}</dd>
      <dt className="text-muted">טלפון</dt>
      <dd>
        <a href={CONTACT.phoneHref} className="num underline underline-offset-2">
          {CONTACT.phone}
        </a>
      </dd>
      <dt className="text-muted">דוא״ל</dt>
      <dd>
        <a
          href={`mailto:${CONTACT.email}`}
          dir="ltr"
          className="underline underline-offset-2 [overflow-wrap:anywhere]"
        >
          {CONTACT.email}
        </a>
      </dd>
    </dl>
  );
}

export function Updated() {
  return (
    <p className="mt-10 border-t border-line pt-4 text-sm text-muted">
      עדכון אחרון: {LEGAL_UPDATED}
    </p>
  );
}
