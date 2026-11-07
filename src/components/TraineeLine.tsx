/**
 * המתלמד שצורף לבלוק, בשורה משלו מתחת לשם: "+ טל (מתלמד)". חלק מהסידור
 * לכל דבר — גם בתמונה שנשלחת לקבוצה, כדי שכולם ידעו מי מגיע לחפוף.
 */
export function TraineeLine({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span className={`block text-xs font-normal ${className}`}>
      + {name} (מתלמד)
    </span>
  );
}
