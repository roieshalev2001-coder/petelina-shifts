import Link from "next/link";
import { BUSINESS_NAME } from "@/lib/legal";
import { SWAP_CUTOFF_HOURS } from "@/lib/swaps";
import { MAX_ATTEMPTS, LOCK_MINUTES } from "@/lib/lockout";
import { ContactDetails, DocList, DocSection, DocTitle, Updated } from "../doc";

export const metadata = { title: `תקנון האתר · ${BUSINESS_NAME}` };

/*
 * המספרים בתקנון — שעות החסימה לפני משמרת והנעילה אחרי ניסיונות
 * שגויים — נקראים מהקוד שאוכף אותם, כדי שהתקנון לא יבטיח דבר אחר
 * ממה שהאתר עושה.
 */
export default function TermsPage() {
  return (
    <article>
      <DocTitle
        title="תקנון האתר"
        lead={
          <>
            התקנון חל על כל מי שמשתמש באתר סידור המשמרות של {BUSINESS_NAME}.
            השימוש באתר מותנה בהסכמה לו.
          </>
        }
      />

      <DocSection title="למי האתר מיועד">
        <p>
          לעובדים ולמנהלים של {BUSINESS_NAME} בלבד. הכניסה היא עם מספר טלפון
          וקוד אישי שהמנהל נותן.
        </p>
      </DocSection>

      <DocSection title="החשבון שלך">
        <DocList>
          <li>
            הקוד אישי. אל תמסור אותו לאחרים, ואל תיכנס לחשבון של עובד אחר.
          </li>
          <li>בכניסה הראשונה תתבקש לבחור קוד חדש.</li>
          <li>
            אחרי {MAX_ATTEMPTS} ניסיונות כניסה שגויים החשבון ננעל ל-
            {LOCK_MINUTES} דקות.
          </li>
          <li>
            אם שכחת את הקוד, או שאתה חושד שמישהו אחר משתמש בו, פנה למנהל כדי
            לאפס אותו.
          </li>
        </DocList>
      </DocSection>

      <DocSection title="הגשת זמינות וסידור העבודה">
        <DocList>
          <li>
            את הזמינות מגישים עד המועד האחרון שהמנהל קובע לכל שבוע.
          </li>
          <li>
            הגשת זמינות היא בקשה, ולא התחייבות לשיבוץ. את הסידור קובע ומפרסם
            המנהל.
          </li>
          <li>
            מסירה או החלפה של משמרת נכנסת לתוקף רק אחרי אישור מנהל. עד
            האישור, המשמרת נשארת שלך.
          </li>
          <li>
            משמרת רגילה (לא בסבב שישי) אי אפשר למסור, או לקחת כשהוצעה, פחות
            מ-{SWAP_CUTOFF_HOURS} שעות לפני שהיא מתחילה.
          </li>
        </DocList>
      </DocSection>

      <DocSection title="שימוש הוגן">
        <p>
          אסור לנסות לגשת למידע של עובדים אחרים או לאזור הניהול בלי הרשאה,
          לשבש את פעולת האתר, או להעתיק ממנו מידע על עובדים לשימוש שאינו קשור
          לעבודה.
        </p>
      </DocSection>

      <DocSection title="זמינות האתר">
        <p>
          ייתכנו תקלות והפסקות בפעילות האתר. אם האתר לא עובד, פנה למנהל כדי
          לברר את המשמרות שלך. {BUSINESS_NAME} אינה אחראית לנזק שנגרם מתקלה
          באתר, במידה שהחוק מתיר זאת.
        </p>
      </DocSection>

      <DocSection title="פרטיות ונגישות">
        <p>
          השימוש במידע האישי מתואר ב
          <Link href="/privacy" className="underline underline-offset-2">
            מדיניות הפרטיות
          </Link>
          . מה נעשה כדי שהאתר יהיה נגיש, ולמי פונים אם משהו לא נגיש, מפורט
          ב
          <Link href="/accessibility" className="underline underline-offset-2">
            הצהרת הנגישות
          </Link>
          .
        </p>
      </DocSection>

      <DocSection title="שינויים בתקנון">
        <p>
          {BUSINESS_NAME} רשאית לעדכן את התקנון. הנוסח המחייב הוא זה שמופיע
          בדף הזה, והתאריך שבסופו מראה מתי עודכן.
        </p>
      </DocSection>

      <DocSection title="הדין החל">
        <p>על התקנון ועל השימוש באתר חלים דיני מדינת ישראל.</p>
      </DocSection>

      <DocSection title="יצירת קשר">
        <ContactDetails />
      </DocSection>

      <Updated />
    </article>
  );
}
