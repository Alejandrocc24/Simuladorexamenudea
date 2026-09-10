# Simulador UdeA (Supabase + solo JSON)

Plataforma web para practicar el examen de admisión de la UdeA.

- Backend de datos: **Supabase** (Postgres + Auth + Realtime). Proyecto: `simulacros-udea`.
- Sin Firebase, sin subida de PDFs, sin Gemini.
- La carga de exámenes es **solo desde archivos JSON** (panel `/admin` → Importar y Revisar).

## Run Locally

**Prerequisites:** Node.js 20+

1. Install dependencies:
   `npm install`
2. Copia `.env.example` a `.env.local` y completa:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_ADMIN_EMAIL`
3. Run the app (solo Vite, sin Express):
   `npm run dev` → `http://localhost:5173`

## Formato JSON esperado

```json
{
  "title": "Examen UdeA 2024-1",
  "year": 2024,
  "semester": 1,
  "questions": [
    {
      "number": 1,
      "sectionId": "razonamiento-logico",
      "statement": "Enunciado con $LaTeX$...",
      "options": [
        { "id": "A", "text": "..." },
        { "id": "B", "text": "..." },
        { "id": "C", "text": "..." },
        { "id": "D", "text": "..." }
      ],
      "correctAnswer": "B",
      "explanation": "...",
      "topic": "...",
      "assets": []
    }
  ]
}
```

Las imágenes van como URL o data-uri dentro de `assets` y se guardan en `questions.imagenes` (jsonb).
