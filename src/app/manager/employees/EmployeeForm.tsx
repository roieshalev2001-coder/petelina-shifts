"use client";

import { useState } from "react";
import { Button, Field, inputClass } from "@/components/ui";
import {
  ROLE_LABEL,
  ROLES,
  TRAINEE_LABEL,
  TRAINEE_ROLES,
  parseRoles,
  parseTraineeRoles,
} from "@/lib/domain";
import { FRIDAY_LIMIT_LABEL, type FridayLimit } from "@/lib/fridays";

export type EmployeeFormValues = {
  id?: string;
  fullName: string;
  phone: string | null;
  roles: string;
  requiredShifts: number;
  maxShifts: number;
  seniority: number;
  preferredPeriod: string | null;
  fridayLimit: string;
  privateNotes: string | null;
  active: boolean;
};

const EMPTY: EmployeeFormValues = {
  fullName: "",
  phone: null,
  roles: "waiter",
  requiredShifts: 0,
  maxShifts: 6,
  seniority: 3,
  preferredPeriod: null,
  fridayLimit: "unlimited",
  privateNotes: null,
  active: true,
};

export function EmployeeForm({
  employee,
  action,
  onDone,
}: {
  employee?: EmployeeFormValues;
  action: (formData: FormData) => Promise<void>;
  onDone?: () => void;
}) {
  const value = employee ?? EMPTY;
  const [roles, setRoles] = useState<Set<string>>(
    () => new Set([...parseRoles(value.roles), ...parseTraineeRoles(value.roles)]),
  );
  const [pending, setPending] = useState(false);

  function toggleRole(role: string) {
    setRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  }

  return (
    <form
      action={async (formData) => {
        setPending(true);
        try {
          await action(formData);
          onDone?.();
        } finally {
          setPending(false);
        }
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="שם מלא">
          <input
            name="fullName"
            defaultValue={value.fullName}
            required
            className={inputClass}
          />
        </Field>
        <Field label="טלפון" hint="משמש לשליחת הקישור האישי בוואטסאפ">
          <input
            name="phone"
            defaultValue={value.phone ?? ""}
            inputMode="tel"
            placeholder="050-0000000"
            className={`${inputClass} num`}
          />
        </Field>
      </div>

      <Field
        label="תפקידים"
        hint="עובד יכול למלא יותר מתפקיד אחד. מתלמד מגיש זמינות, ובסידור מצרפים אותו לבלוק של עובד רגיל"
      >
        <div className="flex flex-wrap gap-2">
          {[
            ...ROLES.map((role) => ({ role: role as string, label: ROLE_LABEL[role] })),
            ...TRAINEE_ROLES.map((role) => ({ role: role as string, label: TRAINEE_LABEL[role] })),
          ].map(({ role, label }) => (
            <label
              key={role}
              className={`cursor-pointer border px-3 py-1.5 text-sm transition ${
                roles.has(role)
                  ? "border-brand bg-brand text-white"
                  : "border-line bg-surface hover:border-stone-300"
              }`}
            >
              <input
                type="checkbox"
                name={`role_${role}`}
                defaultChecked={roles.has(role)}
                onChange={() => toggleRole(role)}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
      </Field>

      <fieldset className="border border-line p-4">
        <legend className="px-2 text-sm font-semibold">
          פרופיל פנימי — גלוי למנהל בלבד
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="משמרות חובה בשבוע" hint="היעד שהאלגוריתם ישאף אליו">
            <input
              name="requiredShifts"
              type="number"
              min={0}
              max={14}
              defaultValue={value.requiredShifts}
              className={`${inputClass} num`}
            />
          </Field>
          <Field label="מקסימום משמרות" hint="חסם קשיח שלא ניתן לחרוג ממנו">
            <input
              name="maxShifts"
              type="number"
              min={0}
              max={14}
              defaultValue={value.maxShifts}
              className={`${inputClass} num`}
            />
          </Field>
          <Field label="חלק היום המועדף">
            <select
              name="preferredPeriod"
              defaultValue={value.preferredPeriod ?? ""}
              className={inputClass}
            >
              <option value="">ללא העדפה</option>
              <option value="morning">בוקר</option>
              <option value="evening">ערב</option>
            </select>
          </Field>
          <Field
            label="שישיים בחודש"
            hint="שישי הוא סבב חובה — זה הפטור היחיד ממנו"
          >
            <select
              name="fridayLimit"
              defaultValue={value.fridayLimit}
              className={inputClass}
            >
              {(Object.keys(FRIDAY_LIMIT_LABEL) as FridayLimit[]).map((key) => (
                <option key={key} value={key}>
                  {FRIDAY_LIMIT_LABEL[key]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="ותק" hint="1 = חדש, 5 = ותיק">
            <input
              name="seniority"
              type="number"
              min={1}
              max={5}
              defaultValue={value.seniority}
              className={`${inputClass} num`}
            />
          </Field>
        </div>

        <div className="mt-4">
          <Field label="הערות פנימיות" hint="לא נחשף לעובד בשום מסך">
            <textarea
              name="privateNotes"
              defaultValue={value.privateNotes ?? ""}
              rows={2}
              className={inputClass}
            />
          </Field>
        </div>
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="active"
          defaultChecked={value.active}
          className="check"
        />
        עובד פעיל
      </label>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "שומר…" : "שמירה"}
        </Button>
        {onDone && (
          <Button type="button" variant="ghost" onClick={onDone}>
            ביטול
          </Button>
        )}
      </div>
    </form>
  );
}
