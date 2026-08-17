import { FormShell } from './components/FormShell'
import { useFormState } from './hooks/useFormState'
import type { QuestionnaireSchema } from './types/schema'
import schemaData from './schema/questionnaire_v1.json'
import './App.css'

const schema = schemaData as unknown as QuestionnaireSchema

export function App() {
  const {
    answers, setAnswer, clearAll, lastSaved,
    previousSubmission, loadForEditing, saveSubmission,
  } = useFormState()

  return (
    <FormShell
      schema={schema}
      answers={answers}
      onAnswer={setAnswer}
      onClearAll={clearAll}
      lastSaved={lastSaved}
      previousSubmission={previousSubmission}
      onLoadForEditing={loadForEditing}
      onSaveSubmission={saveSubmission}
    />
  )
}
