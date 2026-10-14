import { PROBES, probeValue } from './metrics.js'
import { language } from './i18n.js'
export function probeName(key, config = {}) {
  if (key.startsWith('node_')) return config[`${key}_name`] || `Node ${key.slice(-1)}`
  return config[`custom_${key}_name`] || ({ ct: language.value === 'zh' ? '电信' : 'CT', cu: language.value === 'zh' ? '联通' : 'CU', cm: language.value === 'zh' ? '移动' : 'CM', bd: 'BGP' })[key]
}
export function probeSeries(rows, kind, config = {}, window = false) {
  return PROBES.filter(key => rows.some(row => probeValue(row[window ? key : `${kind}_${key}`]) !== undefined)).map(key => ({
    name: probeName(key, config), value: row => probeValue(row[window ? key : `${kind}_${key}`])
  }))
}
