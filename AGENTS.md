## Development

When starting the dev server, use background mode:

```
npx astro dev --background
```

Manage the background server with `npx astro dev stop`, `npx astro dev status`, and `npx astro dev logs`.

## Architecture

- **Framework**: Astro (static site generation, no framework components)
- **Icons**: `astro-icon` + `@iconify-json/lucide` — use `<Icon name="lucide:icon-name" />` or just `name="icon-name"` via `src/components/Icon.astro` wrapper
- **Styling**: Scoped `<style>` blocks, CSS custom properties, no Tailwind
- **Routing**: Static file-based routing (`src/pages/`), no dynamic routes

## Recent Changes

### Icon System (astro-icon + Lucide)
- Installed `astro-icon` integration and `@iconify-json/lucide` package
- Created `src/components/Icon.astro` wrapper — auto-prefixes `lucide:` if no prefix given
- Replaced ALL raw inline SVG elements across 11+ files with `<Icon>` component
- Uses professional Lucide icons (1800+ consistent outline icons)
- Finding Lucide icon names: check `node_modules/@iconify-json/lucide/icons.json` or https://lucide.dev

### Dashboard Redesign
- **3D Greeting Card** with gradient background, date, stethoscope icon, and perspective tilt effect
- **Summary cards** with 3D tilt effect on hover (`dash-card` class with `perspective` transforms)
- **Month filter** functional dropdown — changes data across summary cards and chart
- **Income Chart** filter (Este mes / Último trimestre / Este año) with JS-driven data aggregation
- **Quick Access** cards grid (replaces old FAB): Registrar Gasto, Nuevo Tratamiento, Ver Deudas, Portfolio
- Activity feed with avatars and color-coded entries
- Period badges and filter selects adapt to both light/dark themes

### Gastos Page Redesign
- Split into "Hoy" (today/active expenses) and "Historial" (past expenses) sections
- Visual category badges with gradient backgrounds
- Collapsible expense cards with staggered animations
- Each card shows: category, amount, date, payment status, voucher thumbnail
- **Month filter** functional dropdown — filtra gastos por mes seleccionado
- **CRUD completo**: al crear un gasto se agrega a la lista, cada card se expande con detalle y botón eliminar
- **Inputs rediseñados**: mejor contraste, padding, border-width, íconos alineados
- **Date picker** con `color-scheme` para adaptarse a tema claro/oscuro
- Nuevo campo **Descripción** en el formulario

### Tratamiento Page
- Patient search bar with real-time filtering
- Filter buttons: Todos, En Progreso, Completados, Pendientes
- Treatment cards showing patient image, name, treatment type, status badge
- Integrated TreatmentWizard component

### Debt System (Deudas)
- `DebtList` component separates debts by Origen: **Clínica** / **Externo**
- Data now includes `source` field (`clinica` or `externo`)
- `DebtCard` component with pay button, overdue badges, "Pagado" state
- Summary cards showing totals: Total Deuda, Pagado, Pendiente

### Sidebar Enhancements (Layout.astro)
- Profile dropdown with:
  - Edit Profile modal (name, email, role, avatar initials)
  - Theme toggle (light/dark) with sun/moon animation
  - Logout button
- Animated dropdown with smooth transitions

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
