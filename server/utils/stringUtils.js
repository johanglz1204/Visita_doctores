/**
 * utilidades de limpieza y normalización de strings
 */

/**
 * Normalización agresiva:
 * - Elimina acentos
 * - Elimina caracteres no imprimibles y espacios especiales (vía NFD y regex)
 * - Convierte a minúsculas
 * - TRIM de espacios
 */
const normalize = (str) => {
  if (!str) return '';
  return str
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Eliminar acentos
    .replace(/[^\x20-\x7E\s]/g, '')  // Eliminar caracteres no-ASCII (adiós símbolos raros)
    .trim()
    .toLowerCase();
};

/**
 * Limpieza Ultra-Agresiva:
 * Solo permite letras y números (para comparaciones de identidad)
 */
const hardClean = (str) => {
  return normalize(str).replace(/[^a-z0-9]/g, '');
};

/**
 * Limpieza para visualización (Bonita):
 * - Quita símbolos raros pero mantiene espacios y puntuación básica
 * - Normaliza espacios múltiples
 */
const cleanForDisplay = (str) => {
  if (!str) return '';
  return str
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E\s]/g, '') // Eliminar símbolos rotos tipo ┬á
    .replace(/\s+/g, ' ')           // Colapsar espacios múltiples
    .trim();
};

module.exports = {
  normalize,
  hardClean,
  cleanForDisplay
};
