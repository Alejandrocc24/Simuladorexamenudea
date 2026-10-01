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

## Formato JSON esperado (v3)

```json
{
  "title": "Examen UdeA 2024-1",
  "year": 2024,
  "semester": 1,
  "sharedTexts": [
    { "id": "texto-1", "title": "TEXTO 1", "text": "Lea el texto...", "appliesToQuestions": [3, 4] }
  ],
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
      "topic": "Proporcionalidad directa",
      "category": "Proporcionalidad y cálculo",
      "confidence": "high",
      "difficulty": "medium",
      "assets": [
        { "type": "image", "target": "statement", "description": "...", "croppedImage": "data:image/png;base64,..." }
      ]
    }
  ]
}
```

- `year` / `semester` pueden ser `null` (simulacros de institutos): se muestra el título tal cual, sin fallback.
- `category` (bloque oficial): RL → Proporcionalidad y cálculo, Álgebra y patrones, Geométrico y espacial, Análisis de información, Lógica y deducción. CL → Literal, Inferencial, Analógica.
- `confidence` (`high` | `medium` | `low`, interno): `low` importa la pregunta como pendiente de revisión.
- `difficulty` (`easy` | `medium` | `hard`).
- `sharedTexts` se guardan en `exams.shared_texts` (jsonb) y se muestran en lectura.
- `assets[].target`: `statement` | `table` | `options` | `shared` (informativo; el bloque `options` se muestra separado encima de los botones).
- Al importar se limpian marcas `[cite: N]` y barras LaTeX dobles; los JSON cortados se rechazan sin importar nada.

Las imágenes van como URL o data-uri dentro de `assets` y se guardan en `questions.imagenes` (jsonb).

### Migración Supabase v3

Ejecutar `supabase/migration_v3.sql` en el SQL Editor (agrega `questions.category`, `questions.confidence`, `questions.difficulty` y `exams.shared_texts`). El código funciona aunque aún no se haya ejecutado (reintenta con el esquema anterior), pero sin esas columnas los campos nuevos no se persisten.

### Migración Supabase v3b (borrado sin errores 409)

Ejecutar `supabase/migration_v3b_constraints.sql`: permite `periodo` nulo, amplía el `CHECK` de `exams.tipo` a `examen_real`/`simulacro` y pone `ON DELETE CASCADE` en las FKs de duelos (`room_answers`, `room_participants`, `rooms`). La primera mitad solo diagnostica (CHECKs, NOT NULLs y FKs).

### Migración Supabase v4 (moderación de usuarios)

Ejecutar `supabase/migration_v4_user_moderation.sql`: crea `banned_users` y las funciones `admin_user_activity` (última conexión real desde `auth.users`), `am_i_banned`, `admin_ban_user`, `admin_unban_user` y `admin_delete_user`. Sin esta migración, la pestaña Usuarios solo gestiona roles. Vetar bloquea el ingreso sin borrar nada; Eliminar borra perfil, intentos y datos de duelos pero la persona puede volver a registrarse. Con casillas puedes vetar o eliminar en lote (p. ej. inactivos); la cuenta de acceso (`auth.users`) solo se elimina desde el Dashboard de Supabase → Authentication → Users.

### Migración Supabase v4b (nickname editable + admin lo ve)

Ejecutar `supabase/migration_v4b_nickname.sql`: agrega `profiles.nickname` (único, con `update_my_nickname()` que valida, evita duplicados y omite las RLS que bloquean el `UPDATE` directo). El nombre de registro (`nombre`) no se toca. La página /perfil separa ambos campos y la pestaña Usuarios muestra nombre, @nickname y correo (con fallback si la migración aún no se aplicó).
