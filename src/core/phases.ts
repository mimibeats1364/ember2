/**
 * Plantillas locales de fases para "Sugerir fases" y para que Orbit desglose proyectos. No es
 * IA: son desgloses habituales por tipo de proyecto, elegidos por palabras clave. El usuario
 * decide cuáles crear.
 */
import { normalizeText } from './nlp';

interface Template {
  match: RegExp;
  es: string[];
  en: string[];
}

const TEMPLATES: Template[] = [
  { match: /\b(ep|album|disco|cancion|single|musica|track|song|music)\b/, es: ['Concepto', 'Composición', 'Producción', 'Grabación', 'Mezcla', 'Masterización', 'Portada', 'Distribución', 'Marketing'], en: ['Concept', 'Writing', 'Production', 'Recording', 'Mixing', 'Mastering', 'Artwork', 'Distribution', 'Marketing'] },
  { match: /\b(examen|asignatura|estudiar|oposicion|exam|course|study|tema)\b/, es: ['Reunir temario', 'Plan de estudio', 'Primera lectura', 'Resúmenes', 'Ejercicios / casos', 'Simulacro de examen', 'Repaso final'], en: ['Gather materials', 'Study plan', 'First pass', 'Summaries', 'Exercises / cases', 'Mock exam', 'Final review'] },
  { match: /\b(web|app|software|producto|lanzar|launch|startup|mvp)\b/, es: ['Definir problema', 'Investigación', 'Diseño', 'Prototipo', 'Construcción', 'Pruebas', 'Lanzamiento', 'Medir y mejorar'], en: ['Define the problem', 'Research', 'Design', 'Prototype', 'Build', 'Testing', 'Launch', 'Measure and iterate'] },
  { match: /\b(viaje|vacaciones|trip|travel)\b/, es: ['Elegir fechas', 'Presupuesto', 'Transporte', 'Alojamiento', 'Itinerario', 'Documentación', 'Maleta'], en: ['Pick dates', 'Budget', 'Transport', 'Accommodation', 'Itinerary', 'Documents', 'Packing'] },
  { match: /\b(carnet|conducir|licencia|driving|licence|license)\b/, es: ['Matricularse en autoescuela', 'Estudiar teórico', 'Examen teórico', 'Clases prácticas', 'Examen práctico'], en: ['Enroll in driving school', 'Study theory', 'Theory exam', 'Practical lessons', 'Practical exam'] },
  { match: /\b(mudanza|mudarse|move|moving)\b/, es: ['Inventario', 'Presupuesto', 'Cajas y embalaje', 'Contratar transporte', 'Cambiar suministros', 'Cambio de dirección'], en: ['Inventory', 'Budget', 'Boxes and packing', 'Book movers', 'Transfer utilities', 'Change of address'] },
  { match: /\b(trabajo|tfg|tfm|informe|presentacion|report|thesis|paper|presentation)\b/, es: ['Definir objetivo', 'Investigación', 'Esquema', 'Borrador', 'Revisión', 'Versión final', 'Entrega'], en: ['Define goal', 'Research', 'Outline', 'Draft', 'Review', 'Final version', 'Submit'] },
];

const GENERIC = { es: ['Definir el resultado', 'Primer paso concreto', 'Planificar hitos', 'Ejecutar', 'Revisar y cerrar'], en: ['Define the outcome', 'First concrete step', 'Plan milestones', 'Execute', 'Review and close'] };

export function suggestPhases(name: string, lang: 'es' | 'en'): string[] {
  const n = normalizeText(name);
  const tpl = TEMPLATES.find((x) => x.match.test(n));
  return tpl ? tpl[lang] : GENERIC[lang];
}
