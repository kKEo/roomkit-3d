export const pad2 = n => String(n).padStart(2, '0');

/** "{n} of {total}" + { n: '01', total: '05' } -> "01 of 05" */
export const fmt = (tpl, vars) => String(tpl).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
