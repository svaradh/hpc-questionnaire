import { createContext } from 'react'
import type { Section } from '../types/schema'

/**
 * The questionnaire's sections, for components that refer to other sections
 * (e.g. a workload entry naming the Section D panels it opens).
 */
export const SectionsContext = createContext<Section[]>([])
