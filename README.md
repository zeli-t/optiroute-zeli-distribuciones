# OptiRoute – Zeli Distribuciones

**Materia:** Investigación de Operaciones · **Unidad 6:** Proyecto Integrador  
**Repositorio:** `zeli-t/optiroute-zeli-distribuciones`

OptiRoute es una aplicación web de optimización logística desarrollada para resolver el **Problema de Transporte** de **Zeli Distribuciones**, permitiendo determinar el plan de distribución de costo mínimo desde múltiples almacenes hacia distintas sucursales, con análisis matemático paso a paso, análisis de sensibilidad completo, comparador de escenarios y exportación a reporte académico en PDF formato A4.

---

## 1. Descripción del problema logístico

**Zeli Distribuciones** requiere planificar el envío de unidades de producto desde sus almacenes de origen hacia sus sucursales de destino minimizando el costo total de transporte (en MXN), sujeto a la disponibilidad de inventario en cada almacén y a los requerimientos de demanda de cada sucursal.

El caso base configurado por defecto en la aplicación considera:

- **2 almacenes (orígenes):** Almacén A (`100` u), Almacén B (`150` u) — oferta total de `250` unidades.
- **3 sucursales (destinos):** Sucursal 1 (`80` u), Sucursal 2 (`90` u), Sucursal 3 (`80` u) — demanda total de `250` unidades.
- **Costos unitarios (MXN/u):** Almacén A `[8, 6, 10]` y Almacén B `[9, 7, 4]`.
- **Costo mínimo óptimo certificado:** **$1,570 MXN**.

La aplicación admite matrices dinámicas de cualquier dimensión (incluyendo casos preestablecidos desbalanceados y el caso de referencia 3×4 de Taha).

---

## 2. Formulación matemática general del modelo

Dado un conjunto de $m$ almacenes ($i = 1, \dots, m$) y $n$ sucursales ($j = 1, \dots, n$):

- **Variables de decisión:**  
  $X_{ij} \ge 0$ = cantidad de unidades enviadas desde el almacén $i$ hacia la sucursal $j$.

- **Parámetros:**  
  - $c_{ij}$: costo unitario de transporte en la ruta $(i, j)$ (MXN/unidad).  
  - $S_i$: oferta o capacidad disponible en el almacén $i$.  
  - $D_j$: demanda requerida por la sucursal $j$.

- **Función Objetivo (Minimización de costos):**
  $$\text{Minimizar } Z = \sum_{i=1}^{m} \sum_{j=1}^{n} c_{ij} X_{ij}$$

- **Restricciones de oferta (capacidad por almacén):**
  $$\sum_{j=1}^{n} X_{ij} \le S_i \quad (\text{o } = S_i \text{ en modelo balanceado}), \quad \forall i \in \{1, \dots, m\}$$

- **Restricciones de demanda (requerimiento por sucursal):**
  $$\sum_{i=1}^{m} X_{ij} \ge D_j \quad (\text{o } = D_j \text{ cuando se balancea con nodo ficticio}), \quad \forall j \in \{1, \dots, n\}$$

- **Restricción de no negatividad:**
  $$X_{ij} \ge 0 \quad \forall i, j$$

---

## 3. Algoritmos y capacidades implementadas

1. **Balanceo automático con nodos ficticios (`balance.ts`):**
   - Si $\sum S_i > \sum D_j$ (exceso de oferta), inserta automáticamente un **Destino Ficticio** con costo unitario $0$ y demanda $\sum S_i - \sum D_j$ para absorber el inventario sin asignar.
   - Si $\sum D_j > \sum S_i$ (déficit de oferta), inserta automáticamente un **Origen Ficticio** con costo unitario $0$ y oferta $\sum D_j - \sum S_i$ para representar la demanda insatisfecha.
2. **Solución inicial – Método de Costo Mínimo (`leastCost.ts`):** Asignación iterativa comenzando por las celdas de menor costo unitario disponible.
3. **Solución inicial – Método de Aproximación de Vogel / VAM (`vogel.ts`):** Cálculo de penalizaciones por fila y columna para priorizar rutas con mayor costo de oportunidad.
4. **Optimización exacta – Método MODI / *Stepping-Stone* (`modi.ts`):**
   - Resolución automática de degeneración mediante celdas básicas con asignación $\varepsilon = 0$ para garantizar exactamente $m + n - 1$ variables básicas formando un árbol generador sin ciclos.
   - Cálculo de potenciales duales $u_i$ y $v_j$ ($u_i + v_j = c_{ij}$ en celdas básicas) y costos reducidos $\Delta_{ij} = c_{ij} - u_i - v_j$ en celdas no básicas.
   - Pivoteo por ciclo cerrado (*stepping-stone*) hasta alcanzar $\Delta_{ij} \ge 0$ en todas las celdas no básicas y detección de **óptimos alternativos** ($\Delta_{ij} = 0$).
5. **Análisis de holguras, sensibilidad y toma de decisiones (`sensitivity.ts`):**
   - Tabla explícita de **Análisis de Holguras y Saturación de Restricciones** por almacén y por sucursal.
   - Sensibilidad de costos unitarios (costos reducidos e intervalos admisibles de optimalidad).
   - Sensibilidad de oferta/demanda (intervalos de factibilidad, precios sombra $u_i, v_j$ y variaciones balanceadas).
   - Comparador interactivo de escenarios (original vs. alternativo) con respaldo matemático.
   - Interpretación gerencial y recomendaciones automáticas basadas exclusivamente en la solución óptima.
6. **Visualización y Reporte Académico PDF A4 (`RouteFlowDiagram.tsx`, `pdfReport.ts`):**
   - Grafo vectorial interactivo (SVG) de flujos almacén $\rightarrow$ sucursal y matrices paso a paso.
   - Exportación de reporte académico PDF tamaño A4 con portada institucional, índice, formulación matemática, holguras, trazas de Costo Mínimo, Vogel, MODI, análisis de sensibilidad, comparación de escenarios y recomendaciones gerenciales.

---

## 4. Estructura del proyecto

```text
optiroute-zeli-distribuciones/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── App.tsx                                 # Orquestador principal de la aplicación
│   ├── main.tsx                                # Punto de entrada React
│   ├── index.css                               # Estilos globales (Tailwind CSS v4)
│   ├── components/
│   │   ├── Header.tsx                          # Barra superior y navegación por secciones
│   │   ├── HeroOverview.tsx                    # Introducción ejecutiva y carga de caso base
│   │   ├── MatrixEditor.tsx                    # Captura/edición de costos, oferta y demanda
│   │   ├── MathematicalFormulationCard.tsx     # Formulación matemática dinámica del modelo
│   │   ├── ResultsSection.tsx                  # KPIs, holguras, grafo SVG y matriz óptima
│   │   ├── RouteFlowDiagram.tsx                # Diagrama vectorial SVG de rutas asignadas
│   │   ├── AdvancedAnalysisSection.tsx         # Sensibilidad, comparador y gestión gerencial
│   │   ├── StepByStepProcedure.tsx             # Procedimiento iterativo paso a paso
│   │   └── ReportsSection.tsx                  # Generación y descarga de PDF A4 y CSV
│   ├── hooks/
│   │   └── useScenarioComparator.ts            # Gestión independiente del escenario alternativo
│   └── math/
│       ├── types.ts                            # Definiciones de tipos del motor y sensibilidad
│       ├── presets.ts                          # Caso base Zeli, Taha 3x4, exceso y déficit
│       ├── balance.ts                          # Validación de entradas y balanceo automático
│       ├── leastCost.ts                        # Algoritmo de Costo Mínimo
│       ├── vogel.ts                            # Algoritmo de Aproximación de Vogel (VAM)
│       ├── modi.ts                             # Método MODI / Stepping-Stone con degeneración
│       ├── solver.ts                           # Orquestador cuantitativo integral
│       ├── sensitivity.ts                      # Holguras, sensibilidad, escenarios y gerencia
│       ├── pdfReport.ts                        # Generador del reporte académico PDF A4
│       └── transportation.test.ts              # Suite automatizada de pruebas (node:test)
```

---

## 5. Stack tecnológico

- **Frontend:** React 19 + TypeScript
- **Empaquetador y entorno dev:** Vite 8
- **Estilos e iconografía:** Tailwind CSS v4 + Lucide React
- **Generación de reportes:** jsPDF + jspdf-autotable
- **Pruebas unitarias e integración:** `node:test` ejecutado con `tsx`

---

## 6. Instalación y ejecución local

### Prerrequisitos
- **Node.js** 20 o superior
- **npm** 10 o superior

### Pasos

```bash
# 1. Clonar el repositorio
git clone https://github.com/zeli-t/optiroute-zeli-distribuciones.git
cd optiroute-zeli-distribuciones

# 2. Instalar dependencias
npm install

# 3. Iniciar el servidor de desarrollo (http://localhost:3000)
npm run dev
```

### Comandos disponibles

| Comando | Descripción |
| :--- | :--- |
| `npm run dev` | Levanta el entorno de desarrollo con Vite en el puerto `3000`. |
| `npm test` | Ejecuta la suite completa de pruebas matemáticas y de regresión (`src/math/transportation.test.ts`). |
| `npm run lint` | Verifica tipos estáticos en todo el proyecto mediante `tsc --noEmit`. |
| `npm run build` | Genera la compilación optimizada para producción en `dist/`. |
| `npm run preview` | Previsualiza localmente el paquete compilado de producción. |
