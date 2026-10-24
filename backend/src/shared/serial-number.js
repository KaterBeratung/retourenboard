/** Comparison only: retain the original serial string for storage/display.
 * NFKC and Unicode uppercase retain the existing backend lookup/disposal rule.
 * Accents, punctuation and internal spaces remain significant; never guess O/0.
 * Repeated returns of one device are allowed: this key is not a unique ID.
 */
export function serialKey(value){
 return typeof value==='string'?value.trim().normalize('NFKC').toUpperCase():'';
}
