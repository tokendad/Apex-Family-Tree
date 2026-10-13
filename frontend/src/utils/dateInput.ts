/**
 * The hint shown in every date field.
 *
 * A date is stored as typed and parsed afterwards for sorting, and the parser
 * understands four shapes: YYYY-MM-DD, D MON YYYY, MON YYYY and YYYY, each
 * optionally prefixed with ABT, BEF, AFT, BET … AND, CAL or EST. Anything else
 * is kept verbatim but only partly understood -- "Nov 29 1990" reads as the
 * year alone, because the three-part form expects the day first, and the
 * event then sorts to the start of that year with nothing on screen to say
 * so.
 *
 * YYYY-MM-DD is offered first because it is unambiguous in a way no other
 * numeric form is, and because it is the one shape nobody writes by accident.
 * ABT stays in the hint: in a family archive most dates are approximate, and
 * a hint that implied otherwise would push people into inventing precision.
 */
export const DATE_INPUT_HINT = 'YYYY-MM-DD, or ABT 1900';
