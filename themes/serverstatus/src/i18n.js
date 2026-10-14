import { computed, ref } from 'vue'

const words = {
  zh: {
    home: '首页', monitor: '监控', admin: '后台', servers: '服务器', all: '全部', search: '搜索服务器',
    status: '状态', name: '名称', region: '位置', os: '系统', uptime: '在线', expiry: '到期', load: '负载',
    speed: '网速 ↓|↑', cpu: 'CPU', ram: '内存', disk: '硬盘', traffic: '月流量', online: '在线', offline: '离线',
    total: '总数', totalTraffic: '总流量', empty: '没有匹配的服务器', loading: '加载中…', live: '实时连接',
    reconnecting: '重新连接中', stopped: '连接中断', hidden: '已暂停', idle: '等待连接', invalid: '推送格式错误',
    paused: '实时连接已暂停', timeout: '已达到后台设置的连接时限。是否继续接收实时数据？', continue: '继续连接',
    keepPaused: '保持暂停', details: '查看资源图表 →', back: '返回列表', theme: '切换深浅色', language: '语言',
    verify: '请完成人机验证', verifyError: '人机验证加载失败，请检查网络或 CSP 设置', retry: '重试',
    noData: '暂无数据', timeoutValue: '超时', latency: '网络延迟', loss: '丢包率', network: '网络速度', resources: '资源使用率',
    swap: '交换分区', model: 'CPU 型号', arch: '架构', kernel: '内核', processes: '进程 / 连接', gpu: 'GPU',
    monthly: '本月流量', price: '价格', free: '免费', expireNone: '长期有效', expired: '已过期', days: '天',
    historyAuth: '此时间范围需要登录后查看', login: '前往登录', io: '磁盘 IO', read: '读取', write: '写入',
    chartHint: '拖动指针查看采样值 · 历史只在切换时间范围时查询', minute: '分钟', hour: '小时', day: '天',
    reset: '重置日', ungrouped: '未分组', lastUpdated: '最后上报', tags: '标签', close: '关闭'
  },
  en: {
    home: 'Home', monitor: 'Monitor', admin: 'Admin', servers: 'Servers', all: 'All', search: 'Search servers',
    status: 'Status', name: 'Name', region: 'Location', os: 'OS', uptime: 'Uptime', expiry: 'Expiry', load: 'Load',
    speed: 'Speed ↓|↑', cpu: 'CPU', ram: 'Memory', disk: 'Disk', traffic: 'Traffic', online: 'Online', offline: 'Offline',
    total: 'Total', totalTraffic: 'Total traffic', empty: 'No matching servers', loading: 'Loading…', live: 'Live',
    reconnecting: 'Reconnecting', stopped: 'Disconnected', hidden: 'Hidden', idle: 'Waiting', invalid: 'Invalid live frame',
    paused: 'Live updates paused', timeout: 'The configured connection time limit has been reached. Continue receiving live updates?', continue: 'Continue',
    keepPaused: 'Keep paused', details: 'View resource charts →', back: 'Back to list', theme: 'Toggle color theme', language: 'Language',
    verify: 'Complete the security check', verifyError: 'Security check failed to load. Check network / CSP settings.', retry: 'Retry',
    noData: 'No data', timeoutValue: 'Timeout', latency: 'Network latency', loss: 'Packet loss', network: 'Network speed', resources: 'Resource usage',
    swap: 'Swap', model: 'CPU model', arch: 'Architecture', kernel: 'Kernel', processes: 'Processes / connections', gpu: 'GPU',
    monthly: 'Monthly traffic', price: 'Price', free: 'Free', expireNone: 'No expiry', expired: 'Expired', days: 'days',
    historyAuth: 'Sign in to view this time range', login: 'Sign in', io: 'Disk IO', read: 'Read', write: 'Write',
    chartHint: 'Hover to inspect samples · History is fetched only when the range changes', minute: 'min', hour: 'h', day: 'd',
    reset: 'Reset day', ungrouped: 'Ungrouped', lastUpdated: 'Last report', tags: 'Tags', close: 'Close'
  },
  es: {
    home: 'Inicio', monitor: 'Monitor', admin: 'Panel', servers: 'Servidores', all: 'Todos', search: 'Buscar servidores',
    status: 'Estado', name: 'Nombre', region: 'Ubicación', os: 'Sistema', uptime: 'Activo', expiry: 'Vencimiento', load: 'Carga',
    speed: 'Velocidad ↓|↑', cpu: 'CPU', ram: 'Memoria', disk: 'Disco', traffic: 'Tráfico', online: 'En línea', offline: 'Desconectado',
    total: 'Total', totalTraffic: 'Tráfico total', empty: 'No hay servidores', loading: 'Cargando…', live: 'En vivo',
    reconnecting: 'Reconectando', stopped: 'Desconectado', hidden: 'Oculto', idle: 'En espera', invalid: 'Datos inválidos',
    paused: 'Actualizaciones pausadas', timeout: 'Se alcanzó el límite de conexión. ¿Continuar?', continue: 'Continuar', keepPaused: 'Mantener pausa',
    details: 'Ver gráficos →', back: 'Volver', theme: 'Cambiar tema', language: 'Idioma', verify: 'Completa la verificación',
    verifyError: 'No se pudo cargar la verificación. Revisa la red / CSP.', retry: 'Reintentar', noData: 'Sin datos', timeoutValue: 'Tiempo agotado',
    latency: 'Latencia', loss: 'Pérdida de paquetes', network: 'Velocidad de red', resources: 'Uso de recursos', swap: 'Swap', model: 'Modelo CPU',
    arch: 'Arquitectura', kernel: 'Kernel', processes: 'Procesos / conexiones', gpu: 'GPU', monthly: 'Tráfico mensual', price: 'Precio', free: 'Gratis',
    expireNone: 'Sin vencimiento', expired: 'Vencido', days: 'días', historyAuth: 'Inicia sesión para ver este período', login: 'Iniciar sesión',
    io: 'IO de disco', read: 'Lectura', write: 'Escritura', chartHint: 'Historia consultada solo al cambiar el período', minute: 'min', hour: 'h', day: 'd',
    reset: 'Día de reinicio', ungrouped: 'Sin grupo', lastUpdated: 'Último informe', tags: 'Etiquetas', close: 'Cerrar'
  }
}
export const language = ref('en')
export const t = (key) => words[language.value]?.[key] || words.en[key] || key
export const locale = computed(() => ({ zh: 'zh-CN', en: 'en-US', es: 'es-419' })[language.value])
export function setLanguage(value, persist = true) {
  const selected = ['zh', 'en', 'es'].includes(value) ? value : navigator.language.startsWith('zh') ? 'zh' : navigator.language.startsWith('es') ? 'es' : 'en'
  language.value = selected; document.documentElement.lang = selected
  if (persist) { try { localStorage.setItem('language_preference', selected) } catch { /* Optional preference. */ } }
}
