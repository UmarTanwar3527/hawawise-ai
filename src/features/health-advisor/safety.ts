/**
 * Content rules for AI explanations of health advice. The model may explain
 * official guidance; it may not prescribe, diagnose or promise safety.
 * Returns a correction message for the model, or null when acceptable.
 */
const MEDICATION =
  /\b(medicines?|medications?|drugs?|doses?|dosage|tablets?|pills?|inhalers?|nebuli[sz]ers?|steroids?|antibiotics?|paracetamol|ibuprofen|aspirin|salbutamol|antihistamines?|prescri(?:be|bed|ption)s?)\b|दवा|दवाई|दवाइयों|खुराक|गोली|इनहेलर/i;
const DIAGNOSIS =
  /\byou (?:may |might |probably |likely )?(?:have|are suffering from|are diagnosed with) (?:asthma|copd|bronchitis|pneumonia|an? (?:infection|allergy|lung disease|heart disease))\b|\byour (?:symptoms|cough|breathlessness) (?:mean|means|indicate|indicates|suggest|suggests)\b|आपको (?:अस्थमा|ब्रोंकाइटिस|निमोनिया) है/i;
const SAFETY_CLAIM =
  /\b(?:completely|totally|perfectly|100%|entirely)\s+safe\b|\b(?:it is|it's|is|are)\s+safe\b|\bsafe to\b|\bno risk\b|पूरी तरह (?:से )?सुरक्षित|सुरक्षित है|कोई खतरा नहीं/i;

export function findMedicalSafetyProblem(text: string): string | null {
  if (MEDICATION.test(text)) {
    return "Rejected: do not mention medicines, inhalers, doses or prescriptions. Say only to follow their doctor's instructions.";
  }
  if (DIAGNOSIS.test(text)) {
    return "Rejected: do not diagnose or suggest what condition the person has.";
  }
  if (SAFETY_CLAIM.test(text)) {
    return "Rejected: never describe any activity, time or level as safe or risk-free. Use the official advice wording instead.";
  }
  return null;
}
